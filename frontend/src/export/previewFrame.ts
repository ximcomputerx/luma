const hexPattern = /^#[0-9a-fA-F]{6}$/;
const radiusPattern = /^\d+(?:\.\d+)?px$/;
const scrollRadius = "20px";

const pagerScript = `(function () {
  var spread = document.querySelector(".spread");
  var label = document.querySelector("[data-page-label]");
  if (!spread) return;
  var vertical = false;
  function article() {
    return spread.querySelector(".pdf-article");
  }
  function measure() {
    var width = spread.clientWidth || 1;
    var columns = spread.scrollWidth > width + 1;
    if (columns) {
      vertical = false;
      spread.style.columnWidth = "";
      spread.style.columnCount = "";
      spread.style.overflowX = "";
      spread.style.overflowY = "";
      return;
    }
    var body = article();
    if (body && body.scrollHeight > (spread.clientHeight || 1) + 2) {
      vertical = true;
      spread.style.columnWidth = "auto";
      spread.style.columnCount = "1";
      spread.style.overflowX = "hidden";
      spread.style.overflowY = "auto";
    }
  }
  function pageCount() {
    var size = (vertical ? spread.clientHeight : spread.clientWidth) || 1;
    var total = vertical ? spread.scrollHeight : spread.scrollWidth;
    var count = Math.round(total / size);
    return count > 0 ? count : 1;
  }
  function pageIndex() {
    var size = (vertical ? spread.clientHeight : spread.clientWidth) || 1;
    var pos = vertical ? spread.scrollTop : spread.scrollLeft;
    var index = Math.round(pos / size);
    var last = pageCount() - 1;
    if (index < 0) return 0;
    return index > last ? last : index;
  }
  function paint() {
    if (label) label.textContent = (pageIndex() + 1) + " / " + pageCount();
  }
  function go(delta) {
    var size = (vertical ? spread.clientHeight : spread.clientWidth) || 1;
    var next = pageIndex() + delta;
    if (next < 0) next = 0;
    var last = pageCount() - 1;
    if (next > last) next = last;
    if (vertical) spread.scrollTop = next * size;
    else spread.scrollLeft = next * size;
    paint();
  }
  function ready() {
    measure();
    paint();
  }
  var prev = document.querySelector("[data-page-prev]");
  var next = document.querySelector("[data-page-next]");
  if (prev) prev.addEventListener("click", function () { go(-1); });
  if (next) next.addEventListener("click", function () { go(1); });
  spread.addEventListener("wheel", function (event) {
    if (!event.deltaY) return;
    event.preventDefault();
    go(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  spread.addEventListener("scroll", paint);
  var fonts = document.fonts;
  if (fonts && fonts.ready) fonts.ready.then(ready);
  ready();
})();`;

export function wrapPreview(html: string, options: { prev: string; next: string; ink: string; thumb?: string; radius?: string }): string {
  if (!html.includes("</body>") || !html.includes("script-src 'none'")) {
    return html;
  }
  const ink = hexPattern.test(options.ink) ? options.ink : "#2c2822";
  const thumb = options.thumb && hexPattern.test(options.thumb) ? options.thumb : ink;
  const radius = options.radius && radiusPattern.test(options.radius) ? options.radius : scrollRadius;
  const pager = `<style>.pager{color:${ink}}${spreadScroll(thumb, radius)}</style><nav class="pager"><button type="button" data-page-prev>${escapeHtml(options.prev)}</button><span data-page-label>1 / 1</span><button type="button" data-page-next>${escapeHtml(options.next)}</button></nav><script>${pagerScript}</script>`;
  return html
    .replace("script-src 'none'", "script-src 'unsafe-inline'")
    .replace("</body>", `${pager}</body>`);
}

function spreadScroll(thumb: string, radius: string): string {
  const mix = (amount: number) => `color-mix(in srgb,${thumb} ${amount}%,transparent)`;
  return `.spread{scrollbar-width:thin;scrollbar-color:transparent transparent;}.spread:hover,.spread:focus-within{scrollbar-color:${mix(45)} transparent;}.spread::-webkit-scrollbar{width:8px;height:8px;}.spread::-webkit-scrollbar-track{background:transparent;}.spread::-webkit-scrollbar-thumb{background-color:transparent;border-radius:${radius};}.spread:hover::-webkit-scrollbar-thumb,.spread:focus-within::-webkit-scrollbar-thumb{background-color:${mix(45)};}.spread::-webkit-scrollbar-thumb:hover{background-color:${mix(70)};}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
