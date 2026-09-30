"""Small shared helpers: paths, dates, amounts, JSON I/O."""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
CACHE = DATA / "cache"  # large, rebuildable, not committed (prices, PDFs)
REF = DATA / "ref"  # small reference data, committed (legislators, CUSIP map, companies)
SITE = DATA / "site"
CONFIG = ROOT / "config"


def load_yaml(path: Path) -> Any:
    import yaml

    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def settings() -> dict:
    s = load_yaml(CONFIG / "settings.yaml") or {}
    s.setdefault("start_year", 2020)
    s.setdefault("price_provider", "yahoo")
    s.setdefault("price_start", "2019-12-01")
    s.setdefault("investor_quarters", 12)
    s.setdefault("horizons", [30, 90, 180, 365])
    s.setdefault("benchmark", "SPY")
    s.setdefault("recent_days", 120)
    return s


# ---------------------------------------------------------------- JSON


def read_json(path: Path, default: Any = None) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return default


def write_json(path: Path, obj: Any, pretty: bool = False) -> None:
    """Write deterministically (sorted keys) so unchanged data gives no git diff."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        if pretty:
            json.dump(obj, fh, ensure_ascii=False, sort_keys=True, indent=1)
        else:
            json.dump(obj, fh, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        fh.write("\n")
    os.replace(tmp, path)


# ---------------------------------------------------------------- dates

_MDY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")


def mdy_to_iso(s: str | None) -> str | None:
    """'03/16/2026' -> '2026-03-16'. Returns None if not a valid date."""
    if not s:
        return None
    m = _MDY.match(s.strip())
    if not m:
        return None
    mo, d, y = (int(x) for x in m.groups())
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None


def to_date(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def days_between(a: str, b: str) -> int:
    return (to_date(b) - to_date(a)).days


def today_iso() -> str:
    return dt.date.today().isoformat()


def is_weekend(s: str) -> bool:
    return to_date(s).weekday() >= 5


# ---------------------------------------------------------------- amounts

_NUM = re.compile(r"\$?\s*([\d,]+(?:\.\d+)?)")


def parse_amount(text: str | None) -> tuple[int | None, int | None]:
    """Parse a disclosure amount band.

    '$1,001 - $15,000' -> (1001, 15000); 'Over $50,000,000' -> (50000001, None);
    '$15,001 -' (truncated) -> (15001, None). Returns (None, None) if nothing parses.
    """
    if not text:
        return None, None
    t = text.replace("–", "-").replace("—", "-")
    nums = [int(float(n.replace(",", ""))) for n in _NUM.findall(t)]
    if not nums:
        return None, None
    if re.search(r"\bover\b", t, re.I):
        return nums[0] + (1 if nums[0] % 10 == 0 else 0), None
    if len(nums) >= 2:
        lo, hi = nums[0], nums[1]
        if hi < lo:
            lo, hi = hi, lo
        return lo, hi
    # a single number: an exact amount was reported
    if "-" in t:
        return nums[0], None
    return nums[0], nums[0]


# ---------------------------------------------------------------- names

_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|md|phd|hon|dr|mr|mrs|ms)\b\.?", re.I)


def norm_name(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("’", "'")
    s = _SUFFIX.sub(" ", s)
    s = re.sub(r"[^a-z' -]", " ", s)
    s = s.replace("-", " ").replace("'", "")
    return re.sub(r"\s+", " ", s).strip()


def first_token(s: str | None) -> str:
    n = norm_name(s)
    return n.split(" ")[0] if n else ""


# ---------------------------------------------------------------- tickers

_TICKER_OK = re.compile(r"^[A-Z][A-Z0-9]{0,5}(?:[.\-/][A-Z0-9]{1,2})?$")


def clean_ticker(t: str | None) -> str | None:
    """Normalise to our canonical form: upper case, class shares with a dot (BRK.B)."""
    if not t:
        return None
    t = t.strip().upper().replace(" ", "")
    t = t.replace("/", ".").replace("-", ".")
    if t in {"--", "N/A", "NA", "NONE"}:
        return None
    return t if _TICKER_OK.match(t) else None


def chunks(seq: list, n: int) -> Iterable[list]:
    for i in range(0, len(seq), n):
        yield seq[i : i + n]
