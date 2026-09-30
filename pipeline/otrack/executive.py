"""Executive branch officials: profiles from OGE's index, trades from parsed 278-T reports."""
from __future__ import annotations

import logging
import re

from . import oge
from .util import CONFIG, load_yaml

log = logging.getLogger(__name__)

ID_PREFIX = "E-"


def config() -> dict:
    return load_yaml(CONFIG / "executive.yaml") or {}


def member_id(oge_name: str) -> str:
    return ID_PREFIX + oge.person_key(oge_name)


def _display(oge_name: str) -> str:
    last, _, first = oge_name.partition(",")
    first = re.sub(r"\s+", " ", first).strip()
    return f"{first} {last.strip()}".strip()


def _ci(d: dict, k: str) -> str | None:
    if k in d:
        return d[k]
    low = {a.lower(): b for a, b in d.items()}
    return low.get(k.lower())


def normalise(trade_fn, name_to_ticker: dict[str, str]) -> tuple[list[dict], list[dict]]:
    """Trades and unreadable reports from every parsed 278-T."""
    trades, scanned = [], []
    seen: dict[str, list[set]] = {}
    # OGE sometimes posts the same report twice (e.g. "...278T(2).pdf" and "...278T(3).pdf"): oldest copy wins
    for f in sorted(oge.load_all(), key=lambda f: (f.get("added") or "", f["doc"])):
        mid = member_id(f["name"])
        sig = {(t["asset"][:40].lower(), t["tx_date"], t["type"], t["amount_min"]) for t in f.get("transactions", [])}
        if sig and any(len(sig & old) >= 0.8 * len(sig) for old in seen.get(mid, [])):
            log.info("OGE %s: duplicate of an earlier report, skipped", f["url"])
            continue
        if sig:
            seen.setdefault(mid, []).append(sig)
        doc = f"O{f['doc']}"
        filed = f.get("added") or None
        if f.get("status") == "amendment":
            continue
        if f.get("status") in ("scanned", "error", "empty"):
            scanned.append({"m": mid, "ch": "E", "doc": doc, "fil": filed, "url": f["url"], "why": f.get("status")})
            continue
        for t in f["transactions"]:
            t = dict(t)
            if not t.get("ticker") and t.get("asset_type") in (None, "ST"):
                sym = name_to_ticker.get(t["asset"])
                if sym:
                    t["ticker"] = sym
                    t.setdefault("asset_type", "EF" if re.search(r"\bETF\b|ISHARES|SPDR|VANGUARD|INVESCO", t["asset"], re.I) else "ST")
            if not t.get("ticker") and not t.get("asset_type"):
                t["asset_type"] = "OT" if not oge.looks_like_equity(t["asset"]) else None
            tr = trade_fn(mid, "E", doc, filed, f["url"], t)
            if f.get("amended"):
                tr["amd"] = True
            trades.append(tr)
    return trades, scanned


def equity_names() -> set[str]:
    """Descriptions without a ticker that look like shares: to be matched to tickers."""
    names = set()
    for f in oge.load_all():
        for t in f.get("transactions", []):
            if not t.get("ticker") and t.get("asset_type") in (None, "ST", "EF") and (oge.looks_like_equity(t["asset"]) or re.search(r"\bETF\b", t["asset"], re.I)):
                names.add(t["asset"])
    return names


def profiles(ids: set[str], congress_ids: set[str]) -> dict[str, dict]:
    """Profile for each executive official: latest role, documents, Chinese labels."""
    cfg = config()
    people = cfg.get("people") or {}
    tz, az = cfg.get("titles_zh") or {}, cfg.get("agencies_zh") or {}
    index = {ID_PREFIX + p["key"]: p for p in oge.load_index()}
    out = {}
    for mid in ids:
        p = index.get(mid)
        key = mid[len(ID_PREFIX):]
        extra = people.get(key) or {}
        if not p:
            continue
        roles = sorted(p["roles"].items(), key=lambda kv: kv[1], reverse=True)
        # the latest real job (candidate filings are not a role)
        roles = [r for r in roles if "Candidate" not in r[0]] or roles
        title, _, agency = roles[0][0].partition("|")
        docs = p["docs"]
        latest = p["kinds"].get("last", "")
        ended = any(d["kind"].startswith("Termination") and d["added"] >= latest for d in docs) or p["kinds"].get("term", "") >= latest
        prof = {
            "id": mid,
            "name": extra.get("en") or _display(p["name"]),
            "zh": extra.get("zh"),
            "party": extra.get("party") or "",
            "chamber": "E",
            "state": "",
            "title": title,
            "agency": agency,
            "title_zh": _ci(tz, title),
            "agency_zh": _ci(az, agency),
            "current": latest >= "2025-01-20" and not ended,
            "since": min((d["added"] for d in docs), default=None),
            "committees": [],
            "docs": docs[:60],
            "on_request": p.get("req", 0),
        }
        bg = extra.get("bioguide")
        if bg and bg in congress_ids:
            prof["congress"] = bg
        out[mid] = {k: v for k, v in prof.items() if v is not None}
    return out


def always_ids() -> set[str]:
    return {ID_PREFIX + k for k, v in (config().get("people") or {}).items() if v.get("always")}
