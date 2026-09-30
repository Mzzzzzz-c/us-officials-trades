"""Daily prices with a pluggable provider and a local cache.

Stored prices are *split-adjusted* OHLC (today's share basis) plus the list of
splits, so we can recover the price actually traded on any past day:

    raw_price(d) = adjusted_price(d) * product(ratio of every split after d)

Providers:
  * yahoo         - free, no key (default)
  * alphavantage  - needs ALPHAVANTAGE_API_KEY (full history requires a premium plan)
"""
from __future__ import annotations

import bisect
import datetime as dt
import logging
import os
import time
from zoneinfo import ZoneInfo

from . import http
from .util import CACHE, read_json, today_iso, write_json

log = logging.getLogger(__name__)

PRICE_DIR = CACHE / "prices"
MISSING_RETRY_DAYS = 30


def yahoo_symbol(sym: str) -> str:
    return sym.replace(".", "-")


class YahooProvider:
    name = "yahoo"

    def __init__(self):
        # Yahoo throttles unfamiliar user agents; a plain one works. We handle 429s ourselves.
        self.s = http.session("Mozilla/5.0", retry_429=False)

    def fetch(self, sym: str, start: str) -> dict | None:
        p1 = int(dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc).timestamp())
        p2 = int(time.time()) + 86400
        host = os.environ.get("YAHOO_HOST", "query1.finance.yahoo.com")
        url = (
            f"https://{host}/v8/finance/chart/{yahoo_symbol(sym)}"
            f"?period1={p1}&period2={p2}&interval=1d&events=split&includeAdjustedClose=false"
        )
        for attempt in range(4):
            r = http.get(self.s, url)
            if r.status_code != 429:
                break
            time.sleep(15 * (attempt + 1))  # rate limited: cool down, then retry
        if r.status_code in (400, 404):
            return None
        r.raise_for_status()
        res = (r.json().get("chart") or {}).get("result") or []
        if not res:
            return None
        res = res[0]
        meta = res.get("meta", {})
        off = int(meta.get("gmtoffset") or 0)
        ts = res.get("timestamp") or []
        q = (res.get("indicators", {}).get("quote") or [{}])[0]
        ny = dt.datetime.now(ZoneInfo("America/New_York"))
        unfinished = ny.date().isoformat() if ny.time() < dt.time(16, 30) else "9999-12-31"
        rows = []
        for i, t in enumerate(ts):
            o, h, lo, c = (q.get(k, [None] * len(ts))[i] for k in ("open", "high", "low", "close"))
            if c is None:
                continue
            o = o if o is not None else c
            h = max(x for x in (h, o, c) if x is not None)  # thin OTC quotes can be inconsistent
            lo = min(x for x in (lo, o, c) if x is not None)
            d = dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat()
            if d >= unfinished:
                continue  # today's bar before the US close is still moving
            rows.append([d, round(o, 4), round(h, 4), round(lo, 4), round(c, 4)])
        splits = []
        for sp in (res.get("events", {}).get("splits") or {}).values():
            if sp.get("denominator"):
                d = dt.datetime.fromtimestamp(sp["date"] + off, dt.timezone.utc).date().isoformat()
                splits.append([d, sp["numerator"] / sp["denominator"]])
        splits.sort()
        # the same calendar day can appear twice (intraday "current" bar); keep the last
        dedup = {r[0]: r for r in rows}
        return {
            "rows": [dedup[k] for k in sorted(dedup)],
            "splits": splits,
            "meta": {
                "name": meta.get("longName") or meta.get("shortName"),
                "type": meta.get("instrumentType"),
                "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
                "currency": meta.get("currency"),
            },
        }


class AlphaVantageProvider:
    name = "alphavantage"

    def __init__(self):
        self.key = os.environ.get("ALPHAVANTAGE_API_KEY", "")
        if not self.key:
            raise RuntimeError("ALPHAVANTAGE_API_KEY is not set")
        self.s = http.session()

    def fetch(self, sym: str, start: str) -> dict | None:
        url = (
            "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED"
            f"&symbol={sym}&outputsize=full&apikey={self.key}"
        )
        r = http.get(self.s, url)
        r.raise_for_status()
        d = r.json()
        series = d.get("Time Series (Daily)")
        if not series:
            if "Error Message" in d:
                return None
            raise RuntimeError(f"Alpha Vantage: {str(d)[:200]}")
        days = sorted(k for k in series if k >= start)
        # raw prices + split coefficients -> split-adjusted prices
        splits = [[k, float(series[k]["8. split coefficient"])] for k in days if float(series[k]["8. split coefficient"]) != 1.0]
        rows = []
        for k in days:
            v = series[k]
            f = 1.0
            for sd, ratio in splits:
                if sd > k:
                    f *= ratio
            rows.append([k] + [round(float(v[x]) / f, 4) for x in ("1. open", "2. high", "3. low", "4. close")])
        return {"rows": rows, "splits": splits, "meta": {}}


