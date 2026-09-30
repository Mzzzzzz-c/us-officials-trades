"""Executive branch: OGE Form 278-T periodic transaction reports.

The President, Vice President, Cabinet and other Senate-confirmed officials file with the
U.S. Office of Government Ethics. OGE's public collection is served by a DataTables JSON API;
reports it publishes directly carry a PDF link, the rest must be requested by form (OGE 201) and
are only counted here.

Two PDF styles exist:
- Integrity.gov electronic reports: clean text, tickers usually in brackets, e.g. "Verizon (VZ)".
- Scanned paper reports with an OCR text layer (the President's): noisy text, company names only;
  tickers come from matching the name against SEC's company list.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import logging
import re
import time

from collections import Counter

from . import http
from .util import CACHE, RAW, REF, clean_ticker, norm_name, read_json, write_json

log = logging.getLogger(__name__)

API = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest"
PARSER_VERSION = 4
http.HOST_DELAY.setdefault("extapps2.oge.gov", 0.5)

# OGE amount bands (lower bound -> upper bound; None = open-ended)
BANDS = [
    (1001, 15000), (15001, 50000), (50001, 100000), (100001, 250000), (250001, 500000),
    (500001, 1000000), (1000001, 5000000), (5000001, 25000000), (25000001, 50000000), (50000001, None),
]


# ------------------------------------------------------------------ index


def _strip(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()


def fetch_index(s) -> list[dict]:
    """Every entry in OGE's collection (about 17,000), newest first."""
    out, start, total = [], 0, None
    while total is None or start < total:
        for attempt in range(5):
            try:
                r = http.get(s, API, params={"draw": 1, "start": start, "length": 1000}, timeout=120)
                r.raise_for_status()
                d = r.json()
                break
            except Exception as e:  # noqa: BLE001  (the API answers 400 now and then under load)
                if attempt == 4:
                    raise
                log.warning("OGE index page %d: %s - retrying", start, e)
                time.sleep(10 * (attempt + 1))
        total = d["recordsTotal"]
        if not d["data"]:
            break
        out += d["data"]
        start += 1000
    docs = []
    for x in out:
        typ = _strip(x.get("type"))
        kind = re.sub(r"\s*\(\s*Request this Document\s*\)", "", typ).strip()
        m = re.search(r"href='([^']+\$FILE[^']+)'", x.get("type") or "")
        docs.append({
            "name": (x.get("name") or "").strip(),
            "title": (x.get("title") or "").strip(),
            "agency": (x.get("agency") or "").strip(),
            "kind": kind,
            "added": (x.get("docDate") or "")[:10],
            "url": m.group(1) if m else None,
            "amended": bool((x.get("amended") or "").strip()),
        })
    return docs


def doc_id(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:10]


def person_key(name: str) -> str:
    """'Trump, Donald J' -> 'trump-donald'  (last name + first given name)."""
    last, _, first = name.partition(",")
    first = re.sub(r"\(.*?\)", " ", first)
    given = norm_name(first).split()
    return "-".join([*norm_name(last).split(), *(given[:1])]).lower()


# ------------------------------------------------------------------ parsing helpers


_TYPE_P = re.compile(r"[pl1|I,.•]?\s*[pcoa]?u?[rn]?cha?s[eo]", re.I)


def norm_type(raw: str) -> str | None:
    t = raw.lower()
    if "exchange" in t:
        return "E"
    if re.search(r"sale|sa[l1i]e", t):
        return "SP" if "partial" in t else "S"
    if re.search(r"urch|rchas|chase|chaso", t):
        return "P"
    return None


def band(amount_text: str) -> tuple[int | None, int | None]:
    """Map a (possibly OCR-mangled) amount to its OGE band using the lower bound."""
    t = amount_text.replace("S", "$").replace("s", "$")
    if re.search(r"over", t, re.I):
        n = _first_number(t)
        if n is None:
            return None, None
        lo = n + 1 if n % 10 == 0 else n
        return lo, None
    n = _first_number(t)
    if n is None:
        return None, None
    for lo, hi in BANDS:
        if abs(n - lo) <= 1:
            return lo, hi
    # OCR sometimes drops a digit group; fall back to the nearest band by magnitude
    best = min(BANDS, key=lambda b: abs(len(str(b[0])) - len(str(n))) * 10 + abs(int(str(b[0])[0]) - int(str(n)[0])))
    return best if abs(len(str(best[0])) - len(str(n))) == 0 else (None, None)


