"""Names and portraits for well-known company insiders, from Wikidata.

An insider is matched only when Wikidata links a person to the same company (by the company's SEC
number) and the surname and a given name agree with the name on the Form 4. Writes
data/ref/insider_names.json {sec number: {q, en, zh, img}} and, with --photos, saves the Commons
portraits as public/media/people/ins-<sec number>.webp (credited through the media manifest).
The daily pipeline downloads the portraits still missing, a few per run (media.fetch_insider_photos).

    python scripts/insider_wikidata.py [--photos]
"""
import collections
import glob
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from otrack import media  # noqa: E402

UA = {"User-Agent": media.WIKI_UA, "Accept": "application/sparql-results+json"}
RELS = [
    "{ ?co wdt:P169 ?p } UNION { ?co wdt:P488 ?p } UNION { ?co wdt:P112 ?p } UNION { ?co wdt:P3320 ?p } UNION { ?co wdt:P1037 ?p } UNION { ?co wdt:P127 ?p } UNION { ?p wdt:P3320 ?co }",
    "?p wdt:P108 ?co",
]
QUERY = 'SELECT DISTINCT ?p ?cik ?en ?zh ?img ?alt WHERE { ?co wdt:P5531 ?cik . %s . ?p wdt:P31 wd:Q5 . OPTIONAL { ?p wdt:P18 ?img } OPTIONAL { ?p rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?p rdfs:label ?zh FILTER(LANG(?zh)="zh") } OPTIONAL { ?p skos:altLabel ?alt FILTER(LANG(?alt)="en") } }'


def tokens(s: str) -> list[str]:
    return [w for w in re.sub(r"[^a-z ]", " ", s.lower()).split() if len(w) > 1 and w not in ("jr", "sr", "ii", "iii", "iv")]


def same_person(filed: list[str], names: list[str]) -> bool:
    """Form 4 names are "SURNAME GIVEN MIDDLE". The surname must agree, and a given name must agree
    with one of the person's names on Wikidata, allowing a short form (Jeff / Jeffrey)."""
    given = filed[1:]
    short = lambda a, b: a == b or (min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)))  # noqa: E731
    for name in names:
        e = tokens(name)
        if len(e) < 2 or filed[0] != e[-1]:
            continue
        first, rest = e[0], e[1:-1]
        hit = next((g for g in given if short(g, first)), None)
        if hit:
            # further given names on both sides must not contradict each other
            # ("Chih-Ho" is not "Chi-Ren", "David Tsung-Hung" is not "Ting Tsung")
            others = [g for g in given if g != hit]
            if rest and others and not any(short(g, w) for g in others for w in rest):
                continue
            return True
        if "".join(given) == "".join(e[:-1]):
            return True
    return False


def main() -> None:
    try:  # Wikidata's "zh" labels mix traditional and simplified characters
        from opencc import OpenCC

        t2s = OpenCC("t2s").convert
    except ImportError:  # names stay as Wikidata has them
        t2s = lambda s: s  # noqa: E731
    by: dict[int, dict] = collections.defaultdict(dict)
    for rel in RELS:
        rows = None
        for attempt in range(4):  # a busy endpoint cuts long answers short: ask again
            try:
                r = requests.get("https://query.wikidata.org/sparql", params={"query": QUERY % rel}, headers=UA, timeout=180)
                r.raise_for_status()
                rows = r.json()["results"]["bindings"]
                break
            except (requests.RequestException, ValueError):
                time.sleep(30 * (attempt + 1))
        if rows is None:
            raise SystemExit("Wikidata did not answer")
        for b in rows:
            try:
                cik = int(b["cik"]["value"])
            except ValueError:
                continue
            h = by[cik].setdefault(b["p"]["value"].split("/")[-1], {})
            for k in ("en", "zh", "img"):
                if k in b and k not in h:
                    h[k] = b[k]["value"]
            if "alt" in b:
                h.setdefault("alts", set()).add(b["alt"]["value"])
        time.sleep(3)
    hits: dict[str, dict] = {}
    for f in sorted(glob.glob(str(ROOT / "data/site/insider/*.json"))):
        d = json.load(open(f))
        for row in d["tx"]:
            oc = row[11] if len(row) > 11 else 0
            if not oc or str(oc) in hits:
                continue
            t = tokens(row[2])
            if len(t) < 2:
                continue
            for q, h in by.get(d["cik"], {}).items():
                if h.get("en") and same_person(t, [h["en"], *h.get("alts", ())]):
                    hits[str(oc)] = {"q": q, "en": h["en"], **({"zh": t2s(h["zh"])} if h.get("zh") else {}), **({"img": h["img"]} if h.get("img") else {})}
                    break
    out = {k: {x: v[x] for x in ("q", "en", "zh", "img") if x in v} for k, v in sorted(hits.items(), key=lambda kv: int(kv[0]))}
    (ROOT / "data/ref/insider_names.json").write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True))
    print("matched", len(hits), "with zh", sum("zh" in v for v in hits.values()), "with image", sum("img" in v for v in hits.values()))
    # portraits saved for a match that no longer holds are removed
    keep = {f"ins-{oc}" for oc, h in hits.items() if h.get("img")}
    st = media._state()
    for f in media.PEOPLE_DIR.glob("ins-*.webp"):
        if f.stem not in keep:
            f.unlink()
            st.get("people", {}).pop(f.stem, None)
            print("removed", f.stem)
    media._save_state(st)
    if "--photos" not in sys.argv:
        return
    s = requests.Session()
    s.headers["User-Agent"] = media.WIKI_UA
    done = 0
    for oc, h in hits.items():
        pid = f"ins-{oc}"
        if not h.get("img") or (media.PEOPLE_DIR / f"{pid}.webp").exists():
            continue
        for attempt in range(4):
            try:
                r = s.get(h["img"].replace("http://", "https://"), params={"width": 500}, timeout=60)
            except requests.RequestException:
                time.sleep(10)
                continue
            if r.status_code == 429:
                time.sleep(20 * (attempt + 1))
                continue
            if r.status_code == 200 and media.save_local_photo(pid, r.content, r.url.split("?")[0]):
                done += 1
            break
        time.sleep(2.5)
    print("photos saved", done)


if __name__ == "__main__":
    main()
