import { mountStockComparison } from "./comparison.mjs?v=point-popup-20261122";
import { mountStockRelationshipNetwork } from "./network.mjs?v=point-popup-20261122";

export async function mountDemo(container, d3) {
  const response = await fetch("./years.json");
  if (!response.ok) throw new Error("Year data could not load.");
  const years = await response.json();
  const cache = new Map();
  let selected = "NVDA";
  let cleanup;
  let request = 0;
  const root = d3.select(container);
  root.html(`
    <div class="sl-analysis-bar">
      <label class="sl-year-card"><strong>Select Year (Analysis View)</strong><select aria-label="Select Year"></select></label>
      <div class="sl-search-slot"></div>
      <section class="sl-summary" aria-live="polite">
        <h3></h3>
        <div class="sl-summary-values">
          <strong class="sl-summary-company"></strong>
          <div><span>Annualized Return</span><strong class="sl-return"></strong></div>
          <div><span>Annualized Volatility</span><strong class="sl-volatility"></strong></div>
          <div><span>Sector</span><strong class="sl-sector"></strong></div>
        </div>
        <p class="sl-summary-period"></p>
      </section>
    </div>
    <label class="sl-window-control">Correlation window
      <select aria-label="Correlation window">
        <option value="90">Last 90 calendar days</option>
        <option value="180">Last 180 calendar days</option>
        <option value="year">Full selected year (available dates)</option>
      </select>
    </label>
    <p class="sl-load-status" role="status"></p>
    <div class="sl-chart-host"></div>
    <div class="sl-comparison-host"></div>
  `);
  const updateComparison = mountStockComparison(root.select(".sl-comparison-host").node(), d3);
  const select = root.select(".sl-year-card select");
  const windowSelect = root.select(".sl-window-control select");
  select.selectAll("option").data(Object.keys(years).sort().reverse()).join("option")
    .attr("value", year => year).text(year => year);
  const status = root.select(".sl-load-status");
  const chart = root.select(".sl-chart-host");
  const percentage = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";

  function summary(node, year) {
    if (node) selected = node.id;
    updateComparison(cache.get(`${year}-${windowSelect.property("value")}`), selected);
    root.select(".sl-search-slot input").property("value", selected);
    const stock = years[year].stocks[selected];
    root.select(".sl-summary h3").text(`Selected Stock Summary (${year})`);
    root.select(".sl-summary-company").text(node ? `${node.company} (${node.id})` : "No eligible stocks");
    root.select(".sl-return").text(percentage(stock?.annualized_return))
      .style("color", stock?.annualized_return < 0 ? "#d13e51" : "#12834c");
    root.select(".sl-volatility").text(percentage(stock?.annualized_volatility));
    root.select(".sl-sector").text(node?.sector ?? "N/A");
    root.select(".sl-summary-period").text(stock
      ? `Summary period ${stock.period_start} to ${stock.period_end}`
      : `Annual summary unavailable for this stock · Data through ${years[year].endDate}`);
  }

  async function loadYear() {
    const year = select.property("value");
    const window = windowSelect.property("value");
    const key = `${year}-${window}`;
    const current = ++request;
    status.text(`Loading ${year}…`);
    select.property("disabled", true);
    windowSelect.property("disabled", true);
    try {
      if (!cache.has(key)) {
        const result = await fetch(`./correlations-${key}.json`);
        if (!result.ok) throw new Error(`Network data for ${year} could not load.`);
        cache.set(key, await result.json());
      }
      if (current !== request) return;
      cleanup?.();
      root.select(".sl-search-slot").selectAll("*").remove();
      cleanup = mountStockRelationshipNetwork(chart.node(), {
        d3, data: cache.get(key), initialSelected: selected,
        onSelect: node => summary(node, year),
      });
      root.select(".sl-search-slot").node().appendChild(chart.select(".sl-search").node());
      root.select(".sl-search-slot input").property("value", selected);
      status.text("");
    } catch (error) {
      status.text(error.message);
    } finally {
      if (current === request) {
        select.property("disabled", false);
        windowSelect.property("disabled", false);
      }
    }
  }
  select.on("change", loadYear);
  windowSelect.on("change", loadYear);
  await loadYear();
}