def _first_number(t: str) -> int | None:
    m = re.search(r"\$\s*([0-9][0-9 ,.]*[0-9])", t)
    if not m:
        return None
    digits = re.sub(r"[^0-9]", "", m.group(1))
    return int(digits) if digits else None


_DATE = re.compile(r"(?<![0-9])([01]?[0-9])\s*/\s*([0-3]?[0-9])\s*[/1lI|]\s*(20[0-9]{2})(?![0-9])")


def parse_date(t: str, not_after: str | None = None) -> tuple[str | None, re.Match | None]:
    for m in _DATE.finditer(t):
        mo, d, y = (int(g) for g in m.groups())
        try:
            iso = dt.date(y, mo, d).isoformat()
        except ValueError:
            continue
        if not_after and iso > not_after:
            continue
        return iso, m
    return None, None


_BOND = re.compile(r"(\b\d{1,2}\.\d{1,3}\s*%|\bDue\b|\bB/E\b|\bBDS?\b|\bNOTES?\b\s+DUE|\bREV\b|\bRFDG\b|\bSER\s+[A-Z0-9]\b|MUNI|BOND)", re.I)
_TREAS = re.compile(r"\b(TREASURY|T-BILL|US TREAS|UNITED STATES TREAS)", re.I)
_FUND = re.compile(r"\b(FUND|ETF|TRUST|PORTFOLIO|INDEX|LP\b|L\.P\.|LLC|PARTNERS|HOLDINGS LP)", re.I)
_TICKER_IN = re.compile(r"\(([A-Z][A-Z0-9.\-/]{0,6})\)\s*$")


def classify(desc: str) -> tuple[str | None, str | None]:
    """(ticker, asset_type) from a description. asset_type uses the House codes."""
    d = desc.strip()
    m = _TICKER_IN.search(d) or re.search(r"\(([A-Z][A-Z0-9.\-]{0,6})\)", d)
    tk = clean_ticker(m.group(1)) if m else None
    if _TREAS.search(d):
        return None, "GS"
    if _BOND.search(d) and "%" in d:
        return None, "CS" if re.search(r"\b(INC|CORP|CO|LLC|PLC|LTD)\b", d, re.I) and not re.search(r"\b(CNTY|CITY|ST|AUTH|DIST|REV|SCH)\b", d) else "GS"
    if tk:
        return tk, "EF" if re.search(r"\bETF\b|iShares|SPDR|Vanguard|Invesco|Select Sector", d, re.I) else "ST"
    if re.search(r"\b(ETF)\b", d, re.I):
        return None, "EF"
    return None, None


# ------------------------------------------------------------------ PDF


def _clean_line(s: str) -> str:
    return re.sub(r"[ \t]+", " ", s).strip()


# the transaction type, allowing for OCR damage ("lourchaso", "purehase", "nurchasc", "Sa1e")
_TYPE = re.compile(
    r"(?<![A-Za-z])(\S{0,2}(?:urch|urc[hn]|rcha|rehas|ehase|chas[eo]|chasc|urchas)\S*|Sa[l1I]e(?:\s*\(partial\))?|Exchange)",
    re.I,
)
# m/d/yyyy, m/d/yy, or with the second slash lost / read as 1 (after OCR normalisation)
_DATE_TOKEN = re.compile(r"^[\s•.,:;'`|~\-]*([0-9]{1,2})/([0-9]{1,2})/?([0-9]{2,4})")


def _ocr_digits(t: str) -> str:
    return (t.replace("S", "5").replace("O", "0").replace("o", "0").replace("I", "1").replace("l", "1")
             .replace("|", "1").replace(" ", ""))


