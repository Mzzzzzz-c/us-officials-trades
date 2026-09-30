"""Estimated trade price and share count.

Disclosures give only the trade date and an amount band. On the trade date:

    typical price   P = (High + Low + Close) / 3
    shares (min)    N_min = A_min / High     (smallest amount at the highest price)
    shares (max)    N_max = A_max / Low      (largest amount at the lowest price)
    shares (point)  N = ((A_min + A_max) / 2) / P

Prices here are the prices actually traded that day (split effects removed).
When the filer wrote an exact price in the description, that price is used.
"""
from __future__ import annotations

from .prices import Series

EQUITY_TYPES = {"ST", "EF", "OT", "RS", "ET", None}


def estimate(tx: dict, s: Series | None) -> dict:
    """Return the `est` block for one transaction (always a dict with `conf`)."""
    at = tx.get("at")
    if at == "OP" or tx.get("opt"):
        return {"conf": "none", "why": "option"}
    if not tx.get("sym"):
        return {"conf": "none", "why": "no_ticker"}
    if at not in EQUITY_TYPES:
        return {"conf": "none", "why": "not_equity"}
    if s is None:
        return {"conf": "none", "why": "no_price"}
    date = tx.get("tx")
    if not date:
        return {"conf": "none", "why": "no_date"}
    hit = s.on(date)
    if hit is None or (date > s.dates[-1]):
        return {"conf": "none", "why": "no_price"}
    i, exact = hit
    d, o, h, lo, c = s.rows[i]
    gap = _days(d, date)
    if gap > 5:
        return {"conf": "none", "why": "no_price"}
    f = s.factor(d)
    H, L, C = h * f, lo * f, c * f
    P = (H + L + C) / 3
    amin, amax = tx.get("amin"), tx.get("amax")
    out = {"d": d, "p": _r(P), "lo": _r(L), "hi": _r(H), "f": f if f != 1.0 else None}

    rep = tx.get("reported")
    if rep and rep.get("price") and L * 0.8 <= rep["price"] <= H * 1.2:
        out.update(p=_r(rep["price"]), lo=_r(rep["price"]), hi=_r(rep["price"]), conf="reported")
        if rep.get("shares"):
            out.update(smin=_r(rep["shares"]), smax=_r(rep["shares"]), smid=_r(rep["shares"]))
            return out
    if amin:
        out["smin"] = _r(amin / H)
        if amax:
            out["smax"] = _r(amax / L)
            out["smid"] = _r((amin + amax) / 2 / P)
    if rep and rep.get("shares") and not rep.get("price"):
        # the filer stated the share count only: keep it if it fits the amount band
        n = rep["shares"]
        if (not amin or n * H >= amin * 0.8) and (not amax or n * L <= amax * 1.2):
            out.update(smin=_r(n), smax=_r(n), smid=_r(n), sh_rep=True)
    if out.get("conf") == "reported":
        return out

    amp = (H - L) / L if L > 0 else 1
    if not exact:
        out["conf"], out["why"] = "low", "not_trading_day"
    elif at not in ("ST", "EF", None) and at != "RS":
        out["conf"], out["why"] = "medium", "asset_type"
    elif amp < 0.02:
        out["conf"] = "high"
    elif amp < 0.08:
        out["conf"], out["why"] = "medium", "wide_range"
    else:
        out["conf"], out["why"] = "low", "very_wide_range"
    return out


def _days(a: str, b: str) -> int:
    import datetime as dt

    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def _r(x: float) -> float:
    if x >= 100:
        return round(x, 2)
    if x >= 1:
        return round(x, 3)
    return round(x, 5)
