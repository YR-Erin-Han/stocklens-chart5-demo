export function mountStockComparison(container, d3) {
  const root = d3.select(container).append("section").attr("class", "sl-comparison");
  root.html(`
    <h2>Compare Two Stocks</h2>
    <div class="sl-compare-controls">
      <strong class="sl-compare-first"></strong>
      <label>Compare with
        <input type="search" aria-label="Compare with" placeholder="Ticker or company name" autocomplete="off">
      </label>
      <div class="sl-compare-metrics" aria-live="polite"></div>
    </div>
    <div class="sl-compare-matches" aria-label="Comparison search results" hidden></div>
    <p class="sl-compare-period"></p>
    <p class="sl-compare-status" role="status"></p>
    <p class="sl-point-detail" aria-live="polite">Click a point to see its date and daily returns.</p>
    <div class="sl-compare-plot"></div>
  `);
  const input = root.select("input");
  const matches = root.select(".sl-compare-matches");
  const status = root.select(".sl-compare-status");
  const metrics = root.select(".sl-compare-metrics");
  const plot = root.select(".sl-compare-plot");
  const cache = new Map();
  let network;
  let selected;
  let comparison = "AMD";
  let sequence = 0;
  let suggestions = [];

  function choose(node) {
    comparison = node.id;
    input.property("value", node.id);
    matches.property("hidden", true);
    draw();
  }

  input.on("input", () => {
    const query = input.property("value").trim().toLowerCase();
    suggestions = (network?.nodes ?? []).filter(node => node.id !== selected &&
      (node.id.toLowerCase().includes(query) || node.company.toLowerCase().includes(query)));
    suggestions.sort((a, b) => Number(b.id.toLowerCase() === query) - Number(a.id.toLowerCase() === query)
      || a.id.localeCompare(b.id));
    suggestions = query ? suggestions.slice(0, 8) : [];
    matches.selectAll("*").remove();
    matches.property("hidden", !query);
    matches.selectAll("button").data(suggestions).join("button").attr("type", "button")
      .text(node => `${node.id} — ${node.company}`).on("click", (_, node) => choose(node));
    if (query && !suggestions.length) matches.append("span").text("No matching stocks");
  }).on("keydown", event => {
    if (event.key === "Escape") matches.property("hidden", true);
    if (event.key === "Enter" && suggestions.length && !matches.property("hidden")) {
      event.preventDefault();
      choose(suggestions[0]);
    }
  });

  async function draw() {
    const current = ++sequence;
    plot.selectAll("*").remove();
    metrics.text("");
    root.select(".sl-point-detail").text("Click a point to see its date and daily returns.");
    if (!network || !selected || !comparison) {
      status.text("Choose another stock to compare.");
      return;
    }
    const year = `${network.year}-${network.window}`;
    const first = selected;
    const second = comparison;
    root.select(".sl-compare-first").text(first);
    root.select(".sl-compare-period").text(
      `Daily returns · ${network.startDate} to ${network.endDate} · At least 60 shared trading days required`
    );
    status.text("Loading comparison…");
    try {
      if (!cache.has(year)) {
        cache.set(year, fetch(`./returns-${year}.json`).then(response => {
          if (!response.ok) throw new Error("Daily returns could not load.");
          return response.json();
        }).catch(error => {
          cache.delete(year);
          throw error;
        }));
      }
      const data = await cache.get(year);
      if (current !== sequence) return;
      const a = data.returns[first] ?? [];
      const b = data.returns[second] ?? [];
      const points = data.dates.flatMap((date, i) =>
        Number.isFinite(a[i]) && Number.isFinite(b[i]) ? [{ date, x: a[i], y: b[i] }] : []);
      const link = network.links.find(link =>
        (link.source === first && link.target === second) || (link.source === second && link.target === first));
      const correlation = link?.correlation;
      metrics.text(`Pearson correlation ${Number.isFinite(correlation) ? correlation.toFixed(2) : "N/A"} · ${points.length} shared trading days`);
      status.text(Number.isFinite(correlation) ? "" :
        "Correlation unavailable. This pair needs at least 60 shared days and non-constant returns.");
      if (!points.length) return;
      const width = 760;
      const height = 340;
      const margin = { left: 68, right: 24, top: 16, bottom: 58 };
      const domain = key => {
        const extent = d3.extent(points, point => point[key]);
        const span = Math.max(extent[1] - extent[0], 0.002);
        return [extent[0] - span * 0.12, extent[1] + span * 0.12];
      };
      const x = d3.scaleLinear().domain(domain("x")).nice().range([margin.left, width - margin.right]);
      const y = d3.scaleLinear().domain(domain("y")).nice().range([height - margin.bottom, margin.top]);
      const svg = plot.append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-label", `Daily return scatterplot for ${first} and ${second}. Each dot is one shared trading day.`);
      svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".1%")));
      svg.append("g").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".1%")));
      if (x.domain()[0] <= 0 && x.domain()[1] >= 0) {
        svg.append("line").attr("x1", x(0)).attr("x2", x(0))
          .attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", "#c8d5e5").attr("stroke-dasharray", "4 4");
      }
      if (y.domain()[0] <= 0 && y.domain()[1] >= 0) {
        svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right)
          .attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#c8d5e5").attr("stroke-dasharray", "4 4");
      }
      const tooltip = plot.append("div").attr("class", "sl-scatter-tooltip")
        .attr("role", "status").attr("aria-live", "polite").property("hidden", true);
      svg.on("click", event => {
        if (event.target.tagName.toLowerCase() !== "circle") clearPoint();
      }).on("keydown", event => {
        if (event.key === "Escape") clearPoint();
      });
      svg.append("g").selectAll("circle").data(points).join("circle")
        .attr("cx", point => x(point.x)).attr("cy", point => y(point.y))
        .attr("r", 4.5).attr("fill", "#387bc4").attr("fill-opacity", 0.75)
        .attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", point => `Show returns for ${point.date}`)
        .style("cursor", "pointer")
        .on("click", function (_, point) {
          showPoint(this, point);
        })
        .on("keydown", function (event, point) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            showPoint(this, point);
          }
        });
      function showPoint(element, point) {
        svg.selectAll("circle").attr("r", 4.5).attr("fill", "#387bc4").attr("stroke", null);
        d3.select(element).attr("r", 6).attr("fill", "#15468e").attr("stroke", "#142e51");
        tooltip.selectAll("*").remove();
        tooltip.append("strong").text(point.date);
        tooltip.append("div").text(`${first} daily return ${d3.format("+.2%")(point.x)}`);
        tooltip.append("div").text(`${second} daily return ${d3.format("+.2%")(point.y)}`);
        tooltip.property("hidden", false)
          .style("left", `${x(point.x) / width * 100}%`)
          .style("top", `${y(point.y) / height * 100}%`)
          .style("transform", `translate(${x(point.x) > width / 2 ? "calc(-100% - 12px)" : "12px"}, ${y(point.y) > height / 2 ? "calc(-100% - 12px)" : "12px"})`);
      }
      function clearPoint() {
        tooltip.property("hidden", true);
        svg.selectAll("circle").attr("r", 4.5).attr("fill", "#387bc4").attr("stroke", null);
      }
      svg.append("text").attr("x", width / 2).attr("y", height - 12)
        .attr("text-anchor", "middle").text(`${first} daily return`);
      svg.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2)
        .attr("y", 17).attr("text-anchor", "middle").text(`${second} daily return`);
    } catch (error) {
      if (current === sequence) status.text(error.message);
    }
  }

  return (data, ticker) => {
    const changed = network !== data || selected !== ticker;
    network = data;
    selected = ticker;
    if (!changed) return;
    matches.property("hidden", true);
    if (comparison === selected || !network.nodes.some(node => node.id === comparison)) {
      comparison = network.nodes.find(node => node.id !== selected)?.id;
    }
    input.property("value", comparison ?? "");
    draw();
  };
}
