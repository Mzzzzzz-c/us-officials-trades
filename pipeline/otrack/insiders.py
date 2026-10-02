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
# 8-K items worth a mark on a stock's timeline (earnings, item 2.02, are kept separately)
KEY_ITEMS = {"1.01", "1.02", "1.03", "2.01", "2.05", "2.06", "3.01", "4.01", "4.02", "5.01", "5.02"}
EVENTS_SINCE = "2023-01-01"
NASDAQ_CAL = "https://api.nasdaq.com/api/calendar/earnings?date={d}"
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


def _cik(s) -> int:
    """The reporting owner's SEC number: what tells two people with the same name apart (0 if absent)."""
    try:
        return int(str(s).strip())
    except (TypeError, ValueError):
        return 0


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
            owners[acc] = (r.get("RPTOWNERNAME") or "").strip(), _rel(r.get("RPTOWNER_RELATIONSHIP", "")), (r.get("RPTOWNER_TITLE") or "").strip(), _cik(r.get("RPTOWNERCIK"))
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
        who, rel, title, oc = owners.get(acc, ("", "X", "", 0))
        sub = subs[acc]
        rows.append({"cik": sub["cik"], "acc": acc, "fd": sub["fd"], "td": td, "who": who, "rel": rel, "title": title, "code": code,
                     "sh": sh, "px": px, "plan": sub["plan"], "oc": oc})
    return rows


def load_bulk(s, fetch: bool) -> tuple[list[dict], str | None]:
    """(rows of the last QUARTERS data sets, end date of the newest one)."""
    BULK_DIR.mkdir(parents=True, exist_ok=True)
    cached = {p.stem: (read_json(p, []) or []) for p in BULK_DIR.glob("*.json")}
    # quarters parsed before owner ids were kept are downloaded and parsed again
    have = sorted((q for q, rows in cached.items() if not rows or "oc" in rows[0]), reverse=True)
    stale = sorted((q for q in cached if q not in have), reverse=True)
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
                cached[q] = parse_dataset(r.content)
                write_json(BULK_DIR / f"{q}.json", cached[q])
                have.append(q)
        except Exception as e:  # noqa: BLE001
            log.warning("insiders: data set index failed (using cached quarters): %s", e)
    # a quarter that could not be parsed again is still better than a hole in the history
    have = sorted(set(have) | set(stale), reverse=True)[:QUARTERS]
    rows: list[dict] = []
    for q in have:
        rows.extend(cached[q])
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
    oc = _cik(text(owner, "reportingOwnerId/rptOwnerCik"))
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
        out.append({"td": td, "who": who, "rel": rel or "X", "title": title, "code": code, "sh": sh, "px": px, "plan": plan, "oc": oc})
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
    ev8: dict = read_json(REF / "company_8k.json", {}) or {}
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
        # a company never read for its 8-K events is read once more
        if not (_due(checked.get(key), rank, today) or key not in ev8) or not spend():
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
        major = []
        for f, d, a, it in zip(forms, dates, accs, items):
            keep = sorted(KEY_ITEMS & set((it or "").split(",")))
            if f == "8-K" and keep and d >= EVENTS_SINCE:
                major.append([d, ",".join(keep), a])
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
            old = {e[2]: e for e in ev8.get(key, [])}
            old.update({e[2]: e for e in major})
            ev8[key] = sorted(old.values())
            filings.update(parsed)
            count["new"] += len(parsed)
            if complete:
                checked[key] = today
            # keep what has been fetched if the run is cut short
            if time.monotonic() - count["saved"] > 120:
                count["saved"] = time.monotonic()
                write_json(REF / "insiders_recent.json", state)
                write_json(REF / "earnings.json", earn)
                write_json(REF / "company_8k.json", ev8)
                log.info("insiders: %d requests, %d filings, %d companies", count["used"], len(filings), len(checked))

    # a few workers overlap the network waits; http.polite() still spaces requests to each host
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(company, enumerate(ciks)))
    used, new = count["used"], count["new"]
    write_json(REF / "insiders_recent.json", state)
    write_json(REF / "earnings.json", earn)
    write_json(REF / "company_8k.json", ev8)
    return {"requests": used, "new_filings": new, "companies_checked": len(checked)}


