"""Company insiders' open-market trades (SEC Form 4) and earnings-release dates.

Two free SEC sources, both public records without use restrictions:

- The quarterly "Insider Transactions Data Sets" (every Form 3/4/5 of a quarter as TSV files in one
  zip). They give history cheaply: one download per quarter instead of one per filing.
- For the months after the newest data set, each company's submissions index
  (data.sec.gov/submissions) and the Form 4 XML documents it lists. The same index tells us when
  the company published results: 8-K filings with item 2.02 ("Results of Operations").

Only open-market purchases (code P) and sales (code S) of non-derivative securities are kept:
grants, option exercises, gifts and tax withholding say little about what an insider thinks.

Committed state (data/ref): insiders_recent.json (parsed recent filings), earnings.json.
Rebuildable cache (data/cache/form345): the quarterly zips and their parsed P/S rows.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import logging
import os
import re
import threading
import time
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from xml.etree import ElementTree as ET

from . import http
from .util import CACHE, REF, SITE, read_json, today_iso, write_json

log = logging.getLogger(__name__)

INDEX_URL = "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets"
BULK_DIR = CACHE / "form345"
QUARTERS = 8  # two years of history
KEEP_DAYS = 730
MAX_ROWS = 600  # per stock on the site
MONTHS = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}

csv.field_size_limit(10_000_000)


def _iso(s: str | None) -> str | None:
    """'31-MAR-2026' -> '2026-03-31' (ISO dates pass through)."""
    if not s:
        return None
    s = s.strip()
    m = re.match(r"^(\d{1,2})-([A-Za-z]{3})-(\d{4})$", s)
    if m and m.group(2).upper() in MONTHS:
        return f"{m.group(3)}-{MONTHS[m.group(2).upper()]:02d}-{int(m.group(1)):02d}"
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else None


def _num(s: str | None) -> float | None:
    try:
        return float(s) if s not in (None, "") else None
    except ValueError:
        return None


def _rel(text: str) -> str:
    """Relationship letters: D director, O officer, T ten-percent owner, X other."""
    low = (text or "").lower()
    out = ""
    if "director" in low:
        out += "D"
    if "officer" in low:
        out += "O"
    if "ten" in low or "10" in low:
        out += "T"
    return out or "X"


# ---------------------------------------------------------------- quarterly data sets


def _dataset_urls(s) -> list[tuple[str, str]]:
    """[(quarter 'YYYYqN', url)], newest first."""
    r = http.get(s, INDEX_URL, timeout=60)
    r.raise_for_status()
    found = {}
    for href, q in re.findall(r'href="([^"]*?/(\d{4}q[1-4])_form345\.zip)"', r.text):
        found[q] = href if href.startswith("http") else "https://www.sec.gov" + href
    return sorted(found.items(), reverse=True)


def _quarter_end(q: str) -> str:
    y, n = int(q[:4]), int(q[5])
    month = n * 3
    last = (dt.date(y + (month == 12), month % 12 + 1, 1) - dt.timedelta(days=1)).day
    return f"{y}-{month:02d}-{last:02d}"


def _tsv(z: zipfile.ZipFile, name: str):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"), delimiter="\t", quoting=csv.QUOTE_NONE)


def parse_dataset(content: bytes) -> list[dict]:
    """Open-market purchases and sales of one quarterly data set."""
    z = zipfile.ZipFile(io.BytesIO(content))
    subs = {}
    for r in _tsv(z, "SUBMISSION.tsv"):
        if r.get("DOCUMENT_TYPE") != "4":
            continue
        try:
            cik = int(r["ISSUERCIK"])
        except (KeyError, ValueError):
            continue
        subs[r["ACCESSION_NUMBER"]] = {"cik": cik, "fd": _iso(r.get("FILING_DATE")), "plan": str(r.get("AFF10B5ONE", "")).lower() in ("1", "true")}
    owners = {}
    for r in _tsv(z, "REPORTINGOWNER.tsv"):
        acc = r["ACCESSION_NUMBER"]
        if acc in subs and acc not in owners:
            owners[acc] = (r.get("RPTOWNERNAME") or "").strip(), _rel(r.get("RPTOWNER_RELATIONSHIP", "")), (r.get("RPTOWNER_TITLE") or "").strip()
    rows = []
    for r in _tsv(z, "NONDERIV_TRANS.tsv"):
        code = r.get("TRANS_CODE")
        acc = r["ACCESSION_NUMBER"]
        if code not in ("P", "S") or acc not in subs:
            continue
        sh, px = _num(r.get("TRANS_SHARES")), _num(r.get("TRANS_PRICEPERSHARE"))
        td = _iso(r.get("TRANS_DATE"))
        if not sh or not px or not td:
            continue
        who, rel, title = owners.get(acc, ("", "X", ""))
        sub = subs[acc]
        rows.append({"cik": sub["cik"], "acc": acc, "fd": sub["fd"], "td": td, "who": who, "rel": rel, "title": title, "code": code,
                     "sh": sh, "px": px, "plan": sub["plan"]})
    return rows


def load_bulk(s, fetch: bool) -> tuple[list[dict], str | None]:
    """(rows of the last QUARTERS data sets, end date of the newest one)."""
    BULK_DIR.mkdir(parents=True, exist_ok=True)
    have = sorted((p.stem for p in BULK_DIR.glob("*.json")), reverse=True)
    if fetch:
        try:
            for q, url in _dataset_urls(s)[:QUARTERS]:
                if q in have:
                    continue
                log.info("insiders: downloading %s", q)
                r = http.get(s, url, timeout=300)
                if r.status_code != 200:
                    log.warning("insiders: %s -> %s", url, r.status_code)
                    continue
                write_json(BULK_DIR / f"{q}.json", parse_dataset(r.content))
                have.append(q)
        except Exception as e:  # noqa: BLE001
            log.warning("insiders: data set index failed (using cached quarters): %s", e)
    have = sorted(set(have), reverse=True)[:QUARTERS]
    rows: list[dict] = []
    for q in have:
        rows.extend(read_json(BULK_DIR / f"{q}.json", []) or [])
    return rows, (_quarter_end(have[0]) if have else None)


# ---------------------------------------------------------------- recent filings, company by company


def parse_form4(xml: bytes) -> list[dict]:
    """Open-market purchases and sales in one Form 4 document."""
    return _form4(xml)[1]


def _form4(xml: bytes) -> tuple[int | None, list[dict]]:
    """(issuer CIK, open-market purchases and sales). A company's filing index also lists Form 4s
    it filed as a large holder of *other* companies, so the issuer has to come from the document."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None, []

    def text(node, path):
        el = node.find(path) if node is not None else None
        return (el.text or "").strip() if el is not None and el.text else ""

    owner = root.find("reportingOwner")
    who = text(owner, "reportingOwnerId/rptOwnerName")
    relnode = owner.find("reportingOwnerRelationship") if owner is not None else None
    truthy = lambda v: v.lower() in ("1", "true")  # noqa: E731
    rel = ""
    if truthy(text(relnode, "isDirector")):
        rel += "D"
    if truthy(text(relnode, "isOfficer")):
        rel += "O"
    if truthy(text(relnode, "isTenPercentOwner")):
        rel += "T"
    title = text(relnode, "officerTitle")
    plan = truthy(text(root, "aff10b5One"))
    out = []
    for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        code = text(tx, "transactionCoding/transactionCode")
        if code not in ("P", "S"):
            continue
        sh = _num(text(tx, "transactionAmounts/transactionShares/value"))
        px = _num(text(tx, "transactionAmounts/transactionPricePerShare/value"))
        td = _iso(text(tx, "transactionDate/value"))
        if not sh or not px or not td:
            continue
        out.append({"td": td, "who": who, "rel": rel or "X", "title": title, "code": code, "sh": sh, "px": px, "plan": plan})
    try:
        issuer = int(text(root, "issuer/issuerCik"))
    except ValueError:
        issuer = None
    return issuer, out


