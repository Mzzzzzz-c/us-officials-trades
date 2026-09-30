"""Turn cached filings + prices into the JSON files the website reads (data/site)."""
from __future__ import annotations

import datetime as dt
import hashlib
import logging
import re
import shutil
from collections import Counter, defaultdict

from . import companies, estimate, house, performance, positions, prices, sec13f, senate
from .members import Directory
from .util import CONFIG, SITE, days_between, load_yaml, norm_name, read_json, settings, today_iso, write_json

log = logging.getLogger(__name__)

EQUITY_FOR_PRICES = {"ST", "EF", "OT", "RS", "ET", "OP", None}
DESC_MAX = 400


# ------------------------------------------------------------------ normalise


def _pseudo_id(chamber: str, first: str, last: str) -> str:
    h = hashlib.sha1(f"{chamber}|{norm_name(first)}|{norm_name(last)}".encode()).hexdigest()[:6].upper()
    return f"Z{h}"


def normalise(directory: Directory) -> tuple[list[dict], list[dict], dict, list[dict]]:
    """All transactions from both chambers in one schema, matched to BioGuide IDs."""
    trades, scanned, unknown, review = [], [], {}, []
    for f in house.load_all():
        date = f.get("filed") or f"{f['year']}-12-31"
        mid = directory.match_house(f["first"], f["last"], f["state_dst"], date)
        if not mid:
            # almost always a candidate rather than a sitting member; listed for review, not published
            review.append({"chamber": "H", "name": f"{f['first']} {f['last']}", "state_dst": f["state_dst"], "doc": f["doc_id"],
                           "key": f"H|{norm_name(f['first'])}|{norm_name(f['last'])}|{f['state_dst']}"})
            continue
        doc = f"H{f['doc_id']}"
        if f.get("status") in ("scanned", "error", "empty"):
            scanned.append({"m": mid, "ch": "H", "doc": doc, "fil": f.get("filed"), "url": f["url"], "why": f.get("status")})
            continue
        for t in f["transactions"]:
            trades.append(_trade(mid, "H", doc, f.get("filed"), f["url"], t))

    for f in senate.load_all():
        if f.get("role") not in ("Senator", "Former Senator"):
            continue
        mid = directory.match_senate(f["first"], f["last"], f.get("filed") or today_iso())
        if not mid:
            mid = _pseudo_id("S", f["first"], f["last"])
            unknown[mid] = {"id": mid, "name": f"{f['first']} {f['last']}".strip(), "chamber": "S", "state": "", "party": "?"}
            review.append({"chamber": "S", "name": f["full"], "doc": f["uid"], "key": f"S|{norm_name(f['first'])}|{norm_name(f['last'])}"})
        doc = f"S{f['uid'][:8]}"
        if f.get("status") in ("scanned", "empty"):
            scanned.append({"m": mid, "ch": "S", "doc": doc, "fil": f.get("filed"), "url": f["url"], "why": f.get("status")})
            continue
        for t in f["transactions"]:
            tr = _trade(mid, "S", doc, f.get("filed"), f["url"], t)
            if f.get("amended"):
                tr["amd"] = True
            trades.append(tr)
    return trades, scanned, unknown, review


def clean_asset(name: str | None) -> str | None:
    """Senate private holdings read 'X LLC Company: X LLC (City, ST) Description: Hedge Fund' -> 'X LLC · Hedge Fund'."""
    if not name:
        return name
    m = re.search(r"\s+Company:\s", name)
    if not m:
        return name
    desc = re.search(r"Description:\s*(.+)$", name)
    base = name[: m.start()].strip()
    return f"{base} · {desc.group(1).strip()}" if desc else base


