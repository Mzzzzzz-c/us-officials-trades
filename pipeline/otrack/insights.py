"""Cross-cutting analysis for the Insights page and the member pages.

- copy-trade backtest: buy every stock an official buys at the first open after the report
  becomes public, hold 90 days, equal weight, compared with SPY (and the same trades at the
  official's own estimated price, which shows what the disclosure delay costs)
- leaderboard of officials by how well their buys did for someone copying them
- sector money flows, monthly buy/sell activity, cluster buys (several officials, same stock,
  same month), trades in industries the official oversees, best- and worst-timed trades,
  disclosure delays, party comparison
"""
from __future__ import annotations

import datetime as dt
import math
from bisect import bisect_right
from collections import Counter, defaultdict
from statistics import mean, median

from .prices import Series

HOLD_DAYS = 90
STOCK_TYPES = {"ST", None}

# ---------------------------------------------------------------- oversight map
# Industries (SIC ranges) a committee or agency has jurisdiction over. Used to flag trades
# that deserve a second look; a flag is not an accusation.
DEFENSE = [(3480, 3489), (3720, 3729), (3760, 3769), (3795, 3795), (3812, 3812)]
ENERGY = [(1300, 1399), (2900, 2999), (4610, 4619), (4900, 4949)]
FIN = [(6000, 6399), (6700, 6799)]
HEALTH = [(2830, 2836), (3840, 3851), (5122, 5122), (6324, 6324), (8000, 8099)]
AGRI = [(100, 999), (2000, 2099), (2870, 2879), (3523, 3523)]
TRANSPORT = [(3710, 3716), (3720, 3729), (4000, 4799)]
TELECOM = [(4800, 4899)]
MINING = [(1000, 1099), (1200, 1299), (1400, 1499)]
SPACE = [(3760, 3769), (3720, 3729), (3812, 3812)]

COMMITTEE_SIC = {
    "HSAS": DEFENSE, "SSAS": DEFENSE, "HLIG": DEFENSE, "SLIN": DEFENSE,
    "HSIF": ENERGY + HEALTH + TELECOM, "SSEG": ENERGY + MINING, "HSII": ENERGY + MINING,
    "HSBA": FIN, "SSBK": FIN,
    "HSAG": AGRI, "SSAF": AGRI,
    "SSHR": HEALTH, "SSFI": HEALTH + FIN, "HSWM": HEALTH,
    "SSCM": TRANSPORT + TELECOM + SPACE, "HSPW": TRANSPORT,
    "HSSY": SPACE + ENERGY, "SSEV": ENERGY,
}
AGENCY_SIC = [
    ("Treasury", FIN), ("Federal Reserve", FIN), ("Defense", DEFENSE), ("Navy", DEFENSE), ("Air Force", DEFENSE),
    ("Energy", ENERGY), ("Interior", ENERGY + MINING), ("Health", HEALTH), ("Transportation", TRANSPORT),
    ("Aeronautics", SPACE), ("Agriculture", AGRI), ("Environmental Protection", ENERGY),
]


def _in(sic: int | None, ranges) -> bool:
    return bool(sic) and any(lo <= sic <= hi for lo, hi in ranges)


def oversight(profile: dict, sic: int | None) -> str | None:
    """The committee id (or 'agency') whose remit covers this company's industry."""
    if not sic:
        return None
    if profile.get("chamber") == "E":
        ag = profile.get("agency") or ""
        for key, ranges in AGENCY_SIC:
            if key.lower() in ag.lower() and _in(sic, ranges):
                return "agency"
        return None
    for c in profile.get("committees") or []:
        if _in(sic, COMMITTEE_SIC.get(c["id"], [])):
            return c["id"]
    return None


# ---------------------------------------------------------------- backtest


def _mid(t: dict) -> float:
    lo, hi = t.get("amin") or 0, t.get("amax") or t.get("amin") or 0
    return (lo + hi) / 2


def _stock_buy(t: dict) -> bool:
    return t["type"] == "P" and not t.get("opt") and t.get("at") in STOCK_TYPES and bool(t.get("sym"))


