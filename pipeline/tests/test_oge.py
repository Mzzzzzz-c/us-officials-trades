"""Executive branch (OGE 278-T) parsing."""
from pathlib import Path

from otrack import oge

FIX = Path(__file__).parent / "fixtures"


def test_integrity_report():
    r = oge.parse_278t((FIX / "oge_278t_integrity.pdf").read_bytes(), "2025-08-14")
    assert r["status"] == "ok" and r["style"] == "integrity"
    txs = r["transactions"]
    assert len(txs) == 24
    first = txs[0]
    assert first["ticker"] == "EWG" and first["type"] == "S" and first["tx_date"] == "2025-03-04"
    assert (first["amount_min"], first["amount_max"]) == (1001, 15000)
    # an amount wrapped onto the next line
    gld = txs[2]
    assert gld["ticker"] == "GLD" and (gld["amount_min"], gld["amount_max"]) == (50001, 100000)
    # a description wrapped onto the next line
    assert txs[18]["asset"].endswith("Onshore Fund, LLC")


def test_ocr_dates():
    assert oge._date_readings("3110/2026", "2026-05-14") == ["2026-03-10"]
    assert oge._date_readings("2123/2026", "2026-05-14") == ["2026-02-23"]
    assert oge._date_readings("7/17/25", "2025-08-19") == ["2025-07-17"]
    # a date after the filing is impossible
    assert oge._date_readings("6/23/2026", "2026-05-01") == []


def test_ocr_types():
    for t in ("purchase", "lourchaso", "ourehase", "nurchasc", "Pllrchoao"):
        assert oge._type_of(t) == "P", t
    for t in ("sale", "salo", "solo", "s:,lo"):
        assert oge._type_of(t) == "S", t
    for t in ("CORP", "INC", "2026"):
        assert oge._type_of(t) is None, t


def test_amount_band_from_noisy_text():
    assert oge.norm_amount("S1 ooo 001-Ss ooo ooo") == (1000001, 5000000)
    assert oge.norm_amount("$15 001 -$50 000") == (15001, 50000)
    assert oge.norm_amount("s1.001-s15.ooo") == (1001, 15000)


def test_paper_stream():
    pages = [
        "Page 2 of 3\n# Description Type Date Notification Amount\n"
        "1 AUTOMATIC DATA PROCESSING INC lourchaso 7/17/2026 No $15 001 -$50 000\n"
        "2 COMCAST CORP CL A salo 7/1712026 Yes $1,001-$15000 3 INTUITIVE SURGICAL INC\n"
        "1curchase 7/17/2026 No $15 001 -$50 000\n"
    ]
    rows = oge.parse_paper_stream(pages, "2026-08-22")
    assert [r["desc"] for r in rows] == ["AUTOMATIC DATA PROCESSING INC", "COMCAST CORP CL A", "INTUITIVE SURGICAL INC"]
    assert [r["type"] for r in rows] == ["P", "S", "P"]
    assert rows[1]["late"] is True and rows[1]["dates"] == ["2026-07-17"]


def test_person_key():
    assert oge.person_key("Trump, Donald J") == "trump-donald"
    assert oge.person_key("DeVos, Elisabeth (Betsy) P") == "devos-elisabeth"
