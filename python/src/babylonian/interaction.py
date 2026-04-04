"""
Python port of R's edit_scene3d(), last_scene_state(), and apply_scene_state().

State capture works through two complementary channels:

1. **anywidget** (preferred): The BabylonWidget anywidget listens for the
   ``babylonian-host-event`` custom DOM event emitted by the Babylon JS renderer
   and syncs the payload back to Python via the ``scene_state`` traitlet.
   last_scene_state() reads from the active widget's traitlet so the state is
   always current without any polling.

2. **iframe fallback**: When anywidget is not available, edit_scene3d() falls
   back to the iframe renderer. The iframe posts ``scene_state`` messages to
   its parent window via postMessage. State capture then requires a manual call
   to retrieve_scene_state() or direct inspection of window._bab_last_state
   from the browser's developer console.

The scene_state payload emitted by the Python JS renderer is the full scene
payload with an updated ``scene.view`` field (camera position, zoom, bg).  The
R-style diff format {view, objects, removed_objects, ...} is also accepted by
apply_scene_state() for interoperability.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional

from .core import Scene, render_scene3d

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_LAST_SCENE_STATE: Optional[dict] = None
_ACTIVE_EDITOR: Optional[Any] = None   # BabylonWidget instance (anywidget)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _scene_state_from_scene(scene: Scene) -> dict:
    """Build an initial scene state from a Scene (mirrors R's scene_state_from_widget)."""
    payload = scene.to_payload()
    view = payload.get("scene", {}).get("view", {})
    return {
        "view": deepcopy(view),
        "postprocess": deepcopy(payload.get("scene", {}).get("postprocess")),
        "scale_bar": deepcopy(payload.get("scene", {}).get("scale_bar")),
        "clipping": deepcopy(payload.get("scene", {}).get("clipping")),
        "objects": [],
        "removed_objects": [],
    }


def _is_full_payload(state: dict) -> bool:
    """Return True if *state* is a full scene payload rather than an R-style diff."""
    return "objects" in state and isinstance(state.get("objects"), list) and (
        "scene" in state or "schema" in state
    )


def _is_par3d(state: dict) -> bool:
    """Return True if *state* is a par3d payload from the JS renderer.

    par3d format: {zoom, bg, camera: {alpha, beta, radius, target}}
    """
    return "camera" in state and isinstance(state.get("camera"), dict)


def _normalize_state(state: dict) -> dict:
    """
    Normalise a state dict into the internal diff format.

    Accepts any of:
    - par3d payload       {zoom, bg, camera: {alpha, beta, radius, target}}
    - Full scene payload  {objects: [...], scene: {view: ...}, ...}
    - R-style diff        {view: {...}, objects: [...edit diffs...], removed_objects: [...], ...}
    """
    if _is_par3d(state):
        # The par3d payload from the JS renderer IS the view.
        return {
            "view": deepcopy(state),
            "postprocess": None,
            "scale_bar": None,
            "clipping": None,
            "objects": [],
            "removed_objects": [],
        }
    if _is_full_payload(state):
        # Emitted by the Python iframe's currentSceneState()
        scene_block = state.get("scene") or {}
        return {
            "view": deepcopy(scene_block.get("view")),
            "postprocess": deepcopy(scene_block.get("postprocess")),
            "scale_bar": deepcopy(scene_block.get("scale_bar")),
            "clipping": deepcopy(scene_block.get("clipping")),
            # Full payload has the whole objects list, not diffs; treat as empty
            # diffs so apply_scene_state just applies the view update.
            "objects": [],
            "removed_objects": [],
        }
    # Already in diff format
    return {
        "view": deepcopy(state.get("view")),
        "postprocess": deepcopy(state.get("postprocess")),
        "scale_bar": deepcopy(state.get("scale_bar")),
        "clipping": deepcopy(state.get("clipping")),
        "objects": deepcopy(state.get("objects") or []),
        "removed_objects": deepcopy(state.get("removed_objects") or []),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def edit_scene3d(
    scene: Scene,
    *,
    width: int = 900,
    height: int = 600,
    renderer: str = "anywidget",
) -> Any:
    """
    Open the interactive 3D scene editor.

    Sets ``interaction = {"mode": "edit_scene3d"}`` on the scene and renders it.
    When displayed in Jupyter with anywidget installed, camera-pose changes are
    automatically relayed back to Python via the ``scene_state`` traitlet; call
    ``last_scene_state()`` in a subsequent cell to retrieve the current state.

    Parameters
    ----------
    scene:
        The :class:`~babylonian.Scene` to edit.
    width, height:
        Canvas dimensions in pixels.
    renderer:
        ``"anywidget"`` (default, enables two-way state sync) or ``"iframe"``
        (state capture is not automatic; use ``retrieve_scene_state()``).

    Returns
    -------
    A widget object with ``_repr_html_`` / ``_ipython_display_`` so Jupyter
    displays it inline.  When *renderer* is ``"anywidget"`` the returned object
    also has a ``scene_state`` traitlet you can ``observe``.
    """
    global _LAST_SCENE_STATE, _ACTIVE_EDITOR

    # Seed _LAST_SCENE_STATE with the initial scene so last_scene_state() always
    # returns something sensible even before the user interacts.
    _LAST_SCENE_STATE = _scene_state_from_scene(scene)

    edit_scene = scene.clone()
    edit_scene.interaction = {"mode": "edit_scene3d"}

    widget = render_scene3d(edit_scene, width=width, height=height, renderer=renderer)

    # Wire up automatic state capture when anywidget is available.
    if hasattr(widget, "observe") and hasattr(widget, "scene_state"):
        def _on_state_change(change: dict) -> None:
            global _LAST_SCENE_STATE
            msg = change.get("new") or {}
            raw = msg.get("value")
            if raw and isinstance(raw, dict):
                _LAST_SCENE_STATE = _normalize_state(raw)

        widget.observe(_on_state_change, names=["scene_state"])
        _ACTIVE_EDITOR = widget

    return widget


def last_scene_state() -> Optional[dict]:
    """
    Return the most recent scene state captured from the interactive editor.

    When the anywidget renderer is active the traitlet is polled immediately so
    the returned dict reflects the current camera pose.  Returns ``None`` if
    ``edit_scene3d()`` has not been called yet.

    The returned dict has keys: ``view``, ``objects``, ``removed_objects``,
    ``postprocess``, ``scale_bar``, ``clipping``.
    """
    global _LAST_SCENE_STATE, _ACTIVE_EDITOR

    # Pull the latest value from the active widget before returning.
    if _ACTIVE_EDITOR is not None and hasattr(_ACTIVE_EDITOR, "scene_state"):
        msg = _ACTIVE_EDITOR.scene_state or {}
        raw = msg.get("value")
        if raw and isinstance(raw, dict):
            _LAST_SCENE_STATE = _normalize_state(raw)

    return deepcopy(_LAST_SCENE_STATE) if _LAST_SCENE_STATE is not None else None


def apply_scene_state(
    scene: Optional[Scene] = None,
    *,
    state: Optional[dict] = None,
) -> Scene:
    """
    Apply a saved editor state to a scene and return the updated scene.

    Parameters
    ----------
    scene:
        The :class:`~babylonian.Scene` to update.  Defaults to the most
        recently rendered scene (``_CURRENT_SCENE``).
    state:
        A state dict from :func:`last_scene_state`.  Defaults to the last
        captured state.

    Returns
    -------
    A new :class:`~babylonian.Scene` with the state applied.

    Raises
    ------
    ValueError
        If no state or no scene is available.
    """
    from .core import _CURRENT_SCENE

    if state is None:
        state = last_scene_state()
    if state is None:
        raise ValueError(
            "No scene state available. Call edit_scene3d() first, or pass state=."
        )

    if scene is None:
        scene = _CURRENT_SCENE
    if scene is None:
        raise ValueError(
            "No active scene. Pass scene=, or build a scene with plot3d() / Scene() first."
        )

    norm = _normalize_state(state)
    result = scene.clone()

    # --- view -----------------------------------------------------------------
    if norm.get("view"):
        result.scene["view"] = deepcopy(norm["view"])

    # --- postprocess / scale_bar / clipping -----------------------------------
    for key in ("postprocess", "scale_bar", "clipping"):
        if norm.get(key) is not None:
            result.scene[key] = deepcopy(norm[key])

    # --- object edits (R-style diff) ------------------------------------------
    removed_indices = {
        int(entry["index"])
        for entry in (norm.get("removed_objects") or [])
        if "index" in entry
    }
    objects = list(result.objects)
    for idx in sorted(removed_indices, reverse=True):
        if 0 <= idx < len(objects):
            objects.pop(idx)
    result.objects = objects

    for edit in (norm.get("objects") or []):
        idx = edit.get("index")
        if idx is None:
            continue
        try:
            idx = int(idx)
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(result.objects):
            obj = deepcopy(result.objects[idx])
            obj.update({k: deepcopy(v) for k, v in edit.items() if k != "index"})
            result.objects[idx] = obj

    return result


def retrieve_scene_state() -> Optional[dict]:
    """
    Alias for :func:`last_scene_state`.

    Provided as a convenience alias that matches the mental model of
    "retrieve what the editor currently has" rather than "return the last
    captured snapshot."
    """
    return last_scene_state()