def provider(name: str):
    return AlphaVantageProvider() if name == "alphavantage" else YahooProvider()


# ---------------------------------------------------------------- cache


def _path(sym: str):
    return PRICE_DIR / f"{sym}.json"


def update(symbols: list[str], prov_name: str, start: str) -> dict:
    """Bring the local price cache up to date for these symbols."""
    prov = provider(prov_name)
    today = today_iso()
    stats = {"fetched": 0, "fresh": 0, "missing": 0, "errors": 0}
    for i, sym in enumerate(sorted(set(symbols))):
        p = _path(sym)
        old = read_json(p)
        if old and old.get("checked") == today:
            stats["fresh"] += 1
            continue
        if old and old.get("missing"):
            last = dt.date.fromisoformat(old["checked"])
            if (dt.date.today() - last).days < MISSING_RETRY_DAYS:
                stats["missing"] += 1
                continue
        if old and old.get("rows") and old.get("checked"):
            # no trading for a month (delisted / renamed): look again only once a week
            stale = (dt.date.today() - dt.date.fromisoformat(old["rows"][-1][0])).days > 30
            if stale and (dt.date.today() - dt.date.fromisoformat(old["checked"])).days < 7:
                stats["fresh"] += 1
                continue
        try:
            if old and old.get("rows"):
                since = (dt.date.fromisoformat(old["rows"][-1][0]) - dt.timedelta(days=10)).isoformat()
                new = prov.fetch(sym, since)
                if new and any(sd > old["rows"][-1][0] for sd, _ in new["splits"]):
                    new = prov.fetch(sym, start)  # a new split re-bases all history
                elif new:
                    merged = {r[0]: r for r in old["rows"]}
                    merged.update({r[0]: r for r in new["rows"]})
                    new["rows"] = [merged[k] for k in sorted(merged)]
                    known = {tuple(x) for x in old.get("splits", [])}
                    new["splits"] = sorted(known | {tuple(x) for x in new["splits"]})
                    new["meta"] = new.get("meta") or old.get("meta", {})
            else:
                new = prov.fetch(sym, start)
        except Exception as e:  # noqa: BLE001
            log.warning("prices %s failed: %s", sym, e)
            stats["errors"] += 1
            continue
        if not new or not new.get("rows"):
            write_json(p, {"sym": sym, "missing": True, "checked": today})
            stats["missing"] += 1
            continue
        write_json(p, {"sym": sym, "checked": today, "provider": prov.name, **new})
        stats["fetched"] += 1
        if (i + 1) % 200 == 0:
            log.info("prices: %d symbols processed", i + 1)
    return stats


class Series:
    """Fast lookups on one symbol's cached daily prices."""

    def __init__(self, sym: str, d: dict):
        self.sym = sym
        self.rows = d.get("rows", [])
        self.dates = [r[0] for r in self.rows]
        self.splits = [tuple(x) for x in d.get("splits", [])]
        self.meta = d.get("meta", {})

    def __bool__(self):
        return bool(self.rows)

    def factor(self, date: str) -> float:
        """Multiply an adjusted price on `date` by this to get the price traded that day."""
        f = 1.0
        for sd, ratio in self.splits:
            if sd > date:
                f *= ratio
        return f

    def on(self, date: str) -> tuple[int, bool] | None:
        """Index of the trading day on `date`, or the last one before it. bool = exact match."""
        i = bisect.bisect_right(self.dates, date) - 1
        if i < 0:
            return None
        return i, self.dates[i] == date

    def after(self, date: str) -> int | None:
        """Index of the first trading day strictly after `date`."""
        i = bisect.bisect_right(self.dates, date)
        return i if i < len(self.dates) else None

    def on_or_after(self, date: str) -> int | None:
        i = bisect.bisect_left(self.dates, date)
        return i if i < len(self.dates) else None

    def last(self):
        return self.rows[-1] if self.rows else None


def load(sym: str) -> Series | None:
    d = read_json(_path(sym))
    if not d or d.get("missing") or not d.get("rows"):
        return None
    return Series(sym, d)
