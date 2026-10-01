"""Well-known investors' quarterly holdings from SEC Form 13F.

Source: SEC EDGAR (free, no key). Automated access must declare a contact
email in the User-Agent (env SEC_USER_AGENT) and stay under 10 requests/second.

A 13F is a quarter-end snapshot of US-listed long positions, filed up to 45
days after the quarter ends. Shorts, cash, bonds and non-US listings are not
included, and holdings in an individual's own name never appear.
"""
from __future__ import annotations

import logging
import os
import re
import xml.etree.ElementTree as ET

from . import http
from .util import CONFIG, RAW, REF, chunks, clean_ticker, load_yaml, read_json, write_json

log = logging.getLogger(__name__)

PARSER_VERSION = 1


def _strip_ns(root: ET.Element) -> ET.Element:
    for el in root.iter():
        if "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def investors() -> list[dict]:
    return (load_yaml(CONFIG / "investors.yaml") or {}).get("investors", [])


class Edgar:
    def __init__(self):
        self.s = http.session(http.sec_user_agent())

    def json(self, url: str) -> dict:
        r = http.get(self.s, url)
        r.raise_for_status()
        return r.json()

    def text(self, url: str) -> str:
        r = http.get(self.s, url)
        r.raise_for_status()
        return r.text

    def filings(self, cik: int, want_periods: int) -> list[dict]:
        """13F-HR and 13F-HR/A filings, newest first, covering at least `want_periods` quarters."""
        d = self.json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        blocks = [d["filings"]["recent"]]
        out: list[dict] = []

        def take(rec):
            for i, form in enumerate(rec["form"]):
                if form in ("13F-HR", "13F-HR/A"):
                    out.append({
                        "acc": rec["accessionNumber"][i], "form": form,
                        "filed": rec["filingDate"][i], "period": rec["reportDate"][i],
                    })

        take(blocks[0])
        for extra in d["filings"].get("files", []):
            if len({f["period"] for f in out}) >= want_periods:
                break
            take(self.json(f"https://data.sec.gov/submissions/{extra['name']}"))
        out.sort(key=lambda f: (f["period"], f["filed"]), reverse=True)
        return out

    def holdings(self, cik: int, acc: str, filed: str) -> dict:
        folder = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}"
        idx = self.json(f"{folder}/index.json")
        names = [it["name"] for it in idx.get("directory", {}).get("item", [])]
        xmls = [n for n in names if n.lower().endswith(".xml")]
        primary = next((n for n in xmls if n.lower() == "primary_doc.xml"), None)
        table = next((n for n in xmls if n != primary and "info" in n.lower()), None) or next(
            (n for n in xmls if n != primary), None
        )
        meta = {"amendment_type": None}
        if primary:
            root = _strip_ns(ET.fromstring(self.text(f"{folder}/{primary}").encode()))
            meta["amendment_type"] = (root.findtext(".//amendmentType") or "").strip().upper() or None
            meta["is_amendment"] = (root.findtext(".//isAmendment") or "").strip().lower() == "true"
        rows = []
        if table:
            root = _strip_ns(ET.fromstring(self.text(f"{folder}/{table}").encode()))
            # values are reported in dollars since 2023; in thousands before that
            mult = 1 if filed >= "2023-01-03" else 1000
            for it in root.iter("infoTable"):
                g = lambda path: (it.findtext(path) or "").strip()  # noqa: E731
                try:
                    rows.append({
                        "cusip": g("cusip").upper(),
                        "name": g("nameOfIssuer"),
                        "class": g("titleOfClass"),
                        "value": int(float(g("value") or 0)) * mult,
                        "shares": float(g("shrsOrPrnAmt/sshPrnamt") or 0),
                        "unit": g("shrsOrPrnAmt/sshPrnamtType") or "SH",
                        "pc": g("putCall").upper() or None,
                    })
                except ValueError:
                    continue
        return {**meta, "rows": rows, "url": f"{folder}/"}


def _aggregate(rows: list[dict]) -> list[dict]:
    """Sum rows for the same security (filers split positions by sub-manager)."""
    agg: dict[tuple, dict] = {}
    for r in rows:
        k = (r["cusip"], r["pc"], r["unit"])
        if k in agg:
            agg[k]["value"] += r["value"]
            agg[k]["shares"] += r["shares"]
        else:
            agg[k] = dict(r)
    return sorted(agg.values(), key=lambda r: -r["value"])


def update(quarters: int) -> dict:
    stats = {"new": 0, "cached": 0, "errors": 0}
    try:
        ed = Edgar()
    except RuntimeError as e:
        log.warning("%s - skipping 13F", e)
        return {**stats, "skipped": str(e)}
    for inv in investors():
        cik = int(inv["cik"])
        try:
            fs = ed.filings(cik, quarters)
        except Exception as e:  # noqa: BLE001
            log.warning("13F list %s failed: %s", cik, e)
            stats["errors"] += 1
            continue
        periods = sorted({f["period"] for f in fs}, reverse=True)[:quarters]
        for f in fs:
            if f["period"] not in periods:
                continue
            p = RAW / "sec" / str(cik) / f"{f['acc']}.json"
            old = read_json(p)
            if old and old.get("parser") == PARSER_VERSION:
                stats["cached"] += 1
                continue
            try:
                h = ed.holdings(cik, f["acc"], f["filed"])
            except Exception as e:  # noqa: BLE001
                log.warning("13F %s %s failed: %s", cik, f["acc"], e)
                stats["errors"] += 1
                continue
            write_json(p, {**f, "cik": cik, "parser": PARSER_VERSION, **h})
            stats["new"] += 1
    return stats