def _trade(mid: str, ch: str, doc: str, filed: str | None, url: str, t: dict) -> dict:
    tr = {
        "id": f"{mid}-{doc}-{t['idx']}",
        "m": mid,
        "ch": ch,
        "doc": doc,
        "src": url,
        "tx": t.get("tx_date"),
        "fil": filed,
        "own": t.get("owner", "SELF"),
        "asset": clean_asset(t.get("asset")),
        "sym": t.get("ticker"),
        "at": t.get("asset_type"),
        "type": t.get("type"),
        "amin": t.get("amount_min"),
        "amax": t.get("amount_max"),
    }
    if t.get("notified"):
        tr["nd"] = t["notified"]
    if t.get("option"):
        tr["opt"] = t["option"]
    desc = " ".join(x for x in (t.get("description"), t.get("comment")) if x)
    if desc:
        tr["desc"] = desc[:DESC_MAX]
    if t.get("subholding"):
        tr["sub"] = t["subholding"][:120]
    if (t.get("status") or "").lower().startswith("amend"):
        tr["amd"] = True
    if t.get("reported"):
        tr["reported"] = t["reported"]
    else:
        n = house.reported_shares(desc)
        if n:
            tr["reported"] = {"shares": n}
    if tr["tx"] and filed:
        tr["delay"] = days_between(tr["tx"], filed)
    return tr


