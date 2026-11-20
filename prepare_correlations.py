"""Export date-aligned Pearson correlations for StockLens Chart 5."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

MIN_OVERLAP = 60
FIELDS = ["date", "ticker", "company_name", "sector", "industry", "stock_return_1d"]


def build_network(csv_path, end_date=None):
    data = pd.read_csv(csv_path, usecols=FIELDS, dtype={"ticker": "string"})
    data["date"] = pd.to_datetime(data["date"], format="%Y-%m-%d", errors="coerce")
    if end_date is not None:
        data = data.loc[data["date"] <= pd.Timestamp(end_date)].copy()
    end = data["date"].max()
    if pd.isna(end):
        raise ValueError("CSV contains no valid trading dates")
    start = end - pd.Timedelta(days=89)
    data["stock_return_1d"] = pd.to_numeric(data["stock_return_1d"], errors="coerce")
    data["ticker"] = data["ticker"].str.strip()
    data = data.loc[
        data["date"].between(start, end)
        & data["ticker"].notna()
        & data["ticker"].ne("")
        & np.isfinite(data["stock_return_1d"])
    ].copy()

    # Identical duplicate returns contribute once. Conflicting returns have no
    # unambiguous observation for that ticker and trading date.
    key = ["ticker", "date"]
    data = data.drop_duplicates(key + ["stock_return_1d"]).drop_duplicates(key, keep=False)
    daily = data.pivot(index="date", columns="ticker", values="stock_return_1d")
    daily = daily.loc[:, daily.count() >= MIN_OVERLAP]
    tickers = daily.columns.tolist()
    metadata = data.sort_values("date", kind="stable").groupby("ticker").last()
    nodes = [
        {
            "id": ticker,
            "company": info.company_name if pd.notna(info.company_name) else ticker,
            "sector": info.sector if pd.notna(info.sector) else "Unknown",
            "industry": info.industry if pd.notna(info.industry) else "Unknown",
        }
        for ticker, info in metadata.loc[tickers].iterrows()
    ]

    matrix = daily.corr(method="pearson", min_periods=MIN_OVERLAP).to_numpy()
    rows, columns = np.triu_indices(len(tickers), k=1)
    links = [
        {"source": tickers[i], "target": tickers[j], "correlation": float(matrix[i, j])}
        for i, j in zip(rows, columns)
        if np.isfinite(matrix[i, j])
    ]
    return {
        "startDate": start.date().isoformat(),
        "endDate": end.date().isoformat(),
        "nodes": nodes,
        "links": links,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("correlations.json"))
    args = parser.parse_args()
    network = build_network(args.csv)
    with args.output.open("w", encoding="utf-8") as stream:
        json.dump(network, stream, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    print(f'{len(network["nodes"])} stocks, {len(network["links"])} pairs → {args.output}')


if __name__ == "__main__":
    main()