def date_candidates(after_type: str, not_after: str | None) -> tuple[list[str], int]:
    """Possible ISO dates right after the type word, and how many characters they used."""
    lead = len(after_type) - len(after_type.lstrip(" |•.,:;'`~-_"))
    head = after_type[lead: lead + 16]
    norm = _ocr_digits(head)
    m = _DATE_TOKEN.match(norm)
    if not m:
        return [], 0
    mo, d, y = m.group(1), m.group(2), m.group(3)
    cands: list[tuple[int, int, int]] = []

    def year(yy: str) -> int | None:
        if len(yy) == 4:
            return int(yy)
        if len(yy) == 2:
            return 2000 + int(yy)
        return None

    raw = m.group(0)
    if "/" in raw[raw.index("/") + 1:]:
        yv = year(y)
        if yv:
            cands.append((int(mo), int(d), yv))
    else:
        # "8/112025": either 8/11/2025 (slash lost) or 8/1/2025 (slash read as "1")
        rest = d + y
        for dl in (2, 1):
            dd, yy = rest[:dl], rest[dl:]
            if dl == 1 and yy.startswith("1") and len(yy) == 5:
                yy = yy[1:]
            if len(yy) == 4:
                cands.append((int(mo), int(dd), int(yy)))
    out = []
    for mo_, d_, y_ in cands:
        try:
            iso = dt.date(y_, mo_, d_).isoformat()
        except ValueError:
            continue
        if not_after and iso > not_after:
            continue
        if iso < "2015-01-01":
            continue
        out.append(iso)
    # map the used length back onto the original text (approximate: digits consumed)
    used = 0
    digits_needed = len(re.sub(r"[^0-9/]", "", raw))
    got = 0
    for ch in head:
        used += 1
        if _ocr_digits(ch) and re.match(r"[0-9/]", _ocr_digits(ch)):
            got += 1
            if got >= digits_needed:
                break
    return out, used + lead


def norm_amount(t: str) -> tuple[int | None, int | None]:
    t = re.sub(r"[0-9oO][0-9oO ,.]*", lambda m: m.group(0).replace("o", "0").replace("O", "0") if re.search(r"[0-9]", m.group(0)) else m.group(0), t)
    t = t.replace("S", "$").replace("s", "$")
    if not re.search(r"\$", t):
        t = "$" + t.strip()
    return band(t)


_ROW_START = re.compile(r"^[\s.,'`•~\-]*(\d{1,3})[\s.,]+(?=\S)")


def _anchor(line: str, filed: str | None) -> dict | None:
    """A line holding type + date (+ amount): the right-hand columns of one transaction."""
    for tm in _TYPE.finditer(line):
        typ = norm_type(tm.group(1))
        if not typ:
            continue
        cands, used = date_candidates(line[tm.end():], filed)
        if not cands:
            continue
        rest = line[tm.end() + used:]
        late = bool(re.match(r"^\W*(Yes|Vos|Yos|Ves|Y[eo]s)\b", rest, re.I))
        am = re.search(r"(Over\s*)?[$S]?\s*[0-9oO][0-9oO ,.]{2,}", rest)
        amin, amax = norm_amount(rest[am.start():]) if am else (None, None)
        if re.search(r"See Endnote|not readily", line, re.I):
            amin, amax = None, None
        return {"desc": line[: tm.start()], "type": typ, "dates": cands, "late": late, "amin": amin, "amax": amax}
    return None


_NOISE = re.compile(
    r"(OGE Form|If ?y[o0]u|N[o0]t[eo]|Fil(e|o|c)[r\'s]*\s*(Name|Inf)|Page\s*\d|Pa(g|q|a|=)[eo]|^Trans|^#|Descr|Received|Rece|30\s*Days|Days Ago|D[ae]y[sa] Ago|^Notif|^Donald J Trump|Instructions|public form|account numbers)",
    re.I,
)


# ---- paper reports with a noisy OCR text layer: read the text as one token stream

_PURCH_HINT = re.compile(r"(rch|rc[hn]|un:h|n:h|t:h|ha[sao]{2}|has[eo]|hao[eo]|iao[eo]|hat[o0]|ch[o0]a[o0]|chas|rcha|urc|ourc|pur|rdia)", re.I)
_SALE_TOK = re.compile(r"^[sSaAoO5][a:,oOuUeE]?[,:]?[l1iI][eoOcC]$")
_YESNO = re.compile(r"^[|I(]*(y[a-z-]{1,3}|v[a-z-]{1,3}|no|n[o0]|na|ne|nn)\W*$", re.I)


def _type_of(tok: str) -> str | None:
    t = re.sub(r"^[|I\[\]'\".,•:;`~(]+|[|\]'\".,•:;`~)]+$", "", tok)
    low = t.lower()
    if not low:
        return None
    if low.startswith("exchang"):
        return "E"
    if _SALE_TOK.match(t) or low in ("sale", "salo", "sole", "solo", "sulo", "aalo", "aale", "oalo", "salc", "sa1e", "sa1o"):
        return "S"
    if 6 <= len(low) <= 11 and _PURCH_HINT.search(low) and not re.search(r"[0-9]{2}", low):
        return "P"
    return None


