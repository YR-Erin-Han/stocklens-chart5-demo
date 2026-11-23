# StockLens — Chart 5: Stock Relationship Network

| Version | Branch | Demo |
| --- | --- | --- |
| Current version | `main` | [Open current demo](https://yr-erin-han.github.io/stocklens-chart5-demo/) |
| New features | `feature/enhancements` | [Open feature demo](https://yr-erin-han.github.io/stocklens-chart5-demo/enhancements/) |

This chart shows which stocks tended to move together based on their daily returns. Each dot is a stock. Each line connects two stocks and represents their correlation.

## Data and calculation

All displayed data comes from the project’s `data` folder. Choose an analysis year from **2018–2026**. The network uses the final 90 calendar days ending on the last available trading date in that year. The default 2026 network covers **August 2 through October 30, 2026** and includes 498 stocks and 123,753 stock pairs with a valid correlation.

The stock summary shows the selected year's annualized return, annualized volatility and sector. These values come from `stock_risk_return.csv`. The summary shows its actual start and end dates, including the prior closing date used to measure returns. The 2026 period ends on October 30. Missing annual summaries show N/A.

Yearly networks use daily returns from `comparison_daily_returns.csv` and company details from `companies.csv`. Generate them with `python prepare_years.py /path/to/data` after installing pandas and numpy.

The Python script matches each pair’s daily returns by trading date. A pair must have **at least 60 trading days when both stocks have valid daily returns** to calculate its Pearson correlation. The chart loads the generated correlation JSON file for the selected year. [View the Python script](prepare_correlations.py)

A value close to +1 means the stocks’ daily returns tended to move in the same direction. A value close to −1 means they tended to move in opposite directions. A value near 0 means there was little linear relationship.

## How to use the chart

- **Select Year** updates the network and annual stock summary.
- **Search Stock** lets you look up a stock by ticker or company name. Select a result to focus on that stock.
- **Focus Mode** shows the selected stock and the five stocks with the highest correlations to it. The table lists their correlations.
- **Full Network** shows all stocks. Use the threshold slider to change which lines are shown. For example, a threshold of 0.60 shows pairs with a correlation of 0.60 or higher. The slider only filters the lines in this mode.
- **Explore the graph** by clicking a stock to select it, hovering over a stock or line for details, and dragging nodes to move them. In Full Network, the legend explains the sector colors.

## Demo versions

- [Current demo](https://yr-erin-han.github.io/stocklens-chart5-demo/) uses the `main` branch.
- [Feature demo](https://yr-erin-han.github.io/stocklens-chart5-demo/enhancements/) uses the `feature/enhancements` branch.

Both branches start with the same features. Future feature work goes into `feature/enhancements`. Pushing to either branch publishes both demo links using their respective branch contents. The tag `backup-2026-11-19` saves the version before this branch setup.

## Data sources

| File in the data folder | Used for |
| --- | --- |
| `comparison_daily_returns.csv` | Daily stock returns for the correlation network |
| `companies.csv` | Company names, sectors and industries |
| `stock_risk_return.csv` | Annual return and volatility summaries |

Run `python prepare_years.py /path/to/data` to generate the yearly networks and summaries. Run `python prepare_correlations.py /path/to/data` for the standalone latest 90-day network. All generated page data comes from these files. The data snapshot ends on October 30, 2026.
