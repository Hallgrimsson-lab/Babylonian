from .core import (
    BabylonScene,
    Scene,
    apply_scene_state,
    as_babylon_mesh,
    clear_scene3d,
    edit_scene3d,
    last_scene_state,
    light3d,
    plot3d,
    render_scene3d,
    scene3d,
    shade3d,
    wireframe3d,
)

__all__ = [
    "BabylonScene",
    "Scene",
    "apply_scene_state",
    "as_babylon_mesh",
    "clear_scene3d",
    "edit_scene3d",
    "last_scene_state",
    "light3d",
    "plot3d",
    "render_scene3d",
    "scene3d",
    "shade3d",
    "wireframe3d",
]

try:
    from .interaction import EditSceneHTMLWidget, EditSceneWidget

    __all__.extend([
        "EditSceneHTMLWidget",
        "EditSceneWidget",
    ])
except ImportError:  # pragma: no cover
    pass

try:
    from .shiny import scene_input_name, scene_input_value, shiny_scene3d

    __all__.extend([
        "scene_input_name",
        "scene_input_value",
        "shiny_scene3d",
    ])
except ImportError:
    pass