_DATE_SHAPES = [re.compile(p) for p in (
    r"^([0-9]{1,2})[/1]?([0-9]{1,2})[/1]?([0-9]{4})$",
    r"^([0-9]{1,2})[/1]?([0-9]{1,2})[/1]?([0-9]{2})$",
)]


def _date_readings(tok: str, filed: str | None) -> list[str]:
    """Every sensible reading of an OCR'd m/d/yyyy token, within ~13 months before the filing."""
    norm = re.sub(r"[^0-9/]", "", tok.replace("S", "5").replace("O", "0").replace("o", "0").replace("l", "1")
                  .replace("I", "1").replace("|", "1").replace("f", "/").replace("\\", "/"))
    if len(re.sub(r"/", "", norm)) < 5:
        return []
    fdate = dt.date.fromisoformat(filed) if filed else dt.date.today()
    out = set()
    # brute force: month, day and an optional separator digit "1" where a slash was misread
    n = norm
    for mlen in (1, 2):
        for s1 in ("/", "1", ""):
            for dlen in (1, 2):
                for s2 in ("/", "1", ""):
                    j = 0
                    mo = n[j: j + mlen]; j += mlen
                    if s1:
                        if n[j: j + 1] != s1:
                            continue
                        j += 1
                    dd = n[j: j + dlen]; j += dlen
                    if s2:
                        if n[j: j + 1] != s2:
                            continue
                        j += 1
                    yy = n[j:]
                    if not (mo.isdigit() and dd.isdigit()) or len(mo) != mlen or len(dd) != dlen or len(yy) not in (2, 4, 5):
                        continue
                    if not yy.isdigit():
                        continue
                    m_, d_ = int(mo), int(dd)
                    if not (1 <= m_ <= 12 and 1 <= d_ <= 31):
                        continue
                    y_ = int(yy) + (2000 if len(yy) == 2 else 0) if len(yy) != 5 else 0
                    years = [y_] if 2015 <= y_ <= fdate.year else [fdate.year, fdate.year - 1]
                    for y in years:
                        try:
                            d0 = dt.date(y, m_, d_)
                        except ValueError:
                            continue
                        if fdate - dt.timedelta(days=400) <= d0 <= fdate:
                            out.add(d0.isoformat())
                            break
    return sorted(out)


_HEADER_TAIL = re.compile(r"^.*\bAmo?unt\b", re.I)
_PAGE_NOISE = re.compile(
    r"(OGE\s*F[o0][rn]|278-?T|n[o0]{2}d m[o0]r|f[o0]ll[o0]w\s+th|N[o0]t[o0e][·:.]|[l1I]nstruct|you need more|Instructions|public form|account numbers|family member|Fil[eo][r'\u2019]?s?\s*Nam|Page\s*\d|Pa[gq][eo]\s*\d|^Donald J\.? Trump|Transac|Notification|Received|Days\s*Ago)",
    re.I,
)


