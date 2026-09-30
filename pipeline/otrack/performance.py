"""Entry prices and fixed-horizon returns: the official vs. someone copying them.

  official entry  = estimated price on the trade date
  follower entry  = opening price on the first trading day after the filing
                    became public (the disclosure date)

Returns are price returns (dividends excluded) on split-adjusted prices, and
are always shown next to the S&P 500 ETF (SPY) over the same window. Only
horizons that have fully elapsed are stored, so values never change afterwards.
"""
from __future__ import annotations

import datetime as dt
from statistics import mean, median

from .prices import Series


def _plus(date: str, days: int) -> str:
    return (dt.date.fromisoformat(date) + dt.timedelta(days=days)).isoformat()


def _typical(row) -> float:
    _, _, h, lo, c = row
    return (h + lo + c) / 3


def entries(t: dict, s: Series | None, spy: Series) -> dict | None:
    est = t.get("est") or {}
    if s is None or not est.get("d"):
        return None
    d = est["d"]
    f = est.get("f") or 1.0
    off = est["p"] / f  # back to today's share basis
    ent = {"off": round(off, 4)}
    hit = spy.on(d)
    if hit:
        ent["soff"] = round(_typical(spy.rows[hit[0]]), 4)
    if t.get("fil"):
        i = s.after(t["fil"])
        j = spy.after(t["fil"])
        if i is not None and j is not None:
            ent["fold"] = s.dates[i]
            ent["fol"] = s.rows[i][1]
            ent["sfol"] = spy.rows[j][1]
    return ent


def horizons(t: dict, s: Series | None, spy: Series, hs: list[int]) -> dict:
    ent = t.get("ent")
    if not ent or s is None:
        return {}
    out = {}
    for h in hs:
        row = [None, None, None, None]
        tgt = _plus(t["est"]["d"], h)
        i, j = s.on_or_after(tgt), spy.on_or_after(tgt)
        if i is not None and j is not None and ent.get("soff") and s.dates[i] <= _plus(tgt, 7):
            row[0] = round(s.rows[i][4] / ent["off"] - 1, 4)
            row[2] = round(spy.rows[j][4] / ent["soff"] - 1, 4)
        if ent.get("fold"):
            tgt = _plus(ent["fold"], h)
            i, j = s.on_or_after(tgt), spy.on_or_after(tgt)
            if i is not None and j is not None and s.dates[i] <= _plus(tgt, 7):
                row[1] = round(s.rows[i][4] / ent["fol"] - 1, 4)
                row[3] = round(spy.rows[j][4] / ent["sfol"] - 1, 4)
        if any(v is not None for v in row):
            out[str(h)] = row
    return out


def summarize(trades: list[dict], hs: list[int]) -> dict:
    """Average excess return vs SPY, by horizon, for buys (and price move after sells)."""
    res = {}
    for side, types in (("buy", {"P"}), ("sell", {"SF", "SP", "S"})):
        per = {}
        for h in hs:
            k = str(h)
            off = [t["h"][k][0] - t["h"][k][2] for t in trades if t["type"] in types and k in t.get("h", {}) and t["h"][k][0] is not None]
            fol = [t["h"][k][1] - t["h"][k][3] for t in trades if t["type"] in types and k in t.get("h", {}) and t["h"][k][1] is not None]
            if off or fol:
                per[k] = {
                    "n": len(off),
                    "off": round(mean(off), 4) if off else None,
                    "off_med": round(median(off), 4) if off else None,
                    "nf": len(fol),
                    "fol": round(mean(fol), 4) if fol else None,
                    "win": round(sum(1 for x in off if x > 0) / len(off), 3) if off else None,
                }
        if per:
            res[side] = per
    return res
