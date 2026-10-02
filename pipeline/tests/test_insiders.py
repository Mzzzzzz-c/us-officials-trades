import datetime as dt

from otrack import insiders

FORM4 = b"""<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer><issuerCik>0001045810</issuerCik><issuerTradingSymbol>NVDA</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0001</rptOwnerCik><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>true</isOfficer><officerTitle>Chief Financial Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <aff10b5One>1</aff10b5One>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-08-03</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>200.5</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-08-04</value></transactionDate>
      <transactionCoding><transactionCode>A</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>500</value></transactionShares>
        <transactionPricePerShare><value>0</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-08-05</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50</value></transactionShares>
        <transactionPricePerShare><value>190</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>"""


def test_dates_from_both_formats():
    assert insiders._iso("31-MAR-2026") == "2026-03-31"
    assert insiders._iso("2026-03-31T00:00:00") == "2026-03-31"
    assert insiders._iso("") is None and insiders._iso("soon") is None


def test_quarter_end():
    assert insiders._quarter_end("2026q2") == "2026-06-30"
    assert insiders._quarter_end("2025q4") == "2025-12-31"
    assert insiders._quarter_end("2026q1") == "2026-03-31"


def test_form4_keeps_only_open_market_trades():
    rows = insiders.parse_form4(FORM4)
    # the grant (code A) is dropped; the sale and the purchase stay
    assert [(r["code"], r["td"], r["sh"], r["px"]) for r in rows] == [("S", "2026-08-03", 1000.0, 200.5), ("P", "2026-08-05", 50.0, 190.0)]
    assert rows[0]["who"] == "DOE JANE" and rows[0]["rel"] == "DO" and rows[0]["title"] == "Chief Financial Officer"
    assert rows[0]["plan"] is True
    assert insiders.parse_form4(b"not xml") == []


def test_summary_counts_value_and_people():
    today = "2026-10-01"
    ago = lambda n: (dt.date.fromisoformat(today) - dt.timedelta(days=n)).isoformat()  # noqa: E731
    rows = [
        {"code": "P", "td": ago(10), "sh": 100, "px": 10, "who": "A"},
        {"code": "P", "td": ago(20), "sh": 100, "px": 20, "who": "A"},
        {"code": "S", "td": ago(200), "sh": 10, "px": 50, "who": "B"},
        {"code": "S", "td": ago(500), "sh": 10, "px": 50, "who": "C"},
    ]
    s = insiders.summarise(rows, today)
    assert (s["b90"], s["vb90"], s["nb90"]) == (2, 3000, 1)
    assert (s["s90"], s["s365"], s["vs365"], s["ns365"]) == (0, 1, 500, 1)


def test_busy_companies_are_rechecked_sooner():
    assert insiders._due(None, 5000, "2026-10-01")
    assert insiders._due("2026-09-30", 10, "2026-10-01")
    assert not insiders._due("2026-09-30", 500, "2026-10-01")
    assert insiders._due("2026-09-20", 2000, "2026-10-01")


def test_issuer_comes_from_the_document():
    issuer, rows = insiders._form4(FORM4)
    assert issuer == 1045810 and len(rows) == 2
    assert insiders._form4(b"<x/>") == (None, [])


def test_form4_keeps_owner_id():
    xml = b"""<ownershipDocument><issuer><issuerCik>0000320193</issuerCik></issuer>
    <reportingOwner><reportingOwnerId><rptOwnerCik>0001214156</rptOwnerCik><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-08-03</value></transactionDate>
    <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
    <transactionAmounts><transactionShares><value>100</value></transactionShares>
    <transactionPricePerShare><value>10</value></transactionPricePerShare></transactionAmounts>
    </nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>"""
    issuer, rows = insiders._form4(xml)
    assert issuer == 320193
    assert rows[0]["oc"] == 1214156


def test_fix_prices_reads_total_in_price_box():
    base = [{"sh": 100.0, "px": 50.0 + k} for k in range(6)]
    total = {"sh": 15000.0, "px": 780000.0}  # 15,000 shares at $52: the total was typed as the price
    junk = {"sh": 1000.0, "px": 1000000.0}
    out = insiders.fix_prices(base + [total, junk])
    assert len(out) == 7
    assert out[-1]["px"] == 52.0
    # too few trades to compare with: the market price is the reference
    assert insiders.fix_prices([junk], 40.0) == []
    assert insiders.fix_prices([junk]) == [junk]
