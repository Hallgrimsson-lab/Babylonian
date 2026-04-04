/**
 * edit_widget.js — anywidget ESM for the Babylonian scene editor.
 *
 * Strategy
 * --------
 * The full scene-editor UI (BabylonJS gizmos, material panel, morph sliders,
 * etc.) lives in inst/htmlwidgets/babylon.js and uses the HTMLWidgets factory
 * pattern.  Rather than porting that code to a new ES module we embed it
 * inside a sandboxed <iframe> whose HTML is built from a Blob URL.  The iframe
 * communicates back to the host page (and therefore to Python) through
 * window.postMessage.  This ESM intercepts those messages and writes the
 * serialised scene_state / par3d_state strings to the anywidget model, making
 * them available as Python traitlets.
 *
 * The full babylon.js content is passed from Python via the
 * `babylon_js_content` traitlet so the iframe has access to the rich editor
 * without needing any server.
 */

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

/**
 * Build the standalone HTML document that goes inside the iframe.
 *
 * @param {string}  babylonJsContent  Full text of inst/htmlwidgets/babylon.js
 * @param {object}  payload           Scene payload (serialisable to JSON)
 * @param {string}  elementId         Widget element id
 * @param {number}  width
 * @param {number}  height
 * @returns {string} Complete HTML document
 */
function buildEditorHtml(babylonJsContent, payload, elementId, width, height) {
  const payloadJson = JSON.stringify(payload);
  const idJson = JSON.stringify(elementId);

  // Minimal HTMLWidgets shim – provides only what babylon.js needs:
  //   • HTMLWidgets.widget()   – registers the factory
  //   • HTMLWidgets.shinyMode  – used to guard Shiny.setInputValue calls
  const htmlwidgetsShim = `
(function() {
  window.HTMLWidgets = {
    shinyMode: false,
    widgets: {},
    widget: function(def) { this.widgets[def.name] = def; },
    find:    function(sel) { return document.querySelector(sel); },
    findAll: function(sel) { return Array.from(document.querySelectorAll(sel)); }
  };
})();
`;

  // Initialisation script – waits until BABYLON and the widget factory are
  // both available, then creates the widget and calls renderValue().
  const initScript = `
(function() {
  var payload    = ${payloadJson};
  var elementId  = ${idJson};
  var width      = ${width};
  var height     = ${height};

  function tryInit() {
    if (
      typeof window.BABYLON === "undefined" ||
      !window.HTMLWidgets ||
      !window.HTMLWidgets.widgets ||
      !window.HTMLWidgets.widgets.babylon
    ) {
      setTimeout(tryInit, 80);
      return;
    }

    var el = document.getElementById(elementId);
    if (!el) {
      setTimeout(tryInit, 80);
      return;
    }

    var def      = window.HTMLWidgets.widgets.babylon;
    var instance = def.factory(el, width, height);

    // renderValue signature: (x, sizing)  — pass the payload as both.
    instance.renderValue(payload, payload);
  }

  tryInit();
})();
`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Babylonian Scene Editor</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fafafa;
    }
    #editor-root {
      width: ${width}px;
      height: ${height}px;
      position: relative;
    }
  </style>
</head>
<body>
  <div id="${elementId}" style="width:${width}px; height:${height}px; position:relative;"></div>
  <script src="https://cdn.babylonjs.com/babylon.js"></script>
  <script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
  <script>${htmlwidgetsShim}</script>
  <script>${babylonJsContent}</script>
  <script>${initScript}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// anywidget render function
// ---------------------------------------------------------------------------

export default function () {
  return {
    render({ model, el }) {
      // ----------------------------------------------------------------
      // Build iframe
      // ----------------------------------------------------------------
      function rebuild() {
        // Clear previous content
        while (el.firstChild) el.removeChild(el.firstChild);
        if (iframeUrl) {
          URL.revokeObjectURL(iframeUrl);
          iframeUrl = null;
        }

        const babylonJsContent = model.get("babylon_js_content") || "";
        const payload          = model.get("scene_payload")     || {};
        const width            = model.get("width")             || 1100;
        const height           = model.get("height")            || 800;
        const elementId        = model.get("element_id")        || "babylonian-edit";

        const html  = buildEditorHtml(babylonJsContent, payload, elementId, width, height);
        const blob  = new Blob([html], { type: "text/html" });
        iframeUrl   = URL.createObjectURL(blob);

        const iframe = document.createElement("iframe");
        iframe.src    = iframeUrl;
        iframe.style.width  = width  + "px";
        iframe.style.height = height + "px";
        iframe.style.border = "0";
        iframe.style.display = "block";
        // allow-scripts is sufficient; postMessage works cross-origin.
        // allow-same-origin is NOT set intentionally to avoid privilege
        // escalation while still allowing postMessage to the parent.
        iframe.sandbox = "allow-scripts";
        el.appendChild(iframe);
      }

      let iframeUrl = null;

      // ----------------------------------------------------------------
      // Message relay  iframe → model traitlets
      // ----------------------------------------------------------------
      function onMessage(event) {
        var data = event.data;
        if (!data || data.source !== "babylonian") return;
        if (data.widgetId && data.widgetId !== model.get("element_id")) return;

        if (data.event === "scene_state") {
          var value = typeof data.value === "string"
            ? data.value
            : JSON.stringify(data.value);
          model.set("scene_state", value);
          model.save_changes();
        }

        if (data.event === "par3d") {
          var parValue = typeof data.value === "string"
            ? data.value
            : JSON.stringify(data.value);
          model.set("par3d_state", parValue);
          model.save_changes();
        }
      }

      window.addEventListener("message", onMessage);

      // ----------------------------------------------------------------
      // Initial render & change handlers
      // ----------------------------------------------------------------
      rebuild();

      const redraw = () => rebuild();
      model.on("change:scene_payload",     redraw);
      model.on("change:babylon_js_content", redraw);
      model.on("change:width",             redraw);
      model.on("change:height",            redraw);

      // ----------------------------------------------------------------
      // Cleanup
      // ----------------------------------------------------------------
      return () => {
        window.removeEventListener("message", onMessage);
        model.off("change:scene_payload",     redraw);
        model.off("change:babylon_js_content", redraw);
        model.off("change:width",             redraw);
        model.off("change:height",            redraw);
        if (iframeUrl) {
          URL.revokeObjectURL(iframeUrl);
          iframeUrl = null;
        }
        while (el.firstChild) el.removeChild(el.firstChild);
      };
    },
  };
}
