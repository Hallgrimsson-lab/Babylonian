"""interaction.py — Interactive scene-editor widgets for Babylonian.

Provides :class:`EditSceneWidget` (anywidget-based, for Jupyter) and
:class:`EditSceneHTMLWidget` (standalone iframe, for scripts / Shiny).

Both classes wrap the full ``babylon.js`` scene editor (the same JS used by
the R package) inside an HTML page.  :class:`EditSceneWidget` additionally
exposes the live scene state as a Python-readable traitlet so callers can
read :attr:`EditSceneWidget.scene_state` at any time after interacting with
the browser editor.

Usage
-----
::

    import babylonian as bab

    scene = bab.Scene()
    scene.add_mesh(vertices, faces)

    # In a Jupyter notebook cell:
    editor = bab.edit_scene3d(scene)
    # … interact in the browser …
    updated = editor.apply_to(scene)       # apply edits back
    # or:
    updated = bab.apply_scene_state(scene) # uses last_scene_state()
"""

from __future__ import annotations

import base64
import json
from copy import deepcopy
from dataclasses import dataclass, field
from html import escape
from pathlib import Path
from typing import Any, Optional
import uuid

from .core import (
    BabylonHTMLWidget,
    Scene,
    _normalize_scene_state,
    _scene_state_from_scene,
    _set_last_scene_state,
    _standalone_document,
    last_scene_state,
)

try:
    import anywidget
    import traitlets
except ImportError:  # pragma: no cover
    anywidget = None
    traitlets = None


# ---------------------------------------------------------------------------
# Locate the full babylon.js editor bundle
# ---------------------------------------------------------------------------

def _find_babylon_editor_js() -> str:
    """Return the text of inst/htmlwidgets/babylon.js, or '' if not found.

    Searches in several likely locations so the code works in both
    development (monorepo) and installed-package layouts.
    """
    candidates = [
        # Development layout: python/ lives next to inst/
        Path(__file__).parents[4] / "inst" / "htmlwidgets" / "babylon.js",
        # Alternate dev layout
        Path(__file__).parents[3] / "inst" / "htmlwidgets" / "babylon.js",
        # Bundled alongside the Python package (populated by a build step)
        Path(__file__).with_name("babylon_editor.js"),
    ]
    for path in candidates:
        if path.is_file():
            return path.read_text(encoding="utf-8")
    return ""  # fallback: no full editor available


# ---------------------------------------------------------------------------
# Shared HTML builder
# ---------------------------------------------------------------------------

def _build_editor_document(
    scene: Scene,
    *,
    element_id: str,
    width: int,
    height: int,
    babylon_js_content: str,
) -> str:
    """Build a standalone HTML document containing the full scene editor.

    The document loads BabylonJS from CDN, then inlines *babylon_js_content*
    (the full inst/htmlwidgets/babylon.js text), provides a minimal
    HTMLWidgets shim, and bootstraps the widget with the scene payload.
    """
    payload_json = json.dumps(scene.to_payload())
    id_json      = json.dumps(element_id)

    htmlwidgets_shim = """
(function() {
  window.HTMLWidgets = {
    shinyMode: false,
    widgets:   {},
    widget:    function(def) { this.widgets[def.name] = def; },
    find:      function(sel) { return document.querySelector(sel); },
    findAll:   function(sel) { return Array.from(document.querySelectorAll(sel)); }
  };
})();
"""

    init_script = f"""
(function() {{
  var payload   = {payload_json};
  var elementId = {id_json};
  var width     = {width};
  var height    = {height};

  function tryInit() {{
    if (
      typeof window.BABYLON === "undefined" ||
      !window.HTMLWidgets ||
      !window.HTMLWidgets.widgets ||
      !window.HTMLWidgets.widgets.babylon
    ) {{
      setTimeout(tryInit, 80);
      return;
    }}

    var el = document.getElementById(elementId);
    if (!el) {{
      setTimeout(tryInit, 80);
      return;
    }}

    var def      = window.HTMLWidgets.widgets.babylon;
    var instance = def.factory(el, width, height);
    instance.renderValue(payload, payload);
  }}

  tryInit();
}})();
"""

    eid = escape(element_id)
    return (
        f"<!doctype html><html>\n"
        f"<head>\n"
        f"  <meta charset='utf-8'>\n"
        f"  <title>Babylonian Scene Editor</title>\n"
        f"  <style>\n"
        f"    html, body {{ margin:0; padding:0; width:100%; height:100%;"
        f" overflow:hidden; background:#fafafa; }}\n"
        f"  </style>\n"
        f"</head>\n"
        f"<body>\n"
        f"  <div id='{eid}'"
        f" style='width:{width}px; height:{height}px; position:relative;'></div>\n"
        f"  <script src='https://cdn.babylonjs.com/babylon.js'></script>\n"
        f"  <script src='https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js'></script>\n"
        f"  <script>{htmlwidgets_shim}</script>\n"
        f"  <script>{babylon_js_content}</script>\n"
        f"  <script>{init_script}</script>\n"
        f"</body></html>"
    )


# ---------------------------------------------------------------------------
# EditSceneHTMLWidget — standalone iframe widget (no anywidget dependency)
# ---------------------------------------------------------------------------