def dedupe(trades: list[dict]) -> list[dict]:
    """An amended filing repeats earlier lines: keep one copy (from the amendment).

    Identical lines inside one filing are kept - they are usually separate accounts.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for t in trades:
        k = (t["m"], t.get("sym") or (t.get("asset") or "").lower(), t["tx"], t["type"], t["amin"], t["amax"], t["own"])
        groups[k].append(t)
    keep = []
    for ts in groups.values():
        docs = {t["doc"] for t in ts}
        if len(docs) == 1:
            keep.extend(ts)
            continue
        amended_docs = {t["doc"] for t in ts if t.get("amd")}
        if not amended_docs:
            keep.extend(ts)  # two original filings: genuinely separate trades
            continue
        # latest filing wins; the doc id breaks same-day ties so every run picks the same one
        latest = max(sorted(amended_docs), key=lambda d: (max(x.get("fil") or "" for x in ts if x["doc"] == d), d))
        keep.extend(t for t in ts if t["doc"] == latest)
    keep.sort(key=lambda t: (t.get("fil") or "", t["tx"] or "", t["id"]), reverse=True)
    return keep


# ------------------------------------------------------------------ analytics


def weekly(s: prices.Series, start: str) -> list:
    out, last_key = [], None
    for d, _o, _h, _l, c in s.rows:
        if d < start:
            continue
        y, w, _ = dt.date.fromisoformat(d).isocalendar()
        if (y, w) == last_key:
            out[-1] = [d, round(c, 4)]
        else:
            out.append([d, round(c, 4)])
            last_key = (y, w)
    return out


def analyse(trades: list[dict], cfg: dict) -> tuple[dict, list]:
    spy = prices.load(cfg["benchmark"])
    if spy is None:
        raise RuntimeError("benchmark prices missing - run the price update first")
    series: dict[str, prices.Series | None] = {}
    for t in trades:
        sym = t.get("sym")
        if sym and sym not in series:
            series[sym] = prices.load(sym)
        s = series.get(sym) if sym else None
        t["est"] = estimate.estimate(t, s)
        if t["est"].get("d"):
            ent = performance.entries(t, s, spy)
            if ent:
                t["ent"] = ent
                h = performance.horizons(t, s, spy, cfg["horizons"])
                if h:
                    t["h"] = h
        t.pop("reported", None)
    pos = positions.build(trades)
    return series, pos


# ------------------------------------------------------------------ investors


def investors_block(cfg: dict, directory_prices: dict) -> tuple[list, dict, dict]:
    spy = prices.load(cfg["benchmark"])
    invs = sec13f.investors()
    listing, pages, by_sym = [], {}, defaultdict(list)
    for inv in invs:
        qs = sec13f.load(int(inv["cik"]), cfg["investor_quarters"])
        if not qs:
            continue
        cusips = {r["cusip"] for q in qs for r in q["rows"]}
        cmap = sec13f.map_cusips(cusips, {r["cusip"]: r["name"] for q in qs for r in q["rows"]})
        snaps = []
        for q in qs:
            total = sum(r["value"] for r in q["rows"]) or 1
            hold = {}
            for r in q["rows"]:
                sym = cmap.get(r["cusip"])
                key = (sym or r["cusip"]) + (f":{r['pc']}" if r["pc"] else "")
                s = directory_prices.get(sym) if sym else None
                f = s.factor(q["period"]) if s else 1.0
                hold[key] = {
                    "sym": sym, "cusip": r["cusip"], "name": r["name"], "cls": r["class"], "pc": r["pc"],
                    "unit": r["unit"], "sh": r["shares"] * f, "val": r["value"], "w": round(r["value"] / total, 5),
                }
            snaps.append({**q, "total": total, "hold": hold})
        # quarter-over-quarter changes (snaps are newest first)
        for i, q in enumerate(snaps):
            prev = snaps[i + 1] if i + 1 < len(snaps) else None
            start = prev["period"] if prev else None
            for key, h in q["hold"].items():
                if prev is None:
                    h["chg"] = None
                    continue
                p = prev["hold"].get(key)
                if p is None:
                    h["chg"], h["dsh"] = "new", h["sh"]
                else:
                    d = h["sh"] - p["sh"]
                    rel = d / p["sh"] if p["sh"] else 0
                    h["chg"] = "same" if abs(rel) < 0.005 else ("add" if d > 0 else "trim")
                    h["dsh"] = d
                    h["pct"] = round(rel, 4)
                if h["chg"] in ("new", "add") and h["sym"] and start:
                    s = directory_prices.get(h["sym"])
                    if s:
                        rows = [r for r in s.rows if start < r[0] <= q["period"]]
                        if rows:
                            h["cost"] = {
                                "p": round(sum((r[2] + r[3] + r[4]) / 3 for r in rows) / len(rows), 4),
                                "lo": round(min(r[3] for r in rows), 4),
                                "hi": round(max(r[2] for r in rows), 4),
                            }
                        j = s.after(q["filed"])
                        k = spy.after(q["filed"]) if spy else None
                        if j is not None:
                            h["fol"] = {"d": s.dates[j], "p": s.rows[j][1], "sp": spy.rows[k][1] if k is not None else None}
            if prev is not None:
                q["exits"] = [
                    {**p, "sh": 0, "val": 0, "w": 0, "chg": "exit", "dsh": -p["sh"]}
                    for key, p in prev["hold"].items() if key not in q["hold"]
                ]
            else:
                q["exits"] = []

        latest = snaps[0]
        hold_sorted = sorted(latest["hold"].values(), key=lambda h: -h["val"])
        iid = inv["id"]
        for h in hold_sorted:
            if h["sym"] and not h["pc"]:
                by_sym[h["sym"]].append({
                    "id": iid, "sh": _rn(h["sh"]), "val": h["val"], "w": h["w"], "chg": h.get("chg"), "period": latest["period"],
                })
        activity = []
        for q in snaps[:-1]:
            items = [h for h in q["hold"].values() if h.get("chg") in ("new", "add", "trim")] + q["exits"]
            items.sort(key=lambda h: -abs((h.get("dsh") or 0) * (_price_now(directory_prices, h["sym"]) or 0)) if h.get("sym") else 0)
            activity.append({"period": q["period"], "filed": q["filed"], "url": q["url"], "items": [_slim(h) for h in items[:80]]})
        profile = {k: inv.get(k) for k in ("id", "zh", "en", "firm_zh", "firm_en", "cik", "inferred", "note_zh", "note_en")}
        pages[iid] = {
            "profile": profile,
            "quarters": [{"period": q["period"], "filed": q["filed"], "url": q["url"], "value": q["total"], "n": len(q["hold"])} for q in snaps],
            "holdings": [_slim(h) for h in hold_sorted[:300]],
            "exits": [_slim(h) for h in latest["exits"]][:80],
            "activity": activity,
        }
        listing.append({
            **profile, "period": latest["period"], "filed": latest["filed"], "value": latest["total"],
            "n": len(latest["hold"]), "top": [h["sym"] or h["name"] for h in hold_sorted[:5]],
        })
    return listing, pages, by_sym


def _price_now(series: dict, sym: str | None):
    s = series.get(sym) if sym else None
    return s.rows[-1][4] if s else None


def _rn(x):
    return None if x is None else (round(x) if abs(x) >= 100 else round(x, 3))


def _slim(h: dict) -> dict:
    out = {k: h[k] for k in ("sym", "cusip", "name", "cls", "pc", "val", "w", "chg") if h.get(k) is not None}
    out["sh"] = _rn(h.get("sh"))
    for k in ("dsh", "pct", "cost", "fol"):
        if h.get(k) is not None:
            out[k] = _rn(h[k]) if k == "dsh" else h[k]
    return out


# ------------------------------------------------------------------ export


def export(trades, scanned, unknown, review, series, pos, directory: Directory, cfg: dict, with_investors: bool = True) -> dict:
    tmp = SITE.with_name("site.tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    comp = companies.load()
    names_zh = load_yaml(CONFIG / "names_zh.yaml") or {}

    # --- members
    mids = {t["m"] for t in trades} | {s["m"] for s in scanned}
    prof = directory.export(mids)
    prof.update({k: {**v, "current": False, "committees": []} for k, v in unknown.items()})
    by_member = defaultdict(list)
    for t in trades:
        by_member[t["m"]].append(t)
    pos_by_member = defaultdict(list)
    for p in pos:
        pos_by_member[p["m"]].append(p)
    scanned_by_member = defaultdict(list)
    for s in scanned:
        scanned_by_member[s["m"]].append(s)

    members_list = []
    for mid in sorted(mids):
        p = prof.get(mid)
        if not p:
            continue
        if names_zh.get(mid):
            p["zh"] = names_zh[mid]
        ts = by_member.get(mid, [])
        delays = [t["delay"] for t in ts if t.get("delay") is not None and t["delay"] >= 0]
        late = sum(1 for d in delays if d > 45)
        vmin = sum(t["amin"] or 0 for t in ts)
        vmax = sum(t["amax"] or t["amin"] or 0 for t in ts)
        row = {
            **{k: p.get(k) for k in ("id", "name", "zh", "party", "chamber", "state", "district", "current")},
            "n": len(ts),
            "nb": sum(1 for t in ts if t["type"] == "P"),
            "ns": sum(1 for t in ts if t["type"] in ("SF", "SP", "S")),
            "last": max((t["tx"] for t in ts if t["tx"]), default=None),
            "lastf": max((t["fil"] for t in ts if t.get("fil")), default=None),
            "vmin": vmin, "vmax": vmax, "late": late,
            "scanned": len(scanned_by_member.get(mid, [])),
        }
        members_list.append({k: v for k, v in row.items() if v is not None})
        page = {
            "profile": {k: v for k, v in p.items() if v is not None},
            "summary": row,
            "perf": performance.summarize(ts, cfg["horizons"]),
            "delay": {
                "avg": round(sum(delays) / len(delays), 1) if delays else None,
                "max": max(delays) if delays else None,
                "late": late,
                "n": len(delays),
            },
            "trades": ts,
            "positions": sorted(pos_by_member.get(mid, []), key=lambda x: x["last"], reverse=True),
            "scanned": sorted(scanned_by_member.get(mid, []), key=lambda s: s.get("fil") or "", reverse=True),
        }
        write_json(tmp / "member" / f"{mid}.json", page)
    members_list.sort(key=lambda r: (r.get("lastf") or "", r["n"]), reverse=True)
    write_json(tmp / "members.json", members_list)

    # --- investors (needs price series for the tickers they hold)
    inv_syms = set()
    inv_list, inv_pages, inv_by_sym = [], {}, {}
    if with_investors and sec13f.investors():
        names = {}
        for inv in sec13f.investors():
            for q in sec13f.load(int(inv["cik"]), cfg["investor_quarters"]):
                inv_syms |= {r["cusip"] for r in q["rows"]}
                names.update({r["cusip"]: r["name"] for r in q["rows"]})
        cmap = sec13f.map_cusips(inv_syms, names)
        for sym in set(cmap.values()):
            if sym and sym not in series:
                series[sym] = prices.load(sym)
        inv_list, inv_pages, inv_by_sym = investors_block(cfg, series)
        for iid, page in inv_pages.items():
            write_json(tmp / "investor" / f"{iid}.json", page)
    write_json(tmp / "investors.json", inv_list)

    # --- tickers
    by_sym = defaultdict(list)
    for t in trades:
        if t.get("sym"):
            by_sym[t["sym"]].append(t)
    pos_by_sym = defaultdict(list)
    for p in pos:
        pos_by_sym[p["sym"]].append(p)
    tick_list = []
    all_syms = set(by_sym) | set(inv_by_sym)
    for sym in sorted(all_syms):
        ts = by_sym.get(sym, [])
        s = series.get(sym)
        meta = (s.meta if s else {}) or {}
        c = comp.get(sym, {})
        name = meta.get("name") or c.get("name") or (ts[0]["asset"] if ts else sym)
        sec = companies.sector_of(c.get("sic"), meta.get("type"))
        mem = defaultdict(lambda: {"nb": 0, "ns": 0, "vmin": 0, "vmax": 0})
        for t in ts:
            m = mem[t["m"]]
            m["id"] = t["m"]
            if t["type"] == "P":
                m["nb"] += 1
            elif t["type"] in ("SF", "SP", "S"):
                m["ns"] += 1
            m["vmin"] += t["amin"] or 0
            m["vmax"] += t["amax"] or t["amin"] or 0
        held = {p["m"]: p["held"] for p in pos_by_sym.get(sym, [])}
        members = sorted(({**v, "held": held.get(k)} for k, v in mem.items()), key=lambda m: -(m["nb"] + m["ns"]))
        row = {
            "sym": sym, "name": name, "sec": sec,
            "n": len(ts), "nm": len(mem),
            "nb": sum(1 for t in ts if t["type"] == "P"),
            "ns": sum(1 for t in ts if t["type"] in ("SF", "SP", "S")),
            "last": max((t["tx"] for t in ts if t["tx"]), default=None),
            "inv": len(inv_by_sym.get(sym, [])),
        }
        tick_list.append({k: v for k, v in row.items() if v is not None})
        write_json(tmp / "ticker" / f"{sym}.json", {
            "sym": sym, "name": name, "sec": sec, "type": meta.get("type"), "exch": meta.get("exchange"),
            "sic": c.get("sicd"), "trades": ts, "members": members, "investors": inv_by_sym.get(sym, []),
        })
        if s:
            write_json(tmp / "series" / f"{sym}.json", {"w": weekly(s, f"{cfg['start_year']}-01-01")})
    tick_list.sort(key=lambda r: (-r["n"], r["sym"]))
    write_json(tmp / "tickers.json", tick_list)

    # --- latest prices (the only file that changes every day)
    px = {}
    for sym, s in series.items():
        if s and s.rows:
            px[sym] = s.rows[-1][4]
    spy = prices.load(cfg["benchmark"])
    px[cfg["benchmark"]] = spy.rows[-1][4]
    asof = spy.rows[-1][0]
    write_json(tmp / "latest-prices.json", {"asof": asof, "px": px})

    # --- recent filings (home page)
    newest = max((t["fil"] for t in trades if t.get("fil")), default=today_iso())
    cutoff = (dt.date.fromisoformat(newest) - dt.timedelta(days=cfg["recent_days"])).isoformat()
    recent = [t for t in trades if (t.get("fil") or "") >= cutoff][:2500]
    write_json(tmp / "recent.json", [_card(t) for t in recent])

    # --- headline stats (last 90 days of trades by transaction date)
    c90 = (dt.date.fromisoformat(newest) - dt.timedelta(days=90)).isoformat()
    win = [t for t in trades if (t.get("tx") or "") >= c90]
    buyers, sellers = defaultdict(set), defaultdict(set)
    for t in win:
        if not t.get("sym") or t.get("opt"):
            continue
        if t["type"] == "P":
            buyers[t["sym"]].add(t["m"])
        elif t["type"] in ("SF", "SP", "S"):
            sellers[t["sym"]].add(t["m"])
    active = Counter(t["m"] for t in win)
    c30 = (dt.date.fromisoformat(newest) - dt.timedelta(days=30)).isoformat()
    last30 = [t for t in trades if (t.get("fil") or "") >= c30]
    write_json(tmp / "stats.json", {
        "window": 90,
        "since": c90,
        "last30": {
            "trades": len(last30),
            "members": len({t["m"] for t in last30}),
            "buys": sum(1 for t in last30 if t["type"] == "P"),
            "sells": sum(1 for t in last30 if t["type"] in ("SF", "SP", "S")),
            "late": sum(1 for t in last30 if (t.get("delay") or 0) > 45),
        },
        "top_bought": [{"sym": k, "nm": len(v)} for k, v in sorted(buyers.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:12]],
        "top_sold": [{"sym": k, "nm": len(v)} for k, v in sorted(sellers.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:12]],
        "active": [{"id": k, "n": v} for k, v in active.most_common(12)],
    })

    write_json(tmp / "unparsed.json", sorted(scanned, key=lambda s: s.get("fil") or "", reverse=True))
    meta = {
        "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "data_through": newest,
        "price_asof": asof,
        "price_provider": cfg["price_provider"],
        "start_year": cfg["start_year"],
        "horizons": cfg["horizons"],
        "counts": {
            "trades": len(trades), "members": len(members_list), "tickers": len(tick_list),
            "filings": len({t["doc"] for t in trades}), "scanned": len(scanned), "investors": len(inv_list),
            "estimated": sum(1 for t in trades if (t.get("est") or {}).get("d")),
        },
    }
    write_json(tmp / "meta.json", meta)
    write_json(SITE.parent / "review.json", {"unmatched": review}, pretty=True)

    if SITE.exists():
        shutil.rmtree(SITE)
    tmp.rename(SITE)
    return meta


def _card(t: dict) -> dict:
    """The fields the home-page table needs."""
    keys = ("id", "m", "ch", "tx", "fil", "own", "asset", "sym", "type", "amin", "amax", "delay", "act", "opt")
    out = {k: t[k] for k in keys if t.get(k) is not None}
    est = t.get("est") or {}
    if est.get("d"):
        out["est"] = {k: est[k] for k in ("p", "lo", "hi", "smin", "smax", "conf") if est.get(k) is not None}
    if t.get("ent", {}).get("fol"):
        out["ent"] = {k: t["ent"][k] for k in ("off", "fol", "soff", "sfol") if k in t["ent"]}
    return out


# ------------------------------------------------------------------ orchestration


def guard_coverage(trades: list[dict]) -> None:
    """Refuse to overwrite the site if price coverage collapsed (e.g. the price source blocked us today).

    Set FORCE_BUILD=1 to override.
    """
    import os

    old = read_json(SITE / "meta.json") or {}
    before = (old.get("counts") or {}).get("estimated") or 0
    now = sum(1 for t in trades if (t.get("est") or {}).get("d"))
    if before and now < 0.9 * before and os.environ.get("FORCE_BUILD") != "1":
        raise RuntimeError(
            f"price coverage dropped from {before} to {now} estimated trades - keeping yesterday's site "
            "(missing prices will be retried on the next run; FORCE_BUILD=1 overrides)"
        )


def run(fetch: bool = True, limit: int | None = None, skip_prices: bool = False, skip_sec: bool = False) -> dict:
    cfg = settings()
    this_year = dt.date.today().year
    years = list(range(cfg["start_year"], this_year + 1))
    report = {}
    if fetch:
        from . import members

        try:
            members.refresh(cfg["start_year"])
        except Exception as e:  # noqa: BLE001
            log.warning("members refresh failed (using cached copy): %s", e)
        report["house"] = house.update(years, limit=limit)
        report["senate"] = senate.update(cfg["start_year"], limit=limit)
        if not skip_sec:
            report["sec13f"] = sec13f.update(cfg["investor_quarters"])
    directory = Directory()
    trades, scanned, unknown, review = normalise(directory)
    trades = dedupe(trades)
    log.info("%d transactions, %d unparsed filings, %d unmatched filers", len(trades), len(scanned), len(review))

    syms = {t["sym"] for t in trades if t.get("sym") and t.get("at") in EQUITY_FOR_PRICES}
    inv_syms = set()
    if not skip_sec and sec13f.investors():
        cus, names = set(), {}
        for inv in sec13f.investors():
            for q in sec13f.load(int(inv["cik"]), cfg["investor_quarters"]):
                cus |= {r["cusip"] for r in q["rows"]}
                names.update({r["cusip"]: r["name"] for r in q["rows"]})
        inv_syms = {v for v in sec13f.map_cusips(cus, names).values() if v}
    if fetch and not skip_prices:
        report["prices"] = prices.update(sorted(syms | inv_syms | {cfg["benchmark"]}), cfg["price_provider"], cfg["price_start"])
    if fetch and not skip_sec:
        report["companies"] = companies.update(syms | inv_syms)

    series, pos = analyse(trades, cfg)
    guard_coverage(trades)
    report["meta"] = export(trades, scanned, unknown, review, series, pos, directory, cfg, with_investors=not skip_sec)
    return report
