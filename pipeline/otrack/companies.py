"""Company names and sectors.

Sector comes from the company's SEC SIC code (EDGAR), grouped into broad
GICS-like sectors. ETFs and funds are detected from the price provider's
instrument type. Cached in data/ref/companies.json.
"""
from __future__ import annotations

import logging

from . import http
from .util import REF, read_json, write_json

log = logging.getLogger(__name__)

# (low, high, sector) - first match wins, so specific ranges come first
SIC_RANGES = [
    (2830, 2836, "health"), (3840, 3851, "health"), (5122, 5122, "health"), (8000, 8099, "health"),
    (3570, 3579, "tech"), (3660, 3679, "tech"), (3670, 3679, "tech"), (7370, 7379, "tech"), (3820, 3829, "tech"),
    (3600, 3629, "tech"), (3640, 3659, "tech"),
    (3630, 3639, "disc"), (3711, 3716, "disc"), (3750, 3751, "disc"), (3900, 3999, "disc"), (2200, 2399, "disc"),
    (2500, 2599, "disc"), (3100, 3199, "disc"), (5400, 5499, "staples"), (5912, 5912, "staples"),
    (5200, 5999, "disc"), (7000, 7099, "disc"), (7200, 7299, "disc"), (7990, 7999, "disc"), (8200, 8299, "disc"),
    (100, 999, "staples"), (2000, 2199, "staples"), (2840, 2844, "staples"),
    (1200, 1399, "energy"), (2900, 2999, "energy"), (4610, 4619, "energy"), (4920, 4923, "energy"),
    (1000, 1099, "mat"), (1400, 1499, "mat"), (2400, 2499, "mat"), (2600, 2699, "mat"), (2800, 2899, "mat"),
    (3000, 3099, "mat"), (3200, 3399, "mat"),
    (4900, 4999, "util"),
    (4800, 4899, "comm"), (2700, 2799, "comm"), (7800, 7989, "comm"),
    (6798, 6798, "re"), (6500, 6599, "re"),
    (6000, 6799, "fin"),
    (1500, 1799, "ind"), (3400, 3599, "ind"), (3690, 3799, "ind"), (3800, 3899, "ind"), (4000, 4799, "ind"),
    (5000, 5199, "ind"), (7300, 7399, "ind"), (8100, 8999, "ind"),
]


def sector_of(sic: int | None, instrument_type: str | None = None) -> str:
    if instrument_type in ("ETF", "MUTUALFUND"):
        return "fund"
    if not sic:
        return "other"
    for lo, hi, sec in SIC_RANGES:
        if lo <= sic <= hi:
            return sec
    return "other"


def update(symbols: set[str]) -> dict:
    """Fetch SIC codes for symbols we haven't seen. Needs SEC_USER_AGENT."""
    path = REF / "companies.json"
    cache: dict = read_json(path, {}) or {}
    todo = sorted(s for s in symbols if s not in cache)
    if not todo:
        return {"new": 0}
    try:
        s = http.session(http.sec_user_agent())
    except RuntimeError as e:
        log.warning("%s - skipping sectors", e)
        return {"skipped": True}
    r = http.get(s, "https://www.sec.gov/files/company_tickers_exchange.json")
    r.raise_for_status()
    d = r.json()
    fields = d["fields"]
    by_ticker = {}
    for row in d["data"]:
        rec = dict(zip(fields, row))
        by_ticker[str(rec["ticker"]).upper().replace("-", ".")] = rec
    new = 0
    for sym in todo:
        rec = by_ticker.get(sym)
        if not rec:
            cache[sym] = {"sic": None}
            continue
        try:
            sub = http.get(s, f"https://data.sec.gov/submissions/CIK{int(rec['cik']):010d}.json").json()
            sic = int(sub.get("sic") or 0) or None
            cache[sym] = {"cik": int(rec["cik"]), "name": rec.get("name"), "sic": sic, "sicd": sub.get("sicDescription"), "exch": rec.get("exchange")}
            new += 1
        except Exception as e:  # noqa: BLE001
            log.warning("sector %s failed: %s", sym, e)
            continue
        if new % 200 == 0:
            write_json(path, cache, pretty=True)
    write_json(path, cache, pretty=True)
    return {"new": new}


def load() -> dict:
    return read_json(REF / "companies.json", {}) or {}
