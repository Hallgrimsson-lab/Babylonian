from __future__ import annotations

import base64
from copy import deepcopy
import math
from pathlib import Path
import tempfile
from typing import Any, Optional

from .core import (
    _CURRENT_SCENE,
    _display_in_notebook,
    _scene_from_object,
    anywidget,
    BabylonWidget,
    render_scene3d,
    Scene,
    snapshot3d,
)

_LAST_SCENE_STATE: Optional[dict[str, Any]] = None
_ACTIVE_EDITOR: Optional[Any] = None


def _editable_mesh_primitive_types() -> set[str]:
    return {"sphere", "box", "plane", "cylinder", "cone", "mesh3d"}


def _coerce_transform_vector(
    value: Any,
    default: tuple[float, float, float],
) -> list[float]:
    if value is None:
        return list(default)
    if isinstance(value, (list, tuple)) and len(value) == 3:
        try:
            vector = [float(component) for component in value]
        except (TypeError, ValueError):
            return list(default)
        if all(math.isfinite(component) for component in vector):
            return vector
    return list(default)


def _normalize_morph_target_state(target: Any) -> dict[str, Any]:
    if not isinstance(target, dict):
        return {"name": None, "influence": 0.0}

    influence = target.get("influence", 0)
    try:
        influence = float(influence)
    except (TypeError, ValueError):
        influence = 0.0
    if not math.isfinite(influence):
        influence = 0.0

    return {
        "name": target.get("name"),
        "influence": influence,
    }


def _seed_scene_state_entry(obj: Any, index: int) -> Optional[dict[str, Any]]:
    if not isinstance(obj, dict):
        return None

    primitive_type = obj.get("type")
    if not primitive_type:
        return None

    entry: dict[str, Any] = {
        "index": int(index),
        "primitive_type": primitive_type,
    }

    if obj.get("name") is not None:
        entry["name"] = obj.get("name")

    if primitive_type == "light3d":
        entry["node_type"] = "light"
        entry["light_type"] = obj.get("light_type", "hemispheric")
        if obj.get("position") is not None:
            entry["position"] = _coerce_transform_vector(obj.get("position"), (0.0, 0.0, 0.0))
        if obj.get("direction") is not None:
            entry["direction"] = _coerce_transform_vector(obj.get("direction"), (0.0, 0.0, 0.0))
        for key in (
            "intensity",
            "diffuse",
            "specular",
            "ground_color",
            "angle",
            "exponent",
            "range",
            "enabled",
            "shadow_enabled",
            "shadow_darkness",
        ):
            if obj.get(key) is not None:
                entry[key] = deepcopy(obj.get(key))
        return entry

    if primitive_type in _editable_mesh_primitive_types():
        entry["node_type"] = "mesh"
        entry["position"] = _coerce_transform_vector(obj.get("position"), (0.0, 0.0, 0.0))
        entry["rotation"] = _coerce_transform_vector(obj.get("rotation"), (0.0, 0.0, 0.0))
        entry["scaling"] = _coerce_transform_vector(obj.get("scaling"), (1.0, 1.0, 1.0))
        if obj.get("show_bounding_box") is not None:
            entry["show_bounding_box"] = bool(obj.get("show_bounding_box"))
        if obj.get("material") is not None:
            entry["material"] = deepcopy(obj.get("material"))
        if obj.get("morph_target") is not None:
            morph_targets = obj.get("morph_target")
            if isinstance(morph_targets, dict):
                morph_targets = [morph_targets]
            if isinstance(morph_targets, list):
                entry["morph_target"] = [
                    _normalize_morph_target_state(target) for target in morph_targets
                ]
        return entry

    return None


