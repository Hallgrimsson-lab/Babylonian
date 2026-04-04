from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional

from .core import Scene, _scene_from_object, render_scene3d, BabylonWidget


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
    """Create an interactive 3D pose widget.

    Returns an anywidget whose ``scene_state`` traitlet is continuously
    updated with the current camera pose.  Access the live state from
    Python with ``widget.scene_state`` or ``widget.get_scene()``.
    """
    scene = _coerce_scene(
        x, color=color, alpha=alpha, axes=axes, nticks=nticks, **kwargs
    )
    scene.interaction = {"mode": "pose_3d"}
    scene.scene.pop("view", None)
    return render_scene3d(scene, width=width, height=height, renderer="anywidget")


def edit_scene3d(
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
    """Open an interactive 3D scene editor.

    Returns an anywidget with the full scene editor enabled (gizmos,
    lights, materials, etc.).  The ``scene_state`` traitlet is
    continuously updated as the user edits.  Retrieve the result with
    ``widget.scene_state`` or ``widget.get_scene()``.
    """
    scene = _coerce_scene(
        x, color=color, alpha=alpha, axes=axes, nticks=nticks, **kwargs
    )
    scene.interaction = {"mode": "edit_scene3d"}
    return render_scene3d(scene, width=width, height=height, renderer="anywidget")
