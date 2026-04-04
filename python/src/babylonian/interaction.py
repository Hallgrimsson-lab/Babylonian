from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional

from .core import (
    _CURRENT_SCENE,
    _display_in_notebook,
    _scene_from_object,
    anywidget,
    BabylonWidget,
    render_scene3d,
    Scene,
)

_LAST_SCENE_STATE: Optional[dict[str, Any]] = None
_ACTIVE_EDITOR: Optional[Any] = None


def _scene_state_from_scene(scene: Scene) -> dict[str, Any]:
    payload = scene.to_payload()
    return {
        "view": deepcopy(payload.get("scene", {}).get("view")),
        "postprocess": deepcopy(payload.get("scene", {}).get("postprocess")),
        "scale_bar": deepcopy(payload.get("scene", {}).get("scale_bar")),
        "clipping": deepcopy(payload.get("scene", {}).get("clipping")),
        "objects": [],
        "removed_objects": [],
    }


def _is_full_payload(state: dict[str, Any]) -> bool:
    return "objects" in state and isinstance(state.get("objects"), list) and (
        "scene" in state or "schema" in state
    )


def _is_par3d(state: dict[str, Any]) -> bool:
    return "camera" in state and isinstance(state.get("camera"), dict)


def _normalize_state(state: dict[str, Any]) -> dict[str, Any]:
    if _is_par3d(state):
        return {
            "view": deepcopy(state),
            "postprocess": None,
            "scale_bar": None,
            "clipping": None,
            "objects": [],
            "removed_objects": [],
        }
    if _is_full_payload(state):
        scene_block = state.get("scene") or {}
        return {
            "view": deepcopy(scene_block.get("view")),
            "postprocess": deepcopy(scene_block.get("postprocess")),
            "scale_bar": deepcopy(scene_block.get("scale_bar")),
            "clipping": deepcopy(scene_block.get("clipping")),
            "objects": [],
            "removed_objects": [],
        }
    return {
        "view": deepcopy(state.get("view")),
        "postprocess": deepcopy(state.get("postprocess")),
        "scale_bar": deepcopy(state.get("scale_bar")),
        "clipping": deepcopy(state.get("clipping")),
        "objects": deepcopy(state.get("objects") or []),
        "removed_objects": deepcopy(state.get("removed_objects") or []),
    }


def _observe_widget_state(widget: Any) -> Any:
    global _ACTIVE_EDITOR, _LAST_SCENE_STATE
    if hasattr(widget, "observe") and hasattr(widget, "scene_state"):
        def _on_state_change(change: dict[str, Any]) -> None:
            global _LAST_SCENE_STATE
            msg = change.get("new") or {}
            raw = msg.get("value")
            if raw and isinstance(raw, dict):
                _LAST_SCENE_STATE = _normalize_state(raw)

        widget.observe(_on_state_change, names=["scene_state"])
        _ACTIVE_EDITOR = widget
    return widget


def _coerce_scene(
    x: Any,
    *,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    **kwargs: Any,
) -> Scene:
    if isinstance(x, Scene):
        return x.clone()
    if hasattr(x, "scene") and isinstance(getattr(x, "scene", None), Scene):
        return x.scene.clone()
    if hasattr(x, "scene_payload") and isinstance(getattr(x, "scene_payload", None), dict):
        payload = x.scene_payload
        return Scene(
            objects=payload.get("objects", []),
            scene=payload.get("scene", {}),
            interaction=payload.get("interaction"),
        )
    return _scene_from_object(
        x,
        color=color,
        alpha=alpha,
        axes=axes,
        nticks=nticks,
        add=False,
        wireframe=kwargs.get("wireframe", False),
    )


def create_pose_3d(
    x: Any,
    *,
    width: int = 900,
    height: int = 700,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    **kwargs: Any,
) -> BabylonWidget:
    scene = _coerce_scene(
        x, color=color, alpha=alpha, axes=axes, nticks=nticks, **kwargs
    )
    scene.interaction = {"mode": "pose_3d"}
    scene.scene.pop("view", None)
    widget = render_scene3d(scene, width=width, height=height, renderer="anywidget")
    _display_in_notebook(widget)
    return _observe_widget_state(widget)


def edit_scene3d(
    x: Any,
    *,
    width: Optional[int] = None,
    height: Optional[int] = None,
    renderer: Optional[str] = None,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    **kwargs: Any,
) -> Any:
    global _LAST_SCENE_STATE

    scene = _coerce_scene(
        x, color=color, alpha=alpha, axes=axes, nticks=nticks, **kwargs
    )
    scene.interaction = {"mode": "edit_scene3d"}
    _LAST_SCENE_STATE = _scene_state_from_scene(scene)

    w = int(width) if width is not None else 1100
    h = int(height) if height is not None else 800
    if renderer is None:
        renderer = "anywidget" if anywidget is not None else "iframe"

    widget = render_scene3d(scene, width=w, height=h, renderer=renderer)
    _display_in_notebook(widget)
    return _observe_widget_state(widget)


def last_scene_state() -> Optional[dict[str, Any]]:
    global _LAST_SCENE_STATE
    if _ACTIVE_EDITOR is not None and hasattr(_ACTIVE_EDITOR, "scene_state"):
        msg = _ACTIVE_EDITOR.scene_state or {}
        raw = msg.get("value")
        if raw and isinstance(raw, dict):
            _LAST_SCENE_STATE = _normalize_state(raw)
    return deepcopy(_LAST_SCENE_STATE) if _LAST_SCENE_STATE is not None else None


def apply_scene_state(
    scene: Optional[Any] = None,
    *,
    state: Optional[dict[str, Any]] = None,
    **kwargs: Any,
) -> Scene:
    if state is None:
        state = last_scene_state()
    if state is None:
        raise ValueError("No scene state available. Call edit_scene3d() first, or pass state=.")

    if scene is None:
        scene = _CURRENT_SCENE
    if scene is None:
        raise ValueError("No active scene. Pass scene=, or build a scene first.")

    result = _coerce_scene(scene, **kwargs)
    norm = _normalize_state(state)

    if norm.get("view") is not None:
        current_view = deepcopy(result.scene.get("view", {}))
        current_view.update(norm["view"])
        result.scene["view"] = current_view

    for key in ("postprocess", "scale_bar", "clipping"):
        if norm.get(key) is not None:
            result.scene[key] = deepcopy(norm[key])

    removed_indices = {
        int(entry["index"]) - 1
        for entry in (norm.get("removed_objects") or [])
        if "index" in entry
    }
    objects = list(result.objects)
    for idx in sorted(removed_indices, reverse=True):
        if 0 <= idx < len(objects):
            objects.pop(idx)
    result.objects = objects

    for edit in norm.get("objects") or []:
        idx = edit.get("index")
        if idx is None:
            continue
        try:
            idx = int(idx) - 1
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(result.objects):
            obj = deepcopy(result.objects[idx])
            obj.update({k: deepcopy(v) for k, v in edit.items() if k != "index"})
            result.objects[idx] = obj

    return result


def retrieve_scene_state() -> Optional[dict[str, Any]]:
    return last_scene_state()


def _make_edit_widget(scene: Scene, *, width: int, height: int) -> Any:
    return edit_scene3d(scene, width=width, height=height)