def backtest(trades: list[dict], series: dict[str, Series | None], spy: Series, start: str, entry: str = "fol",
             hold: int = HOLD_DAYS, keep=None) -> dict | None:
    """Equal-weight portfolio of every stock buy, each held `hold` calendar days.

    entry: 'fol' (a copier, from the first open after the report is public) or 'off' (the
    official, from the estimated trade price). keep: optional filter on the trades.
    """
    add: dict[str, float] = defaultdict(float)
    cnt: dict[str, int] = defaultdict(int)
    n = 0
    xs: list[float] = []
    for t in trades:
        if not _stock_buy(t) or (keep is not None and not keep(t)):
            continue
        s = series.get(t["sym"])
        ent = t.get("ent") or {}
        if s is None or not s.rows:
            continue
        if entry == "fol":
            d0 = ent.get("fold")
            if not d0:
                continue
            i0 = s.on_or_after(d0)
            if i0 is None or s.dates[i0] != d0:
                continue
            p0 = s.rows[i0][1]  # open
        else:
            d0 = (t.get("est") or {}).get("d")
            i0 = s.on_or_after(d0) if d0 else None
            if i0 is None or s.dates[i0] != d0:
                continue
            p0 = ent.get("off")
        if not p0 or p0 <= 0 or d0 < start:
            continue
        end = (dt.date.fromisoformat(d0) + dt.timedelta(days=hold)).isoformat()
        prev = p0
        i = i0
        ok = False
        while i < len(s.rows) and s.dates[i] <= end:
            c = s.rows[i][4]
            if c and prev:
                r = c / prev - 1
                if abs(r) < 0.6:  # a bad print, not a real one-day move
                    add[s.dates[i]] += r
                    cnt[s.dates[i]] += 1
                    ok = True
            prev = c
            i += 1
        n += ok
        h = (t.get("h") or {}).get(str(hold))
        k = (1, 3) if entry == "fol" else (0, 2)
        if ok and h and h[k[0]] is not None and h[k[1]] is not None:
            xs.append(h[k[0]] - h[k[1]])
    if not n:
        return None
    nav, bench = 1.0, 1.0
    curve = []
    first = None
    prev_spy = None
    for d, row in zip(spy.dates, spy.rows):
        if d < start:
            prev_spy = row[4]
            continue
        if first is None:
            if not cnt.get(d):
                prev_spy = row[4]
                continue
            first = d
        if cnt.get(d):
            nav *= 1 + add[d] / cnt[d]
        if prev_spy:
            bench *= row[4] / prev_spy
        prev_spy = row[4]
        curve.append((d, nav, bench, cnt.get(d, 0)))
    if not curve:
        return None
    out = _stats(curve, n)
    # position level: how often one copied trade beat the S&P 500 over the holding period
    if xs:
        out["x"] = round(mean(xs), 4)
        out["hit"] = round(sum(1 for x in xs if x > 0) / len(xs), 3)
        out["nx"] = len(xs)
    return out


def _r(x: float | None, d: int = 4) -> float | None:
    return None if x is None else round(x, d)


def _stats(curve: list[tuple], n: int) -> dict:
    days = (dt.date.fromisoformat(curve[-1][0]) - dt.date.fromisoformat(curve[0][0])).days or 1
    yrs = days / 365.25

    def cagr(v: float) -> float | None:
        # annualising less than a year of history exaggerates; show the cumulative return instead
        return v ** (1 / yrs) - 1 if yrs >= 1 and v > 0 else None

    def mdd(k: int) -> float:
        peak, worst = 0.0, 0.0
        for row in curve:
            peak = max(peak, row[k])
            worst = min(worst, row[k] / peak - 1)
        return worst

    rets = [curve[i][1] / curve[i - 1][1] - 1 for i in range(1, len(curve))]
    vol = (sum((r - mean(rets)) ** 2 for r in rets) / max(1, len(rets) - 1)) ** 0.5 * math.sqrt(252) if len(rets) > 20 else None
    years: dict[str, list] = {}
    for d, a, b, _ in curve:
        y = d[:4]
        years.setdefault(y, [a, b, a, b])
        years[y][2], years[y][3] = a, b
    by_year = []
    prev = (1.0, 1.0)
    for y in sorted(years):
        a0, b0 = prev
        a1, b1 = years[y][2], years[y][3]
        by_year.append({"y": y, "s": round(a1 / a0 - 1, 4), "b": round(b1 / b0 - 1, 4)})
        prev = (a1, b1)
    # weekly points keep the file small
    pts, last_wk = [], None
    for d, a, b, c in curve:
        wk = dt.date.fromisoformat(d).isocalendar()[:2]
        if wk != last_wk:
            pts.append([d, round(a, 4), round(b, 4)])
            last_wk = wk
        else:
            pts[-1] = [d, round(a, 4), round(b, 4)]
    return {
        "n": n,
        "from": curve[0][0],
        "to": curve[-1][0],
        "total": round(curve[-1][1] - 1, 4),
        "bench": round(curve[-1][2] - 1, 4),
        "cagr": _r(cagr(curve[-1][1])),
        "bcagr": _r(cagr(curve[-1][2])),
        "mdd": round(mdd(1), 4),
        "bmdd": round(mdd(2), 4),
        "vol": round(vol, 4) if vol else None,
        "years": by_year,
        "pts": pts,
    }


