"""Build yearly network files and stock summaries from the project data folder."""
import argparse
import json
from pathlib import Path

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
    summaries = pd.read_csv(args.data_folder / "stock_risk_return.csv")
    years = sorted(returns.date.str[:4].astype(int).unique().tolist())
    summary_fields = ["period_start", "period_end", "trading_returns", "period_return",
                      "annualized_return", "annualized_volatility"]
    yearly = {}
    # Reuse the existing correlation calculation with each year's own end date.
    import tempfile
    with tempfile.TemporaryDirectory() as temp:
        source = Path(temp) / "returns.csv"
        daily.to_csv(source, index=False)
        for year in years:
            network = build_network(source, f"{year}-12-31")
            network["year"] = year
            filename = f"correlations-{year}.json"
            (output / filename).write_text(json.dumps(network, allow_nan=False, separators=(",", ":")))
            rows = summaries.loc[summaries.year == year]
            yearly[str(year)] = {
                "file": filename,
                "endDate": network["endDate"],
                "stocks": {
                    row["ticker"]: {key: None if pd.isna(row[key]) else row[key] for key in summary_fields}
                    for row in rows.to_dict("records")
                },
            }
            print(year, len(network["nodes"]), len(network["links"]), flush=True)
    (output / "years.json").write_text(json.dumps(yearly, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
