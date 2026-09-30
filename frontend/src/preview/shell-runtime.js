(function () {
  var root = document.getElementById("root");
  var appliedGen = 0;
  var applying = false;
  var mermaidReady = false;
  var currentId = null;

  if (typeof mermaid !== "undefined") {
    mermaid.startOnLoad = false;
  }

  function initMermaid() {
    if (mermaidReady || typeof mermaid === "undefined") {
      return;
    }
    var config = {
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "suppressErrorRendering",
        "htmlLabels",
        "maxEdges",
      ],
    };
    try {
      mermaid.initialize(config);
    } catch (error) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        suppressErrorRendering: true,
      });
    }
    mermaid.startOnLoad = false;
    mermaidReady = true;
  }

  function text(key, fallback) {
    var table = typeof lumaCopy === "object" && lumaCopy ? lumaCopy : null;
    var value = table && typeof table[key] === "string" ? table[key] : fallback;
    return value;
  }

  function fill(template, name, value) {
    return String(template).split("{" + name + "}").join(String(value));
  }

  function sourceLineCount(source) {
    var text = String(source || "");
    if (!text) {
      return 0;
    }
    var parts = text.split("\n");
    if (parts[parts.length - 1] === "") {
      parts.pop();
    }
    return parts.length;
  }

  function diagramFailure(source, error) {
    var raw = "";
    if (error && typeof error.message === "string") {
      raw = error.message;
    } else if (error && typeof error.str === "string") {
      raw = error.str;
    } else if (typeof error === "string") {
      raw = error;
    }
    var reported = null;
    var matched = /on line (\d+)/.exec(raw);
    if (matched) {
      reported = Number(matched[1]);
    }
    var syntax = /parse error|expecting|lexical error|unknown diagram|got 'EOF'/i.test(raw);
    var title = syntax
      ? text("mermaidSyntax", "Mermaid syntax error")
      : text("mermaidRender", "Couldn't render the Mermaid diagram");
    var total = sourceLineCount(source);
    if (syntax && reported && reported >= 1 && reported <= Math.max(total, 1)) {
      title = fill(
        text("mermaidSyntaxLine", "Mermaid syntax error, check line {line}"),
        "line",
        reported,
      );
    }
    return { title: title, detail: raw };
  }

  function clearStaleMermaidNodes() {
    var nodes = document.body.children;
    for (var i = nodes.length - 1; i >= 0; i -= 1) {
      var el = nodes[i];
      if (el.id === "root") {
        continue;
      }
      if (el.tagName === "DIV" || el.tagName === "IFRAME") {
        el.remove();
      }
    }
  }

  function clearRenderNode(id) {
    var enclosing = document.getElementById("d" + id);
    if (enclosing && enclosing.id !== "root") {
      enclosing.remove();
    }
    var frame = document.getElementById("i" + id);
    if (frame) {
      frame.remove();
    }
  }

  function showDiagramError(host, source, error) {
    var failure = diagramFailure(source, error);
    host.textContent = "";
    var heading = document.createElement("p");
    heading.className = "diagram-error";
    heading.textContent = failure.title;
    host.appendChild(heading);
    if (failure.detail) {
      var detail = document.createElement("pre");
      detail.className = "diagram-error-detail";
      detail.textContent = failure.detail;
      host.appendChild(detail);
    }
  }

  function filterSvg(svgText) {
    var parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
    var svg = parsed.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      parsed = new DOMParser().parseFromString(svgText, "text/html");
      svg = parsed.querySelector("svg");
    }
    if (!svg) {
      return null;
    }
    var doomed = svg.querySelectorAll("script, foreignObject");
    for (var i = 0; i < doomed.length; i += 1) {
      doomed[i].remove();
    }
    var elements = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll("*")));
    elements.forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        if (name.indexOf("on") === 0) {
          el.removeAttribute(attr.name);
        }
        if (name === "href" || name === "xlink:href") {
          var value = attr.value.trim().toLowerCase();
          if (value.indexOf("https:") !== 0) {
            el.removeAttribute(attr.name);
          }
        }
      });
    });
    return svg;
  }

  function allowedImageSrc(src) {
    if (typeof src !== "string" || src.length > 2100000) {
      return false;
    }
    if (/^https:\/\//i.test(src)) {
      return true;
    }
    return /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src);
  }

  function imagePending() {
    if (typeof lumaRemoteImages !== "undefined" && lumaRemoteImages === true) {
      return text("imageLocalPending", "Local image not shown");
    }
    return text("imagePending", "Image not shown");
  }

  function textOf(inlines, target) {
    inlines.forEach(function (inline) {
      if (inline.type === "text" || inline.type === "code") {
        target.appendChild(document.createTextNode(inline.text));
      } else if (inline.type === "soft_break" || inline.type === "hard_break") {
        target.appendChild(document.createElement("br"));
      } else if (inline.type === "emphasis" || inline.type === "strong" || inline.type === "strike") {
        var el = document.createElement(
          inline.type === "strong" ? "strong" : inline.type === "strike" ? "s" : "em",
        );
        textOf(inline.children, el);
        target.appendChild(el);
      } else if (inline.type === "link") {
        var link = document.createElement("span");
        link.className = "link";
        link.title = text("linkClosed", "Links stay in the document");
        textOf(inline.children, link);
        target.appendChild(link);
      } else if (inline.type === "image") {
        var holder = document.createElement("span");
        holder.className = "placeholder";
        if (inline.src && allowedImageSrc(inline.src)) {
          var img = document.createElement("img");
          img.alt = inline.alt || "";
          img.src = inline.src;
          holder.appendChild(img);
        } else {
          var pending = imagePending();
          holder.textContent = inline.alt ? inline.alt : pending;
          holder.title = pending;
        }
        target.appendChild(holder);
      } else if (inline.type === "math") {
        var math = document.createElement("span");
        target.appendChild(math);
        if (typeof katex !== "undefined") {
          katex.render(inline.tex, math, {
            throwOnError: false,
            trust: false,
            strict: "ignore",
            maxSize: 10,
            maxExpand: 1000,
          });
        } else {
          math.textContent = inline.tex;
        }
      }
    });
  }

  function pageBreak(inlines) {
    if (!inlines || !inlines.length) {
      return false;
    }
    var text = "";
    for (var i = 0; i < inlines.length; i += 1) {
      var inline = inlines[i];
      if (!inline || inline.type !== "text") {
        return false;
      }
      text += inline.text || "";
    }
    return text.trim() === "\\pagebreak";
  }

  function renderBlock(node, depth) {
    var body = node.body;
    var el;
    if (body.type === "paragraph") {
      if (pageBreak(body.inlines)) {
        el = document.createElement("div");
        el.className = "page-break";
        el.setAttribute("role", "separator");
        var label = document.createElement("span");
        label.textContent = text("pageBreak", "Page break");
        el.appendChild(label);
      } else {
        el = document.createElement("p");
        textOf(body.inlines, el);
      }
    } else if (body.type === "heading" || body.type === "outline_heading") {
      var level = Math.min(6, Math.max(1, body.level || 1));
      el = document.createElement("h" + level);
      if (body.type === "outline_heading") {
        el.textContent = body.text || "";
      } else {
        textOf(body.inlines, el);
      }
    } else if (body.type === "bullet_list" || body.type === "ordered_list") {
      el = document.createElement(body.type === "ordered_list" ? "ol" : "ul");
      if (body.type === "ordered_list" && body.start) {
        el.start = body.start;
      }
      body.items.forEach(function (item) {
        el.appendChild(renderBlock(item, depth + 1));
      });
    } else if (body.type === "list_item") {
      el = document.createElement("li");
      if (body.checked === true || body.checked === false) {
        var mark = document.createElement("span");
        mark.textContent = body.checked ? "☑ " : "☐ ";
        el.appendChild(mark);
      }
      body.blocks.forEach(function (child) {
        el.appendChild(renderBlock(child, depth + 1));
      });
    } else if (body.type === "block_quote") {
      el = document.createElement("blockquote");
      if (body.alert) {
        var label = document.createElement("div");
        label.textContent = body.alert;
        el.appendChild(label);
      }
      body.blocks.forEach(function (child) {
        el.appendChild(renderBlock(child, depth + 1));
      });
    } else if (body.type === "code") {
      el = document.createElement("pre");
      var code = document.createElement("code");
      code.textContent = body.source || "";
      el.appendChild(code);
    } else if (body.type === "diagram") {
      el = document.createElement("div");
      el.className = "diagram";
      renderDiagram(el, body.source || "");
    } else if (body.type === "table") {
      el = document.createElement("table");
      body.rows.forEach(function (row) {
        var tr = document.createElement("tr");
        row.cells.forEach(function (cell) {
          var td = document.createElement(row.header ? "th" : "td");
          if (cell.align && cell.align !== "none") {
            td.style.textAlign = cell.align;
          }
          textOf(cell.inlines, td);
          tr.appendChild(td);
        });
        el.appendChild(tr);
      });
    } else if (body.type === "thematic_break") {
      el = document.createElement("hr");
    } else if (body.type === "math_display") {
      el = document.createElement("div");
      el.className = "math-display";
      if (typeof katex !== "undefined") {
        katex.render(body.tex || "", el, {
          throwOnError: false,
          trust: false,
          strict: "ignore",
          displayMode: true,
          maxSize: 10,
          maxExpand: 1000,
        });
      } else {
        el.textContent = body.tex || "";
      }
    } else {
      el = document.createElement("div");
    }
    el.setAttribute("data-id", String(node.id));
    el.setAttribute("data-start", String(node.source_line));
    el.setAttribute("data-end", String(node.end_line));
    el.setAttribute("data-depth", String(depth));
    return el;
  }

  function renderDiagram(host, source) {
    initMermaid();
    if (typeof mermaid === "undefined") {
      host.textContent = text("mermaidMissing", "Mermaid didn't load");
      return;
    }
    var id = "d" + Math.random().toString(36).slice(2);
    mermaid
      .render(id, source)
      .then(function (result) {
        clearRenderNode(id);
        var svg = result && result.svg ? result.svg : "";
        var node = filterSvg(svg);
        host.textContent = "";
        if (!node) {
          host.textContent = text("diagramFiltered", "Diagram was removed");
          return;
        }
        host.appendChild(document.importNode(node, true));
      })
      .catch(function (error) {
        clearRenderNode(id);
        showDiagramError(host, source, error);
      });
  }

  function replaceTree(message) {
    if (message.render_gen < appliedGen) {
      return;
    }
    appliedGen = message.render_gen;
    clearStaleMermaidNodes();
    root.textContent = "";
    (message.blocks || []).forEach(function (block) {
      root.appendChild(renderBlock(block, 0));
    });
    applyHighlight();
  }

  function applyHighlight() {
    var marked = root.querySelectorAll(".current-block");
    for (var i = 0; i < marked.length; i += 1) {
      marked[i].classList.remove("current-block");
    }
    if (currentId == null) {
      return;
    }
    var el = root.querySelector('[data-id="' + currentId + '"]');
    if (el) {
      el.classList.add("current-block");
    }
  }

  function scrollToBlock(message) {
    if (message.render_gen !== appliedGen) {
      return;
    }
    var el = root.querySelector('[data-id="' + message.id + '"]');
    if (!el) {
      return;
    }
    applying = true;
    var ratio = Math.max(0, Math.min(0.999999, Number(message.ratio) || 0));
    var top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + ratio * el.offsetHeight - 8);
    var release = function () {
      applying = false;
    };
    window.addEventListener("scrollend", release, { once: true });
    window.setTimeout(release, 80);
  }

  function reportVisible() {
    if (applying) {
      return;
    }
    var nodes = root.querySelectorAll("[data-id]");
    var chosen = null;
    var depth = -1;
    for (var i = 0; i < nodes.length; i += 1) {
      var rect = nodes[i].getBoundingClientRect();
      if (rect.top <= 8 && rect.bottom > 8) {
        var nodeDepth = Number(nodes[i].getAttribute("data-depth") || 0);
        if (nodeDepth >= depth) {
          chosen = nodes[i];
          depth = nodeDepth;
        }
      }
    }
    if (!chosen) {
      return;
    }
    var rect = chosen.getBoundingClientRect();
    var ratio = rect.height > 0 ? (8 - rect.top) / rect.height : 0;
    ratio = Math.max(0, Math.min(0.999999, ratio));
    window.parent.postMessage(
      {
        type: "visible",
        render_gen: appliedGen,
        id: Number(chosen.getAttribute("data-id")),
        ratio: ratio,
      },
      "*",
    );
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) {
      return;
    }
    var message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }
    if (message.type === "render") {
      replaceTree(message);
    } else if (message.type === "scrollTo") {
      scrollToBlock(message);
    } else if (message.type === "highlight") {
      currentId = message.id == null ? null : Number(message.id);
      applyHighlight();
    }
  });

  window.addEventListener(
    "scroll",
    function () {
      reportVisible();
    },
    { passive: true },
  );
  window.addEventListener("scrollend", function () {
    reportVisible();
  });

  window.RustmarkShell = {
    filterSvg: filterSvg,
    renderBlock: renderBlock,
    diagramFailure: diagramFailure,
  };
})();