# ---------------------------------------------------------------- rules known at the time
# Filters for the strategy lab must only use what a copier could have known on the day the
# report became public, or the backtest would be flattering itself.


class TrackRecords:
    """Each official's copy-trade record as it stood on any given date."""

    def __init__(self, trades: list[dict], min_n: int = 10):
        self.min_n = min_n
        rows: dict[str, list[tuple[str, float]]] = defaultdict(list)
        for t in trades:
            if not _stock_buy(t):
                continue
            h = (t.get("h") or {}).get("90")
            fold = (t.get("ent") or {}).get("fold")
            if h and h[1] is not None and h[3] is not None and fold:
                # the 90-day result is known a little after the holding period ends
                known = (dt.date.fromisoformat(fold) + dt.timedelta(days=95)).isoformat()
                rows[t["m"]].append((known, h[1] - h[3]))
        self.dates: dict[str, list[str]] = {}
        self.cum: dict[str, list[tuple[float, int]]] = {}
        for m, v in rows.items():
            v.sort()
            self.dates[m] = [d for d, _ in v]
            acc, wins, cum = 0.0, 0, []
            for _, x in v:
                acc += x
                wins += x > 0
                cum.append((acc, wins))
            self.cum[m] = cum

    def at(self, m: str, when: str) -> tuple[int, float, float] | None:
        """(n, mean excess, win rate) of trades whose result was known by `when`."""
        ds = self.dates.get(m)
        if not ds:
            return None
        i = bisect_right(ds, when)
        if i == 0:
            return None
        acc, wins = self.cum[m][i - 1]
        return i, acc / i, wins / i

    def proven(self, m: str, when: str) -> bool:
        r = self.at(m, when)
        return bool(r) and r[0] >= self.min_n and r[1] > 0 and r[2] >= 0.5


def cluster_flags(trades: list[dict], days: int = 30, need: int = 3) -> set[str]:
    """Ids of buys that, when they became public, were the 3rd+ official buying that stock within 30 days."""
    by_sym: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        if _stock_buy(t) and t.get("tx") and t.get("fil"):
            by_sym[t["sym"]].append(t)
    out = set()
    for ts in by_sym.values():
        ts.sort(key=lambda t: t["tx"])
        for i, t in enumerate(ts):
            lo = (dt.date.fromisoformat(t["tx"]) - dt.timedelta(days=days)).isoformat()
            who = {t["m"]}
            j = i - 1
            while j >= 0 and ts[j]["tx"] >= lo:
                if ts[j]["fil"] <= t["fil"]:
                    who.add(ts[j]["m"])
                j -= 1
            if len(who) >= need:
                out.add(t["id"])
    return out


def _thin(pts: list, every: int = 2) -> list:
    return [p for i, p in enumerate(pts) if i % every == 0 or i == len(pts) - 1]


# ---------------------------------------------------------------- the rest


def _month(d: str | None) -> str | None:
    return d[:7] if d else None


