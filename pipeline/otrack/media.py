"""Portraits of officials and company logos, stored as small WebP files under public/media.

Self-hosting keeps pages fast (also from mainland China, where some image hosts are slow or blocked).

- Members of Congress: the public-domain official photos collected by the unitedstates/images
  project; Wikipedia's lead image when a photo is missing there.
- Executive officials: the lead image of their Wikipedia article (found by search and checked
  against their job title); most are official portraits in the public domain.
- Logos: Parqet's logo service (app-icon style), Financial Modeling Prep as a fallback.

data/ref/media.json records what was tried, so missing images are retried only once a month.
"""
from __future__ import annotations

import datetime as dt
import io
import logging
import re
import time
from pathlib import Path

from . import http
from .util import REF, ROOT, read_json, write_json

log = logging.getLogger(__name__)

PUBLIC = ROOT / "public" / "media"
PEOPLE_DIR = PUBLIC / "people"
LOGO_DIR = PUBLIC / "logos"
WIKI_UA = "us-officials-trades/1.0 (https://github.com/Mzzzzzz-c/us-officials-trades; open-data site)"
http.HOST_DELAY.update({
    "unitedstates.github.io": 0.05,
    "en.wikipedia.org": 0.2,
    "upload.wikimedia.org": 0.2,
    "assets.parqet.com": 0.1,
    "financialmodelingprep.com": 0.2,
})
RETRY_DAYS = 30


def _state() -> dict:
    return read_json(REF / "media.json", {}) or {}


def _save_state(st: dict) -> None:
    write_json(REF / "media.json", st, pretty=True)


def _due(rec: dict | None) -> bool:
    if not rec:
        return True
    if rec.get("ok"):
        return False
    tried = rec.get("tried", "2000-01-01")
    return tried < (dt.date.today() - dt.timedelta(days=RETRY_DAYS)).isoformat()