@dataclass
class EditSceneHTMLWidget:
    """Iframe-based scene editor widget.

    Works without anywidget.  Displays the full scene editor UI in a
    sandboxed iframe.  State cannot be round-tripped to Python automatically
    in this mode; use :func:`~babylonian.last_scene_state` after interacting.
    """

    scene: Scene
    width: int = 1100
    height: int = 800
    element_id: str = field(default_factory=lambda: f"babylonian-edit-{uuid.uuid4().hex}")

    def _build_document(self) -> str:
        babylon_js = _find_babylon_editor_js()
        return _build_editor_document(
            self.scene,
            element_id=self.element_id,
            width=self.width,
            height=self.height,
            babylon_js_content=babylon_js,
        )

    def _repr_html_(self) -> str:
        doc = self._build_document()
        encoded = base64.b64encode(doc.encode("utf-8")).decode("ascii")
        return (
            f"<iframe style='width:100%; max-width:{self.width}px;"
            f" aspect-ratio:{self.width} / {self.height};"
            f" height:auto; border:0; display:block;'"
            f" sandbox='allow-scripts'"
            f" src=\"data:text/html;base64,{encoded}\"></iframe>"
        )

    def _repr_mimebundle_(self, include=None, exclude=None) -> dict[str, Any]:
        return {"text/html": self._repr_html_()}

    def _ipython_display_(self) -> None:
        from IPython.display import HTML, display  # type: ignore[import]
        display(HTML(self._repr_html_()))

    def save_html(self, path: "str | Path") -> Path:
        path = Path(path)
        path.write_text(self._build_document(), encoding="utf-8")
        return path

    def get_scene_state(self) -> Optional[dict[str, Any]]:
        """Return the last known scene state (from :func:`last_scene_state`)."""
        return last_scene_state()

    def apply_to(self, scene: Scene) -> Scene:
        """Apply the last captured state to *scene* and return the result."""
        from .core import apply_scene_state  # noqa: PLC0415
        return apply_scene_state(scene)


# ---------------------------------------------------------------------------
# EditSceneWidget — anywidget version with live Python↔JS traitlet sync
# ---------------------------------------------------------------------------

if anywidget is not None and traitlets is not None:
    class EditSceneWidget(anywidget.AnyWidget):
        """Anywidget-based scene editor with live Python traitlet sync.

        After interacting with the scene editor in the browser, read
        :attr:`scene_state` (a JSON string) or call :meth:`get_scene_state`
        (returns a parsed dict) to retrieve the captured edits.

        The state is also automatically reflected in
        :func:`~babylonian.last_scene_state` via the internal observe hook.
        """

        _esm = Path(__file__).with_name("edit_widget.js")

        # Inputs (Python → JS)
        scene_payload      = traitlets.Dict().tag(sync=True)
        babylon_js_content = traitlets.Unicode("").tag(sync=True)
        width              = traitlets.Int(1100).tag(sync=True)
        height             = traitlets.Int(800).tag(sync=True)
        element_id         = traitlets.Unicode("").tag(sync=True)

        # Outputs (JS → Python, updated as the user edits)
        scene_state = traitlets.Unicode("").tag(sync=True)
        par3d_state = traitlets.Unicode("").tag(sync=True)

        def __init__(
            self,
            scene: Scene,
            width: int = 1100,
            height: int = 800,
        ) -> None:
            super().__init__()
            self._scene            = scene
            self.scene_payload     = scene.to_payload()
            self.width             = int(width)
            self.height            = int(height)
            self.element_id        = f"babylonian-edit-{uuid.uuid4().hex}"
            self.babylon_js_content = _find_babylon_editor_js()

            # Mirror scene_state updates into the global last_scene_state store
            self.observe(self._on_scene_state_change, names=["scene_state"])

        # ------------------------------------------------------------------
        def _on_scene_state_change(self, change: dict[str, Any]) -> None:
            raw = change.get("new", "")
            if not raw:
                return
            try:
                state = json.loads(raw)
                _set_last_scene_state(state)
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        # ------------------------------------------------------------------
        def get_scene_state(self) -> Optional[dict[str, Any]]:
            """Return the current scene state as a parsed dict, or None."""
            raw = self.scene_state
            if raw:
                try:
                    return _normalize_scene_state(json.loads(raw))
                except (json.JSONDecodeError, ValueError, TypeError):
                    pass
            return last_scene_state()

        def apply_to(self, scene: Scene) -> Scene:
            """Apply the current editor state to *scene* and return the result."""
            from .core import apply_scene_state  # noqa: PLC0415
            return apply_scene_state(scene, state=self.get_scene_state())

        def save_html(self, path: "str | Path") -> Path:
            """Save the scene editor as a standalone HTML file."""
            html_widget = EditSceneHTMLWidget(
                scene=self._scene,
                width=self.width,
                height=self.height,
                element_id=self.element_id,
            )
            return html_widget.save_html(path)

else:
    # Anywidget is not installed — alias to the HTML fallback so that code
    # importing EditSceneWidget always gets something useful.
    EditSceneWidget = EditSceneHTMLWidget  # type: ignore[assignment,misc]


# ---------------------------------------------------------------------------
# Factory used by core.edit_scene3d
# ---------------------------------------------------------------------------

def _make_edit_widget(
    scene: Scene,
    *,
    width: int,
    height: int,
) -> "EditSceneWidget | EditSceneHTMLWidget":
    """Return the best available interactive editor widget for *scene*."""
    if anywidget is not None and traitlets is not None:
        return EditSceneWidget(scene=scene, width=width, height=height)
    return EditSceneHTMLWidget(scene=scene, width=width, height=height)
