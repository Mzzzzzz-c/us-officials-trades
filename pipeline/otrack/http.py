"""HTTP session with retries and a per-host politeness delay."""
from __future__ import annotations

import os
import threading
import time
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 us-officials-trades"
)

# Minimum seconds between two requests to the same host.
HOST_DELAY = {
    "www.sec.gov": 0.15,  # SEC fair-access: max 10 requests/second
    "data.sec.gov": 0.15,
    "efdsearch.senate.gov": 0.5,
    "disclosures-clerk.house.gov": 0.2,
    "query1.finance.yahoo.com": 0.25,
    "query2.finance.yahoo.com": 0.25,
    "api.openfigi.com": 2.5,
    "www.alphavantage.co": 0.9,
}

_last: dict[str, float] = {}
_lock = threading.Lock()


def sec_user_agent() -> str:
    ua = os.environ.get("SEC_USER_AGENT", "").strip()
    if not ua or "@" not in ua:
        raise RuntimeError(
            "SEC_USER_AGENT is not set. SEC requires a contact email, e.g. "
            "'us-officials-trades you@example.com'. Set it as a GitHub Actions secret."
        )
    return ua


def session(user_agent: str = BROWSER_UA, retry_429: bool = True) -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504) if retry_429 else (500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers["User-Agent"] = user_agent
    s.headers["Accept-Encoding"] = "gzip, deflate"
    return s


def polite(url: str) -> None:
    host = urlparse(url).netloc
    delay = HOST_DELAY.get(host, 0.2)
    with _lock:
        now = time.monotonic()
        wait = _last.get(host, 0) + delay - now
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.monotonic()


def get(s: requests.Session, url: str, **kw) -> requests.Response:
    polite(url)
    kw.setdefault("timeout", 45)
    return s.get(url, **kw)


def post(s: requests.Session, url: str, **kw) -> requests.Response:
    polite(url)
    kw.setdefault("timeout", 45)
    return s.post(url, **kw)
