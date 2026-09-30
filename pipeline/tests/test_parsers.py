from conftest import FIX
from otrack.house import norm_type, parse_asset, parse_ptr_pdf, reported_price
from otrack.senate import parse_ptr_html
from otrack.util import clean_ticker, parse_amount


def test_amounts():
    assert parse_amount("$1,001 - $15,000") == (1001, 15000)
    assert parse_amount("$15,001 -\n$50,000") == (15001, 50000)
    assert parse_amount("Over $50,000,000") == (50000001, None)
    assert parse_amount("Spouse/DC Over $1,000,000") == (1000001, None)
    assert parse_amount("") == (None, None)


def test_tickers():
    assert clean_ticker("BRK/B") == "BRK.B"
    assert clean_ticker("brk-b") == "BRK.B"
    assert clean_ticker("--") is None
    assert clean_ticker("not a ticker") is None


def test_type_and_asset():
    assert norm_type("S (partial)") == ("SP", "")
    assert norm_type("s") == ("SF", "")
    assert norm_type("P U.S. Trust") == ("P", "U.S. Trust")
    a = parse_asset("aDTRaN, Inc. (aDTN) [sT]", old_font=True)
    assert a == {"asset": "ADTRAN, Inc.", "ticker": "ADTN", "asset_type": "ST"}
    assert parse_asset("Eaton Corporation, PLC Ordinary Shares (ETN) [ST]")["ticker"] == "ETN"
    assert parse_asset("Taiwan Semiconductor (ADR) (TSM) [ST]")["ticker"] == "TSM"


def test_reported_price():
    d = "The full transaction included: T – 37.426 shares sold @ $27.645/share AMZN – 25 shares sold @ $209.40/share"
    assert reported_price(d, "AMZN") == {"price": 209.4, "shares": 25.0}
    assert reported_price(d, "MSFT") is None
    assert reported_price("Bought 100 shares at $12.50 per share", "XYZ") == {"price": 12.5, "shares": 100.0}


def test_house_pdf_multi():
    r = parse_ptr_pdf((FIX / "house_ptr_multi.pdf").read_bytes())
    assert r["status"] == "ok"
    assert r["filer"]["state_dst"] == "MO04"
    txs = r["transactions"]
    assert len(txs) == 9
    amzn = txs[0]
    assert (amzn["ticker"], amzn["type"], amzn["tx_date"], amzn["amount_min"], amzn["amount_max"]) == ("AMZN", "SP", "2026-03-16", 1001, 15000)
    assert amzn["subholding"] == "Putnam Investments"
    assert amzn["reported"]["price"] == 209.4
    assert txs[3]["ticker"] == "BRK.B"


def test_house_pdf_spouse_wrapped_amount():
    txs = parse_ptr_pdf((FIX / "house_ptr_spouse.pdf").read_bytes())["transactions"]
    assert [(t["owner"], t["ticker"], t["type"], t["amount_min"], t["amount_max"]) for t in txs] == [
        ("SP", "FERG", "P", 15001, 50000),
        ("SP", "NFLX", "SF", 1001, 15000),
    ]


def test_house_pdf_scanned():
    assert parse_ptr_pdf((FIX / "house_ptr_scanned.pdf").read_bytes())["status"] == "scanned"


def test_senate_html():
    r = parse_ptr_html((FIX / "senate_ptr.html").read_text())
    assert r["status"] == "ok"
    t = r["transactions"][0]
    assert (t["ticker"], t["owner"], t["type"], t["amount_min"], t["amount_max"], t["tx_date"]) == ("WFC", "SP", "P", 15001, 50000, "2026-09-01")