def parse_paper_stream(pages: list[str], filed: str | None) -> list[dict]:
    toks: list[str] = []
    for page in pages:
        for raw in page.split("\n"):
            line = _clean_line(raw)
            if not line:
                continue
            if re.search(r"\bAmo?unt\b", line, re.I):
                line = _HEADER_TAIL.sub("", line)  # a table header glued to the first row
            elif _PAGE_NOISE.search(line) and not re.search(r"\$|/20", line):
                continue
            if re.match(r"^(Endnotes|Summary of Contents|Privacy Act|Public Burden)", line, re.I):
                break
            toks += line.split()
    anchors = []  # (type index, date index, type, dates)
    i = 0
    while i < len(toks) - 1:
        typ = _type_of(toks[i])
        if not typ and len(toks[i]) <= 12 and i + 2 < len(toks) and _YESNO.match(toks[i + 2]) and toks[i + 1].count("/") == 2:
            typ = "?"  # an unreadable type: still a row boundary, but the row is dropped
        if typ:
            # the date may be split by a stray character ("7/ 11/25")
            for span in (1, 2):
                cand = "".join(toks[i + 1: i + 1 + span])
                ds = _date_readings(cand, filed)
                if ds:
                    anchors.append((i, i + span, typ, ds))
                    i += span
                    break
        i += 1
    rows = []
    prev_end = 0
    for k, (ti, di, typ, ds) in enumerate(anchors):
        j = di + 1
        late = False
        if j < len(toks) and re.match(r"^[|I(]*([yv][a-z-]{1,3})\W*$", toks[j], re.I) and not re.match(r"^n", toks[j], re.I):
            late, j = True, j + 1
        elif j < len(toks) and re.match(r"^[|I(]*(no|n[o0]|na|ne|nn)\W*$", toks[j], re.I):
            j += 1
        # the amount: tokens until the next description starts (letters without $)
        amt = []
        limit = anchors[k + 1][0] if k + 1 < len(anchors) else len(toks)
        while j < limit and len(amt) < 8:
            t = toks[j]
            if re.search(r"[0-9$]", t) or re.fullmatch(r"[-•—~·.,sSoO]+", t) or re.fullmatch(r"[sS$][0-9oO,.]+", t):
                amt.append(t)
                j += 1
                continue
            break
        amin, amax = norm_amount(" ".join(amt)) if amt else (None, None)
        desc_toks = toks[prev_end:ti]
        prev_end = j
        desc = " ".join(desc_toks)
        # an unrecognised earlier row glued on: keep what follows its "$amount  rownumber"
        desc = re.sub(r"^.*[$S5][0-9oO][0-9oO ,.]*\s*[-•—~·]\s*[$S5]?\s*[0-9oOS][0-9oOS ,.]*?[0-9oO]\s+\d{1,4}\s+(?=[A-Za-z])", "", desc)
        desc = re.sub(r"^(y[eo][sa]?|v[eo][sa]?|no)\s+", "", desc, flags=re.I)
        desc = re.sub(r"^[\W\d]*\d{1,4}\s+", "", desc)  # leading row number
        desc = re.sub(r"\s+\d{1,4}\W*$", "", desc)       # a trailing row number
        desc = desc.strip(" |•.,:;-_~'")
        if typ == "?" or len(re.sub(r"[^A-Za-z]", "", desc)) < 3:
            continue
        rows.append({"desc": desc, "type": typ, "dates": ds, "late": late, "amin": amin, "amax": amax})
    return rows


def parse_278t(content: bytes, filed: str | None = None) -> dict:
    """Parse one 278-T PDF into transactions."""
    import pdfplumber

    try:
        pdf = pdfplumber.open(io.BytesIO(content))
        pages = [(p.extract_text() or "") for p in pdf.pages]
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": str(e)[:200], "transactions": []}
    text = "\n".join(pages)
    ocr = False
    if len(re.sub(r"\s|\(cid:\d+\)", "", text)) < 400 * max(1, len(pages) - 2) / max(1, len(pages)):
        key = hashlib.sha1(content).hexdigest()[:16]
        cached = CACHE / "ocr" / f"{key}.json"
        pages = read_json(cached) or []
        if not pages:
            pages = ocr_pages(content)
            if pages:
                write_json(cached, pages)
        text = "\n".join(pages)
        ocr = True
    if len(re.sub(r"\s", "", text)) < 200:
        return {"status": "scanned", "transactions": []}
    if re.search(r"In place of (the )?line item", text, re.I):
        # an amendment letter replacing single lines of an earlier report
        return {"status": "amendment", "transactions": []}
    style = "integrity" if "integrity.gov" in text.lower() else "paper"

    rows: list[dict] = []
    pending: list[str] = []
    stop = False
    if style == "paper" and not ocr:
        rows = parse_paper_stream(pages, filed)
        stop = True
    for page in pages:
        if stop:
            break
        for raw in page.split("\n"):
            line = _clean_line(raw)
            if not line:
                continue
            if re.match(r"^(Endnotes|Summary of Contents|Privacy Act|Public Burden|PART # ENDNOTE)", line, re.I):
                if style == "integrity":
                    stop = rows != []
                pending = []
                if stop:
                    break
                continue
            a = _anchor(line, filed)
            if a:
                desc = a["desc"]
                if style == "integrity":
                    m = _ROW_START.match(desc)
                    desc = desc[m.end():] if m else desc
                    if not m and rows:
                        # a wrapped line that happens to contain a date: treat as continuation
                        pass
                elif ocr:
                    # rebuilt grid rows: "# | description | type | date | ...": the cell before the type
                    desc = desc.rstrip(" |").split("|")[-1]
                else:
                    desc = re.sub(r"^[\s.,'`•~\-]*\d{1,3}\s+", "", desc)
                    if pending:
                        desc = " ".join(pending + [desc])
                a["desc"] = desc
                rows.append(a)
                pending = []
                continue
            if _NOISE.search(line) or re.fullmatch(r"[\W\d]{0,4}", line):
                continue
            if style == "integrity":
                if rows and not re.fullmatch(r"\$?[0-9,]+", line.replace(" ", "")):
                    rows[-1]["desc"] += " " + line
                elif rows and rows[-1]["amax"] is None and rows[-1]["amin"]:
                    pass
            elif not ocr:
                pending.append(line)
                pending = pending[-2:]

    # resolve ambiguous OCR dates using the unambiguous ones in the same report
    sure = Counter(r["dates"][0] for r in rows if len(r["dates"]) == 1)
    txs = []
    for i, r in enumerate(rows):
        date = max(r["dates"], key=lambda d: (sure.get(d, 0), -r["dates"].index(d)))
        desc = re.sub(r"\s+", " ", r["desc"]).strip(" ,.;:-•")
        desc = re.sub(r"\s*\(\d+\)\s*$", "", desc)
        if not desc:
            continue
        tk, at = classify(desc)
        t = {"idx": len(txs), "asset": desc[:300], "type": r["type"], "tx_date": date,
             "amount_min": r["amin"], "amount_max": r["amax"], "owner": "SELF"}
        if tk:
            t["ticker"] = tk
        if at:
            t["asset_type"] = at
        if r["late"]:
            t["late_notice"] = True
        txs.append(t)
    return {"status": "ok" if txs else "empty", "style": style, "ocr": ocr, "transactions": txs}


