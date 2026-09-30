"""U.S. Senate Periodic Transaction Reports via the eFD system.

Source: Senate Office of Public Records, https://efdsearch.senate.gov
Every visit must first accept the site's statement of prohibited uses; we do
that once per session. Electronic PTRs are HTML tables and are parsed here;
paper filings are scanned images and are recorded as "scanned" with a link.
"""
from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup

from . import http
from .house import parse_option, reported_price
from .util import RAW, clean_ticker, mdy_to_iso, parse_amount, read_json, write_json

log = logging.getLogger(__name__)

BASE = "https://efdsearch.senate.gov"
PARSER_VERSION = 2
TYPE_MAP = {
    "purchase": "P",
    "sale (full)": "SF",
    "sale (partial)": "SP",
    "sale": "S",
    "exchange": "E",
}
OWNER_MAP = {"self": "SELF", "spouse": "SP", "joint": "JT", "child": "DC", "dependent child": "DC"}
ASSET_TYPE_MAP = {
    "stock": "ST",
    "stock option": "OP",
    "corporate bond": "CS",
    "municipal security": "GS",
    "government security": "GS",
    "mutual fund": "MF",
    "exchange traded fund": "EF",
    "other securities": "OT",
    "cryptocurrency": "CT",
}


class Senate:
    def __init__(self):
        self.s = http.session()
        self._agree()

    def _agree(self):
        r = http.get(self.s, f"{BASE}/search/home/")
        r.raise_for_status()
        m = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', r.text)
        if not m:
            raise RuntimeError("Senate eFD: could not find the agreement form")
        r = http.post(
            self.s,
            f"{BASE}/search/home/",
            data={"prohibition_agreement": "1", "csrfmiddlewaretoken": m.group(1)},
            headers={"Referer": f"{BASE}/search/home/"},
        )
        r.raise_for_status()

    def list_ptrs(self, start_date: str) -> list[dict]:
        """All PTRs (senators and former senators) submitted since start_date ('MM/DD/YYYY')."""
        out, off = [], 0
        while True:
            csrf = self.s.cookies.get("csrftoken")
            data = {
                "start": str(off), "length": "100", "report_types": "[11]", "filer_types": "[1,5]",
                "submitted_start_date": f"{start_date} 00:00:00", "submitted_end_date": "",
                "candidate_state": "", "senator_state": "", "office_id": "", "first_name": "",
                "last_name": "", "csrfmiddlewaretoken": csrf,
            }
            r = http.post(
                self.s, f"{BASE}/search/report/data/", data=data,
                headers={"Referer": f"{BASE}/search/", "X-CSRFToken": csrf},
            )
            if r.status_code == 403 or "json" not in r.headers.get("Content-Type", ""):
                self._agree()  # session expired
                continue
            d = r.json()
            rows = d.get("data", [])
            for first, last, full, link, filed in rows:
                m = re.search(r'href="([^"]+)"', link)
                if not m:
                    continue
                href = m.group(1)
                kind = "paper" if "/paper/" in href else "ptr"
                uid = href.rstrip("/").split("/")[-1]
                role = re.search(r"\(([^)]+)\)\s*$", full)
                out.append({
                    "uid": uid, "kind": kind, "url": BASE + href, "first": first.strip(),
                    "last": last.strip(), "full": full.strip(), "role": role.group(1) if role else "",
                    "filed": mdy_to_iso(filed.strip()), "title": BeautifulSoup(link, "lxml").get_text(" ", strip=True),
                })
            off += len(rows)
            if not rows or off >= d.get("recordsTotal", 0):
                break
        return out

    def fetch(self, url: str) -> str:
        for _ in range(2):
            r = http.get(self.s, url, headers={"Referer": f"{BASE}/search/"})
            # an expired session is redirected back to the agreement page
            if r.status_code == 200 and "/search/home" not in r.url:
                return r.text
            self._agree()
        r.raise_for_status()
        raise RuntimeError(f"Senate eFD kept redirecting to the agreement page for {url}")


def _cell_text(td) -> str:
    return re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip()


def parse_ptr_html(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    title = _cell_text(h1) if h1 else ""
    amended = "amend" in title.lower()
    table = None
    for t in soup.find_all("table"):
        head = [_cell_text(th).lower() for th in t.find_all("th")]
        if "transaction date" in head and "amount" in head:
            table = t
            break
    if table is None:
        return {"status": "empty", "amended": amended, "transactions": []}
    head = [_cell_text(th).lower() for th in table.find("thead").find_all("th")]
    col = {name: i for i, name in enumerate(head)}
    out = []
    for i, tr in enumerate(table.find("tbody").find_all("tr")):
        tds = tr.find_all("td")
        if len(tds) < len(head):
            continue
        g = lambda name: _cell_text(tds[col[name]]) if name in col else ""  # noqa: E731
        asset = g("asset name")
        atype_txt = g("asset type").lower()
        ticker = clean_ticker(g("ticker"))
        lo, hi = parse_amount(g("amount"))
        comment = g("comment")
        if comment in ("--", ""):
            comment = None
        rec = {
            "idx": i + 1,
            "tx_date": mdy_to_iso(g("transaction date")),
            "owner": OWNER_MAP.get(g("owner").lower(), "SELF"),
            "ticker": ticker,
            "asset": re.sub(r"\s+", " ", asset),
            "asset_type": ASSET_TYPE_MAP.get(atype_txt, "OT"),
            "asset_type_text": g("asset type"),
            "type": TYPE_MAP.get(g("type").lower(), g("type")),
            "amount_min": lo,
            "amount_max": hi,
        }
        if comment:
            rec["comment"] = comment
        if rec["asset_type"] == "OP":
            opt = parse_option(asset, comment)
            if opt:
                rec["option"] = opt
        rp = reported_price(comment, ticker)
        if rp:
            rec["reported"] = rp
        out.append(rec)
    return {"status": "ok" if out else "empty", "amended": amended, "transactions": out}


def cache_path(uid: str):
    return RAW / "senate" / f"{uid}.json"


def update(start_year: int, limit: int | None = None) -> dict:
    stats = {"new": 0, "scanned": 0, "errors": 0, "cached": 0}
    try:
        sen = Senate()
        listing = sen.list_ptrs(f"01/01/{start_year}")
    except Exception as e:  # noqa: BLE001
        log.warning("senate listing failed: %s", e)
        return {**stats, "failed": str(e)[:200]}
    log.info("senate: %d PTRs listed", len(listing))
    done = 0
    for f in listing:
        p = cache_path(f["uid"])
        old = read_json(p)
        if old and old.get("parser") == PARSER_VERSION:
            stats["cached"] += 1
            continue
        if limit is not None and done >= limit:
            continue
        done += 1
        if f["kind"] == "paper":
            parsed = {"status": "scanned", "amended": False, "transactions": []}
            stats["scanned"] += 1
        else:
            try:
                parsed = parse_ptr_html(sen.fetch(f["url"]))
            except Exception as e:  # noqa: BLE001
                log.warning("senate %s failed: %s", f["url"], e)
                stats["errors"] += 1
                continue
        write_json(p, {**f, "parser": PARSER_VERSION, **parsed}, pretty=True)
        stats["new"] += 1
        if done % 50 == 0:
            log.info("senate: %d filings processed", done)
    return stats


def load_all() -> list[dict]:
    out = []
    for p in sorted((RAW / "senate").glob("*.json")):
        d = read_json(p)
        if d:
            out.append(d)
    return out
