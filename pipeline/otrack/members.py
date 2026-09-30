"""Members of Congress: identity, party, state, terms and committees.

Source: the public-domain @unitedstates/congress-legislators project.
Filers are matched to a BioGuide ID so that every data source joins on one key.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import yaml

from . import http
from .util import CONFIG, REF, first_token, load_yaml, norm_name, read_json, write_json

log = logging.getLogger(__name__)

SRC = "https://unitedstates.github.io/congress-legislators"
PARTY = {"Democrat": "D", "Republican": "R", "Independent": "I", "Libertarian": "L"}


@dataclass
class Member:
    id: str
    first: str
    last: str
    full: str
    nick: str | None
    terms: list = field(default_factory=list)  # [{type, start, end, state, district, party}]
    committees: list = field(default_factory=list)

    @property
    def latest(self) -> dict:
        return self.terms[-1]

    def term_at(self, date: str, kind: str | None = None) -> dict | None:
        for t in self.terms:
            if (kind is None or t["type"] == kind) and t["start"] <= date <= t["end"]:
                return t
        return None

    def to_json(self, current_ids: set[str]) -> dict:
        t = self.latest
        return {
            "id": self.id,
            "name": self.full,
            "first": self.first,
            "last": self.last,
            "party": PARTY.get(t.get("party", ""), (t.get("party") or "?")[:1]),
            "chamber": "S" if t["type"] == "sen" else "H",
            "state": t["state"],
            "district": t.get("district"),
            "current": self.id in current_ids,
            "since": self.terms[0]["start"][:4],
            "committees": self.committees,
        }


def _download(name: str) -> list | dict:
    s = http.session()
    r = http.get(s, f"{SRC}/{name}")
    r.raise_for_status()
    return yaml.safe_load(r.content.decode("utf-8"))


def refresh(start_year: int) -> None:
    """Download the legislator and committee files and keep a trimmed local copy."""
    cur = _download("legislators-current.yaml")
    hist = _download("legislators-historical.yaml")
    cutoff = f"{start_year - 1}-01-01"
    keep = []
    for p in cur + hist:
        terms = [t for t in p.get("terms", []) if t.get("end", "") >= cutoff]
        if not terms:
            continue
        n = p["name"]
        keep.append({
            "id": p["id"]["bioguide"],
            "first": n.get("first", ""),
            "last": n.get("last", ""),
            "nick": n.get("nickname"),
            "full": n.get("official_full") or f"{n.get('first', '')} {n.get('last', '')}",
            "terms": [
                {k: t.get(k) for k in ("type", "start", "end", "state", "district", "party")} for t in p["terms"]
            ],
        })
    committees = _download("committees-current.yaml")
    membership = _download("committee-membership-current.yaml")
    write_json(REF / "legislators.json", {
        "current": [p["id"]["bioguide"] for p in cur],
        "people": keep,
        "committees": [
            {"id": c["thomas_id"], "type": c.get("type"), "name": c["name"]} for c in committees
        ],
        "membership": {
            cid: [{"id": m["bioguide"], "title": m.get("title"), "rank": m.get("rank")} for m in ms]
            for cid, ms in membership.items()
            if len(cid) == 4  # full committees only (subcommittee ids are longer)
        },
    })
    log.info("members: %d people kept", len(keep))


class Directory:
    def __init__(self):
        d = read_json(REF / "legislators.json")
        if not d:
            raise RuntimeError("legislators cache missing - run the members refresh first")
        self.current = set(d["current"])
        self.people: dict[str, Member] = {}
        for p in d["people"]:
            self.people[p["id"]] = Member(p["id"], p["first"], p["last"], p["full"], p.get("nick"), p["terms"])
        cname = {c["id"]: c["name"] for c in d["committees"]}
        for cid, ms in d["membership"].items():
            for m in ms:
                if m["id"] in self.people:
                    self.people[m["id"]].committees.append(
                        {"id": cid, "name": cname.get(cid, cid), "title": m.get("title")}
                    )
        self.overrides = (load_yaml(CONFIG / "name_matches.yaml") or {}) if (CONFIG / "name_matches.yaml").exists() else {}

    # -------------------------------------------------------------- matching

    def _last_match(self, m: Member, last: str) -> bool:
        a, b = norm_name(m.last), norm_name(last)
        if not a or not b:
            return False
        return a == b or a.split(" ")[-1] == b.split(" ")[-1] or a in b or b in a

    def _first_match(self, m: Member, first: str) -> bool:
        f = first_token(first)
        return bool(f) and f in {first_token(m.first), first_token(m.nick), first_token(m.full)}

    def match_house(self, first: str, last: str, state_dst: str, date: str) -> str | None:
        key = f"H|{norm_name(first)}|{norm_name(last)}|{state_dst}"
        if key in self.overrides:
            return self.overrides[key]
        state, dist = state_dst[:2], state_dst[2:]
        district = int(dist) if dist.isdigit() else None
        cands = []
        for m in self.people.values():
            for t in m.terms:
                if t["type"] != "rep" or t["state"] != state:
                    continue
                if district is not None and t.get("district") not in (district, None) and not (district == 0 and t.get("district") in (0, 1)):
                    continue
                if t["start"] <= date <= t["end"] or abs(int(t["end"][:4]) - int(date[:4])) <= 1:
                    cands.append(m)
                    break
        named = [m for m in cands if self._last_match(m, last)]
        if len(named) == 1:
            return named[0].id
        if len(named) > 1:
            both = [m for m in named if self._first_match(m, first)]
            if len(both) >= 1:
                return both[0].id
        # redistricting or a typo in the district: fall back to name + state
        loose = [
            m for m in self.people.values()
            if self._last_match(m, last) and self._first_match(m, first) and any(t["type"] == "rep" and t["state"] == state for t in m.terms)
        ]
        return loose[0].id if len(loose) == 1 else None

    def match_senate(self, first: str, last: str, date: str) -> str | None:
        key = f"S|{norm_name(first)}|{norm_name(last)}"
        if key in self.overrides:
            return self.overrides[key]
        sens = [m for m in self.people.values() if any(t["type"] == "sen" for t in m.terms)]
        named = [m for m in sens if self._last_match(m, last)]
        if len(named) > 1:
            named = [m for m in named if self._first_match(m, first)] or named
        if len(named) > 1:
            named = [m for m in named if m.term_at(date, "sen")] or named
        return named[0].id if len(named) == 1 else None

    def export(self, ids: set[str]) -> dict[str, dict]:
        return {i: self.people[i].to_json(self.current) for i in ids if i in self.people}