def _to_webp(content: bytes, out: Path, size: tuple[int, int], cover: bool, bg: tuple | None = None) -> bool:
    from PIL import Image, ImageOps

    try:
        im = Image.open(io.BytesIO(content))
        im.load()
    except Exception:  # noqa: BLE001
        return False
    if min(im.size) < 24:
        return False
    im = im.convert("RGBA")
    if cover:
        # portraits: crop to the frame, keeping the top (faces are in the upper part)
        im = ImageOps.fit(im, size, method=Image.LANCZOS, centering=(0.5, 0.25))
    else:
        im.thumbnail(size, Image.LANCZOS)
        canvas = Image.new("RGBA", size, bg or (255, 255, 255, 0))
        canvas.alpha_composite(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
        im = canvas
    out.parent.mkdir(parents=True, exist_ok=True)
    if cover:
        im.convert("RGB").save(out, "WEBP", quality=78, method=6)
    else:
        im.save(out, "WEBP", quality=85, method=6)
    return True


# ------------------------------------------------------------------ people


def _wiki_lead_image(s, title: str) -> tuple[str | None, str | None]:
    """(image url, description) of a Wikipedia article's lead image."""
    r = http.get(s, "https://en.wikipedia.org/api/rest_v1/page/summary/" + title.replace(" ", "_"), timeout=30)
    if r.status_code != 200:
        return None, None
    d = r.json()
    # the summary's thumbnail is a ~300px rendition: enough for a 180px portrait
    img = (d.get("thumbnail") or {}).get("source") or (d.get("originalimage") or {}).get("source")
    if img:
        img = img.split("?")[0]
    return img, (d.get("description") or "") + " " + (d.get("extract") or "")[:400]


def _commons_file(url: str) -> str | None:
    """'.../commons/thumb/d/dd/Name.jpg/330px-Name.jpg' -> 'Name.jpg' (the File: page on Wikimedia Commons)."""
    from urllib.parse import unquote

    m = re.search(r"/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)", url)
    return unquote(m.group(1)) if m else None


def _photo_from_url(s, url: str, out: Path) -> dict:
    """A portrait from a direct image URL: an agency site, or an upload.wikimedia.org original
    (then credited to its Commons file page)."""
    r = http.get(s, url, timeout=30)
    if r.status_code == 200 and _to_webp(r.content, out, (180, 220), cover=True):
        f = _commons_file(url) if "wikimedia.org" in url else None
        return {"ok": True, "src": "commons" if f else "agency", "url": url, **({"file": f} if f else {})}
    return {}


def save_local_photo(pid: str, content: bytes, url: str) -> bool:
    """Record a portrait downloaded by other means (e.g. when this machine is rate-limited)."""
    st = _state()
    out = PEOPLE_DIR / f"{pid}.webp"
    if not _to_webp(content, out, (180, 220), cover=True):
        return False
    f = _commons_file(url) if "wikimedia.org" in url else None
    st.setdefault("people", {})[pid] = {"tried": dt.date.today().isoformat(), "ok": True, "cfg": url, "src": "commons" if f else "agency",
                                       "url": url, **({"file": f} if f else {})}
    _save_state(st)
    return True


def fetch_insider_photos(limit: int = 25) -> dict:
    """Portraits of the company insiders matched in Wikidata (data/ref/insider_names.json), a few per
    run: Wikimedia throttles thumbnail downloads, so this stops at the first refusal."""
    names = read_json(REF / "insider_names.json", {}) or {}
    s = http.session(WIKI_UA)
    done = 0
    for oc, h in names.items():
        pid = f"ins-{oc}"
        if done >= limit:
            break
        if not h.get("img") or (PEOPLE_DIR / f"{pid}.webp").exists():
            continue
        try:
            r = s.get(h["img"].replace("http://", "https://"), params={"width": 500}, timeout=60)
        except Exception:  # noqa: BLE001
            break
        if r.status_code == 429:
            break
        if r.status_code == 200 and save_local_photo(pid, r.content, r.url.split("?")[0]):
            done += 1
        time.sleep(3)
    left = sum(1 for oc, h in names.items() if h.get("img") and not (PEOPLE_DIR / f"ins-{oc}.webp").exists())
    return {"saved": done, "left": left}


def fetch_investors(investors: list[dict]) -> dict:
    """Portraits of the 13F investors from their Wikipedia articles (config/investors.yaml `wiki`)."""
    st = _state()
    people = st.setdefault("people", {})
    ws = http.session(WIKI_UA)
    done = 0
    for inv in investors:
        title = inv.get("photo") or inv.get("wiki")
        if not title:
            continue
        pid = f"inv-{inv['id']}"
        rec = people.get(pid)
        out = PEOPLE_DIR / f"{pid}.webp"
        if rec and rec.get("ok") and out.exists() and rec.get("cfg") == title:
            continue
        if not _due(rec) and (rec or {}).get("cfg") == title:
            continue
        done += 1
        new = {"tried": dt.date.today().isoformat(), "ok": False, "cfg": title}
        try:
            if inv.get("photo"):
                new.update(_photo_from_url(ws, inv["photo"], out))
            else:
                img, _ = _wiki_lead_image(ws, title)
                if img:
                    r = http.get(ws, img, timeout=30)
                    if r.status_code == 200 and _to_webp(r.content, out, (180, 220), cover=True):
                        new.update(ok=True, src="wikipedia", page=inv.get("wiki"), file=_commons_file(img))
        except Exception as e:  # noqa: BLE001
            log.warning("photo %s: %s", pid, e)
        people[pid] = new
    _save_state(st)
    return {"investors": sum(1 for k, v in people.items() if k.startswith("inv-") and v.get("ok")), "tried": done}


def _wiki_search(s, query: str) -> list[str]:
    r = http.get(s, "https://en.wikipedia.org/w/api.php", params={
        "action": "query", "list": "search", "srsearch": query, "srlimit": 3, "format": "json",
    }, timeout=30)
    if r.status_code != 200:
        return []
    return [x["title"] for x in r.json().get("query", {}).get("search", [])]


def _keywords(title: str, agency: str) -> list[str]:
    words = re.findall(r"[A-Za-z]{4,}", f"{title} {agency}")
    stop = {"Department", "Office", "Administration", "Director", "Deputy", "Secretary", "Assistant", "Management",
            "System", "Board", "Governors", "Agency", "Commissioner", "Administrator", "Federal", "National", "Chief",
            "Principal", "Under", "Member", "Chairman", "Governor", "Officer"}
    return [w.lower() for w in words if w not in stop] or [w.lower() for w in words]


def fetch_people(members: list[dict], legislators: list[dict], limit: int | None = None) -> dict:
    """members: rows of members.json (id, name, chamber, title, agency)."""
    st = _state()
    people = st.setdefault("people", {})
    wiki_of = {p["id"]: p.get("wiki") for p in legislators}
    s = http.session()
    ws = http.session(WIKI_UA)
    done = 0
    for m in members:
        mid = m["id"]
        rec = people.get(mid)
        out = PEOPLE_DIR / f"{mid}.webp"
        cfg = m.get("photo") or m.get("wiki")
        if rec and rec.get("ok") and out.exists() and rec.get("cfg") == cfg:
            continue
        # a new manual source in config/executive.yaml is tried at once
        if not _due(rec) and not (cfg and (rec or {}).get("cfg") != cfg):
            continue
        if limit is not None and done >= limit:
            break
        done += 1
        new = {"tried": dt.date.today().isoformat(), "ok": False}
        if cfg:
            new["cfg"] = cfg
        try:
            if m.get("chamber") in ("H", "S"):
                r = http.get(s, f"https://unitedstates.github.io/images/congress/225x275/{mid}.jpg", timeout=30)
                if r.status_code == 200 and _to_webp(r.content, out, (180, 220), cover=True):
                    new.update(ok=True, src="congress")
                elif wiki_of.get(mid):
                    img, _ = _wiki_lead_image(ws, wiki_of[mid])
                    if img:
                        r = http.get(ws, img, timeout=30)
                        if r.status_code == 200 and _to_webp(r.content, out, (180, 220), cover=True):
                            new.update(ok=True, src="wikipedia", page=wiki_of[mid], file=_commons_file(img))
            elif m.get("photo"):
                # an official portrait (agency site or its copy on Wikimedia Commons)
                new.update(_photo_from_url(ws, m["photo"], out))
            else:
                title = m.get("wiki")
                cands = [title] if title else _wiki_search(ws, f'{m["name"]} {m.get("title", "")} {m.get("agency", "")}')[:3]
                kws = _keywords(m.get("title", ""), m.get("agency", ""))
                last = m["name"].split()[-1].lower().strip(".")
                for t in cands:
                    img, text = _wiki_lead_image(ws, t)
                    low = (text or "").lower()
                    # the article must be about this person in this job, not a namesake
                    if not img or last not in t.lower() or not (title or any(k in low for k in kws)):
                        continue
                    r = http.get(ws, img, timeout=30)
                    if r.status_code == 200 and _to_webp(r.content, out, (180, 220), cover=True):
                        new.update(ok=True, src="wikipedia", page=t, file=_commons_file(img))
                        break
        except Exception as e:  # noqa: BLE001
            log.warning("photo %s: %s", mid, e)
        people[mid] = new
        if done % 50 == 0:
            _save_state(st)
    _save_state(st)
    return {"people": sum(1 for v in people.values() if v.get("ok")), "tried": done}


# ------------------------------------------------------------------ logos


def fetch_logos(symbols: list[str], limit: int | None = None) -> dict:
    st = _state()
    logos = st.setdefault("logos", {})
    s = http.session()
    done = 0
    for sym in symbols:
        rec = logos.get(sym)
        out = LOGO_DIR / f"{sym}.webp"
        if rec and rec.get("ok") and out.exists():
            continue
        if not _due(rec):
            continue
        if limit is not None and done >= limit:
            break
        done += 1
        new = {"tried": dt.date.today().isoformat(), "ok": False}
        dash = sym.replace(".", "-")
        try:
            r = http.get(s, f"https://assets.parqet.com/logos/symbol/{dash}?format=png&size=128", timeout=20)
            if r.status_code == 200 and _to_webp(r.content, out, (96, 96), cover=False):
                new.update(ok=True, src="parqet", fill=True)
            else:
                r = http.get(s, f"https://financialmodelingprep.com/image-stock/{dash}.png", timeout=20)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image") and _to_webp(r.content, out, (80, 80), cover=False):
                    new.update(ok=True, src="fmp", fill=False)
        except Exception as e:  # noqa: BLE001
            log.warning("logo %s: %s", sym, e)
        logos[sym] = new
        if done % 100 == 0:
            _save_state(st)
            log.info("logos: %d tried", done)
    _save_state(st)
    return {"logos": sum(1 for v in logos.values() if v.get("ok")), "tried": done}


def _light_glyph(path: Path) -> bool:
    """A logo drawn in white on a transparent background (it would vanish on a white tile)."""
    from PIL import Image

    try:
        im = Image.open(path).convert("RGBA")
    except Exception:  # noqa: BLE001
        return False
    im.thumbnail((48, 48))
    px = im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()
    px = list(px)
    opaque = [p for p in px if p[3] > 40]
    if not opaque or len(opaque) > 0.85 * len(px):
        return False
    lum = sum(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in opaque) / len(opaque) / 255
    return lum > 0.8


def manifest() -> dict:
    """What the website may show: {people: {id: 1}, logos: {sym: kind}}.

    Logo kinds: 1 = full-bleed icon, 2 = transparent logo on a white tile, 3 = light logo on a dark tile.
    """
    st = _state()
    people = {k: 1 for k, v in (st.get("people") or {}).items() if v.get("ok") and (PEOPLE_DIR / f"{k}.webp").exists()}
    logos = {}
    changed = False
    for k, v in (st.get("logos") or {}).items():
        f = LOGO_DIR / f"{k}.webp"
        if not v.get("ok") or not f.exists():
            continue
        if v.get("fill"):
            logos[k] = 1
            continue
        if "light" not in v:
            v["light"] = _light_glyph(f)
            changed = True
        logos[k] = 3 if v["light"] else 2
    if changed:
        _save_state(st)
    credits = {k: v["page"] for k, v in (st.get("people") or {}).items() if v.get("ok") and v.get("page")}
    files = {k: v["file"] for k, v in (st.get("people") or {}).items() if v.get("ok") and v.get("file")}
    return {"people": people, "logos": logos, "wiki": credits, "files": files}