def build(trades: list[dict], profiles: dict[str, dict], series: dict, spy: Series, comp: dict,
          sector_of, start: str, today: str) -> tuple[dict, dict[str, dict]]:
    """(insights.json, per-member extras {id: {nav, oversight}})."""
    cong = [t for t in trades if t["ch"] in ("H", "S")]
    execs = [t for t in trades if t["ch"] == "E"]
    sic_of = {s: (c or {}).get("sic") for s, c in comp.items()}

    # --- oversight flags on trades
    ov_count: Counter = Counter()
    ov_list = []
    for t in trades:
        p = profiles.get(t["m"])
        if not p or not t.get("sym") or t.get("at") not in STOCK_TYPES:
            continue
        flag = oversight(p, sic_of.get(t["sym"]))
        if flag:
            t["ov"] = flag
            ov_count[t["m"]] += 1
            ov_list.append(t)
    ov_list.sort(key=lambda t: (t.get("fil") or "", t["tx"] or ""), reverse=True)

    # --- strategies
    strategies = {}
    for key, pool, ent in (("all", trades, "fol"), ("all_off", trades, "off"), ("congress", cong, "fol"), ("exec", execs, "fol")):
        r = backtest(pool, series, spy, start, ent)
        if r:
            strategies[key] = r

    # --- strategy lab: which copy rule would have worked (rules use only what was public then)
    tr = TrackRecords(trades)
    clustered = cluster_flags(trades)

    def proven(t: dict) -> bool:
        return bool(t.get("fil")) and tr.proven(t["m"], t["fil"])

    party_of = {m: (p or {}).get("party") for m, p in profiles.items()}
    lab_defs = [
        ("h30", trades, {"hold": 30}),
        ("h90", trades, {}),
        ("h180", trades, {"hold": 180}),
        ("h365", trades, {"hold": 365}),
        ("big", trades, {"keep": lambda t: (t.get("amin") or 0) >= 50001}),
        ("huge", trades, {"keep": lambda t: (t.get("amin") or 0) >= 250001}),
        ("proven", trades, {"keep": proven}),
        ("cluster", trades, {"keep": lambda t: t["id"] in clustered}),
        ("ov", trades, {"keep": lambda t: bool(t.get("ov"))}),
        ("fast", cong, {"keep": lambda t: t.get("delay") is not None and t["delay"] <= 15}),
        ("senate", [t for t in cong if t["ch"] == "S"], {}),
        ("house", [t for t in cong if t["ch"] == "H"], {}),
        ("dem", [t for t in cong if party_of.get(t["m"]) == "D"], {}),
        ("rep", [t for t in cong if party_of.get(t["m"]) == "R"], {}),
        ("exec", execs, {}),
    ]
    lab = []
    for key, pool, kw in lab_defs:
        r = backtest(pool, series, spy, start, "fol", **kw)
        if not r or r["n"] < 30:
            continue
        lab.append({
            "k": key, "hold": kw.get("hold", HOLD_DAYS),
            **{f: r.get(f) for f in ("n", "nx", "from", "to", "cagr", "bcagr", "total", "bench", "mdd", "x", "hit")},
            "pts": _thin(r["pts"]),
        })

    # --- signals: what just became public from officials whose buys have tended to work
    newest = max((t.get("fil") or "" for t in trades), default=today)
    recent_cut = (dt.date.fromisoformat(newest) - dt.timedelta(days=45)).isoformat()
    record_now = {m: tr.at(m, today) for m in tr.dates}

    def sig_card(t: dict) -> dict:
        out = {k: t[k] for k in ("id", "m", "sym", "tx", "fil", "type", "amin", "amax", "act") if t.get(k) is not None}
        ent = t.get("ent") or {}
        if ent.get("fol"):
            out["fol"] = ent["fol"]
        rec = record_now.get(t["m"])
        if rec:
            out["rec"] = [rec[0], round(rec[1], 4), round(rec[2], 3)]
        if t.get("ov"):
            out["ov"] = t["ov"]
        if t["id"] in clustered:
            out["cl"] = 1
        return out

    fresh = [t for t in trades if _stock_buy(t) and (t.get("fil") or "") >= recent_cut]
    fresh.sort(key=lambda t: (t.get("fil") or "", t.get("amin") or 0), reverse=True)
    def pick(rows: list[dict], per: int = 2, cap: int = 30) -> list[dict]:
        # at most two lines per official (and one per stock each), so one busy filer can't fill the list
        seen_m: Counter = Counter()
        seen: set = set()
        out = []
        for t in rows:
            if seen_m[t["m"]] >= per or (t["m"], t["sym"]) in seen:
                continue
            seen_m[t["m"]] += 1
            seen.add((t["m"], t["sym"]))
            out.append(sig_card(t))
            if len(out) >= cap:
                break
        return out

    signals = {
        "since": recent_cut,
        "proven": pick([t for t in fresh if tr.proven(t["m"], today)]),
        "big": pick([t for t in fresh if (t.get("amin") or 0) >= 250001]),
        "cluster": pick([t for t in fresh if t["id"] in clustered], per=3),
        "ov": pick([t for t in fresh if t.get("ov")]),
    }

    # --- per member: copy curve + leaderboard
    by_m = defaultdict(list)
    for t in trades:
        by_m[t["m"]].append(t)
    extras: dict[str, dict] = {}
    board = []
    for mid, ts in by_m.items():
        buys = [t for t in ts if _stock_buy(t)]
        if len(buys) < 5:
            continue
        r = backtest(ts, series, spy, start, "fol")
        if not r:
            continue
        extras[mid] = {"nav": {k: r[k] for k in ("n", "from", "to", "total", "bench", "cagr", "bcagr", "mdd", "pts", "years")}}
        exc = [t["h"]["90"][1] - t["h"]["90"][3] for t in buys if "90" in t.get("h", {}) and t["h"]["90"][1] is not None]
        exc365 = [t["h"]["365"][1] - t["h"]["365"][3] for t in buys if "365" in t.get("h", {}) and t["h"]["365"][1] is not None]
        if len(exc) >= 20:
            board.append({
                "id": mid,
                "n": len(exc),
                "x90": round(mean(exc), 4),
                "win": round(sum(1 for x in exc if x > 0) / len(exc), 3),
                "x365": round(mean(exc365), 4) if len(exc365) >= 5 else None,
                "cagr": r["cagr"], "bcagr": r["bcagr"],
                "spark": [p[1] for p in r["pts"][:: max(1, len(r["pts"]) // 40)]][-40:],
            })
    board.sort(key=lambda b: -b["x90"])

    # --- monthly activity and sector flows
    months: dict[str, list] = defaultdict(lambda: [0, 0, 0.0, 0.0])  # buys, sells, buy $, sell $
    for t in trades:
        m = _month(t.get("tx"))
        if not m or m < start[:7]:
            continue
        if t["type"] == "P":
            months[m][0] += 1
            months[m][2] += _mid(t)
        elif t["type"] in ("SF", "SP", "S"):
            months[m][1] += 1
            months[m][3] += _mid(t)
    activity = [[m, *v[:2], round(v[2]), round(v[3])] for m, v in sorted(months.items()) if m <= today[:7]]

    def flows(days: int, pool: list[dict]) -> list[dict]:
        cut = (dt.date.fromisoformat(today) - dt.timedelta(days=days)).isoformat()
        f: dict[str, list] = defaultdict(lambda: [0.0, 0.0, 0, 0])
        for t in pool:
            if (t.get("tx") or "") < cut or not t.get("sym") or t.get("at") not in STOCK_TYPES | {"EF"}:
                continue
            sec = sector_of(sic_of.get(t["sym"]), "ETF" if t.get("at") == "EF" else None)
            if t["type"] == "P":
                f[sec][0] += _mid(t)
                f[sec][2] += 1
            elif t["type"] in ("SF", "SP", "S"):
                f[sec][1] += _mid(t)
                f[sec][3] += 1
        return sorted(({"sec": k, "buy": round(v[0]), "sell": round(v[1]), "nb": v[2], "ns": v[3]} for k, v in f.items()),
                      key=lambda x: -(x["buy"] + x["sell"]))

    # --- cluster buys: 3+ officials buying the same stock within 30 days (recent 12 months)
    clusters = []
    cut = (dt.date.fromisoformat(today) - dt.timedelta(days=365)).isoformat()
    by_sym = defaultdict(list)
    for t in trades:
        if _stock_buy(t) and (t.get("tx") or "") >= cut:
            by_sym[t["sym"]].append(t)
    for sym, ts in by_sym.items():
        ts.sort(key=lambda t: t["tx"])
        best = None
        for i, t in enumerate(ts):
            end = (dt.date.fromisoformat(t["tx"]) + dt.timedelta(days=30)).isoformat()
            window = [x for x in ts[i:] if x["tx"] <= end]
            who = {x["m"] for x in window}
            if len(who) >= 3 and (best is None or len(who) > len(best[1])):
                best = (window, who)
        if best:
            window, who = best
            fols = [x["ent"]["fol"] for x in window if (x.get("ent") or {}).get("fol")]
            clusters.append({
                "sym": sym, "nm": len(who), "members": sorted(who),
                "from": window[0]["tx"], "to": window[-1]["tx"],
                "pub": max(x.get("fil") or "" for x in window),
                "fol": round(median(fols), 4) if fols else None,
                "vol": round(sum(_mid(x) for x in window)),
            })
    clusters.sort(key=lambda c: (c["pub"], c["nm"]), reverse=True)

    # --- best / worst timed buys (official's own price, 90 days, vs SPY), at least $15k
    timed = []
    for t in trades:
        h = (t.get("h") or {}).get("90")
        if _stock_buy(t) and h and h[0] is not None and h[2] is not None and (t.get("amin") or 0) >= 15001:
            timed.append((h[0] - h[2], t))
    timed.sort(key=lambda x: -x[0])

    def card(t: dict, x: float | None = None) -> dict:
        out = {k: t[k] for k in ("id", "m", "sym", "tx", "fil", "type", "amin", "amax") if t.get(k) is not None}
        if x is not None:
            out["x"] = round(x, 4)
        if t.get("ov"):
            out["ov"] = t["ov"]
        return out

    # --- disclosure delay (Congress: the STOCK Act's 45-day rule)
    delays = [t["delay"] for t in cong if t.get("delay") is not None and 0 <= t["delay"] <= 1500]
    buckets = [(0, 15), (16, 30), (31, 45), (46, 90), (91, 180), (181, 10000)]
    hist = [sum(1 for d in delays if lo <= d <= hi) for lo, hi in buckets]
    late_by = Counter(t["m"] for t in cong if (t.get("delay") or 0) > 45)
    late_year = defaultdict(lambda: [0, 0])
    for t in cong:
        if t.get("delay") is not None and t.get("tx"):
            late_year[t["tx"][:4]][0] += 1
            late_year[t["tx"][:4]][1] += t["delay"] > 45

    # --- party comparison (Congress)
    party = {}
    for pk in ("D", "R"):
        ts = [t for t in cong if (profiles.get(t["m"]) or {}).get("party") == pk]
        exc = [t["h"]["90"][1] - t["h"]["90"][3] for t in ts if _stock_buy(t) and "90" in t.get("h", {}) and t["h"]["90"][1] is not None]
        sec = Counter()
        for t in ts:
            if _stock_buy(t):
                sec[sector_of(sic_of.get(t["sym"]))] += 1
        r = backtest(ts, series, spy, start, "fol")
        party[pk] = {
            "members": len({t["m"] for t in ts}),
            "trades": len(ts),
            "buys": sum(1 for t in ts if t["type"] == "P"),
            "sells": sum(1 for t in ts if t["type"] in ("SF", "SP", "S")),
            "x90": round(mean(exc), 4) if exc else None,
            "win": round(sum(1 for x in exc if x > 0) / len(exc), 3) if exc else None,
            "sectors": [[k, v] for k, v in sec.most_common(6)],
            "cagr": r["cagr"] if r else None,
            "pts": r["pts"] if r else [],
        }

    out = {
        "generated": today,
        "hold": HOLD_DAYS,
        "strategies": strategies,
        "lab": lab,
        "signals": signals,
        "leaderboard": board[:60],
        "laggards": board[::-1][:15],
        "activity": activity,
        "flows90": flows(90, trades),
        "flows365": flows(365, trades),
        "flows90_exec": flows(90, execs),
        "clusters": clusters[:40],
        "oversight": {"count": ov_count.most_common(30), "recent": [card(t) for t in ov_list[:120]], "total": len(ov_list)},
        "best": [card(t, x) for x, t in timed[:25]],
        "worst": [card(t, x) for x, t in timed[::-1][:15]],
        "delay": {
            "buckets": [[lo, hi if hi < 10000 else None, n] for (lo, hi), n in zip(buckets, hist)],
            "median": median(delays) if delays else None,
            "late": late_by.most_common(15),
            "by_year": [[y, v[0], v[1]] for y, v in sorted(late_year.items()) if start[:4] <= y <= today[:4]],
        },
        "party": party,
    }
    for mid, n in ov_count.items():
        extras.setdefault(mid, {})["ov"] = n
    return out, extras
