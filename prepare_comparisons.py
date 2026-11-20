"""Export daily returns for each network's existing 90-calendar-day window."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_folder", type=Path)
    args = parser.parse_args()
    output = Path(__file__).parent
    data = pd.read_csv(args.data_folder / "comparison_daily_returns.csv",
                       usecols=["date", "ticker", "stock_return_1d"])
    data["date"] = pd.to_datetime(data["date"], errors="coerce")
    data["stock_return_1d"] = pd.to_numeric(data["stock_return_1d"], errors="coerce")
    data["ticker"] = data["ticker"].astype("string").str.strip()
    data = data.loc[data.date.notna() & data.ticker.notna()
                    & data.ticker.ne("") & np.isfinite(data.stock_return_1d)]
    keys = ["ticker", "date"]
    data = data.drop_duplicates(keys + ["stock_return_1d"]).drop_duplicates(keys, keep=False)
    for source in sorted(output.glob("correlations-*.json")):
        network = json.loads(source.read_text())
        window = data.loc[data.date.between(network["startDate"], network["endDate"])]
        tickers = [node["id"] for node in network["nodes"]]
        table = window.pivot(index="date", columns="ticker", values="stock_return_1d").reindex(columns=tickers)
        payload = {
            "dates": table.index.strftime("%Y-%m-%d").tolist(),
            "returns": {ticker: [None if pd.isna(value) else float(value) for value in table[ticker]]
                        for ticker in tickers},
        }
        target = output / f"returns-{network['year']}.json"
        target.write_text(json.dumps(payload, allow_nan=False, separators=(",", ":")))
        print(target.name, len(payload["dates"]), flush=True)


if __name__ == "__main__":
    main()
