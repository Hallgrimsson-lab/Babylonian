# Babylonian

## Overview

`Babylonian` is an R package that provides an interface to the [BabylonJS](https://www.babylonjs.com/) 3D visualization library. It allows you to create and display 3D scenes in R using the `htmlwidgets` framework.

## Installation

To install the development version of `Babylonian`, you can use the `devtools` package:

```r
# install.packages("devtools")
devtools::install_github("your-username/Babylonian")
```

## Usage

Here is a simple example of how to use `Babylonian` to create a 3D scene with a sphere and a cube loaded from an OBJ file:

```r
library(Babylonian)

# Create a scene with a sphere and a cube from an OBJ file
babylon(
  data = list(
    list(type = "sphere", diameter = 1),
    import_mesh(system.file("htmlwidgets/cube.obj", package = "Babylonian"))
  )
)
```

This will create a 3D scene in the RStudio viewer or in a web browser. You can interact with the scene using the mouse.

To keep multiple Babylonian widgets side by side with synchronized camera
motion, give them the same `sync_group`:

```r
left <- babylon(
  data = list(as_babylon_mesh(your_morpho_mesh, color = "gray75")),
  sync_group = "compare"
)

right <- babylon(
  data = list(wireframe3d(your_morpho_mesh, add = FALSE, axes = FALSE)$x$objects[[1]]),
  sync_group = "compare"
)
```

When both widgets appear on the same page, orbiting or zooming one will update
the other to the same view.

For a quick side-by-side layout, use `paired_scene3d()`:

```r
paired_scene3d(
  as_babylon_mesh(mesh, color = "gray75"),
  as_babylon_mesh(mesh2, color = "tomato"),
  labels = c("Reference", "Target")
)
```

`Babylonian` can also render in-memory triangular meshes that use R's `mesh3d`
structure. That makes it possible to take meshes returned by Morpho and send
them directly to the widget:

```r
library(Babylonian)
library(Morpho)

# Any Morpho mesh that inherits from `mesh3d`
mesh <- your_morpho_mesh

babylon(
  data = list(
    list(type = "sphere", diameter = 1, position = c(-15, 0, 0)),
    as_babylon_mesh(mesh, color = "#d97706", alpha = 0.9)
  )
)
```

You can also pass a `mesh3d` object directly in `data`, and `babylon()` will
convert it automatically.

## RGL-style workflow

`Babylonian` now includes a `plot3d()` generic so mesh plotting can start to
look like `rgl` code:

```r
library(Babylonian)

plot3d(your_morpho_mesh, color = "#d97706")
```

That works directly for `mesh3d` objects imported through Morpho, and you can
still explicitly convert first if you want a reusable Babylonian mesh object:

```r
mesh <- as_babylon_mesh(your_morpho_mesh, color = "#d97706")
plot3d(mesh, color = "#2563eb", alpha = 0.95)
```

By default, `plot3d()` now adds lightweight axis lines, tick marks, numeric
labels, and a bounding box around the plotted object. You can tune or disable
that with:

```r
plot3d(your_morpho_mesh, axes = TRUE, nticks = 4)
plot3d(your_morpho_mesh, axes = FALSE)
```

`plot3d()` starts a fresh scene by default. Wrapper helpers like `points3d()`
and `spheres3d()` add to the current scene by default, so a typical layered
workflow looks like this:

```r
plot3d(your_morpho_mesh, add = FALSE, color = "gray70")
points3d(matrix(rnorm(60), ncol = 3), color = "tomato")
```

Any `n x 3` matrix can also be plotted directly as 3D points:

```r
pts <- matrix(rnorm(300), ncol = 3)
plot3d(pts, color = "tomato")

plot3d(pts, color = rep(c("tomato", "steelblue"), length.out = nrow(pts)))
```

For a true spherical scatterplot, use `spheres3d()`:

```r
spheres3d(pts, radius = 0.02, color = rep(c("steelblue", "goldenrod"), length.out = nrow(pts)))
```

To render a triangular mesh as a wireframe instead of a shaded surface, use
`wireframe3d()`:

```r
wireframe3d(your_morpho_mesh, color = "gray30")
```

To use BabylonJS light types directly, add one or more scene lights with
`light3d()` or the dedicated wrappers:

```r
plot3d(your_morpho_mesh, color = "gray75", specularity = 0.3)
light3d_hemispheric(intensity = 0.35, ground_color = "gray20")
light3d_directional(
  direction = c(-0.5, -1, 0.2),
  intensity = 0.9,
  diffuse = "#fff7cc"
)
```

For figure setup, `edit_scene3d()` opens a gizmo-based editor so you can move
lights, translate/rotate/scale meshes, then reuse the saved scene state:

```r
scene <- babylon(
  data = list(
    as_babylon_mesh(your_morpho_mesh, color = "gray75"),
    as_babylon_light(
      type = "directional",
      name = "key",
      direction = c(-0.5, -1, 0.2),
      intensity = 0.9,
      diffuse = "#fff7cc",
      specular = "#ffffff"
    )
  )
)

state <- edit_scene3d(scene)
scene <- apply_scene_state(scene, state = state)
snapshot3d("figure.png", widget = scene)
```

To compare two matching-topology meshes, `meshDist()` colors the reference
mesh by vertex displacement and can overlay a displaced wireframe plus colored
displacement segments:

```r
meshDist(reference_mesh, target_mesh, displace = TRUE)
```

To plot only the corresponding heatmap scale as a 2D graphic, use
`heatmap_scale()`:

```r
heatmap_scale(reference_mesh, target_mesh)
```


To save a static screenshot of the current scene, use `snapshot3d()` (or the
`rgl`-style aliases `rgl.snapshot()` and `snapshot()`):

```r
plot3d(your_morpho_mesh)
snapshot3d("scene.png")
```

## View state

Babylonian also has a lightweight `par3d()`-style view state for repeatable
poses:

```r
pose <- par3d()
pose$userMatrix
pose$zoom

par3d(
  zoom = 1.4,
  userMatrix = diag(4)
)

plot3d(your_morpho_mesh)
```

That view state is applied to new scenes, so you can reuse the same
`userMatrix` and `zoom` across multiple plots.

You can also ask for the last Babylonian view state known to R:

```r
last_par3d()
```

To interactively create a reusable pose, open a dedicated pose gadget:

```r
pose <- create_pose_3d(your_morpho_mesh)
par3d(zoom = pose$zoom, userMatrix = pose$userMatrix)
```

## Surface landmark digitizing

For interactive landmark collection on a mesh surface, use BabylonJS ray
casting through `digitize_landmarks()`:

```r
digitize_landmarks(
  mesh,
  n = 5
)
```

The picked landmarks render as tiny spheres relative to the mesh size, and in
an interactive R session the function returns a 3-column coordinate matrix when
you finish landmarking.

## R Markdown and Quarto

For inline widget output in knitr-based documents, register the Babylonian
chunk hook in a setup chunk:

```r
Babylonian::use_babylon_knitr()
```

Then mark rendering chunks with `babylon = TRUE` so each chunk starts from a
fresh Babylonian scene accumulator:

```r
#| babylon: true
plot3d(your_morpho_mesh)
points3d(matrix(rnorm(60), ncol = 3), color = "tomato")
```
