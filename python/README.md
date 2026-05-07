# Babylonian Python Adapter

This directory contains the Python package for Babylonian.

The intended Python experience is the fluent `Scene` builder API. R-style parity
helpers are still valuable, but mainly as compatibility tools and as a way to
exercise the shared renderer and payload model from Python.

## Install

```bash
pip install -e ./python
pip install anywidget traitlets
pip install trimesh
pip install shiny
```

## Quick Start

```python
import trimesh
from babylonian import Scene, as_babylon_mesh, pbr_material3d, plot3d, texture3d

mesh = trimesh.load("specimen.obj", force="mesh")
plot3d(mesh, color="#d97706")

scene = Scene()
scene.add(as_babylon_mesh(mesh, color="#d97706"))
scene.show()

scene = (
    Scene()
    .with_material(
        "bronze",
        pbr_material3d(base_color="#cd7f32", metallic=0.6, roughness=0.4)
    )
    .add_mesh(mesh, color="#d97706")
    .add_mesh(mesh, material="bronze")
    .add_light(type="point", position=[1, 2, 3], intensity=0.8)
    .add_lighting_preset("three_point")
    .add_points([[0, 0, 0], [1, 1, 1]], color=["#e11d48", "#0ea5e9"], size=0.05)
    .add_text([[0, 0, 0], [1, 1, 1]], texts=["A", "B"])
    .with_background("#f8fafc")
    .with_camera(alpha=-0.6, beta=1.1, radius=7)
    .with_title("Specimen")
    .with_scale_bar(10, units="mm")
    .with_depth_of_field(focus_distance=80, blur_level="medium")
)
scene.show()

scene.snapshot("specimen.png")
editor = scene.edit(width=1100, height=800)
pose = scene.pose(width=900, height=700)
```

`plot3d()` returns a notebook-friendly widget object with `_repr_html_()`, so it renders inline in Jupyter.

Babylonian currently has two Python render surfaces:

- `renderer="anywidget"`: the first-class interactive Python path. Use this for editing, pose capture, morph targets, and the fullest feature coverage.
- `renderer="iframe"`: a portable viewer/export path. It is useful for simple notebook display and standalone HTML, but it is not expected to maintain full interactive parity with the anywidget/editor path.

`plot3d()` still defaults to the iframe-backed HTML path for broad notebook portability, but the recommended Python experience for richer scenes is:

```python
plot3d(mesh, color="#d97706", renderer="anywidget")
```

The same recommendation applies to `Scene.show()` whenever you are using advanced materials, editor workflows, or morph targets.

## Morph Targets

Morph targets are supported on the anywidget/editor path and can be built fluently from `Scene`:

```python
from babylonian import Scene

base = {
    "vertices": [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    "faces": [[0, 1, 2]],
}

target = {
    "vertices": [[0, 0, 1], [1, 0, 1], [0, 1, 1]],
    "faces": [[0, 1, 2]],
}

scene = (
    Scene()
    .add_mesh(**base, name="triangle")
    .add_morph_target(target, target="triangle", influence=0.5, name="raise")
)

scene.show(renderer="anywidget")
scene.edit(renderer="anywidget")
```

If you need a portable HTML export, `save_html()` and `renderer="iframe"` remain available, but morph-target deformation should currently be treated as an anywidget-first feature rather than a guaranteed iframe feature.

## Shiny For Python

There is now a first Shiny for Python host adapter that uses the same scene payloads and a browser-message relay for scene events:

```python
from shiny import App, render, ui
import trimesh

from babylonian import scene_input_value, shiny_scene3d

mesh = trimesh.load("specimen.obj", force="mesh")

app_ui = ui.page_fluid(
    shiny_scene3d("specimen_scene", mesh, color="#d97706"),
    ui.output_text_verbatim("camera_state"),
)

def server(input, output, session):
    @output
    @render.text
    def camera_state():
        return str(scene_input_value(input, "specimen_scene", "par3d", default={}))

app = App(app_ui, server)
```

Save that as `app.py` and run it from a terminal:

```bash
shiny run --reload app.py
```

Running `app.run()` directly inside a Jupyter or VS Code notebook usually fails with `asyncio.run() cannot be called from a running event loop`, because the notebook already owns the event loop.

