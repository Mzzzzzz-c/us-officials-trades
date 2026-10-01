"""Rules the strategy lab and signals rely on must only use what was public at the time."""
from otrack import build
from otrack.insights import TrackRecords, cluster_flags


def _buy(i, m, sym, tx, fil, x90=None, fold=None):
    t = {"id": f"t{i}", "m": m, "sym": sym, "tx": tx, "fil": fil, "type": "P", "at": "ST"}
    if x90 is not None:
        t["ent"] = {"fold": fold or fil}
        t["h"] = {"90": [None, x90, None, 0.0]}
    return t


def test_track_record_uses_only_finished_results():
    trades = [_buy(i, "A", "X", "2024-01-02", "2024-01-10", 0.05, fold="2024-01-11") for i in range(12)]
    tr = TrackRecords(trades, min_n=10)
    # 90 days + a few after the copier's entry, the results are known
    assert tr.at("A", "2024-03-01") is None
    n, mean, win = tr.at("A", "2024-04-20")
    assert n == 12 and abs(mean - 0.05) < 1e-9 and win == 1.0
    assert tr.proven("A", "2024-04-20") and not tr.proven("A", "2024-03-01")


def test_cluster_needs_three_officials_already_public():
    trades = [
        _buy(1, "A", "X", "2024-05-01", "2024-05-10"),
        _buy(2, "B", "X", "2024-05-05", "2024-05-12"),
        # C's buy is the third within 30 days, and A and B were public before C's report
        _buy(3, "C", "X", "2024-05-20", "2024-05-25"),
        # D's report came out before B's: only A was public then
        _buy(4, "D", "X", "2024-05-06", "2024-05-11"),
    ]
    flags = cluster_flags(trades)
    assert "t3" in flags
    assert "t4" not in flags and "t1" not in flags


def test_style_round_trips():
    ts = [{"amin": 1001, "amax": 15000, "own": "SP", "sym": "X", "type": "P"}, {"amin": 15001, "amax": 50000, "own": "SELF", "sym": "X", "type": "SF", "opt": {"t": "call"}}]
    pos = [{"steps": [{"act": "open", "tx": "2024-01-01"}, {"act": "close", "tx": "2024-03-01"}]}]
    st = build._style(ts, pos)
    assert st["hold"] == 60 and st["nhold"] == 1
    assert st["opt"] == 0.5 and st["fam"] == 0.5


def test_renamed_tickers_and_impossible_dates():
    t = {"idx": 0, "ticker": "FB", "tx_date": "3031-04-30", "type": "P", "amount_min": 1001, "amount_max": 15000}
    tr = build._trade("M1", "H", "H1", "2021-05-10", "u", t)
    assert tr["sym"] == "META"
    assert tr["tx"] is None and tr["txr"] == "3031-04-30"
