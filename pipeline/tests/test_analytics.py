from otrack.estimate import estimate
from otrack.positions import build
from otrack.prices import Series

ROWS = [
    ["2024-06-06", 1200.0, 1230.0, 1190.0, 1210.0],
    ["2024-06-07", 1210.0, 1215.0, 1195.0, 1200.0],
    ["2024-06-10", 120.0, 123.0, 119.0, 121.0],
]


def series(rows=None, splits=None):
    # stored prices are split-adjusted: pre-split days divided by 10
    rows = rows or [[d, o / 10, h / 10, lo / 10, c / 10] if d < "2024-06-10" else [d, o, h, lo, c] for d, o, h, lo, c in ROWS]
    return Series("NVDA", {"rows": rows, "splits": splits if splits is not None else [["2024-06-10", 10.0]]})


def test_estimate_undoes_split_and_ranges_shares():
    tx = {"sym": "NVDA", "at": "ST", "tx": "2024-06-07", "amin": 15001, "amax": 50000}
    e = estimate(tx, series())
    assert e["d"] == "2024-06-07" and e["f"] == 10.0
    assert (e["lo"], e["hi"]) == (1195.0, 1215.0)
    assert e["p"] == round((1215 + 1195 + 1200) / 3, 2)
    assert e["smin"] == round(15001 / 1215, 3) and e["smax"] == round(50000 / 1195, 3)
    assert e["conf"] == "high"


def test_estimate_weekend_is_low_confidence():
    e = estimate({"sym": "NVDA", "at": "ST", "tx": "2024-06-08", "amin": 1001, "amax": 15000}, series())
    assert e["d"] == "2024-06-07" and e["conf"] == "low" and e["why"] == "not_trading_day"


def test_estimate_reported_price_wins():
    tx = {"sym": "NVDA", "at": "ST", "tx": "2024-06-07", "amin": 1001, "amax": 15000, "reported": {"price": 1201.5, "shares": 5}}
    e = estimate(tx, series())
    assert e["conf"] == "reported" and e["p"] == 1201.5 and e["smin"] == e["smax"] == 5


def test_estimate_skips_options_and_unknowns():
    assert estimate({"sym": "NVDA", "at": "OP", "tx": "2024-06-07"}, series())["why"] == "option"
    assert estimate({"sym": None, "at": "ST", "tx": "2024-06-07"}, None)["why"] == "no_ticker"


def _t(i, tx, typ, smin, smax, own="SELF", sub=None):
    return {"id": f"X-H1-{i}", "m": "X", "sym": "ABC", "at": "ST", "tx": tx, "fil": tx, "type": typ, "own": own, "sub": sub,
            "est": {"smin": smin, "smax": smax}}


def test_positions_open_add_reduce_close():
    trades = [_t(1, "2024-01-02", "P", 10, 100), _t(2, "2024-02-01", "P", 5, 50), _t(3, "2024-03-01", "SP", 3, 30), _t(4, "2024-04-01", "SF", 1, 1)]
    (p,) = build(trades)
    assert [s["act"] for s in p["steps"]] == ["open", "add", "reduce", "close"]
    assert (p["steps"][1]["lo"], p["steps"][1]["hi"]) == (15, 150)
    assert (p["steps"][2]["lo"], p["steps"][2]["hi"]) == (0, 147)
    assert p["held"] is False


def test_full_sale_in_one_account_keeps_the_other():
    trades = [_t(1, "2024-01-02", "P", 10, 100, sub="A"), _t(2, "2024-01-03", "P", 10, 100, sub="B"), _t(3, "2024-02-01", "SF", 1, 1, sub="A")]
    (p,) = build(trades)
    assert p["steps"][-1]["act"] == "reduce" and p["held"] is True


def test_sale_before_any_buy_is_flagged():
    (p,) = build([_t(1, "2024-01-02", "SP", 10, 100)])
    assert "held_before_data" in p["flags"]


def test_stated_share_count_is_used():
    from otrack.house import reported_shares

    assert reported_shares("Purchased 10,000 shares.") == 10000
    assert reported_shares("Sold 5 shares and bought 7 shares") is None
    tx = {"sym": "NVDA", "at": "ST", "tx": "2024-06-07", "amin": 1001, "amax": 15000, "reported": {"shares": 10}}
    e = estimate(tx, series())
    assert e["smin"] == e["smax"] == 10 and e["sh_rep"] is True


def test_options_are_not_share_positions():
    t = _t(1, "2024-01-02", "P", 10, 100)
    t["at"] = "OP"
    assert build([t]) == []