This is still an evolving port:

- the scene renders inside a Shiny for Python app
- camera/view updates are relayed back as inputs like `specimen_scene_par3d`
- the fluent `Scene` API is the primary Python surface
- R-style parity helpers remain important for cross-language coverage and testing

## Current Scope

- `Scene`
- `scene3d()`
- `plot3d()`
- `shade3d()`
- `wireframe3d()`
- `light3d()`
- `as_babylon_mesh()`
- `render_scene3d()`

`Scene` is the primary Python entry point. The most useful methods right now are:

- `add()`
- `add_mesh()`
- `add_light()`
- `add_point_light()`
- `add_directional_light()`
- `add_spot_light()`
- `add_hemispheric_light()`
- `add_lighting_preset()`
- `add_points()`
- `add_spheres()`
- `add_segments()`
- `add_lines()`
- `add_text()`
- `add_plane()`
- `add_model()`
- `model_info()`
- `set_model_material()`
- `replace_model_geometry()`
- `translate_model_mesh()`
- `scale_model_mesh()`
- `with_material()`
- `with_materials()`
- `with_standard_material()`
- `with_pbr_material()`
- `with_shader_material()`
- `with_node_material()`
- `set_mesh_material()`
- `with_axes()`
- `with_view()`
- `with_background()`
- `with_camera()`
- `with_title()`
- `with_scale_bar()`
- `with_postprocess()`
- `with_depth_of_field()`
- `with_clipping()`
- `extract_geometry()`
- `bounds()`
- `replace_geometry()`
- `translate_mesh()`
- `scale_mesh()`
- `set_mesh_vertices()`
- `add_morph_target()`
- `show()`
- `edit()`
- `pose()`
- `snapshot()`
- `save_html()`

Lower-level material and lighting helpers are also exposed when you want to
build payloads explicitly:

- `texture3d()`
- `standard_material3d()`
- `pbr_material3d()`
- `shader_material3d()`
- `node_material3d()`
- `material_ref3d()`
- `model_info3d()`
- `set_material3d()`
- `as_babylon_light()`
- `light3d_point()`
- `light3d_directional()`
- `light3d_spot()`
- `light3d_hemispheric()`
- `lighting_preset3d()`

Geometry and morph-target helpers are also available for lower-level workflows:

- `extract_geometry3d()`
- `extract_model_geometry3d()`
- `scene_bounds3d()`
- `replace_geometry3d()`
- `replace_model_geometry3d()`
- `translate_geometry3d()`
- `scale_geometry3d()`
- `set_model_material3d()`
- `set_vertices3d()`
- `morph_target3d()`

Imported assets can now participate in the fluent Python workflow too:

```python
from babylonian import Scene, standard_material3d

scene = (
    Scene()
    .add_model("specimen.obj", name="specimen")
    .set_model_material("bronze", asset="specimen")
    .set_model_material(
        standard_material3d(diffuse="#22c55e", alpha=0.6),
        asset="specimen",
        target="mandible",
    )
)
```

Geometry overrides are also supported for imported submeshes, but today they are override-first:
seed an override with `replace_model_geometry()` and then refine it with
`translate_model_mesh()` or `scale_model_mesh()`. Extracting the original
authoring geometry directly from every imported format is still future work.

The first in-memory mesh adapter assumes `trimesh.Trimesh`. Raw `(vertices, faces)` inputs are also supported.

The lower-level parity layer is still incomplete:

- notebook/HTML rendering is implemented
- Shiny for Python scene hosting is implemented
- imported model payloads are implemented
- pose and scene editor wrappers are implemented
- the scene schema is shared-friendly
- many R APIs and higher-level workflows are still not exposed in Python yet

## Developer Note

The Python package vendors the BabylonJS engine files and the R widget source in:

- `python/src/babylonian/lib/babylon.js`
- `python/src/babylonian/lib/babylonjs.loaders.min.js`
- `python/src/babylonian/lib/babylon_widget.js`

Those should stay in sync with the R package sources. Use:

```bash
bash scripts/sync_libs.sh
```

from the repo root after updating the R-side widget or BabylonJS libraries.
