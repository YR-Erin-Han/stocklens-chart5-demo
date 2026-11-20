"""Export 90-day, 180-day and year-to-date stock relationship data."""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from prepare_correlations import build_network


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_folder", type=Path)
    args = parser.parse_args()
    output = Path(__file__).parent
    returns = pd.read_csv(args.data_folder / "comparison_daily_returns.csv",
                          usecols=["date", "ticker", "stock_return_1d"])
    companies = pd.read_csv(args.data_folder / "companies.csv")
    daily = returns.merge(companies, on="ticker", how="left", validate="many_to_one")
    daily["date"] = pd.to_datetime(daily.date)
    daily["ticker"] = daily.ticker.astype("string")
    valid = daily.loc[np.isfinite(daily.stock_return_1d)].copy()
    keys = ["ticker", "date"]
    valid = valid.drop_duplicates(keys + ["stock_return_1d"]).drop_duplicates(keys, keep=False)
    for year in sorted(daily.date.dt.year.unique()):
        end = daily.loc[daily.date.dt.year == year, "date"].max()
        starts = {"90": end - pd.Timedelta(days=89),
                  "180": end - pd.Timedelta(days=179),
                  "year": pd.Timestamp(year=int(year), month=1, day=1)}
        for window, start in starts.items():
            network = build_network(daily, end, start)
            network.update(year=int(year), window=window)
            stem = f"{year}-{window}"
            (output / f"correlations-{stem}.json").write_text(json.dumps(network, allow_nan=False, separators=(",", ":")))
            table = valid.loc[valid.date.between(start, end)].pivot(
                index="date", columns="ticker", values="stock_return_1d")
            table = table.reindex(columns=[node["id"] for node in network["nodes"]])
            payload = {
                "dates": table.index.strftime("%Y-%m-%d").tolist(),
                "returns": {ticker: [None if pd.isna(v) else float(v) for v in table[ticker]]
                            for ticker in table.columns},
            }
            (output / f"returns-{stem}.json").write_text(json.dumps(payload, allow_nan=False, separators=(",", ":")))
            print(stem, len(network["nodes"]), flush=True)


if __name__ == "__main__":
    main()