def update_calendar(days: int = 75) -> dict:
    """Announced earnings dates for the coming weeks from Nasdaq's public calendar (dates only).
    {sym: [date, "pre" | "post" | ""]}; dates already past are dropped, the rest kept if a day fails."""
    import requests

    cal = read_json(REF / "earnings_next.json", {}) or {}
    today = dt.date.fromisoformat(today_iso())
    dates: dict = {k: v for k, v in (cal.get("dates") or {}).items() if v[0] >= today.isoformat()}
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept": "application/json"})
    ok = fail = 0
    seen: set[str] = set()
    for k in range(days):
        day = today + dt.timedelta(days=k)
        if day.weekday() >= 5:
            continue
        try:
            r = http.get(s, NASDAQ_CAL.format(d=day.isoformat()), timeout=20)
            rows = ((r.json().get("data") or {}).get("rows") or []) if r.status_code == 200 else None
        except Exception:  # noqa: BLE001
            rows = None
        if rows is None:
            fail += 1
            if fail >= 4 and not ok:
                break  # blocked from here: keep what we have
            continue
        ok += 1
        for row in rows:
            sym = (row.get("symbol") or "").strip().upper().replace("/", ".")
            if not sym or sym in seen:
                continue
            seen.add(sym)
            when = {"time-pre-market": "pre", "time-after-hours": "post"}.get(row.get("time") or "", "")
            dates[sym] = [day.isoformat(), when]
    if ok:
        # a company the calendar no longer lists on its old date has moved or reported
        first, last = today.isoformat(), (today + dt.timedelta(days=days)).isoformat()
        dates = {k: v for k, v in dates.items() if k in seen or not (first <= v[0] <= last) or fail}
        write_json(REF / "earnings_next.json", {"asof": today.isoformat(), "dates": dates})
    return {"days_ok": ok, "days_failed": fail, "companies": len(dates)}


def project_earnings(dates: list[str], today: str) -> str | None:
    """Next release estimated from the same quarter a year earlier (companies report on a steady
    yearly rhythm); None when there is too little history or the estimate is already past."""
    if len(dates) < 4:
        return None
    last = dt.date.fromisoformat(dates[-1])
    # the release that followed the latest one, a year ago: the first date more than 45 days
    # after (latest - 1 year)
    for d in dates:
        guess = dt.date.fromisoformat(d) + dt.timedelta(days=364)
        if guess > last + dt.timedelta(days=45):
            return guess.isoformat() if guess.isoformat() > today and guess < last + dt.timedelta(days=150) else None
    return None


def fill_owner_ids(s, bulk: list[dict], budget: int) -> dict:
    """Filings stored before owner ids were kept: take the id from another filing by the same person
    at the same company, or read it from the filing itself."""
    state = read_json(REF / "insiders_recent.json", {}) or {}
    filings: dict = state.get("filings", {})
    known = {(r["cik"], r["who"]): r["oc"] for r in bulk if r.get("oc")}
    for f in filings.values():
        for r in f.get("rows", []):
            if r.get("oc"):
                known[(f["cik"], r["who"])] = r["oc"]
    todo, matched = [], 0
    for acc, f in filings.items():
        rows = [r for r in f.get("rows", []) if "oc" not in r]
        if not rows:
            continue
        for r in rows:
            if (f["cik"], r["who"]) in known:
                r["oc"] = known[(f["cik"], r["who"])]
                matched += 1
        if any("oc" not in r for r in rows):
            todo.append(acc)
    fetched = 0
    if s is not None and todo:
        lock = threading.Lock()

        def one(acc: str) -> None:
            nonlocal fetched
            f = filings[acc]
            url = f"https://www.sec.gov/Archives/edgar/data/{f['cik']}/{acc.replace('-', '')}/{acc}.txt"
            try:
                x = http.get(s, url, timeout=60)
                m = re.search(rb"<rptOwnerCik>\s*(\d+)", x.content) if x.status_code == 200 else None
            except Exception as e:  # noqa: BLE001
                log.warning("insiders: %s: %s", url, e)
                return
            with lock:
                # 0 = looked and found nothing: do not ask again
                oc = int(m.group(1)) if m else 0
                for r in f["rows"]:
                    r.setdefault("oc", oc)
                    if oc:
                        known[(f["cik"], r["who"])] = oc
                fetched += 1
                if fetched % 1000 == 0:
                    write_json(REF / "insiders_recent.json", state)
                    log.info("insiders: owner ids %d/%d", fetched, len(todo))

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(one, todo[:budget]))
    if matched or fetched:
        write_json(REF / "insiders_recent.json", state)
    return {"matched": matched, "fetched": fetched, "left": max(0, len(todo) - fetched)}


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


