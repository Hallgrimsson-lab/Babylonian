# Babylonian Python Adapter

This directory contains an early Python adapter for Babylonian's shared scene schema.

## Install

```bash
pip install -e ./python
pip install anywidget traitlets
pip install trimesh
```

## Quick Start

```python
import trimesh
from babylonian import plot3d

mesh = trimesh.load("specimen.obj", force="mesh")
plot3d(mesh, color="#d97706")
```

`plot3d()` returns a notebook-friendly widget object with `_repr_html_()`, so it renders inline in Jupyter.
By default it uses an iframe-backed HTML renderer, which is more reliable in VS Code notebooks. The `anywidget` adaptor is still available as an opt-in:

```python
plot3d(mesh, color="#d97706", renderer="anywidget")
```

## Current Scope

- `scene3d()`
- `plot3d()`
- `shade3d()`
- `wireframe3d()`
- `light3d()`
- `as_babylon_mesh()`
- `render_scene3d()`

The first in-memory mesh adapter assumes `trimesh.Trimesh`. Raw `(vertices, faces)` inputs are also supported.

This first pass is intentionally small:

- notebook/HTML rendering is implemented
- the scene schema is shared-friendly
- imported `glb/gltf` assets are not wired up in Python yet
- interactive editing wrappers are not wired up in Python yet
