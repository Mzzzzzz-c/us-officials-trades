"""U.S. House Periodic Transaction Reports (PTRs).

Source: Office of the Clerk, https://disclosures-clerk.house.gov
  * yearly index:  /public_disc/financial-pdfs/{YEAR}FD.zip  (XML list of every filing)
  * each PTR:      /public_disc/ptr-pdfs/{YEAR}/{DocID}.pdf

Electronically filed PTRs are text PDFs and are parsed here by column position.
Paper filings are image scans; they are recorded as "scanned" with a link and
are not parsed (see docs: OCR is a later phase).
"""
from __future__ import annotations

import io
import logging
import re
import xml.etree.ElementTree as ET
import zipfile

import pdfplumber

from . import http
from .util import CACHE, RAW, clean_ticker, mdy_to_iso, parse_amount, read_json, write_json

log = logging.getLogger(__name__)

BASE = "https://disclosures-clerk.house.gov/public_disc"
PARSER_VERSION = 3


def index_url(year: int) -> str:
    return f"{BASE}/financial-pdfs/{year}FD.zip"


def pdf_url(year: int, doc_id: str) -> str:
    return f"{BASE}/ptr-pdfs/{year}/{doc_id}.pdf"


# ------------------------------------------------------------------ index


def fetch_index(s, year: int) -> list[dict]:
    """Return the PTR filings (FilingType 'P') listed in a year's index."""
    r = http.get(s, index_url(year))
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    xml_name = next(n for n in z.namelist() if n.lower().endswith(".xml"))
    root = ET.fromstring(z.read(xml_name))
    out = []
    for m in root.findall("Member"):
        g = lambda tag: (m.findtext(tag) or "").strip()  # noqa: E731
        if g("FilingType") != "P":
            continue
        out.append(
            {
                "doc_id": g("DocID"),
                "year": int(g("Year") or year),
                "first": g("First"),
                "last": g("Last"),
                "suffix": g("Suffix"),
                "state_dst": g("StateDst"),
                "filed": mdy_to_iso(g("FilingDate")),
            }
        )
    return out


# ------------------------------------------------------------------ PDF parsing

DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
TICKER_PAREN = re.compile(r"\(([A-Za-z][A-Za-z0-9]{0,5}(?:[./][A-Za-z0-9]{1,2})?)\)")
NOT_TICKERS = {"THE", "ADR", "REIT", "LLC", "INC", "CORP", "NEW", "FUND", "CL", "CLASS", "LP", "ETF"}
TICKER_EXCH = re.compile(r"\b(?:NYSE|NASDAQ|NYSEARCA|NYSEAMERICAN|NYSEMKT|BATS|CBOE)\w*:\s*([A-Z]{1,5}(?:\.[A-Z])?)\b")
TYPE_CODE = re.compile(r"\[([A-Za-z]{2})\]")
LABELS = [
    # older PDFs print the labels in words (with scrambled letter case)
    ("status", re.compile(r"^FILING\s+STATUS\s*:\s*(.*)$", re.I)),
    ("subholding", re.compile(r"^SUBHOLDING\s+OF\s*:\s*(.*)$", re.I)),
    ("description", re.compile(r"^DESCRIPTION\s*:\s*(.*)$", re.I)),
    ("comment", re.compile(r"^COMMENTS?\s*:\s*(.*)$", re.I)),
    ("location", re.compile(r"^LOCATION\s*:\s*(.*)$", re.I)),
    # newer PDFs: label glyphs decode as NULs, leaving only initials ("F S: New")
    ("status", re.compile(r"^F\s*S\s*:\s*(.*)$")),
    ("subholding", re.compile(r"^S\s*O\s*:\s*(.*)$")),
    ("description", re.compile(r"^D\s*:\s*(.*)$")),
    ("comment", re.compile(r"^C\s*:\s*(.*)$")),
    ("location", re.compile(r"^L\s*:\s*(.*)$")),
]
HEADER_TAIL = {"Type", "Date", "Gains", ">", "$200?"}