def _scene_state_from_scene(scene: Scene) -> dict[str, Any]:
    payload = scene.to_payload()
    return {
        "view": deepcopy(payload.get("scene", {}).get("view")),
        "postprocess": deepcopy(payload.get("scene", {}).get("postprocess")),
        "scale_bar": deepcopy(payload.get("scene", {}).get("scale_bar")),
        "clipping": deepcopy(payload.get("scene", {}).get("clipping")),
        "objects": [
            entry
            for idx, obj in enumerate(payload.get("objects", []), start=1)
            for entry in [_seed_scene_state_entry(obj, idx)]
            if entry is not None
        ],
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
    normalized: dict[str, Any] = {
        "view": deepcopy(state.get("view")),
        "postprocess": deepcopy(state.get("postprocess")),
        "scale_bar": deepcopy(state.get("scale_bar")),
        "clipping": deepcopy(state.get("clipping")),
        "objects": deepcopy(state.get("objects") or []),
        "removed_objects": deepcopy(state.get("removed_objects") or []),
    }
    for key in ("selected", "gizmo_mode", "gizmos_visible"):
        if state.get(key) is not None:
            normalized[key] = state[key]
    return normalized


def _coerce_state_index(value: Any) -> Optional[int]:
    try:
        index = int(value)
    except (TypeError, ValueError):
        return None
    return index if index >= 1 else None


def _locate_scene_state_object(
    objects: list[dict[str, Any]],
    entry: dict[str, Any],
) -> Optional[int]:
    name = entry.get("name")
    if name is not None:
        matches = [
            idx for idx, obj in enumerate(objects)
            if isinstance(obj, dict) and obj.get("name") == name
        ]
        if len(matches) == 1:
            return matches[0]

    index = _coerce_state_index(entry.get("index"))
    if index is not None and 1 <= index <= len(objects):
        return index - 1

    return None


def _merge_morph_target_edits(
    existing: Any,
    edits: Any,
) -> Any:
    if not isinstance(existing, list) or not isinstance(edits, list):
        return deepcopy(existing)

    merged = deepcopy(existing)
    for edit_idx, edit in enumerate(edits):
        if not isinstance(edit, dict):
            continue

        target_idx: Optional[int] = None
        edit_name = edit.get("name")
        if edit_name is not None:
            matches = [
                idx for idx, target in enumerate(merged)
                if isinstance(target, dict) and target.get("name") == edit_name
            ]
            if len(matches) == 1:
                target_idx = matches[0]

        if target_idx is None and edit_idx < len(merged):
            target_idx = edit_idx

        if target_idx is None or target_idx >= len(merged):
            continue

        target = merged[target_idx]
        if not isinstance(target, dict):
            continue

        if edit.get("name") is not None:
            target["name"] = edit.get("name")
        if edit.get("influence") is not None:
            try:
                influence = float(edit.get("influence"))
            except (TypeError, ValueError):
                influence = 0.0
            if not math.isfinite(influence):
                influence = 0.0
            target["influence"] = influence

    return merged


def _apply_scene_state_entry(
    obj: dict[str, Any],
    entry: dict[str, Any],
) -> dict[str, Any]:
    updated = deepcopy(obj)

    for field, default in (
        ("position", (0.0, 0.0, 0.0)),
        ("rotation", (0.0, 0.0, 0.0)),
        ("scaling", (1.0, 1.0, 1.0)),
        ("direction", (0.0, 0.0, 0.0)),
    ):
        if entry.get(field) is not None:
            updated[field] = _coerce_transform_vector(entry.get(field), default)

    for field in (
        "intensity",
        "angle",
        "exponent",
        "range",
        "enabled",
        "light_type",
        "shadow_enabled",
        "shadow_darkness",
        "diffuse",
        "specular",
        "ground_color",
        "material",
    ):
        if entry.get(field) is not None:
            updated[field] = deepcopy(entry.get(field))

    if entry.get("show_bounding_box") is not None:
        updated["show_bounding_box"] = bool(entry.get("show_bounding_box"))

    if entry.get("morph_target") is not None and updated.get("morph_target") is not None:
        updated["morph_target"] = _merge_morph_target_edits(
            updated.get("morph_target"),
            entry.get("morph_target"),
        )

    return updated


def _create_scene_object_from_state(entry: dict[str, Any]) -> Optional[dict[str, Any]]:
    primitive_type = entry.get("primitive_type")
    node_type = entry.get("node_type")

    if primitive_type == "light3d" or node_type == "light":
        created: dict[str, Any] = {
            "type": "light3d",
            "light_type": entry.get("light_type", "hemispheric"),
        }
        for field in (
            "name",
            "position",
            "direction",
            "intensity",
            "diffuse",
            "specular",
            "ground_color",
            "angle",
            "exponent",
            "range",
            "enabled",
            "shadow_enabled",
            "shadow_darkness",
        ):
            if entry.get(field) is not None:
                created[field] = deepcopy(entry.get(field))
        return created

    return None


def _apply_scene_state_to_objects(
    objects: list[dict[str, Any]],
    edits: list[dict[str, Any]],
    removed: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    edited = [deepcopy(obj) for obj in objects]

    if removed:
        removal_order = sorted(
            removed,
            key=lambda entry: _coerce_state_index(entry.get("index")) or -1,
            reverse=True,
        )
        for entry in removal_order:
            idx = _locate_scene_state_object(edited, entry)
            if idx is not None:
                edited.pop(idx)

    for entry in edits:
        idx = _locate_scene_state_object(edited, entry)
        if idx is None:
            created = _create_scene_object_from_state(entry)
            if created is not None:
                edited.append(created)
            continue
        edited[idx] = _apply_scene_state_entry(edited[idx], entry)

    return edited


def _merge_scene_view(current_view: Any, next_view: Any) -> dict[str, Any]:
    merged = deepcopy(current_view) if isinstance(current_view, dict) else {}
    if not isinstance(next_view, dict):
        return merged

    merged.update(deepcopy(next_view))
    if next_view.get("camera") is not None:
        merged["camera"] = deepcopy(next_view.get("camera"))
    return merged


def _snapshot_request_payload(message: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(message, dict):
        return {}
    value = message.get("value")
    return value if isinstance(value, dict) else message


def _snapshot_request_path(request: dict[str, Any]) -> tuple[Path, str]:
    filename = str(request.get("filename") or "scene.png")
    path = Path(filename).expanduser()
    format_name = str(
        request.get("format") or path.suffix.lstrip(".") or "png"
    ).lower()
    if not path.suffix:
        path = path.with_suffix(f".{format_name}")
    extension = path.suffix.lstrip(".").lower() or format_name
    return path, extension


def _write_png_as_svg(png_bytes: bytes, out: Path, *, width: int, height: int) -> Path:
    encoded = base64.b64encode(png_bytes).decode("ascii")
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' "
        f"viewBox='0 0 {width} {height}'>"
        f"<image width='{width}' height='{height}' href='data:image/png;base64,{encoded}' />"
        "</svg>"
    )
    out.write_text(svg, encoding="utf-8")
    return out.resolve()


def _convert_png_snapshot(tmp_png: Path, out: Path, *, extension: str, width: int, height: int) -> Path:
    if extension == "png":
        out.write_bytes(tmp_png.read_bytes())
        return out.resolve()

    if extension == "svg":
        return _write_png_as_svg(tmp_png.read_bytes(), out, width=width, height=height)

    if extension in {"tif", "tiff"}:
        try:
            from PIL import Image
        except ImportError as err:
            raise RuntimeError(
                "Pillow is required to save TIFF snapshots from the scene editor."
            ) from err
        with Image.open(tmp_png) as image:
            image.save(out, format="TIFF")
        return out.resolve()

    raise RuntimeError(f"Unsupported snapshot format for `edit_scene3d()`: {extension}")


def _decode_data_url_png(data_url: str) -> bytes:
    if not isinstance(data_url, str) or "," not in data_url:
        raise RuntimeError("Snapshot request did not include valid image data.")
    _, _, b64 = data_url.partition(",")
    return base64.b64decode(b64)


def _handle_snapshot_request(widget: Any, message: dict[str, Any]) -> None:
    request = _snapshot_request_payload(message)
    if not request:
        return

    out, extension = _snapshot_request_path(request)
    out.parent.mkdir(parents=True, exist_ok=True)

    width = request.get("vwidth")
    height = request.get("vheight")
    image_data = request.get("image_data")

    try:
        if image_data:
            png_bytes = _decode_data_url_png(image_data)
            if extension == "png":
                out.write_bytes(png_bytes)
                saved = out.resolve()
            else:
                with tempfile.TemporaryDirectory(prefix="babylonian-editor-snapshot-") as tmpdir:
                    tmp_png = Path(tmpdir) / "scene.png"
                    tmp_png.write_bytes(png_bytes)
                    saved = _convert_png_snapshot(
                        tmp_png,
                        out,
                        extension=extension,
                        width=int(width or getattr(widget, "width", 900) or 900),
                        height=int(height or getattr(widget, "height", 700) or 700),
                    )
        elif extension == "png":
            saved = snapshot3d(
                out,
                widget=widget,
                timeout=20,
                vwidth=width,
                vheight=height,
            )
        else:
            with tempfile.TemporaryDirectory(prefix="babylonian-editor-snapshot-") as tmpdir:
                tmp_png = Path(tmpdir) / "scene.png"
                snapshot3d(
                    tmp_png,
                    widget=widget,
                    timeout=20,
                    vwidth=width,
                    vheight=height,
                )
                saved = _convert_png_snapshot(
                    tmp_png,
                    out,
                    extension=extension,
                    width=int(width or getattr(widget, "width", 900) or 900),
                    height=int(height or getattr(widget, "height", 700) or 700),
                )
        print(f"Saved snapshot to {saved}")
    except Exception as err:
        print(f"Snapshot save failed: {err}")


def _observe_widget_state(widget: Any) -> Any:
    global _ACTIVE_EDITOR, _LAST_SCENE_STATE
    if hasattr(widget, "observe") and hasattr(widget, "scene_state"):
        def _merge_par3d_into_last_state() -> None:
            global _LAST_SCENE_STATE
            if not hasattr(widget, "par3d_state"):
                return
            msg = widget.par3d_state or {}
            raw = msg.get("value")
            if not (raw and isinstance(raw, dict)):
                return
            if _LAST_SCENE_STATE is None:
                _LAST_SCENE_STATE = _normalize_state(raw)
                return
            _LAST_SCENE_STATE["view"] = deepcopy(raw)

        def _on_state_change(change: dict[str, Any]) -> None:
            global _LAST_SCENE_STATE
            msg = change.get("new") or {}
            raw = msg.get("value")
            if raw and isinstance(raw, dict):
                _LAST_SCENE_STATE = _normalize_state(raw)
                _merge_par3d_into_last_state()

        widget.observe(_on_state_change, names=["scene_state"])
        if hasattr(widget, "par3d_state"):
            def _on_par3d_change(change: dict[str, Any]) -> None:
                _merge_par3d_into_last_state()

            widget.observe(_on_par3d_change, names=["par3d_state"])
        if hasattr(widget, "snapshot_request"):
            def _on_snapshot_request(change: dict[str, Any]) -> None:
                msg = change.get("new") or {}
                ts = msg.get("ts")
                if ts is not None and getattr(widget, "_babylonian_last_snapshot_ts", None) == ts:
                    return
                widget._babylonian_last_snapshot_ts = ts
                _handle_snapshot_request(widget, msg)

            widget.observe(_on_snapshot_request, names=["snapshot_request"])
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
            if hasattr(_ACTIVE_EDITOR, "par3d_state"):
                par3d_msg = _ACTIVE_EDITOR.par3d_state or {}
                par3d_raw = par3d_msg.get("value")
                if par3d_raw and isinstance(par3d_raw, dict):
                    _LAST_SCENE_STATE["view"] = deepcopy(par3d_raw)
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
        result.scene["view"] = _merge_scene_view(result.scene.get("view", {}), norm["view"])

    for key in ("postprocess", "scale_bar", "clipping"):
        if norm.get(key) is not None:
            result.scene[key] = deepcopy(norm[key])

    result.objects = _apply_scene_state_to_objects(
        list(result.objects),
        norm.get("objects") or [],
        norm.get("removed_objects") or [],
    )

    return result


def retrieve_scene_state() -> Optional[dict[str, Any]]:
    return last_scene_state()


def _make_edit_widget(scene: Scene, *, width: int, height: int) -> Any:
    return edit_scene3d(scene, width=width, height=height)