def _due(checked: str | None, rank: int, today: str) -> bool:
    if not checked:
        return True
    days = (dt.date.fromisoformat(today) - dt.date.fromisoformat(checked)).days
    return days >= (1 if rank < 300 else 3 if rank < 1000 else 7)


def update_recent(s, ciks: list[int], bulk_end: str | None, budget: int) -> dict:
    """Read each company's filing index (most-traded first, within `budget` requests): new Form 4s
    after the last quarterly data set, and earnings-release dates."""
    state = read_json(REF / "insiders_recent.json", {}) or {}
    filings: dict = state.setdefault("filings", {})
    checked: dict = state.setdefault("checked", {})
    earn = read_json(REF / "earnings.json", {}) or {}
    today = today_iso()
    since = bulk_end or (dt.date.today() - dt.timedelta(days=120)).isoformat()
    # filings now covered by a quarterly data set are no longer needed here
    for acc in [a for a, f in filings.items() if (f.get("fd") or "") <= since]:
        del filings[acc]
    lock = threading.Lock()
    count = {"used": 0, "new": 0, "saved": time.monotonic()}

    def spend() -> bool:
        with lock:
            if count["used"] >= budget:
                return False
            count["used"] += 1
            return True

    def company(job: tuple[int, int]) -> None:
        rank, cik = job
        key = str(cik)
        if not _due(checked.get(key), rank, today) or not spend():
            return
        try:
            r = http.get(s, f"https://data.sec.gov/submissions/CIK{cik:010d}.json", timeout=60)
            if r.status_code != 200:
                return
            rec = r.json().get("filings", {}).get("recent", {})
        except Exception as e:  # noqa: BLE001
            log.warning("insiders: submissions %s: %s", cik, e)
            return
        forms, dates, accs, docs, items = (rec.get(k, []) for k in ("form", "filingDate", "accessionNumber", "primaryDocument", "items"))
        got = {d for f, d, it in zip(forms, dates, items) if f == "8-K" and "2.02" in (it or "")}
        todo = [(a, d, doc) for f, d, a, doc in zip(forms, dates, accs, docs) if f == "4" and d > since and a not in filings][:150]
        parsed, complete = {}, True
        for acc, fd, doc in todo:
            if not spend():
                complete = False
                break
            url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc.split('/')[-1]}"
            try:
                x = http.get(s, url, timeout=60)
                if x.status_code == 200:
                    issuer, rows = _form4(x.content)
                    parsed[acc] = {"cik": issuer or cik, "fd": fd, "rows": rows}
            except Exception as e:  # noqa: BLE001
                log.warning("insiders: %s: %s", url, e)
        with lock:
            if got:
                earn[key] = sorted(set(earn.get(key, [])) | got)
            filings.update(parsed)
            count["new"] += len(parsed)
            if complete:
                checked[key] = today
            # keep what has been fetched if the run is cut short
            if time.monotonic() - count["saved"] > 120:
                count["saved"] = time.monotonic()
                write_json(REF / "insiders_recent.json", state)
                write_json(REF / "earnings.json", earn)
                log.info("insiders: %d requests, %d filings, %d companies", count["used"], len(filings), len(checked))

    # a few workers overlap the network waits; http.polite() still spaces requests to each host
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(company, enumerate(ciks)))
    used, new = count["used"], count["new"]
    write_json(REF / "insiders_recent.json", state)
    write_json(REF / "earnings.json", earn)
    return {"requests": used, "new_filings": new, "companies_checked": len(checked)}


