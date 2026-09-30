"""Reconstruct each official's position in each stock from their trades.

Holdings are tracked as a share range [lo, hi] in today's share basis (earlier
splits applied), per account (owner self / spouse / joint / child, plus the
sub-account named in House filings), and reported as the total. `hi = None` means the upper bound is unknown (open-ended amount, no
price estimate, or holdings that existed before our data starts).

Actions: open (first buy / buy after a full exit), add, reduce, close, sell
(Senate "Sale" without full/partial), exchange.
"""
from __future__ import annotations

from collections import defaultdict

BUY, FULL, PARTIAL, SALE, EXCH = "P", "SF", "SP", "S", "E"
STOCKLIKE = {"ST", "EF", "OT", "RS", "ET", None}


def _add(a, b):
    return None if a is None or b is None else a + b


def _shares(t: dict) -> tuple[float | None, float | None]:
    """Share range of one trade in today's share basis."""
    est = t.get("est") or {}
    f = est.get("f") or 1.0
    smin, smax = est.get("smin"), est.get("smax")
    return (smin * f if smin is not None else None, smax * f if smax is not None else None)


def build(trades: list[dict]) -> list[dict]:
    """Annotate trades with `act` and return one timeline per (member, symbol)."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for t in trades:
        # shares only: option contracts, bonds and funds are not share positions
        if t.get("sym") and t.get("tx") and not t.get("opt") and t.get("at") in STOCKLIKE:
            groups[(t["m"], t["sym"])].append(t)

    out = []
    for (mid, sym), ts in groups.items():
        ts.sort(key=lambda t: (t["tx"], t.get("fil") or "", t["id"]))
        hold: dict[str, list] = {}  # account (owner + sub-account) -> [lo, hi]
        flags: set[str] = set()
        steps = []
        for t in ts:
            # a full sale empties one account, not everything the official owns
            acct = f'{t.get("own", "SELF")}|{t.get("sub") or ""}'
            h = hold.setdefault(acct, [0.0, 0.0])
            total_before_hi = sum_hi(hold)
            total_before_lo = sum(v[0] for v in hold.values())
            smin, smax = _shares(t)
            typ = t["type"]
            if typ == BUY:
                act = "open" if (total_before_lo == 0 and total_before_hi == 0) or not steps else "add"
                if not steps and total_before_hi == 0:
                    flags.add("first_seen_buy")
                h[0] = h[0] + (smin or 0)
                h[1] = _add(h[1], smax) if smin is not None else None
                if smin is None:
                    flags.add("unknown_size")
            elif typ == FULL:
                if not steps:
                    flags.add("held_before_data")
                h[0], h[1] = 0.0, 0.0
                act = "close" if all(v == [0.0, 0.0] for v in hold.values()) else "reduce"
            elif typ in (PARTIAL, SALE):
                if not steps:
                    flags.add("held_before_data")
                if smin is None:
                    h[0], h[1] = 0.0, None
                    flags.add("unknown_size")
                else:
                    lo = max(0.0, h[0] - (smax if smax is not None else h[0]))
                    hi = None if h[1] is None else h[1] - smin
                    if hi is not None and hi < 0:
                        hi = None  # sold more than we saw bought: earlier holdings we can't see
                        flags.add("held_before_data")
                    h[0], h[1] = lo, hi
                act = "reduce" if typ == PARTIAL else "sell"
            elif typ == EXCH:
                act = "exchange"
            else:
                act = "other"
            t["act"] = act
            lo_t = sum(v[0] for v in hold.values())
            hi_t = sum_hi(hold)
            steps.append({"id": t["id"], "tx": t["tx"], "act": act, "lo": _rs(lo_t), "hi": _rs(hi_t)})
        last = steps[-1]
        out.append({
            "m": mid,
            "sym": sym,
            "steps": steps,
            "flags": sorted(flags),
            "first": steps[0]["tx"],
            "last": last["tx"],
            "held": not (last["lo"] == 0 and last["hi"] == 0),
        })
    return out


def sum_hi(hold: dict) -> float | None:
    total = 0.0
    for v in hold.values():
        if v[1] is None:
            return None
        total += v[1]
    return total


def _rs(x):
    if x is None:
        return None
    return round(x, 2) if x < 1000 else round(x)