def ocr_pages(content: bytes) -> list[str]:
    """Text of an image-only PDF: find the table grid, OCR each column strip, rebuild one line per row.

    OCR of the whole page fails on ruled tables (the grid lines become noise), so lines are removed and
    each column is read separately; words are then put back on the row whose ruling lines enclose them.
    Needs the tesseract binary (installed in the GitHub workflow).
    """
    import shutil

    if not shutil.which("tesseract"):
        log.warning("tesseract missing - cannot OCR")
        return []
    import pdfplumber

    out = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            img = page.to_image(resolution=200).original.convert("L")
            out.append(_ocr_table_page(img))
    return out


def _runs(mask, minlen: int):
    """Positions (row indexes) that hold a dark run of at least minlen pixels."""
    import numpy as np

    # scanned rules are slightly skewed and broken: thicken them vertically first
    m = mask.copy()
    for k in range(1, 5):
        m[k:] |= mask[:-k]
        m[:-k] |= mask[k:]
    hits = []
    for i, row in enumerate(m):
        d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
        st, en = np.where(d == 1)[0], np.where(d == -1)[0]
        if len(st) and int((en - st).max()) >= minlen:
            hits.append(i)
    # merge neighbouring pixel rows into one line
    lines: list[int] = []
    for h in hits:
        if lines and h - lines[-1][-1] <= 2:  # type: ignore[index]
            lines[-1].append(h)  # type: ignore[union-attr]
        else:
            lines.append([h])  # type: ignore[arg-type]
    return [int(sum(g) / len(g)) for g in lines]  # type: ignore[arg-type]