def fix_prices(rows: list[dict], market: float | None = None) -> list[dict]:
    """Some filers type the total proceeds into the price-per-share box, which turns a $2M sale into
    billions. A price more than 20 times what the company's other trades (or the market) show is
    read as the total when that gives a sensible price, and the row is dropped otherwise."""
    prices = sorted(r["px"] for r in rows)
    ref = prices[len(prices) // 2] if len(prices) >= 5 else market
    if not ref:
        return rows
    out = []
    for r in rows:
        if r["px"] <= 20 * ref:
            out.append(r)
        elif ref / 3 <= r["px"] / r["sh"] <= ref * 3:
            out.append({**r, "px": r["px"] / r["sh"]})
    return out


def export_site(bulk: list[dict], trades: list[dict], companies: dict, symbols: list[str], bulk_end: str | None) -> dict:
    recent = (read_json(REF / "insiders_recent.json", {}) or {}).get("filings", {})
    checked = (read_json(REF / "insiders_recent.json", {}) or {}).get("checked", {})
    earn = read_json(REF / "earnings.json", {}) or {}
    ev8 = read_json(REF / "company_8k.json", {}) or {}
    upcoming = (read_json(REF / "earnings_next.json", {}) or {}).get("dates", {})
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
    people: dict[int, dict] = {}
    people_done: set[int] = set()
    fixed: set[int] = set()
    coming: list[list] = []
    market = (read_json(SITE / "latest-prices.json", {}) or {}).get("px", {})
    for sym in symbols:
        cik = (companies.get(sym) or {}).get("cik")
        if not cik:
            continue
        if int(cik) not in fixed:
            fixed.add(int(cik))
            by_cik[int(cik)] = fix_prices(by_cik.get(int(cik), []), market.get(sym))
        rows = sorted(by_cik.get(int(cik), []), key=lambda r: (r["td"], r["fd"] or ""), reverse=True)
        dates = [d for d in earn.get(str(cik), []) if d >= "2019-06-01"]
        events = ev8.get(str(cik), [])
        nxt = None
        if sym in upcoming and upcoming[sym][0] >= today:
            nxt = [upcoming[sym][0], upcoming[sym][1], "cal"]
        elif (guess := project_earnings(dates, today)):
            nxt = [guess, "", "est"]
        if nxt:
            coming.append([nxt[0], sym, nxt[1], nxt[2]])
        if not rows and not dates and not events:
            continue
        summ = summarise(rows, today)
        tx = [[r["td"], r["fd"], r["who"], r["rel"], r["title"], r["code"], round(r["sh"]), round(r["px"], 2), round(r["sh"] * r["px"]), 1 if r.get("plan") else 0, r["acc"], r.get("oc") or 0]
              for r in rows[:MAX_ROWS]]
        if int(cik) not in people_done:  # a company with two share classes is counted once
            people_done.add(int(cik))
            for r in rows[:MAX_ROWS]:
                oc = r.get("oc")
                if not oc:
                    continue
                p = people.setdefault(oc, {"name": r["who"], "cos": {}})
                c = p["cos"].setdefault(sym, {"rel": r["rel"], "title": r["title"], "b": 0, "s": 0, "vb": 0, "vs": 0, "last": r["td"]})
                k = "b" if r["code"] == "P" else "s"
                c[k] += 1
                c["v" + k] += round(r["sh"] * r["px"])
        # Only things that change when something is filed go in the per-stock file (rolling totals are
        # worked out by the page), so the daily commit touches few files.
        write_json(out_dir / f"{sym}.json", {
            "cik": int(cik), "tx": tx, "earn": dates,
            # major 8-K announcements [date, items, accession] and the next earnings date
            # [date, pre|post, cal (announced) | est (projected from last year)]
            "ev": events, "next": nxt,
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
                b = by_who.setdefault(r["who"], {"sym": sym, "who": r["who"], "rel": r["rel"], "title": r["title"], "td": r["td"], "fd": r["fd"], "val": 0, "n": 0, "acc": r["acc"], "cik": int(cik), "oc": r.get("oc") or 0})
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
    write_json(SITE / "insiders.json", {"asof": today, "bulk_end": bulk_end, "both": both[:60], "top": top[:40], "stocks": written, "people": len(people),
                                        # next earnings dates [date, symbol, pre|post, cal|est], soonest first
                                        "upcoming": sorted(coming)})
    write_json(SITE / "events.json", {"macro": read_json(REF / "macro_events.json", {}) or {}, "company": read_json(REF / "company_events.json", []) or []})
    # One line per insider for the list and profile pages; their trades stay in the per-stock files.
    # [id, name, relationship, title, stocks (largest first), buys, sells, bought $, sold $, last trade]
    # [..., everyday name, Chinese name] for the few hundred people Wikidata knows (scripts/insider_wikidata.py)
    known = read_json(REF / "insider_names.json", {}) or {}
    index = []
    for oc, p in people.items():
        cos = sorted(p["cos"].items(), key=lambda kv: kv[1]["vb"] + kv[1]["vs"], reverse=True)
        main = cos[0][1]
        index.append([oc, p["name"], "".join(c for c in "DOT" if any(c in v["rel"] for _, v in cos)) or "X", main["title"], [k for k, _ in cos],
                      sum(v["b"] for _, v in cos), sum(v["s"] for _, v in cos), sum(v["vb"] for _, v in cos), sum(v["vs"] for _, v in cos),
                      max(v["last"] for _, v in cos), known.get(str(oc), {}).get("en", ""), known.get(str(oc), {}).get("zh", "")])
    index.sort(key=lambda r: (r[9], r[7] + r[8]), reverse=True)
    write_json(SITE / "insider-people.json", {"asof": today, "people": index})
    return {"stocks": written, "both": len(both), "top_buys": len(top), "people": len(index)}


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
    if fetch:
        try:
            report["calendar"] = update_calendar()
        except Exception as e:  # noqa: BLE001
            log.warning("insiders: earnings calendar: %s", e)
    if fetch:
        try:
            from . import media

            report["photos"] = media.fetch_insider_photos()
        except Exception as e:  # noqa: BLE001
            log.warning("insiders: portraits: %s", e)
    report["owner_ids"] = fill_owner_ids(s, bulk, int(os.environ.get("INSIDER_BUDGET", "5000")))
    report["site"] = export_site(bulk, trades, companies, symbols, bulk_end)
    return report
