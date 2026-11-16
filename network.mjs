let searchId = 0;

// Pass the dashboard's D3 v7 namespace and the generated correlations.json.
export function mountStockRelationshipNetwork(container, { d3, data }) {
  const width = 800;
  const height = 460;
  const focusInset = { x: 180, y: 50 };
  const nodes = data.nodes.map(node => ({ ...node }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const rankings = new Map(nodes.map(node => [node.id, []]));
  for (const link of data.links) {
    rankings.get(link.source).push({ id: link.target, link });
    rankings.get(link.target).push({ id: link.source, link });
  }
  for (const peers of rankings.values()) {
    peers.sort((a, b) => b.link.correlation - a.link.correlation || a.id.localeCompare(b.id));
  }

  let selected = byId.has("NVDA") ? "NVDA" : nodes[0]?.id;
  let focus = true;
  let threshold = 0.60;
  let highlighted;
  let visibleLinks = [];
  let visibleNodes;
  let peerIds = new Set();

  const root = d3.select(container).append("section").attr("class", "sl-network");
  root.html(`
    <header>
      <h2>Chart 5 — Stock Relationship Network <span class="sl-threshold-title"></span></h2>
      <p class="sl-period"></p>
      <div class="sl-search">
        <label>
          <span>Search Stock</span>
          <input type="search" role="combobox" aria-autocomplete="list"
            aria-expanded="false" placeholder="Ticker or company name" autocomplete="off">
        </label>
        <div class="sl-search-popup" hidden>
          <ul role="listbox" aria-label="Matching stocks"></ul>
          <p role="status" hidden>No matching stocks</p>
        </div>
      </div>
    </header>
    <div class="sl-content">
      <div class="sl-graph-panel">
        <div class="sl-graph"></div>
        <div class="sl-sector-key" hidden>
          <strong>Sectors</strong>
          <ul aria-label="Sector colors"></ul>
        </div>
      </div>
      <div class="sl-ranking">
        <h3 aria-live="polite"></h3>
        <table>
          <thead><tr><th scope="col">Rank</th><th scope="col">Ticker</th><th scope="col">Company</th><th scope="col">Correlation</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
    <div class="sl-controls">
      <div class="sl-modes" role="group" aria-label="Network mode">
        <button type="button" data-mode="full">Full Network</button>
        <button type="button" data-mode="focus">Focus Mode</button>
      </div>
      <span class="sl-count"></span>
      <label class="sl-slider">
        <span>Correlation Threshold <strong></strong></span>
        <input type="range" min="0.30" max="0.95" step="0.05" value="0.60">
      </label>
    </div>
    <div class="sl-tooltip" role="tooltip" hidden></div>
  `);
  root.select(".sl-period").text(
    `Pearson correlation of daily returns · ${data.startDate} to ${data.endDate}`
  );
  const graph = root.select(".sl-graph");
  const svg = graph.append("svg").attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "group").attr("aria-label", "Interactive stock relationship network");
  const viewport = svg.append("g");
  const canvas = viewport.append("foreignObject").attr("width", width).attr("height", height)
    .attr("pointer-events", "none").append("xhtml:canvas")
    .attr("width", width * 2).attr("height", height * 2)
    .style("width", `${width}px`).style("height", `${height}px`).node();
  const pen = canvas.getContext("2d");
  pen.scale(2, 2);
  const nodeLayer = viewport.append("g");
  const tooltip = root.select(".sl-tooltip");
  const sectorColor = d3.scaleOrdinal(d3.schemeTableau10.concat(["#777da7", "#8b695c"]))
    .domain([...new Set(nodes.map(node => node.sector))].sort());
  const sectorKey = root.select(".sl-sector-key");
  const sectorItems = sectorKey.select("ul").selectAll("li")
    .data(sectorColor.domain()).join("li");
  sectorItems.append("span").attr("class", "sl-sector-dot").attr("aria-hidden", "true")
    .style("background-color", sectorColor);
  sectorItems.append("span").text(sector => sector === "Unknown" ? "Unknown sector" : sector);

  const zoom = d3.zoom().scaleExtent([0.65, 5])
    .filter(event => !focus && !event.button && (event.type === "wheel" || !event.target.closest(".sl-node")))
    .on("zoom", event => {
      viewport.attr("transform", event.transform);
      hideTooltip();
    });
  svg.call(zoom);

  function radius(node) {
    if (node.id === selected) return 29;
    if (peerIds.has(node.id)) return 23;
    return 6;
  }

  const springs = d3.forceLink().id(node => node.id);
  const charge = d3.forceManyBody();
  const collide = d3.forceCollide(node => radius(node) + 2);
  const simulation = d3.forceSimulation().stop()
    .force("link", springs)
    .force("charge", charge)
    .force("collide", collide)
    .force("x", d3.forceX(width / 2).strength(0.08))
    .force("y", d3.forceY(height / 2).strength(0.12))
    .on("tick", paint);

  const drag = d3.drag().clickDistance(4)
    .on("start", (event, node) => {
      hideTooltip();
      if (!event.active) simulation.alphaTarget(0.18).restart();
      node.fx = node.x;
      node.fy = node.y;
    })
    .on("drag", (event, node) => {
      node.fx = bound(event.x, width, focusInset.x, node);
      node.fy = bound(event.y, height, focusInset.y, node);
    })
    .on("end", (event, node) => {
      if (!event.active) simulation.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    });

  function bound(value, size, inset, node) {
    const margin = radius(node) + 2 + (focus ? inset : 0);
    return Math.max(margin, Math.min(size - margin, value));
  }

  function paint() {
    for (const node of simulation.nodes()) {
      node.x = bound(node.x, width, focusInset.x, node);
      node.y = bound(node.y, height, focusInset.y, node);
    }
    visibleNodes.attr("transform", node => `translate(${node.x},${node.y})`);
    pen.clearRect(0, 0, width, height);
    pen.beginPath();
    for (const { source, target } of visibleLinks) {
      pen.moveTo(source.x, source.y);
      pen.lineTo(target.x, target.y);
    }
    pen.strokeStyle = focus ? "#8cabd5" : "#86a3bf";
    pen.lineWidth = focus ? 1.75 : 0.55;
    pen.globalAlpha = focus ? 1 : 0.46;
    pen.stroke();
  }

  function showTooltip(event, title, details) {
    tooltip.attr("hidden", null).selectAll("*").remove();
    tooltip.append("strong").text(title);
    for (const detail of details) tooltip.append("div").text(detail);
    const bounds = root.node().getBoundingClientRect();
    const tip = tooltip.node().getBoundingClientRect();
    tooltip.style("left", `${Math.max(4, Math.min(event.clientX - bounds.left + 14, bounds.width - tip.width - 4))}px`)
      .style("top", `${Math.max(4, Math.min(event.clientY - bounds.top + 14, bounds.height - tip.height - 4))}px`);
  }

  function hideTooltip() {
    tooltip.attr("hidden", true);
  }

  function highlight(id) {
    highlighted = id;
    nodeLayer.selectAll(".sl-node").classed("sl-highlight", node => node.id === highlighted);
    root.selectAll("tbody .sl-peer").classed("sl-highlight", peer => peer.id === highlighted);
  }

  function select(id) {
    if (id === selected) return;
    selected = id;
    highlight(undefined);
    hideTooltip();
    render();
  }

  function showNode(event, node) {
    const details = [node.company, `Sector: ${node.sector}`, `Industry: ${node.industry}`];
    if (node.id !== selected) {
      const peer = rankings.get(selected).find(entry => entry.id === node.id);
      details.push(`Correlation with ${selected}: ${peer ? peer.link.correlation.toFixed(2) : "Unavailable"}`);
    }
    showTooltip(event, node.id, details);
  }

  svg.on("pointermove.edges", event => {
    if (event.buttons || event.target.closest(".sl-node")) return;
    const [x, y] = d3.pointer(event, viewport.node());
    let nearest;
    let best = (4 / d3.zoomTransform(svg.node()).k) ** 2;
    for (const link of visibleLinks) {
      const { source: a, target: b } = link;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length));
      const distance = (x - a.x - dx * t) ** 2 + (y - a.y - dy * t) ** 2;
      if (distance < best) {
        best = distance;
        nearest = link;
      }
    }
    if (nearest) {
      showTooltip(event, `${nearest.source.id} ↔ ${nearest.target.id}`,
        [`Pearson correlation: ${nearest.correlation.toFixed(2)}`]);
    } else {
      hideTooltip();
    }
  }).on("pointerleave.edges", hideTooltip);

  function renderRanking(peers) {
    root.select(".sl-ranking h3").text(
      selected ? `Top ${peers.length} Correlated Stocks (${selected})` : "Correlated Stocks"
    );
    const body = root.select("tbody");
    body.selectAll(".sl-empty-row").remove();
    const rows = body.selectAll(".sl-peer").data(peers, peer => peer.id).join("tr")
      .attr("class", "sl-peer")
      .on("pointerenter", (_, peer) => highlight(peer.id))
      .on("pointerleave", () => highlight(undefined));
    rows.each(function (peer, index) {
      const row = d3.select(this);
      row.selectAll("*").remove();
      row.append("td").text(index + 1);
      row.append("td").append("button").attr("type", "button").text(peer.id)
        .on("click", () => select(peer.id))
        .on("focus", () => highlight(peer.id))
        .on("blur", () => highlight(undefined));
      row.append("td").text(byId.get(peer.id).company);
      row.append("td").text(peer.link.correlation.toFixed(2));
    });
    if (!peers.length) {
      body.append("tr").attr("class", "sl-empty-row").append("td").attr("colspan", 4)
        .text("No stock pairs with sufficient shared trading days.");
    }
  }

  function updateLinks(links) {
    visibleLinks = links.map(link => ({ ...link }));
    springs.links(visibleLinks);
    root.select(".sl-count").text(
      `${visibleNodes.size().toLocaleString()} stocks · ${visibleLinks.length.toLocaleString()} links`
    );
    simulation.alpha(0.7).restart();
    paint();
  }

  function updateThreshold() {
    const value = threshold.toFixed(2);
    root.select(".sl-threshold-title").text(focus ? "" : `(Correlation ≥ ${value})`);
    root.select(".sl-slider strong").text(value);
    root.select(".sl-slider input").property("disabled", focus);
    if (!focus) {
      hideTooltip();
      updateLinks(data.links.filter(link => link.correlation >= threshold));
    }
  }

  function render() {
    sectorKey.property("hidden", focus || sectorColor.domain().length === 0);
    const { x, y } = focusInset;
    svg.attr("viewBox", focus ? `${x} ${y} ${width - 2 * x} ${height - 2 * y}` : `0 0 ${width} ${height}`);
    const peers = rankings.get(selected)?.slice(0, 5) ?? [];
    peerIds = new Set(peers.map(peer => peer.id));
    const activeNodes = focus ? nodes.filter(node => node.id === selected || peerIds.has(node.id)) : nodes;
    const orbit = new Map(peers.map((peer, index) => [peer.id, (index / peers.length) * 2 * Math.PI - Math.PI / 2]));
    visibleNodes = nodeLayer.selectAll(".sl-node").data(activeNodes, node => node.id).join(
      enter => {
        const group = enter.append("g").attr("class", "sl-node")
          .attr("role", "button").attr("tabindex", 0)
          .attr("aria-label", node => `${node.id}, ${node.company}`)
          .on("click", (_, node) => select(node.id))
          .on("keydown", (event, node) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              select(node.id);
            }
          })
          .on("pointerenter", (event, node) => {
            highlight(node.id);
            showNode(event, node);
          })
          .on("pointerleave", () => {
            highlight(undefined);
            hideTooltip();
          })
          .on("focus", (_, node) => highlight(node.id))
          .on("blur", () => highlight(undefined))
          .call(drag);
        group.append("circle");
        group.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
          .attr("pointer-events", "none");
        return group;
      }
    );
    visibleNodes.attr("aria-pressed", node => node.id === selected)
      .classed("sl-selected", node => node.id === selected)
      .classed("sl-peer-node", node => peerIds.has(node.id));
    visibleNodes.select("circle").attr("r", radius)
      .attr("fill", node => {
        if (node.id === selected) return "#15468e";
        if (peerIds.has(node.id)) return "#d4e7ff";
        return sectorColor(node.sector);
      });
    visibleNodes.select("text").text(node => radius(node) > 6 ? node.id : "");

    // Empty the link force before changing its node set. D3 mutates link endpoints.
    springs.links([]).distance(focus ? 119 : 54);
    charge.strength(focus ? -120 : -20);
    simulation.force("x").x(node => width / 2 + (focus && orbit.has(node.id) ? 124 * Math.cos(orbit.get(node.id)) : 0))
      .strength(focus ? 0.35 : 0.055);
    simulation.force("y").y(node => height / 2 + (focus && orbit.has(node.id) ? 124 * Math.sin(orbit.get(node.id)) : 0))
      .strength(focus ? 0.35 : 0.10);
    simulation.nodes(activeNodes);
    if (focus) updateLinks(peers.map(peer => peer.link));

    renderRanking(peers);
    root.selectAll("[data-mode]").attr("aria-pressed", function () {
      return (this.dataset.mode === "focus") === focus;
    });
    updateThreshold();
  }

  root.selectAll("[data-mode]").on("click", function () {
    const next = this.dataset.mode === "focus";
    if (next === focus) return;
    focus = next;
    highlight(undefined);
    svg.call(zoom.transform, d3.zoomIdentity);
    render();
  });
  root.select(".sl-slider input").on("input", function () {
    threshold = Number(this.value);
    updateThreshold();
  });

  const search = root.select(".sl-search input");
  const popup = root.select(".sl-search-popup");
  const listId = `sl-stock-results-${++searchId}`;
  const results = popup.select("ul").attr("id", listId);
  search.attr("aria-controls", listId);
  const searchIndex = nodes.map(node => ({
    node,
    ticker: node.id.toLowerCase(),
    company: node.company.toLowerCase(),
  }));
  let matches = [];
  let activeMatch = 0;

  function closeSearch() {
    popup.property("hidden", true);
    search.attr("aria-expanded", "false").attr("aria-activedescendant", null);
  }

  function highlightMatch(index) {
    activeMatch = index;
    results.selectAll("li").attr("aria-selected", (_, i) => i === index);
    search.attr("aria-activedescendant", matches.length ? `${listId}-${index}` : null);
  }

  function chooseMatch(node) {
    search.property("value", node.id);
    closeSearch();
    if (!focus) {
      focus = true;
      svg.call(zoom.transform, d3.zoomIdentity);
      if (node.id === selected) {
        highlight(undefined);
        render();
        return;
      }
    }
    select(node.id);
  }

  function updateSearch() {
    const query = search.property("value").trim().toLowerCase();
    if (!query) {
      closeSearch();
      return;
    }
    const exact = [];
    const prefixes = [];
    const partial = [];
    for (const { node, ticker, company } of searchIndex) {
      if (ticker === query) exact.push(node);
      else if (ticker.startsWith(query)) prefixes.push(node);
      else if (ticker.includes(query) || company.includes(query)) partial.push(node);
    }
    matches = [...exact, ...prefixes, ...partial].slice(0, 8);
    const options = results.selectAll("li").data(matches, node => node.id).join(
      enter => {
        const option = enter.append("li").attr("role", "option");
        option.append("strong");
        option.append("span");
        return option;
      }
    ).attr("id", (_, i) => `${listId}-${i}`)
      .on("mousedown", event => event.preventDefault())
      .on("click", (_, node) => chooseMatch(node));
    options.select("strong").text(node => node.id);
    options.select("span").text(node => node.company);
    popup.select("p").property("hidden", matches.length > 0);
    popup.property("hidden", false);
    search.attr("aria-expanded", "true");
    highlightMatch(0);
  }

  search.on("input", updateSearch).on("blur", closeSearch)
    .on("keydown", event => {
      if (event.key === "Escape") {
        closeSearch();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (popup.property("hidden")) updateSearch();
        else if (matches.length) {
          const step = event.key === "ArrowDown" ? 1 : -1;
          highlightMatch((activeMatch + step + matches.length) % matches.length);
        }
      } else if (event.key === "Enter" && !popup.property("hidden") && matches.length) {
        event.preventDefault();
        chooseMatch(matches[activeMatch]);
      }
    });
  render();

  return () => {
    simulation.stop().on("tick", null);
    svg.on(".zoom", null).on(".edges", null);
    root.remove();
  };
}
