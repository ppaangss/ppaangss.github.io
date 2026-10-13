/* 사이트 전체 밤하늘 배경 — 다크 모드에서만 고정 별 레이어를 깐다 */

(function () {
  if (!window.matchMedia("(prefers-color-scheme: dark)").matches) return;

  var layer = document.createElement("div");
  layer.className = "space-bg";
  layer.setAttribute("aria-hidden", "true");

  var svgNS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");

  for (var i = 0; i < 220; i++) {
    var star = document.createElementNS(svgNS, "circle");
    star.setAttribute("class", "star");
    star.setAttribute("cx", (Math.random() * 100).toFixed(2) + "%");
    star.setAttribute("cy", (Math.random() * 100).toFixed(2) + "%");
    star.setAttribute("r", (Math.random() * 1.1 + 0.3).toFixed(2));
    star.style.animationDuration = (Math.random() * 4 + 2).toFixed(1) + "s";
    star.style.animationDelay = (Math.random() * 4).toFixed(1) + "s";
    svg.appendChild(star);
  }

  layer.appendChild(svg);
  document.body.prepend(layer);
})();