def _lines(page) -> list[dict]:
    words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
    words.sort(key=lambda w: (w["top"], w["x0"]))
    lines: list[dict] = []
    for w in words:
        # label glyphs in these PDFs decode as NUL characters ("F\x00\x00 S\x00:")
        w = dict(w, text=re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f]", "", w["text"])).strip())
        if not w["text"]:
            continue
        if lines and abs(lines[-1]["top"] - w["top"]) <= 2.5:
            lines[-1]["words"].append(w)
        else:
            lines.append({"top": w["top"], "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w["x0"])
        ln["text"] = " ".join(w["text"] for w in ln["words"])
        ln["x0"] = ln["words"][0]["x0"]
    return lines


HEADER_KEYS = {"owner": "Owner", "asset": "Asset", "transaction": "Transaction",
               "notification": "Notification", "amount": "Amount", "cap.": "Cap."}


def _header_cols(line: dict) -> dict | None:
    """Column x-positions from the table header row (letter case varies between PDF vintages)."""
    names = {w["text"].lower() for w in line["words"]}
    if not {"owner", "asset", "notification", "amount"} <= names:
        return None
    pos: dict = {}
    for w in line["words"]:
        t = w["text"].lower()
        key = HEADER_KEYS.get(t)
        if key and key not in pos:
            pos[key] = w["x0"]
        if t == "date" and "Transaction" in pos and "date" not in pos:
            pos["date"] = w["x0"]
    if "Transaction" not in pos or "date" not in pos:
        return None
    pos.setdefault("Cap.", 10_000)
    return pos


def _col(x: float, c: dict) -> str:
    e = 3
    if x < c["Asset"] - e:
        return "owner"
    if x < c["Transaction"] - e:
        return "asset"
    if x < c["date"] - e:
        return "type"
    if x < c["Notification"] - e:
        return "date"
    if x < c["Amount"] - e:
        return "notif"
    if x < c["Cap."] - e:
        return "amount"
    return "cap"


def _split(line: dict, c: dict) -> dict[str, str]:
    parts: dict[str, list[str]] = {}
    for w in line["words"]:
        parts.setdefault(_col(w["x0"], c), []).append(w["text"])
    return {k: " ".join(v) for k, v in parts.items()}


def _is_row(p: dict) -> bool:
    return bool(DATE_RE.match(p.get("date", "").split(" ")[0] if p.get("date") else "")) and bool(
        p.get("type", "").strip()
    )


_SMALL = {"of", "and", "the", "for", "in", "on", "de", "at", "by", "to", "&"}


def fix_case(text: str) -> str:
    """Older PDFs scramble letter case ('aDTRaN, Inc.', 'Procter & gamble'). Repair it for display."""
    out = []
    for w in text.split(" "):
        letters = re.sub(r"[^A-Za-z]", "", w)
        if not letters:
            out.append(w)
        elif letters.islower():
            out.append(w if w in _SMALL else w[:1].upper() + w[1:])
        elif not letters.isupper() and any(c.isupper() for c in letters[1:]) and len(letters) <= 8:
            out.append(w.upper())  # 'aDTRaN,' -> 'ADTRAN,'  'CVs' -> 'CVS'
        else:
            out.append(w)
    return " ".join(out)


def parse_asset(text: str, old_font: bool = False) -> dict:
    text = re.sub(r"\s+", " ", text).strip()
    ticker = None
    cands = [c for c in TICKER_PAREN.findall(text) if c.upper() not in NOT_TICKERS]
    if cands:
        ticker = clean_ticker(cands[-1].upper())
    else:
        m2 = TICKER_EXCH.search(text)
        if m2:
            ticker = clean_ticker(m2.group(1))
    tc = TYPE_CODE.findall(text)
    name = TYPE_CODE.sub("", text)
    if cands:
        name = name.replace(f"({cands[-1]})", "")
    name = re.sub(r"\s+", " ", name).strip(" -")
    if old_font:
        name = fix_case(name)
    return {"asset": name, "ticker": ticker, "asset_type": tc[-1].upper() if tc else None}


TYPE_RE = re.compile(r"^\s*([PSE])\b\s*(\(\s*partial\s*\))?", re.I)


def norm_type(raw: str) -> tuple[str, str]:
    """'S (partial)' -> ('SP', ''); 'P extra words' -> ('P', 'extra words')."""
    m = TYPE_RE.match(raw or "")
    if not m:
        return (raw or "").strip(), ""
    letter = m.group(1).upper()
    code = {"P": "P", "E": "E"}.get(letter, "SP" if m.group(2) else "SF")
    return code, raw[m.end():].strip()


OPT_KIND = re.compile(r"\b(call|put)s?\b", re.I)
OPT_STRIKE = re.compile(r"strike(?:\s+price)?(?:\s+of)?\s*(?:is\s*)?\$\s*([\d,]+(?:\.\d+)?)", re.I)
OPT_EXP = re.compile(r"expir\w*(?:\s+date)?(?:\s+of|\s+on)?\s*:?\s*(\d{1,2}/\d{1,2}/\d{2,4})", re.I)


def parse_option(*texts: str | None) -> dict | None:
    t = " ".join(x for x in texts if x)
    if not t:
        return None
    kind = OPT_KIND.search(t)
    strike = OPT_STRIKE.search(t)
    exp = OPT_EXP.search(t)
    if not (kind or strike or exp):
        return None
    out = {}
    if kind:
        out["kind"] = kind.group(1).lower()
    if strike:
        out["strike"] = float(strike.group(1).replace(",", ""))
    if exp:
        d = exp.group(1)
        mo, da, yr = d.split("/")
        if len(yr) == 2:
            yr = "20" + yr
        out["exp"] = mdy_to_iso(f"{int(mo):02d}/{int(da):02d}/{yr}")
    return out


_SEG = re.compile(
    r"\b([A-Z][A-Z0-9]{0,5}(?:[./][A-Z0-9]{1,2})?)\s*[-–]\s*([\d,]+(?:\.\d+)?)\s+shares?\b[^@$]{0,30}?@\s*\$\s*([\d,]+(?:\.\d+)?)"
)
_ONE = re.compile(r"([\d,]+(?:\.\d+)?)\s+shares?\b[^@$]{0,60}?(?:@|\bat\b)\s*\$\s*([\d,]+(?:\.\d+)?)", re.I)


def reported_price(desc: str | None, ticker: str | None) -> dict | None:
    """Exact per-share price when the filer wrote one in the description."""
    if not desc:
        return None
    d = desc.replace("–", "-")
    if ticker:
        for m in _SEG.finditer(d):
            if clean_ticker(m.group(1)) == ticker:
                return {"price": float(m.group(3).replace(",", "")), "shares": float(m.group(2).replace(",", ""))}
        if _SEG.search(d):
            return None  # a multi-ticker list that doesn't include this ticker
    ms = list(_ONE.finditer(d))
    if len(ms) == 1:
        try:
            return {"price": float(ms[0].group(2).replace(",", "")), "shares": float(ms[0].group(1).replace(",", ""))}
        except ValueError:
            return None
    return None


_SHARES_ONLY = re.compile(r"\b(?:purchased|bought|sold|sale of|purchase of|acquired)\s+(?:approximately\s+)?([\d,]+(?:\.\d+)?)\s+shares?\b", re.I)


def reported_shares(desc: str | None) -> float | None:
    """'Purchased 10,000 shares.' -> 10000.0 (only when exactly one share count is stated)."""
    if not desc:
        return None
    ms = _SHARES_ONLY.findall(desc)
    if len(ms) != 1:
        return None
    try:
        n = float(ms[0].replace(",", ""))
    except ValueError:
        return None
    return n if n > 0 else None


def parse_ptr_pdf(content: bytes) -> dict:
    """Parse one House PTR PDF. Returns {'status': ok|scanned|empty, 'filer': {...}, 'transactions': [...]}"""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        pages = list(pdf.pages)
        all_text = "\n".join((p.extract_text() or "") for p in pages)
        if len(all_text.strip()) < 40:
            return {"status": "scanned", "filer": {}, "transactions": []}

        filer = {}
        m = re.search(r"Name:\s*(.+)", all_text)
        if m:
            filer["name"] = m.group(1).strip()
        m = re.search(r"Status:\s*(.+)", all_text)
        if m:
            filer["status"] = m.group(1).strip()
        m = re.search(r"State/District:\s*([A-Z]{2}\d{0,2})", all_text)
        if m:
            filer["state_dst"] = m.group(1)

        old_font = "Owner" not in all_text or bool(re.search(r"FILING\s+STATUS", all_text, re.I))
        txs: list[dict] = []
        cur: dict | None = None
        field: str | None = None

        def finish():
            nonlocal cur
            if cur:
                txs.append(cur)
            cur = None

        for page in pages:
            cols = None
            for ln in _lines(page):
                hc = _header_cols(ln)
                if hc:
                    cols = hc
                    continue
                if cols is None:
                    continue
                words = {w["text"] for w in ln["words"]}
                if words <= HEADER_TAIL:
                    continue
                txt = ln["text"]
                parts = _split(ln, cols)
                is_row = _is_row(parts)
                # left-margin text = a new section (Investment Vehicle Details, Certification, footnote)
                if not is_row and (ln["x0"] < cols["Owner"] - 12 or txt.startswith("*")):
                    finish()
                    field = None
                    cols = None
                    continue
                if is_row:
                    finish()
                    field = None
                    ttype = parts.get("type", "").strip()
                    cur = {
                        "owner": parts.get("owner", "").strip() or "SELF",
                        "asset_text": parts.get("asset", ""),
                        "type_raw": ttype,
                        "tx_date": mdy_to_iso(parts.get("date", "").split(" ")[0]),
                        "notified": mdy_to_iso((parts.get("notif") or "").split(" ")[0]),
                        "amount_text": parts.get("amount", ""),
                    }
                    continue
                if cur is None:
                    continue
                label = None
                for name, rx in LABELS:
                    mm = rx.match(txt)
                    if mm and ln["x0"] >= cols["Asset"] - 5:
                        label = name
                        cur[name] = mm.group(1).strip()
                        field = name
                        break
                if label:
                    continue
                if field:  # continuation of a detail field
                    cur[field] = (cur.get(field, "") + " " + txt).strip()
                    continue
                # continuation of the row itself (wrapped asset name / amount / type)
                for k, v in parts.items():
                    if k == "asset":
                        cur["asset_text"] += " " + v
                    elif k == "amount":
                        cur["amount_text"] += " " + v
                    elif k == "type":
                        cur["type_raw"] = (cur["type_raw"] + " " + v).strip()
        finish()

    out = []
    for i, t in enumerate(txs):
        ttype, extra = norm_type(re.sub(r"\s+", " ", t.pop("type_raw")))
        a = parse_asset(t.pop("asset_text") + (" " + extra if extra else ""), old_font)
        lo, hi = parse_amount(t.pop("amount_text"))
        rec = {
            "idx": i + 1,
            "owner": next((o for o in t["owner"].upper().split() if o in ("SP", "JT", "DC")), "SELF"),
            "tx_date": t["tx_date"],
            "notified": t.get("notified"),
            "type": ttype,
            "amount_min": lo,
            "amount_max": hi,
            **a,
        }
        for k in ("status", "subholding", "description", "comment", "location"):
            if t.get(k):
                rec[k] = re.sub(r"\s+", " ", t[k]).strip()
        if rec.get("asset_type") == "OP":
            opt = parse_option(rec["asset"], rec.get("description"))
            if opt:
                rec["option"] = opt
        rp = reported_price(rec.get("description"), rec["ticker"])
        if rp:
            rec["reported"] = rp
        out.append(rec)
    return {"status": "ok" if out else "empty", "filer": filer, "transactions": out}


# ------------------------------------------------------------------ update


def cache_path(year: int, doc_id: str):
    return RAW / "house" / str(year) / f"{doc_id}.json"


def _get_pdf(s, year: int, doc_id: str, url: str) -> bytes | None:
    """Download a PTR PDF, keeping a local copy (not committed) so re-parsing is cheap."""
    local = CACHE / "pdf" / "house" / str(year) / f"{doc_id}.pdf"
    if local.exists() and local.stat().st_size > 0:
        return local.read_bytes()
    r = http.get(s, url)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(r.content)
    return r.content


def update(years: list[int], limit: int | None = None) -> dict:
    """Download and parse every PTR not yet cached. Returns counts."""
    s = http.session()
    stats = {"new": 0, "scanned": 0, "errors": 0, "cached": 0}
    done = 0
    for year in years:
        try:
            filings = fetch_index(s, year)
        except Exception as e:  # noqa: BLE001
            log.warning("house index %s failed: %s", year, e)
            continue
        log.info("house %s: %d PTR filings in index", year, len(filings))
        for f in filings:
            p = cache_path(year, f["doc_id"])
            old = read_json(p)
            if old and old.get("parser") == PARSER_VERSION:
                stats["cached"] += 1
                continue
            if limit is not None and done >= limit:
                continue
            done += 1
            url = pdf_url(year, f["doc_id"])
            try:
                content = _get_pdf(s, year, f["doc_id"], url)
                if content is None:
                    log.info("house %s missing (404)", url)
                    continue
                parsed = parse_ptr_pdf(content)
            except Exception as e:  # noqa: BLE001
                log.warning("house %s failed: %s", url, e)
                stats["errors"] += 1
                parsed = {"status": "error", "error": str(e)[:300], "filer": {}, "transactions": []}
            rec = {**f, "parser": PARSER_VERSION, "url": url, **parsed}
            write_json(p, rec, pretty=True)
            stats["new"] += 1
            if parsed["status"] == "scanned":
                stats["scanned"] += 1
            if done % 50 == 0:
                log.info("house: %d filings processed", done)
    return stats


def load_all() -> list[dict]:
    out = []
    for p in sorted((RAW / "house").glob("*/*.json")):
        d = read_json(p)
        if d:
            out.append(d)
    return out
