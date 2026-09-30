"""Command line.

    python -m otrack all            # fetch everything new, then rebuild data/site
    python -m otrack build          # rebuild data/site from what is already cached
    python -m otrack all --limit 50 # at most 50 new filings per source (quick test)
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

from . import build


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="otrack")
    ap.add_argument("command", choices=["all", "build"])
    ap.add_argument("--limit", type=int, default=None, help="max new filings per source")
    ap.add_argument("--skip-prices", action="store_true")
    ap.add_argument("--skip-sec", action="store_true", help="skip 13F investors and sectors")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if a.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("pdfminer").setLevel(logging.ERROR)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    report = build.run(fetch=a.command == "all", limit=a.limit, skip_prices=a.skip_prices, skip_sec=a.skip_sec)
    print(json.dumps(report, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
