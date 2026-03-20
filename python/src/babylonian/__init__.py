from .core import (
    BabylonScene,
    as_babylon_mesh,
    clear_scene3d,
    light3d,
    plot3d,
    render_scene3d,
    scene3d,
    shade3d,
    wireframe3d,
)

__all__ = [
    "BabylonScene",
    "as_babylon_mesh",
    "clear_scene3d",
    "light3d",
    "plot3d",
    "render_scene3d",
    "scene3d",
    "shade3d",
    "wireframe3d",
]

try:
    from .shiny import scene_input_name, scene_input_value, shiny_scene3d

    __all__.extend([
        "scene_input_name",
        "scene_input_value",
        "shiny_scene3d",
    ])
except ImportError:
    pass
