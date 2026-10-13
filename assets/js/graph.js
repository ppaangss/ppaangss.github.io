/* 지식 그래프 — graph.json의 노드·간선을 D3 force simulation으로 렌더링
   인라인 박스 + 확대 버튼으로 여는 풀스크린(우주 모드) 지원
   조작은 피그마 방식: Space+드래그 = 이동, ⌘/Ctrl+휠 = 확대, 기본 휠 = 페이지 스크롤 */

(function () {
  var box = document.getElementById("graph");
  if (!box || typeof d3 === "undefined") return;

  var space = { held: false };

  fetch(box.dataset.src)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      renderGraph(box, data, { space: true, stars: false, spread: 1 });
      addExpandButton(box, data);
      if (window.location.hash === "#graph-full") openOverlay(data);
    })
    .catch(function (err) { console.error("graph.json 로드 실패:", err); });

  function renderGraph(container, data, opts) {
    var width = container.clientWidth;
    var height = container.clientHeight;
    var spread = opts.spread || 1;

    if (opts.space) container.classList.add("graph-space");

    var nodes = data.nodes.map(function (d) { return Object.assign({}, d); });
    var links = data.links.map(function (d) { return Object.assign({}, d); });

    var svg = d3.select(container).append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", "100%");

    /* 풀스크린 — 줌에 영향 받지 않는 별 배경 (인라인 박스는 사이트 배경 별이 비친다) */
    if (opts.stars) {
      var stars = svg.append("g");
      for (var s = 0; s < 160; s++) {
        stars.append("circle")
          .attr("class", "star")
          .attr("cx", Math.random() * width)
          .attr("cy", Math.random() * height)
          .attr("r", Math.random() * 1.1 + 0.3)
          .style("animation-duration", (Math.random() * 4 + 2).toFixed(1) + "s")
          .style("animation-delay", (Math.random() * 4).toFixed(1) + "s");
      }
    }

    var zoomLayer = svg.append("g");

    var zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .filter(function (event) {
        /* 휠은 ⌘/Ctrl을 누를 때만 줌 (기본 휠은 페이지 스크롤로 통과),
           배경 드래그 이동은 Space를 누르고 있을 때만.
           터치는 인라인에서 핀치(두 손가락)만 받아 한 손가락 스크롤을 살리고,
           풀스크린에서는 한 손가락 이동도 허용 */
        if (event.type === "wheel") return event.metaKey || event.ctrlKey;
        if (event.type === "mousedown") return space.held && !event.button;
        if (event.type === "touchstart") return opts.touchPan || event.touches.length > 1;
        return !event.button;
      })
      .on("start", function () { container.classList.add("panning"); })
      .on("zoom", function (event) { zoomLayer.attr("transform", event.transform); })
      .on("end", function () { container.classList.remove("panning"); });

    svg.call(zoom).on("dblclick.zoom", null);

    /* 인라인 박스에서는 세로 스와이프가 페이지 스크롤로 통과해야 한다
       (d3가 기본으로 touch-action: none을 걸어버리므로 되돌림) */
    if (!opts.touchPan) svg.style("touch-action", "pan-y");

    var simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(function (d) { return d.id; }).distance(90 * spread))
      .force("charge", d3.forceManyBody().strength(-450 * spread))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.08))
      .force("y", d3.forceY(height / 2).strength(spread > 1 ? 0.1 : 0.22))
      .force("collide", d3.forceCollide((nodes.length < 8 ? 120 : 48) * spread));

    /* 미리 돌려서 안정된 배치로 시작 (드래그하면 다시 살아난다) */
    simulation.stop();
    for (var i = 0; i < 300; i++) simulation.tick();

    var link = zoomLayer.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "graph-link");

    var node = zoomLayer.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", function (d) {
        return d.published ? "graph-node" : "graph-node ghost";
      })
      .call(
        d3.drag()
          .clickDistance(4)
          .filter(function (event) {
            /* Space를 누르고 있으면 손바닥(이동) 모드가 우선 */
            return !space.held && !event.ctrlKey && !event.button;
          })
          .on("start", function (event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", function (event, d) {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", function (event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("click", function (event, d) {
        if (d.published && !space.held && !event.defaultPrevented) {
          window.location.href = d.url;
        }
      });

    node.append("circle").attr("r", function (d) { return d.published ? 8 : 5; });

    node.append("text")
      .attr("dy", 26)
      .attr("text-anchor", "middle")
      .text(function (d) { return d.title; });

    function ticked() {
      link
        .attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });

      node.attr("transform", function (d) {
        return "translate(" + d.x + "," + d.y + ")";
      });
    }

    simulation.on("tick", ticked);
    ticked();

    /* 그래프 전체가 뷰에 들어오게 자동 핏 */
    var xs = nodes.map(function (d) { return d.x; });
    var ys = nodes.map(function (d) { return d.y; });
    var padX = 110; /* 라벨이 노드 좌우로 뻗으므로 가로 여백을 넉넉히 */
    var padY = 60;
    var minX = Math.min.apply(null, xs) - padX;
    var maxX = Math.max.apply(null, xs) + padX;
    var minY = Math.min.apply(null, ys) - padY;
    var maxY = Math.max.apply(null, ys) + padY;
    var scale = Math.min(width / (maxX - minX), height / (maxY - minY), 1.2);
    var tx = width / 2 - scale * (minX + maxX) / 2;
    var ty = height / 2 - scale * (minY + maxY) / 2;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));

    /* 조작 힌트 */
    var hint = document.createElement("span");
    hint.className = "graph-hint";
    hint.textContent = window.matchMedia("(hover: none)").matches
      ? "드래그 이동 · 핀치 확대"
      : "Space+드래그 이동 · ⌘+스크롤 확대";
    container.appendChild(hint);

    /* Space 키 추적 — 그래프 위에 있을 때만 페이지 스크롤 차단 */
    var hovering = false;
    function onEnter() { hovering = true; }
    function onLeave() { hovering = false; }
    function onKeyDown(event) {
      if (event.code !== "Space" || event.target !== document.body) return;
      if (hovering) event.preventDefault();
      if (!space.held) {
        space.held = true;
        container.classList.add("space-pan");
      }
    }
    function onKeyUp(event) {
      if (event.code !== "Space") return;
      space.held = false;
      container.classList.remove("space-pan");
    }
    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointerleave", onLeave);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    return function cleanup() {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }

  function addExpandButton(container, data) {
    var btn = document.createElement("button");
    btn.className = "graph-expand";
    btn.type = "button";
    btn.title = "전체 화면으로 보기";
    btn.setAttribute("aria-label", "그래프 전체 화면으로 보기");
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    btn.addEventListener("click", function () { openOverlay(data); });
    container.appendChild(btn);
  }

  function openOverlay(data) {
    if (document.querySelector(".graph-overlay")) return;

    var overlay = document.createElement("div");
    overlay.className = "graph-overlay";

    var canvas = document.createElement("div");
    canvas.className = "graph-overlay-canvas";
    overlay.appendChild(canvas);

    var closeBtn = document.createElement("button");
    closeBtn.className = "graph-close";
    closeBtn.type = "button";
    closeBtn.title = "닫기";
    closeBtn.setAttribute("aria-label", "그래프 닫기");
    closeBtn.innerHTML = "&times;";
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    var cleanupRender = renderGraph(canvas, data, { space: true, stars: true, spread: 1.6, touchPan: true });

    function close() {
      cleanupRender();
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (window.location.hash === "#graph-full") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }

    function onKey(event) {
      if (event.key === "Escape") close();
    }

    var resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        cleanupRender();
        canvas.innerHTML = "";
        cleanupRender = renderGraph(canvas, data, { space: true, stars: true, spread: 1.6, touchPan: true });
      }, 200);
    }

    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
  }
})();
