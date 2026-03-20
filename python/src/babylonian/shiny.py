from __future__ import annotations

import json
from typing import Any, Optional

from .core import BabylonHTMLWidget, BabylonScene, _scene_from_object


def _require_shiny():
    try:
        from shiny import ui
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise ImportError(
            "Shiny for Python support requires `shiny`. Install it with `pip install shiny`."
        ) from exc
    return ui


def _coerce_scene(
    x: Any,
    *,
    color: Optional[str],
    alpha: Optional[float],
    axes: bool,
    nticks: int,
    add: bool,
) -> BabylonScene:
    if isinstance(x, BabylonScene):
        return x.clone()
    return _scene_from_object(
        x,
        color=color,
        alpha=alpha,
        axes=axes,
        nticks=nticks,
        add=add,
        wireframe=False,
    )


def _relay_script(output_id: str, widget_id: str) -> str:
    return f"""
(function() {{
  var root = document.getElementById({json.dumps(output_id)});
  if (!root || root.dataset.babylonianRelayBound === "1") {{
    return;
  }}
  root.dataset.babylonianRelayBound = "1";

  function pushValue(name, value) {{
    if (typeof window.Shiny === "undefined" || !window.Shiny) {{
      return;
    }}
    if (typeof window.Shiny.setInputValue === "function") {{
      window.Shiny.setInputValue(name, value, {{ priority: "event" }});
      return;
    }}
    if (typeof window.Shiny.onInputChange === "function") {{
      window.Shiny.onInputChange(name, value);
    }}
  }}

  window.addEventListener("message", function(event) {{
    var data = event.data;
    if (!data || data.source !== "babylonian" || data.widgetId !== {json.dumps(widget_id)}) {{
      return;
    }}
    pushValue({json.dumps(output_id)} + "_" + data.event, data.value);
  }});
}})();
"""


def shiny_scene3d(
    output_id: str,
    x: Any,
    *,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    add: bool = False,
    width: int = 900,
    height: int = 700,
) -> Any:
    ui = _require_shiny()
    scene = _coerce_scene(
        x,
        color=color,
        alpha=alpha,
        axes=axes,
        nticks=nticks,
        add=add,
    )
    widget = BabylonHTMLWidget(scene=scene, width=width, height=height)
    return ui.div(
        ui.HTML(widget._repr_html_()),
        ui.tags.script(_relay_script(output_id, widget.element_id)),
        id=output_id,
        style="width: 100%;",
    )


def scene_input_name(output_id: str, event: str) -> str:
    return f"{output_id}_{event}"


def scene_input_value(input: Any, output_id: str, event: str, default: Any = None) -> Any:
    accessor = getattr(input, scene_input_name(output_id, event), None)
    if accessor is None or not callable(accessor):
        return default
    value = accessor()
    if value is None:
        return default
    return value
