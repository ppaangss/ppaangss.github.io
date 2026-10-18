/* 지식 그래프 — graph.json의 노드·간선을 D3 force simulation으로 렌더링
   인라인 박스 + 확대 버튼으로 여는 풀스크린(우주 모드) 지원
   조작은 피그마 방식: Space+드래그 = 이동, ⌘/Ctrl+휠 = 확대, 기본 휠 = 페이지 스크롤 */

(function () {
  /* 두 가지 모드 — #graph: 조작 가능한 박스, #graph-bg: 홈 첫 화면 배경 (조작 불가) */
  var box = document.getElementById("graph");
  var bg = document.getElementById("graph-bg");
  var host = box || bg;
  if (!host || typeof d3 === "undefined") return;

  var space = { held: false };

  fetch(host.dataset.src)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (box) {
        renderGraph(box, data, { space: true, stars: false, spread: 1, observeResize: true, springBack: true });
        addExpandButton(box, data);
        addCollapseButton(box);
      } else {
        var bgSource = renderBackground(bg, data);
        addPullGesture(document.getElementById("hero-stage"), bg, data, bgSource);
      }
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

    /* 글 노드의 path(front matter categories)에서 카테고리 별(노란 별)과
       Posts 루트(빨간 별)를 자동 생성해 전체를 하나의 트리로 연결한다.
       [프로젝트, 보험찾개냥]이면 Posts → 프로젝트 → 보험찾개냥 → 글 */
    var catCounts = {};
    var catOrder = [];
    nodes.forEach(function (d) {
      var path = d.path || [];
      var parent = "root";
      path.forEach(function (name, i) {
        var key = path.slice(0, i + 1).join(" › ");
        var id = "cat:" + key;
        if (!(key in catCounts)) {
          catCounts[key] = 0;
          catOrder.push({ id: id, key: key, title: name, parent: parent });
        }
        catCounts[key]++;
        parent = id;
      });
      links.push({ source: parent, target: d.id });
    });
    var counts = catOrder.map(function (c) { return catCounts[c.key]; });
    var countMin = Math.min.apply(null, counts);
    var countMax = Math.max.apply(null, counts);
    catOrder.forEach(function (c) {
      /* 카테고리 별 크기 = 하위 글 개수 (최소~최대 상대 비율) */
      var t = countMax === countMin ? 0.5 : (catCounts[c.key] - countMin) / (countMax - countMin);
      nodes.push({ id: c.id, title: c.title, path: c.key, kind: "category", catSize: 7.5 + t * 5 });
      links.push({ source: c.parent, target: c.id });
    });
    /* 루트는 항상 화면 중앙에 고정 — 카테고리들이 주위로 고르게 퍼진다 */
    nodes.push({ id: "root", title: "Posts", kind: "root", fx: width / 2, fy: height / 2 });

    /* 초기 배치를 트리 모양으로 심는다 — 잎(글)을 DFS 순서로 원 둘레에 고르게 나누고,
       카테고리는 자식들의 평균 각도·깊이별 반지름에 둔다. 무작위 시작보다 간선 꼬임이 적다 */
    var children = {};
    links.forEach(function (l) { (children[l.source] = children[l.source] || []).push(l.target); });
    var byId = {};
    nodes.forEach(function (d) { byId[d.id] = d; });
    var leafCount = nodes.filter(function (d) { return !children[d.id]; }).length || 1;
    function seedPositions() {
      var leafIdx = 0;
      var unit = Math.min(width, height) / 6 * spread;
      (function place(id, depth) {
        var d = byId[id];
        var kids = children[id] || [];
        var angle;
        if (!kids.length) {
          angle = (leafIdx++ + 0.5) / leafCount * 2 * Math.PI;
        } else {
          var sum = 0;
          kids.forEach(function (k) { sum += place(k, depth + 1); });
          angle = sum / kids.length;
        }
        if (d.kind !== "root") {
          d.x = width / 2 + Math.cos(angle) * unit * depth;
          d.y = height / 2 + Math.sin(angle) * unit * depth;
        }
        return angle;
      })("root", 0);
    }
    seedPositions();

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
      var stars = svg.append("g").attr("class", "star-field");
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

    /* 스프링백 모드 — 기본 배치를 집 좌표로 기억해 두고, 드래그가 끝나면 복귀 */
    function saveHome() {
      nodes.forEach(function (d) { d.hx = d.x; d.hy = d.y; });
    }
    if (opts.springBack) saveHome();

    function springHome() {
      var from = nodes.map(function (d) { return [d.x, d.y]; });
      zoomLayer.transition("spring-back")
        .duration(600)
        .ease(d3.easeCubicOut)
        .tween("positions", function () {
          return function (t) {
            nodes.forEach(function (d, i) {
              d.x = from[i][0] + (d.hx - from[i][0]) * t;
              d.y = from[i][1] + (d.hy - from[i][1]) * t;
            });
            ticked();
          };
        });
    }

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
            /* Space를 누르고 있으면 손바닥(이동) 모드가 우선, 루트는 고정이라 드래그 불가 */
            return !space.held && !event.ctrlKey && !event.button && d.kind !== "root";
          })
          .on("start", function (event, d) {
            if (opts.springBack) zoomLayer.interrupt("spring-back");
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
            if (opts.springBack) {
              /* 흐트러진 배치를 기본 형태로 되돌린다 */
              simulation.stop();
              springHome();
            }
          })
      )
      .on("click", function (event, d) {
        if (space.held || event.defaultPrevented) return;
        if (d.published && d.url) {
          window.location.href = d.url;
        } else if (d.kind === "category") {
          /* 노란 별 → 해당 카테고리(하위 포함)로 필터된 글 목록 */
          window.location.href = "/posts/?category=" + encodeURIComponent(d.path);
        } else if (d.kind === "root") {
          window.location.href = "/posts/";
        }
      });

    node.append("circle").attr("r", function (d) {
      if (d.kind === "root") return 12;
      if (d.kind === "category") return d.catSize || 9;
      if (!d.published) return 5;
      /* 글 분량에 비례한 별 크기 */
      return d.chars ? 6.5 + charNorm(d.chars) * 4.5 : 8;
    });

    /* 배경 모드는 별만 — 라벨 없음 */
    if (!opts.background) {
      node.append("text")
        .attr("dy", 26)
        .attr("text-anchor", "middle")
        .text(function (d) { return d.title; });
    }

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
      var root = null;
      for (var n = 0; n < nodes.length; n++) {
        if (nodes[n].kind === "root") { root = nodes[n]; break; }
      }
      if (root) {
        /* 루트를 화면 정중앙에 두고, 가장 멀리 뻗은 노드까지 들어오는 배율 */
        var halfW = Math.max(root.x - minX, maxX - root.x);
        var halfH = Math.max(root.y - minY, maxY - root.y);
        scale = Math.min(width / 2 / halfW, height / 2 / halfH, 1.2);
        tx = width / 2 - scale * root.x;
        ty = height / 2 - scale * root.y;
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
    /* 배경 모드 — 가운데로 모으지 않고 화면 전체에 펼친 뒤 천천히 떠다니게 한다 */
    var driftFrame = null;
    if (opts.background) {
      fillBox();
      startDrift();
    } else {
      fitView();
      if (opts.intro) playIntro();
    }

    /* 화면 좌표 → 그래프 좌표 (현재 줌 기준) */
    function fromScreen(p) {
      var box = svg.node().getBoundingClientRect();
      return d3.zoomTransform(svg.node()).invert([p[0] - box.left, p[1] - box.top]);
    }

    /* 등장 연출 — 별들이 출발점에서 제자리로 모인다.
       opts.introFrom(별 id → 화면 좌표)이 있으면 홈 배경 별이 떠 있던 그 자리에서 출발하고,
       없으면 바깥에 흩어진 위치에서 출발한다. 선·라벨은 CSS(.intro)로 뒤따라 서서히 나타난다 */
    function playIntro() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var root = null;
      nodes.forEach(function (d) { if (d.kind === "root") root = d; });
      var to = nodes.map(function (d) { return [d.x, d.y]; });
      var src = opts.introFrom || {};
      var from = nodes.map(function (d) {
        if (src[d.id]) return fromScreen(src[d.id]);
        if (d === root) return [d.x, d.y];
        var dx = d.x - root.x;
        var dy = d.y - root.y;
        var k = 2.2 + Math.random() * 0.8;
        return [root.x + dx * k + (Math.random() - 0.5) * 120, root.y + dy * k + (Math.random() - 0.5) * 120];
      });
      container.classList.add("intro");
      zoomLayer.transition("intro")
        .duration(1100)
        .ease(d3.easeCubicOut)
        .tween("positions", function () {
          return function (t) {
            nodes.forEach(function (d, i) {
              d.x = from[i][0] + (to[i][0] - from[i][0]) * t;
              d.y = from[i][1] + (to[i][1] - from[i][1]) * t;
            });
            ticked();
          };
        })
        .on("end interrupt", function () {
          nodes.forEach(function (d, i) { d.x = to[i][0]; d.y = to[i][1]; });
          ticked();
        });
      /* 선·라벨 페이드(최대 1.35초)가 끝난 뒤 클래스 정리 */
      setTimeout(function () { container.classList.remove("intro"); }, 1500);
      /* 첫 프레임을 바깥 위치에서 시작 */
      nodes.forEach(function (d, i) { d.x = from[i][0]; d.y = from[i][1]; });
      ticked();
    }

    /* 배치를 박스 가로세로에 각각 맞춰 늘린다 */
    function fillBox() {
      var xs = nodes.map(function (d) { return d.x; });
      var ys = nodes.map(function (d) { return d.y; });
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      var padX = Math.min(70, width * 0.08);
      var padTop = 110; /* 상단 메뉴 아래부터 */
      var padBottom = 80;
      nodes.forEach(function (d) {
        d.bx = padX + (d.x - minX) / ((maxX - minX) || 1) * (width - padX * 2);
        d.by = padTop + (d.y - minY) / ((maxY - minY) || 1) * (height - padTop - padBottom);
        d.x = d.bx;
        d.y = d.by;
        /* 별마다 떠다니는 주기·방향을 다르게 */
        d.phase = Math.random() * Math.PI * 2;
        d.speed = 0.00018 + Math.random() * 0.00022;
        d.amp = 6 + Math.random() * 8;
      });
      ticked();
    }

    function startDrift() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      (function frame(t) {
        nodes.forEach(function (d) {
          d.x = d.bx + Math.cos(t * d.speed + d.phase) * d.amp;
          d.y = d.by + Math.sin(t * d.speed * 1.3 + d.phase) * d.amp;
        });
        ticked();
        driftFrame = requestAnimationFrame(frame);
      })(0);
    }

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
          d.vx = 0;
          d.vy = 0;
          d.fx = null;
          d.fy = null;
        }
      });
      seedPositions(); /* 처음 로드와 같은 트리 모양 초기 배치부터 다시 */
      simulation.nodes(nodes);
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

    /* 화면 맞추기(카메라만) + 배치 초기화 버튼 —
       스프링백(인라인 박스)·배경 모드에서는 배치가 안 바뀌므로 두 버튼 모두 생략 */
    if (!opts.springBack && !opts.background) {
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
    }

    /* 박스 크기가 바뀌면 viewBox를 맞추고, 새 비율에 맞춰 노드들이
       다시 균형을 잡도록 시뮬레이션을 재가동한다 (끝나면 다시 핏) */
    var pendingFit = false;
    simulation.on("end.fit", function () {
      if (opts.springBack) saveHome(); /* 리사이즈 재배치 후 새 기본 배치를 집으로 */
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

    /* 조작 힌트 (배경 모드는 조작이 없으니 생략) */
    if (!opts.background) {
      var hint = document.createElement("span");
      hint.className = "graph-hint";
      hint.textContent = window.matchMedia("(hover: none)").matches
        ? "드래그 이동 · 핀치 확대"
        : "Space+드래그 이동 · ⌘+스크롤 확대";
      container.appendChild(hint);
    }

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

    function cleanup() {
      if (driftFrame) cancelAnimationFrame(driftFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (resizeObserver) resizeObserver.disconnect();
    }

    /* 퇴장 연출 — 별들이 targets(별 id → 화면 좌표)로 돌아간 뒤 done 호출 */
    cleanup.outro = function (targets, done) {
      simulation.stop();
      zoomLayer.interrupt("intro");
      var from = nodes.map(function (d) { return [d.x, d.y]; });
      var to = nodes.map(function (d, i) { return targets[d.id] ? fromScreen(targets[d.id]) : from[i]; });
      zoomLayer.transition("outro")
        .duration(650)
        .ease(d3.easeCubicInOut)
        .tween("positions", function () {
          return function (t) {
            nodes.forEach(function (d, i) {
              d.x = from[i][0] + (to[i][0] - from[i][0]) * t;
              d.y = from[i][1] + (to[i][1] - from[i][1]) * t;
            });
            ticked();
          };
        })
        .on("end interrupt", done);
    };

    return cleanup;
  }

  /* 홈 배경 그래프 — 페이지 크기가 바뀌면(창 크기, 이미지 로딩으로 길어짐) 통째로 다시 펼친다 */
  function renderBackground(layer, data) {
    var opts = { space: true, stars: false, spread: 1.3, background: true };
    var cleanup = renderGraph(layer, data, opts);
    var lastW = layer.clientWidth;
    var lastH = layer.clientHeight;
    var timer = null;
    /* 풀스크린 연출용 — 배경 별들의 현재 화면 좌표 */
    var source = {
      layer: layer,
      positions: function () {
        var map = {};
        d3.select(layer).selectAll(".graph-node circle").each(function (d) {
          var r = this.getBoundingClientRect();
          map[d.id] = [r.left + r.width / 2, r.top + r.height / 2];
        });
        return map;
      }
    };
    if (typeof ResizeObserver === "undefined") return source;
    new ResizeObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var w = layer.clientWidth;
        var h = layer.clientHeight;
        /* 스크롤바 폭(풀스크린 열고 닫을 때 생겼다 사라짐) 정도의 변화는 무시 —
           다시 그리면 별 배치가 바뀌어 풀스크린 연출과 어긋난다 */
        if (Math.abs(w - lastW) < 40 && Math.abs(h - lastH) < 80) return;
        lastW = w;
        lastH = h;
        cleanup();
        layer.innerHTML = "";
        cleanup = renderGraph(layer, data, opts);
      }, 200);
    }).observe(layer);
    return source;
  }

  /* 홈 배경 — 데스크톱에서 페이지 맨 위에서 휠을 위로 더 굴리면 풀스크린이 열린다.
     굴리는 동안 배경 별자리가 따라 올라오며 밝아지고, 덜 굴리고 멈추면 제자리로 돌아간다.
     아래에서 올라온 관성 휠에 열리지 않도록, 맨 위에서 잠깐 멈췄다가 새로 굴릴 때만 반응한다.
     터치 기기에서는 걸지 않는다 */
  function addPullGesture(stage, layer, data, source) {
    if (!stage || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    stage.classList.add("pullable");
    document.documentElement.classList.add("can-pull"); /* 상단 바 안내 문구 표시용 */

    var THRESHOLD = 300; /* 휠 deltaY 누적치 (마우스 휠 약 3칸) */
    var IDLE = 250;      /* 이만큼 휠이 끊기면 새 제스처로 본다 */
    var pull = 0;
    var armed = false;
    var lastWheel = 0;
    var releaseTimer = null;

    function setPull(p) {
      stage.classList.add("pulling");
      layer.style.transform = "translateY(" + (-p * 40) + "px)";
      layer.style.setProperty("--pull", p);
    }

    function release() {
      pull = 0;
      stage.classList.remove("pulling");
      layer.style.transform = "";
      layer.style.removeProperty("--pull");
    }

    window.addEventListener("wheel", function (event) {
      var now = Date.now();
      var gap = now - lastWheel;
      lastWheel = now;
      if (document.querySelector(".graph-overlay")) return;

      if (window.scrollY > 0 || event.deltaY > 0) {
        armed = false;
        if (pull) release();
        return;
      }
      if (!armed) {
        if (gap < IDLE) return; /* 아직 이어지는 관성 휠 */
        armed = true;
      }

      var dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      pull += -dy;
      var p = Math.min(1, pull / THRESHOLD);
      setPull(p);

      clearTimeout(releaseTimer);
      if (p >= 1) {
        var from = source.positions(); /* 끌어올린 위치 그대로에서 출발 */
        release();
        armed = false;
        openOverlay(data, source, from);
        return;
      }
      releaseTimer = setTimeout(release, IDLE);
    }, { passive: true });
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

  /* source가 있으면(홈 배경) 배경 별이 그대로 풀스크린 별자리로 옮겨가고, 닫을 때 제자리로 돌아간다 */
  function openOverlay(data, source, introFrom) {
    if (document.querySelector(".graph-overlay")) return;

    var overlay = document.createElement("div");
    overlay.className = source ? "graph-overlay from-bg" : "graph-overlay";

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

    var cleanupRender = renderGraph(canvas, data, {
      space: true, stars: true, spread: 1.6, touchPan: true, intro: true,
      introFrom: source ? (introFrom || source.positions()) : null
    });
    /* 같은 별이 두 번 보이지 않게, 옮겨가는 동안 배경 별은 숨긴다 */
    if (source) source.layer.style.visibility = "hidden";

    var closing = false;
    function close() {
      if (closing) return;
      closing = true;
      document.body.style.overflow = "";
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (source && !reduce) {
        /* 별들이 배경 자리로 돌아간 뒤 배경과 바꿔치기 */
        overlay.classList.add("outro");
        cleanupRender.outro(source.positions(), function () {
          source.layer.style.visibility = "";
          cleanupRender();
          overlay.remove();
        });
      } else {
        /* 페이드아웃이 끝난 뒤 제거 */
        overlay.classList.add("closing");
        setTimeout(function () {
          if (source) source.layer.style.visibility = "";
          cleanupRender();
          overlay.remove();
        }, 260);
      }
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
