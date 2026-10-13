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
      renderGraph(box, data, { space: true, stars: false, spread: 1, observeResize: true });
      addExpandButton(box, data);
      addCollapseButton(box);
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

    /* 글 노드의 group에서 카테고리(노란 별)·CS 루트(빨간 별)를 자동 생성해
       전체를 하나의 트리로 연결한다 — graph.json에는 글 노드만 있으면 된다 */
    var groupCounts = {};
    nodes.forEach(function (d) {
      if (!d.group) return;
      groupCounts[d.group] = (groupCounts[d.group] || 0) + 1;
      links.push({ source: "cat:" + d.group, target: d.id });
    });
    var counts = Object.keys(groupCounts).map(function (g) { return groupCounts[g]; });
    var countMin = Math.min.apply(null, counts);
    var countMax = Math.max.apply(null, counts);
    Object.keys(groupCounts).forEach(function (g) {
      /* 카테고리 별 크기 = 글 개수 (최소~최대 상대 비율) */
      var t = countMax === countMin ? 0.5 : (groupCounts[g] - countMin) / (countMax - countMin);
      nodes.push({ id: "cat:" + g, title: g, kind: "category", catSize: 7.5 + t * 5 });
      links.push({ source: "cs", target: "cat:" + g });
    });
    /* CS 루트는 항상 화면 중앙에 고정 — 카테고리들이 주위로 고르게 퍼진다 */
    nodes.push({ id: "cs", title: "CS", kind: "root", fx: width / 2, fy: height / 2 });

    /* 글 분량(chars) 상대 비율 — 긴 글일수록 별이 크고 간선이 길다 */
    var charVals = nodes.filter(function (d) { return d.chars; }).map(function (d) { return d.chars; });
    var charMin = Math.min.apply(null, charVals);
    var charMax = Math.max.apply(null, charVals);
    function charNorm(c) {
      if (!c || !charVals.length) return 0.5;
      if (charMax === charMin) return 0.5;
      return (c - charMin) / (charMax - charMin);
    }

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

    /* 박스 비율에 맞춰 축 방향 force 강도를 정한다 —
       넓은 박스는 가로로 퍼지고, 좁은 박스는 세로로 쌓이게 */
    function axialStrengths() {
      var k = Math.sqrt(width / height);
      var damp = spread > 1 ? 0.6 : 1;
      return { x: (0.14 / k) * damp, y: 0.14 * k * damp };
    }

    var ax = axialStrengths();
    var simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(function (d) { return d.id; }).distance(function (l) {
        /* 카테고리→글 간선은 글 분량에 비례해 길어진다 */
        if (l.target.chars) return (65 + charNorm(l.target.chars) * 75) * spread;
        return 90 * spread;
      }))
      .force("charge", d3.forceManyBody().strength(-450 * spread))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(ax.x))
      .force("y", d3.forceY(height / 2).strength(ax.y))
      .force("collide", d3.forceCollide(Math.max(48, 130 - nodes.length * 6) * spread));

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
        if (d.kind === "root") return "graph-node root";
        if (d.kind === "category") return "graph-node cat";
        return d.published ? "graph-node" : "graph-node ghost";
      })
      .call(
        d3.drag()
          .clickDistance(4)
          .filter(function (event, d) {
            /* Space를 누르고 있으면 손바닥(이동) 모드가 우선, CS는 고정이라 드래그 불가 */
            return !space.held && !event.ctrlKey && !event.button && d.kind !== "root";
          })
          .on("start", function (event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            container.classList.add("panning");
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", function (event, d) {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", function (event, d) {
            if (!event.active) simulation.alphaTarget(0);
            container.classList.remove("panning");
            d.fx = null;
            d.fy = null;
          })
      )
      .on("click", function (event, d) {
        if (space.held || event.defaultPrevented) return;
        if (d.published && d.url) {
          window.location.href = d.url;
        } else if (d.kind === "category") {
          /* 노란 별 → 해당 카테고리로 필터된 CS 목록 */
          window.location.href = "/study/?category=" + encodeURIComponent(d.title);
        } else if (d.kind === "root") {
          window.location.href = "/study/";
        }
      });

    node.append("circle").attr("r", function (d) {
      if (d.kind === "root") return 12;
      if (d.kind === "category") return d.catSize || 9;
      if (!d.published) return 5;
      /* 글 분량에 비례한 별 크기 */
      return d.chars ? 6.5 + charNorm(d.chars) * 4.5 : 8;
    });

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
    function fitView(animate) {
      var xs = nodes.map(function (d) { return d.x; });
      var ys = nodes.map(function (d) { return d.y; });
      var padX = 110; /* 라벨이 노드 좌우로 뻗으므로 가로 여백을 넉넉히 */
      var padY = 60;
      var minX = Math.min.apply(null, xs) - padX;
      var maxX = Math.max.apply(null, xs) + padX;
      var minY = Math.min.apply(null, ys) - padY;
      var maxY = Math.max.apply(null, ys) + padY;
      var scale, tx, ty;
      var cs = null;
      for (var n = 0; n < nodes.length; n++) {
        if (nodes[n].kind === "root") { cs = nodes[n]; break; }
      }
      if (cs) {
        /* CS를 화면 정중앙에 두고, 가장 멀리 뻗은 노드까지 들어오는 배율 */
        var halfW = Math.max(cs.x - minX, maxX - cs.x);
        var halfH = Math.max(cs.y - minY, maxY - cs.y);
        scale = Math.min(width / 2 / halfW, height / 2 / halfH, 1.2);
        tx = width / 2 - scale * cs.x;
        ty = height / 2 - scale * cs.y;
      } else {
        scale = Math.min(width / (maxX - minX), height / (maxY - minY), 1.2);
        tx = width / 2 - scale * (minX + maxX) / 2;
        ty = height / 2 - scale * (minY + maxY) / 2;
      }
      var transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
      if (animate) {
        svg.transition().duration(550).call(zoom.transform, transform);
      } else {
        svg.call(zoom.transform, transform);
      }
    }
    fitView();

    /* 초기화 — 노드 배치를 현재 박스 비율 기준의 초기 상태로 다시 계산한다
       (끌어놓은 노드·시야 전부 리셋, 처음 로드와 같은 과정을 다시 밟음) */
    function resetLayout() {
      simulation.stop();
      /* 지금 위치를 기억해 두고 */
      var from = nodes.map(function (d) { return [d.x, d.y]; });
      /* 초기 배치를 오프라인으로 계산한다 (처음 로드와 같은 결정적 과정) */
      nodes.forEach(function (d) {
        if (d.kind === "root") {
          d.fx = width / 2;
          d.fy = height / 2;
        } else {
          d.x = undefined;
          d.y = undefined;
          d.vx = 0;
          d.vy = 0;
          d.fx = null;
          d.fy = null;
        }
      });
      simulation.nodes(nodes); /* 좌표가 빈 노드는 초기 배치부터 다시 */
      simulation.alpha(1); /* 식은 시뮬레이션을 다시 데워야 처음 로드와 같은 결과가 나온다 */
      for (var r = 0; r < 300; r++) simulation.tick();
      var to = nodes.map(function (d) { return [d.x, d.y]; });
      fitView(true); /* 카메라는 목표 배치 기준으로 계산해서 같이 움직인다 */
      /* 현재 위치로 되돌린 뒤, 목표 배치까지 보간 애니메이션 */
      nodes.forEach(function (d, i) {
        if (from[i][0] != null) { d.x = from[i][0]; d.y = from[i][1]; }
      });
      zoomLayer.transition("reset-layout")
        .duration(700)
        .ease(d3.easeCubicInOut)
        .tween("positions", function () {
          return function (t) {
            nodes.forEach(function (d, i) {
              if (from[i][0] == null) return;
              d.x = from[i][0] + (to[i][0] - from[i][0]) * t;
              d.y = from[i][1] + (to[i][1] - from[i][1]) * t;
            });
            ticked();
          };
        });
    }

    /* 화면 맞추기(카메라만) + 배치 초기화 버튼 */
    container.appendChild(makeButton(
      "graph-fit", "화면에 맞추기",
      '<circle cx="12" cy="12" r="6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
      function () { fitView(true); }
    ));
    container.appendChild(makeButton(
      "graph-reset", "배치 초기화",
      '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>',
      resetLayout
    ));

    /* 박스 크기가 바뀌면 viewBox를 맞추고, 새 비율에 맞춰 노드들이
       다시 균형을 잡도록 시뮬레이션을 재가동한다 (끝나면 다시 핏) */
    var pendingFit = false;
    simulation.on("end.fit", function () {
      if (pendingFit) {
        pendingFit = false;
        fitView();
      }
    });

    var resizeObserver = null;
    if (opts.observeResize && typeof ResizeObserver !== "undefined") {
      var resizeTimer = null;
      resizeObserver = new ResizeObserver(function () {
        /* 접기/펼치기 전환 중 중간 높이마다 재배치되지 않도록,
           크기 변화가 멈춘 뒤 한 번만 반응한다 */
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(onBoxResize, 150);
      });
      function onBoxResize() {
        if (container.classList.contains("collapsed")) return;
        var w = container.clientWidth;
        var h = container.clientHeight;
        if (!w || !h || (w === width && h === height)) return;
        width = w;
        height = h;
        svg.attr("viewBox", [0, 0, w, h]);
        nodes.forEach(function (d) {
          if (d.kind === "root") { d.fx = w / 2; d.fy = h / 2; }
        });
        var s = axialStrengths();
        simulation
          .force("center", d3.forceCenter(w / 2, h / 2))
          .force("x", d3.forceX(w / 2).strength(s.x))
          .force("y", d3.forceY(h / 2).strength(s.y));
        fitView();
        pendingFit = true;
        simulation.alpha(0.35).restart();
      }
      resizeObserver.observe(container);
    }

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
      if (resizeObserver) resizeObserver.disconnect();
    };
  }

  function makeButton(cls, title, svgPaths, onClick) {
    var btn = document.createElement("button");
    btn.className = cls;
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      svgPaths + "</svg>";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function addCollapseButton(container) {
    var btn = makeButton(
      "graph-collapse", "그래프 접기/펼치기",
      '<path d="m18 15-6-6-6 6"/>',
      function () { apply(!container.classList.contains("collapsed")); }
    );
    function apply(collapsed) {
      container.classList.toggle("collapsed", collapsed);
      try {
        localStorage.setItem("graph-collapsed", collapsed ? "1" : "");
      } catch (e) { /* 사생활 보호 모드 등에서 localStorage 불가 시 무시 */ }
    }
    container.appendChild(btn);
    try {
      if (localStorage.getItem("graph-collapsed") === "1") apply(true);
    } catch (e) { /* 무시 */ }
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