# ---------------------------------------------------------------- site files


def summarise(rows: list[dict], today: str) -> dict:
    """Counts, dollar value and distinct people for buys and sells over 90 and 365 days."""
    out: dict = {}
    for days in (90, 365):
        cut = (dt.date.fromisoformat(today) - dt.timedelta(days=days)).isoformat()
        for code, k in (("P", "b"), ("S", "s")):
            sel = [r for r in rows if r["code"] == code and r["td"] >= cut]
            out[f"{k}{days}"] = len(sel)
            out[f"v{k}{days}"] = round(sum(r["sh"] * r["px"] for r in sel))
            out[f"n{k}{days}"] = len({r["who"] for r in sel})
    return out


def export_site(bulk: list[dict], trades: list[dict], companies: dict, symbols: list[str], bulk_end: str | None) -> dict:
    recent = (read_json(REF / "insiders_recent.json", {}) or {}).get("filings", {})
    checked = (read_json(REF / "insiders_recent.json", {}) or {}).get("checked", {})
    earn = read_json(REF / "earnings.json", {}) or {}
    today = today_iso()
    floor = (dt.date.fromisoformat(today) - dt.timedelta(days=KEEP_DAYS)).isoformat()

    by_cik: dict[int, list[dict]] = defaultdict(list)
    seen = set()
    for r in bulk:
        if r["td"] >= floor:
            by_cik[r["cik"]].append(r)
            seen.add(r["acc"])
    for acc, f in recent.items():
        if acc in seen:
            continue
        for r in f.get("rows", []):
            if r["td"] >= floor:
                by_cik[f["cik"]].append({**r, "cik": f["cik"], "acc": acc, "fd": f["fd"]})

    out_dir = SITE / "insider"
    out_dir.mkdir(parents=True, exist_ok=True)
    cut90 = (dt.date.fromisoformat(today) - dt.timedelta(days=90)).isoformat()
    cut30 = (dt.date.fromisoformat(today) - dt.timedelta(days=30)).isoformat()
    off_buys: dict[str, set] = defaultdict(set)
    off_n: dict[str, int] = defaultdict(int)
    for t in trades:
        if t.get("type") == "P" and t.get("sym") and (t.get("fil") or "") >= cut90:
            off_buys[t["sym"]].add(t["m"])
            off_n[t["sym"]] += 1

    both, top, written = [], [], 0
    for sym in symbols:
        cik = (companies.get(sym) or {}).get("cik")
        if not cik:
            continue
        rows = sorted(by_cik.get(int(cik), []), key=lambda r: (r["td"], r["fd"] or ""), reverse=True)
        dates = [d for d in earn.get(str(cik), []) if d >= "2019-06-01"]
        if not rows and not dates:
            continue
        summ = summarise(rows, today)
        tx = [[r["td"], r["fd"], r["who"], r["rel"], r["title"], r["code"], round(r["sh"]), round(r["px"], 2), round(r["sh"] * r["px"]), 1 if r.get("plan") else 0, r["acc"]]
              for r in rows[:MAX_ROWS]]
        # Only things that change when something is filed go in the per-stock file (rolling totals are
        # worked out by the page), so the daily commit touches few files.
        write_json(out_dir / f"{sym}.json", {
            "cik": int(cik), "tx": tx, "earn": dates,
            # false until this company's own index has been read: the months after the last
            # quarterly data set are then still missing
            "full": str(cik) in checked,
        })
        written += 1
        if summ["nb90"] and off_buys.get(sym):
            last = max(r["td"] for r in rows if r["code"] == "P")
            both.append({"sym": sym, "off": sorted(off_buys[sym]), "nob": off_n[sym], "ins": summ["nb90"], "nib": summ["b90"], "vb": summ["vb90"], "last": last})
        # large buyers of the last 30 days: one line per person and stock, their purchases added up
        by_who: dict[str, dict] = {}
        for r in rows:
            if r["code"] == "P" and r["td"] >= cut30:
                b = by_who.setdefault(r["who"], {"sym": sym, "who": r["who"], "rel": r["rel"], "title": r["title"], "td": r["td"], "fd": r["fd"], "val": 0, "n": 0, "acc": r["acc"], "cik": int(cik)})
                b["val"] += round(r["sh"] * r["px"])
                b["n"] += 1
        top.extend(b for b in by_who.values() if b["val"] >= 100_000)
    both.sort(key=lambda b: (len(b["off"]), b["ins"], b["vb"]), reverse=True)
    top.sort(key=lambda b: b["val"], reverse=True)
    uniq, seen_top = [], set()
    for b in top:  # a company with two share classes would otherwise be listed twice
        k = (b["cik"], b["who"])
        if k not in seen_top:
            seen_top.add(k)
            uniq.append(b)
    top = uniq
    write_json(SITE / "insiders.json", {"asof": today, "bulk_end": bulk_end, "both": both[:60], "top": top[:40], "stocks": written})
    return {"stocks": written, "both": len(both), "top_buys": len(top)}


def update(trades: list[dict], fetch: bool = True) -> dict:
    """Refresh insider data (within a request budget) and write the site files."""
    companies = read_json(REF / "companies.json", {}) or {}
    tickers = read_json(SITE / "tickers.json", []) or []
    symbols = [t["sym"] for t in tickers]
    report: dict = {}
    s = None
    if fetch:
        try:
            s = http.session(http.sec_user_agent())
        except RuntimeError as e:
            log.warning("insiders: %s", e)
    bulk, bulk_end = load_bulk(s, fetch and s is not None)
    report["bulk_rows"], report["bulk_end"] = len(bulk), bulk_end
    if s is not None:
        ciks, seen = [], set()
        for sym in symbols:  # tickers.json is ordered by number of official trades
            cik = (companies.get(sym) or {}).get("cik")
            if cik and cik not in seen:
                seen.add(cik)
                ciks.append(int(cik))
        report["recent"] = update_recent(s, ciks, bulk_end, int(os.environ.get("INSIDER_BUDGET", "5000")))
    report["site"] = export_site(bulk, trades, companies, symbols, bulk_end)
    return report