def load(cik: int, quarters: int) -> list[dict]:
    """One merged holdings snapshot per quarter, newest first."""
    filings = [read_json(p) for p in sorted((RAW / "sec" / str(cik)).glob("*.json"))]
    by_period: dict[str, list[dict]] = {}
    for f in filings:
        if f:
            by_period.setdefault(f["period"], []).append(f)
    out = []
    for period in sorted(by_period, reverse=True)[:quarters]:
        fs = sorted(by_period[period], key=lambda f: (f["filed"], f["acc"]))
        base = [f for f in fs if f["form"] == "13F-HR"]
        if not base:
            continue
        cur = base[-1]
        rows = list(cur["rows"])
        filed = cur["filed"]
        url = cur["url"]
        for a in fs:
            if a["form"] != "13F-HR/A" or a["filed"] < cur["filed"]:
                continue
            if a.get("amendment_type") == "RESTATEMENT" and a["rows"]:
                rows, url = list(a["rows"]), a["url"]
            elif a.get("amendment_type") == "NEW HOLDINGS":
                rows += a["rows"]
        out.append({"period": period, "filed": filed, "url": url, "rows": _aggregate(rows)})
    return out


# ------------------------------------------------------------------ CUSIP -> ticker


_DROP = {"INC", "CORP", "CORPORATION", "CO", "LTD", "PLC", "LLC", "LP", "HOLDINGS", "HOLDING", "HLDGS", "HLDG", "GROUP",
         "GRP", "THE", "NV", "SA", "AG", "SE", "CL", "CLASS", "COM", "NEW", "DEL", "ADR", "SPONSORED", "ORD", "SHS",
         "LIMITED", "COMPANY", "INCORPORATED", "N", "V", "A", "B", "C", "SHARES", "COMMON", "STOCK"}
NAME_MATCH_VERSION = 3


def _norm_co(name: str) -> list[str]:
    words = re.sub(r"[^A-Z0-9 ]", " ", name.upper().replace("&", " AND ")).split()
    return [w for w in words if w not in _DROP]


def _name_fallback(cache: dict, names: dict[str, str]) -> None:
    """CUSIPs OpenFIGI could not resolve: match the issuer name against SEC's ticker list (unique prefix only)."""
    todo = [c for c, v in cache.items() if v is None and names.get(c)]
    if not todo:
        return
    try:
        s = http.session(http.sec_user_agent())
        d = http.get(s, "https://www.sec.gov/files/company_tickers_exchange.json").json()
    except Exception as e:  # noqa: BLE001
        log.warning("name fallback skipped: %s", e)
        return
    titles = []
    for row in d["data"]:
        rec = dict(zip(d["fields"], row))
        t = clean_ticker(str(rec["ticker"]))
        if t:
            titles.append((_norm_co(str(rec["name"])), t))
    for c in todo:
        key = _norm_co(names[c])
        if not key:
            cache[c] = ""
            continue
        if len(key) < 2:
            # one distinctive word ("CHUBB"): only an exact, unique company name will do
            hits = {t for words, t in titles if words == key}
            cache[c] = hits.pop() if len(hits) == 1 else ""
            continue
        hits = {t for words, t in titles if words[: len(key)] == key or (len(words) >= 2 and key[: len(words)] == words)}
        # several share classes of one company (GOOG/GOOGL) are ambiguous: leave unresolved
        cache[c] = hits.pop() if len(hits) == 1 else ""


def map_cusips(cusips: set[str], names: dict[str, str] | None = None) -> dict[str, str | None]:
    """Resolve CUSIPs to US tickers: OpenFIGI first, then an issuer-name match; cached in data/ref.

    Cache values: ticker, None (OpenFIGI found nothing, name not tried yet), "" (nothing found).
    """
    path = REF / "cusip.json"
    cache: dict = read_json(path, {}) or {}
    if cache.get("_v") != NAME_MATCH_VERSION:
        # the name matcher improved: give earlier misses another try
        for k, v in list(cache.items()):
            if v == "":
                cache[k] = None
        cache["_v"] = NAME_MATCH_VERSION
    todo = sorted(c for c in cusips if c and c not in cache)
    if todo:
        s = http.session()
        key = os.environ.get("OPENFIGI_API_KEY")
        headers = {"Content-Type": "application/json"}
        if key:
            headers["X-OPENFIGI-APIKEY"] = key
            http.HOST_DELAY["api.openfigi.com"] = 0.3
        size = 100 if key else 10
        for batch in chunks(todo, size):
            jobs = [{"idType": "ID_CUSIP", "idValue": c, "exchCode": "US"} for c in batch]
            try:
                r = http.post(s, "https://api.openfigi.com/v3/mapping", json=jobs, headers=headers)
                r.raise_for_status()
                res = r.json()
            except Exception as e:  # noqa: BLE001
                log.warning("OpenFIGI failed: %s", e)
                break
            for c, item in zip(batch, res):
                data = item.get("data") or []
                tick = None
                for d in data:
                    if d.get("marketSector") == "Equity" and d.get("ticker"):
                        tick = clean_ticker(re.sub(r"\s+", "", d["ticker"]))
                        if tick:
                            break
                cache[c] = tick
            write_json(path, cache, pretty=True)
        log.info("OpenFIGI: %d CUSIPs resolved", len(todo))
    if names:
        before = sum(1 for v in cache.values() if v is None)
        _name_fallback(cache, names)
        if before != sum(1 for v in cache.values() if v is None):
            write_json(path, cache, pretty=True)
    return {k: (v or None) for k, v in cache.items() if not k.startswith("_")}
