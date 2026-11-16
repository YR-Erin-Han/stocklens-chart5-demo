# StockLens — Chart 5: Stock Relationship Network

[Open the interactive demo](https://yr-erin-han.github.io/stocklens-chart5-demo/)

This chart shows which stocks tended to move together based on their daily returns. Each dot is a stock. Each line connects two stocks and represents their correlation.

## Data and calculation

The demo uses historical daily stock returns from the project’s feature dataset. It covers **August 2 through October 30, 2026**, a 90-calendar-day window ending on the latest date in the dataset. It includes 498 stocks and 123,753 stock pairs with a valid correlation.

The Python script matches each pair’s daily returns by trading date. A pair must have **at least 60 trading days when both stocks have valid daily returns** to calculate its Pearson correlation. The chart loads the results from [correlations.json](correlations.json). [View the Python script](prepare_correlations.py)

A value close to +1 means the stocks’ daily returns tended to move in the same direction. A value close to −1 means they tended to move in opposite directions. A value near 0 means there was little linear relationship.

## How to use the chart

- **Search Stock** lets you look up a stock by ticker or company name. Select a result to focus on that stock.
- **Focus Mode** shows the selected stock and the five stocks with the highest correlations to it. The table lists their correlations.
- **Full Network** shows all stocks. Use the threshold slider to change which lines are shown. For example, a threshold of 0.60 shows pairs with a correlation of 0.60 or higher. The slider only filters the lines in this mode.
- **Explore the graph** by clicking a stock to select it, hovering over a stock or line for details, and dragging nodes to move them. In Full Network, the legend explains the sector colors.