def _tess(img, psm: int = 6) -> list[tuple[int, int, str]]:
    """(y_center, x, word) for every word tesseract finds."""
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "c.png"
        img.save(f)
        r = subprocess.run(["tesseract", str(f), "-", "--psm", str(psm), "tsv"], capture_output=True, text=True, timeout=300)
    words = []
    for ln in r.stdout.splitlines()[1:]:
        c = ln.split("\t")
        if len(c) >= 12 and c[11].strip() and c[10] not in ("-1",):
            try:
                if float(c[10]) < 10:
                    continue
            except ValueError:
                continue
            words.append((int(c[7]) + int(c[9]) // 2, int(c[6]), c[11].strip()))
    return words


def _ocr_table_page(img) -> str:
    import numpy as np
    from PIL import Image

    a = np.array(img)
    dark = a < 150
    h, w = a.shape
    ys = _runs(dark, int(w * 0.25))
    xs = _runs(dark.T, int(h * 0.2))
    if len(ys) < 3 or len(xs) < 4:
        return ""
    top, bottom = ys[0], ys[-1]
    cols = [(xs[i], xs[i + 1]) for i in range(len(xs) - 1) if xs[i + 1] - xs[i] > 25]
    rows = [(ys[i], ys[i + 1]) for i in range(len(ys) - 1) if ys[i + 1] - ys[i] > 18]
    cells: dict[tuple[int, int], list[tuple[int, str]]] = {}
    for ci, (x0, x1) in enumerate(cols):
        # stay inside the vertical rules; the row rules under the text do not bother tesseract
        strip = img.crop((x0 + 5, top, x1 - 4, bottom))
        strip = strip.resize((strip.width * 2, strip.height * 2), Image.LANCZOS)
        pad = Image.new("L", (strip.width + 40, strip.height + 40), 255)
        pad.paste(strip, (20, 20))
        for yc, x, word in _tess(pad):
            y = (yc - 20) // 2 + top
            for ri, (y0, y1) in enumerate(rows):
                if y0 <= y < y1:
                    cells.setdefault((ri, ci), []).append((x, word))
                    break
    # a tall strip sometimes loses a few lines: read thin description cells again one by one
    if cols:
        dc = max(range(len(cols)), key=lambda i: cols[i][1] - cols[i][0])
        x0, x1 = cols[dc]
        for ri, (y0, y1) in enumerate(rows):
            txt = " ".join(w for _, w in cells.get((ri, dc), []))
            others = sum(len(cells.get((ri, c), [])) for c in range(len(cols)) if c != dc)
            if others >= 3 and len(re.sub(r"[^A-Za-z]", "", txt)) < 4:
                cell = img.crop((x0 + 5, y0 + 2, x1 - 4, y1 - 1))
                cell = cell.resize((cell.width * 2, cell.height * 2), Image.LANCZOS)
                pad = Image.new("L", (cell.width + 40, cell.height + 40), 255)
                pad.paste(cell, (20, 20))
                ws = _tess(pad, psm=7)
                if ws:
                    cells[(ri, dc)] = [(x, w) for _, x, w in ws]

    lines = []
    for ri in range(len(rows)):
        parts = []
        for ci in range(len(cols)):
            ws = sorted(cells.get((ri, ci), []))
            parts.append(" ".join(wd for _, wd in ws))
        if any(parts):
            lines.append(" | ".join(parts))
    return "\n".join(lines)


# ------------------------------------------------------------------ name -> ticker (paper reports)

_DROP = {"INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC", "LLC", "LP", "HOLDINGS", "HOLDING",
         "HLDGS", "GROUP", "THE", "NV", "SA", "AG", "SE", "CL", "CLASS", "A", "B", "C", "COM", "NEW", "DEL", "ADR",
         "SPONSORED", "ORD", "SHS", "PAR", "COMMON", "STOCK", "INCORPORATED", "N", "V", "UNSOLICITED", "IP", "F", "DE",
         "SOLICITED", "ALLOCATED", "ORDER", "REIT"}


def _norm_co(name: str) -> list[str]:
    s = re.sub(r"\bPAR\s*\$?[0-9.]+", " ", name.upper())
    s = re.sub(r"[^A-Z0-9 ]", " ", s.replace("&", " AND "))
    return [w for w in s.split() if w not in _DROP and not re.fullmatch(r"[0-9]+", w)]


def sec_names() -> list[tuple[list[str], str]]:
    """SEC's list of listed companies, cached for a week."""
    path = CACHE / "sec_company_tickers.json"
    d = read_json(path)
    fresh = d and d.get("_fetched", "") >= (dt.date.today() - dt.timedelta(days=7)).isoformat()
    if not fresh:
        try:
            s = http.session(http.sec_user_agent())
            r = http.get(s, "https://www.sec.gov/files/company_tickers_exchange.json")
            r.raise_for_status()
            d = {**r.json(), "_fetched": dt.date.today().isoformat()}
            write_json(path, d)
        except Exception as e:  # noqa: BLE001
            log.warning("SEC company list unavailable (%s) - using cached copy", e)
    if not d:
        return []
    out = []
    for row in d["data"]:
        rec = dict(zip(d["fields"], row))
        t = clean_ticker(str(rec["ticker"]))
        if t and rec.get("exchange") in ("NYSE", "Nasdaq", "CBOE", "NYSE American", "NYSE Arca", "BATS"):
            out.append((_norm_co(str(rec["name"])), t))
    return out


def resolve_names(names: set[str]) -> dict[str, str]:
    """Company name -> ticker for paper-report rows, cached in data/ref (manual fixes in config)."""
    from .util import CONFIG, load_yaml

    path = REF / "oge_names.json"
    cache: dict = read_json(path, {}) or {}
    todo = sorted(n for n in names if n not in cache)
    if todo:
        titles = sec_names()
        if titles:
            for n in todo:
                key = _norm_co(n)
                if not key:
                    cache[n] = ""
                    continue
                hits = {t for words, t in titles if words == key}
                if not hits and len(key) >= 2:
                    hits = {t for words, t in titles if words[: len(key)] == key}
                # several share classes of one company (GOOG/GOOGL): pick the class named in the text
                if len(hits) > 1:
                    cls = re.search(r"\bCL(?:ASS)?\s+([A-C])\b", n.upper())
                    base = sorted(hits, key=len)
                    if cls:
                        pick = [h for h in hits if h.endswith(("." + cls.group(1), cls.group(1)))]
                        hits = set(pick[:1]) if len(pick) == 1 else hits
                    if len(hits) > 1 and len({h.split(".")[0] for h in hits}) == 1:
                        hits = {base[0]}
                cache[n] = hits.pop() if len(hits) == 1 else ""
            write_json(path, cache, pretty=True)
    manual = load_yaml(CONFIG / "oge_tickers.yaml") or {}
    return {k: (manual.get(k) if k in manual else v) for k, v in cache.items() if (manual.get(k) if k in manual else v)}


def looks_like_equity(desc: str) -> bool:
    """A paper-report row that names a company's shares (not a bond, fund or private entity)."""
    d = desc.upper()
    if "%" in d or re.search(r"\bDUE\b|\bB/E\b|\bFUND\b|\bTRUST\b|\bL\.?P\.?\b|\bLLC\b|\bNOTE\b|\bBOND\b", d):
        return False
    return bool(re.search(r"\b(INC|CORP|CO|PLC|LTD|N\.?V|CL [A-C]|COM|HOLDINGS|GROUP|SA|AG|TECHNOLOGIES)\b", d))


# ------------------------------------------------------------------ update / load


def raw_path(did: str):
    return RAW / "oge" / f"{did}.json"


def update(limit: int | None = None) -> dict:
    s = http.session()
    docs = fetch_index(s)
    write_json(REF / "oge_index.json", _index_summary(docs))
    wanted = [d for d in docs if d["kind"].startswith("278 Transaction") and d["url"]]
    new = parsed = 0
    for d in wanted:
        did = doc_id(d["url"])
        p = raw_path(did)
        old = read_json(p)
        if old and old.get("parser") == PARSER_VERSION:
            continue
        if limit is not None and new >= limit:
            break
        content = _get_pdf(s, did, d["url"])
        new += 1
        if content is None:
            continue
        filed = d["added"] or None
        rec = {**d, "doc": did, "parser": PARSER_VERSION, **parse_278t(content, filed)}
        write_json(p, rec, pretty=True)
        parsed += 1
    return {"index": len(docs), "transaction_reports": len(wanted), "downloaded": new, "parsed": parsed}


def _get_pdf(s, did: str, url: str) -> bytes | None:
    local = CACHE / "pdf" / "oge" / f"{did}.pdf"
    if local.exists():
        return local.read_bytes()
    try:
        r = http.get(s, url, timeout=120)
        r.raise_for_status()
    except Exception as e:  # noqa: BLE001
        log.warning("OGE %s: %s", url, e)
        return None
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(r.content)
    return r.content


def _index_summary(docs: list[dict]) -> list[dict]:
    """Per person with at least one public document: roles, public documents, count of on-request ones."""
    by: dict[str, dict] = {}
    for d in docs:
        if not d["name"]:
            continue
        k = person_key(d["name"])
        p = by.setdefault(k, {"key": k, "name": d["name"], "roles": {}, "docs": [], "req": 0, "kinds": {}})
        role = f"{d['title']}|{d['agency']}"
        p["roles"][role] = max(p["roles"].get(role, ""), d["added"])
        if d["url"]:
            p["docs"].append({"kind": d["kind"], "added": d["added"], "url": d["url"]})
        else:
            p["req"] += 1
            if d["kind"].startswith("Termination"):
                p["kinds"]["term"] = max(p["kinds"].get("term", ""), d["added"])
        p["kinds"]["last"] = max(p["kinds"].get("last", ""), d["added"])
    out = []
    for p in by.values():
        if not p["docs"]:
            continue
        p["docs"].sort(key=lambda x: (x["added"], x["kind"], x["url"]), reverse=True)
        out.append(p)
    return sorted(out, key=lambda p: p["key"])


def load_all() -> list[dict]:
    out = []
    for p in sorted((RAW / "oge").glob("*.json")):
        d = read_json(p)
        if d:
            out.append(d)
    return out


def load_index() -> list[dict]:
    return read_json(REF / "oge_index.json", []) or []
