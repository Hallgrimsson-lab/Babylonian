# Babylonian

## Overview

`Babylonian` is an R package that provides an interface to the [BabylonJS](https://www.babylonjs.com/) 3D visualization library. It allows you to create and display 3D scenes in R using the `htmlwidgets` framework.

## Installation

To install the development version of `Babylonian`, you can use the `devtools` package:

``` r
# install.packages("devtools")
devtools::install_github("Hallgrimsson-lab/Babylonian")
```

## Basic Functionality

`Babylonian` supports both direct widget construction through `babylon()` and a more `rgl`-like workflow through `plot3d()`.

A simple BabylonJS scene can be created directly from primitive specs or imported meshes:

``` r
library(Babylonian)

babylon(
  data = list(
    list(type = "sphere", diameter = 1),
    import_mesh(system.file("htmlwidgets/cube.obj", package = "Babylonian"))
  )
)
```

For in-memory `mesh3d` objects, `plot3d()` is usually the most convenient entry point:

``` r
library(Babylonian)
library(Morpho)

mesh <- file2mesh("my_mesh.obj")

plot3d(mesh, color = "#d97706")
plot3d(mesh, color = "#2563eb", alpha = 0.95, axes = TRUE, nticks = 4)
```

You can also convert once and reuse the Babylonian mesh object later:

``` r
mesh <- as_babylon_mesh(your_morpho_mesh, color = "#d97706")
plot3d(mesh)
```

Babylonian keeps a lightweight `par3d()`-style view state so camera settings can persist across new scenes:

``` r
par3d(
  zoom = 1.4,
  userMatrix = diag(4),
  bg = "white"
)

bg3d("#f5f5f5")
plot3d(your_morpho_mesh)

last_par3d()
```

You can also add a canned studio-lighting rig directly from R with the same preset names used by `edit_scene3d()`:

``` r
plot3d(your_morpho_mesh, color = "gray75")
lighting_preset3d("three_point", x = your_morpho_mesh)
```

To save a static screenshot of the current scene, use `snapshot3d()` or the aliases `rgl.snapshot()` and `snapshot()`:

``` r
plot3d(your_morpho_mesh)
snapshot3d("scene.png")
```

Scene-level post-process effects can be added through `scene`. The first Babylonian wrapper is `dof3d()` for depth of field:

``` r
babylon(
  data = list(as_babylon_mesh(your_morpho_mesh, color = "gray75")),
  scene = list(
    postprocess = list(
      dof3d(
        focus_distance = 200,
        f_stop = 1.8,
        focal_length = 50,
        blur_level = "high"
      )
    )
  )
)
```

Those effects can also be tuned interactively in `edit_scene3d()`. The scene editor exposes a `Postprocessing` section with live controls for `dof3d()` parameters:

``` r
scene <- babylon(
  data = list(
    as_babylon_mesh(your_morpho_mesh, color = "gray75"),
    as_babylon_light(
      type = "point",
      name = "key",
      position = c(100, 80, 120),
      intensity = 0.8,
      diffuse = "#ffd166"
    )
  ),
  scene = list(
    postprocess = list(
      dof3d(
        focus_distance = 200,
        f_stop = 2,
        focal_length = 50,
        blur_level = "medium"
      )
    )
  )
)

state <- edit_scene3d(scene)
scene <- apply_scene_state(scene, state = state)
snapshot3d("dof-scene.png", widget = scene)
```

To keep multiple widgets side by side with synchronized camera motion, give them the same `sync_group`:

``` r
left <- babylon(
  data = list(as_babylon_mesh(your_morpho_mesh, color = "gray75")),
  sync_group = "compare"
)

right <- babylon(
  data = list(as_babylon_mesh(your_morpho_mesh, color = "tomato")),
  sync_group = "compare"
)
```

For a quick side-by-side layout, use `paired_scene3d()`:

``` r
paired_scene3d(
  as_babylon_mesh(mesh, color = "gray75"),
  as_babylon_mesh(mesh2, color = "tomato"),
  labels = c("Reference", "Target")
)
```

For repeatable figure setup, Babylonian includes two interactive editors. Use `create_pose_3d()` to capture a reusable camera pose:

``` r
pose <- create_pose_3d(your_morpho_mesh)
par3d(zoom = pose$zoom, userMatrix = pose$userMatrix, bg = pose$bg)
```

Use `edit_scene3d()` to move meshes and lights with gizmos, then reapply the saved scene state before snapshotting:

``` r
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

For inline widget output in knitr-based documents, register the Babylonian chunk hook in a setup chunk:

``` r
Babylonian::use_babylon_knitr()
```

Then mark rendering chunks with `babylon = TRUE` so each chunk starts from a fresh Babylonian scene accumulator:

``` r
#| babylon: true
plot3d(your_morpho_mesh)
points3d(matrix(rnorm(60), ncol = 3), color = "tomato")
```

## Helper Wrappers

`plot3d()` starts a fresh scene by default. Helper wrappers such as `points3d()`, `spheres3d()`, `segments3d()`, `planes3d()`, `shade3d()`, and `wireframe3d()` add to the current scene by default in a more `rgl`-like style.

Points and spheres:

``` r
pts <- matrix(rnorm(60), ncol = 3)

plot3d(your_morpho_mesh, add = FALSE, color = "gray70")
points3d(pts, color = "tomato", size = 0.03)
spheres3d(
  pts,
  radius = 0.02,
  color = rep(c("steelblue", "goldenrod"), length.out = nrow(pts))
)
```

Segments:

``` r
segs <- rbind(
  c(0, 0, 0),
  c(1, 0, 0),
  c(0, 0, 0),
  c(0, 1, 0),
  c(0, 0, 0),
  c(0, 0, 1)
)

segments3d(segs, color = c("red", "green", "blue"), add = FALSE)
```

Planes:

``` r
plot3d(your_morpho_mesh, color = "gray80")
planes3d(0, 0, 1, 0, color = "tomato", alpha = 0.35)
```

Shaded and wireframe surfaces:

``` r
shade3d(your_morpho_mesh, color = "gray75", specularity = 0.3, add = FALSE)
wireframe3d(your_morpho_mesh, color = "black")
```

BabylonJS light types are available through `light3d()` and dedicated wrappers:

``` r
plot3d(your_morpho_mesh, color = "gray75", specularity = 0.3)
light3d_hemispheric(intensity = 0.35, ground_color = "gray20")
light3d_directional(
  direction = c(-0.5, -1, 0.2),
  intensity = 0.9,
  diffuse = "#fff7cc"
)
light3d_point(
  position = c(100, 80, 120),
  intensity = 0.7,
  diffuse = "#ffd166"
)
```

## Analysis

For interactive landmark collection on a mesh surface, use BabylonJS ray casting through `digitize_landmarks()`:

``` r
digitize_landmarks(
  mesh,
  n = 5
)
```

The picked landmarks render as small spheres relative to mesh size, and in an interactive R session the function returns a 3-column coordinate matrix.

For Geomorph-style workflows, Babylonian also provides `digit.fixed()` as a compatibility wrapper:

``` r
digit.fixed(
  mesh,
  fixed = 10,
  index = TRUE,
  ptsize = 1,
  center = TRUE
)
```

It tries to mimic the core features of Geomorph's implementation by centering the specimen by default, snapping picks to the nearest mesh vertex rather than an arbitrary point on a triangle, previewing each selection so it can be accepted or retried, and optionally returning the selected vertex indices along with the landmark coordinates.

To compare two matching-topology meshes, `meshDist()` colors the reference mesh by signed vertex displacement and can optionally overlay displacement vectors:

``` r
meshDist(reference_mesh, target_mesh, displace = TRUE)
```

You can also work from a precomputed per-vertex distance vector:

``` r
meshDist(reference_mesh, distvec = your_distvec, displace = TRUE)
```

To plot only the corresponding heatmap scale as a 2D graphic, use `heatmap_scale()`:

``` r
heatmap_scale(reference_mesh, target_mesh)
```

## Animation

Babylonian can generate camera paths, animate morph-target influence, render high-resolution PNG frames, and then encode either a GIF or a video.

Create a morphing scene:

``` r
scene <- babylon(
  data = list(
    morph_target3d(reference_mesh, target_mesh, influence = 0, color = "gray75")
  )
)
```

Generate a camera orbit path:

``` r
views <- orbit_path3d(n = 120, axis = "y", zoom = 1.1)
```

Render frames directly if you want the PNG sequence:

``` r
render_frames3d(
  scene,
  dir = "frames",
  views = views,
  morph = morph_path3d(n = 120, from = 0, to = 1)
)
```

Or encode a movie or GIF in one step:

``` r
record_scene3d(
  scene,
  file = "turntable.mp4",
  views = views,
  morph = morph_path3d(n = 120, from = 0, to = 1)
)

record_scene3d(
  scene,
  file = "heatmap-turntable.mp4",
  views = views,
  morph = morph_path3d(n = 120, from = 0, to = 1),
  heatmap = TRUE,
  heatmap_args = list(
    alpha = 0.4,
    displace = TRUE
  )
)
```

## Experimental: Imported Assets And Advanced Materials

Imported assets can stay file-backed instead of being flattened into `mesh3d`. This is the preferred route for `glb` and `gltf` assets with authored PBR materials and textures:

``` r
asset <- import_model3d("your_model.glb")
plot3d(asset)
```

To inspect a file-backed asset from R before rendering it, use `model_info3d()`. The packaged `BrainStem.gltf` in `inst/extdata` is included as a geometry-edit example:

``` r
brainstem_info <- model_info3d(
  system.file("extdata", "BrainStem.gltf", package = "Babylonian")
)

brainstem_info$meshes
brainstem_info$materials
brainstem_info$buffers
```

To load and plot the packaged `BrainStem.gltf`:

``` r
brainstem <- import_model3d(
  system.file("extdata", "BrainStem.gltf", package = "Babylonian")
)

plot3d(brainstem)
```

To load and plot the packaged `Bee.glb`:

``` r
bee <- import_model3d(
  system.file("extdata", "Bee.glb", package = "Babylonian")
)

plot3d(bee)
```

Imported geometry can also be extracted, modified in R, and attached back onto the asset:

``` r
brainstem <- import_model3d(
  system.file("extdata", "BrainStem.gltf", package = "Babylonian")
)

brainstem_geo <- extract_geometry3d(brainstem, target = "Figure_2_geometry")
brainstem_geo <- scale_geometry3d(brainstem_geo, 1.05)
brainstem_geo <- translate_geometry3d(brainstem_geo, c(0, 5, 0))

brainstem_edited <- replace_geometry3d(
  brainstem,
  brainstem_geo,
  target = "Figure_2_geometry"
)

plot3d(brainstem_edited)
```

For manually textured imports such as `obj` files, combine `import_model3d()`, `texture3d()`, and `pbr_material3d()`:

``` r
statue <- import_model3d("statue.obj")

statue <- set_material3d(
  statue,
  material = pbr_material3d(
    base_color_texture = texture3d("albedo.png", colorspace = "srgb"),
    normal_texture = texture3d("normal.png", colorspace = "linear"),
    metallic_roughness_texture = texture3d("orm.png", colorspace = "linear"),
    metallic = 0.1,
    roughness = 0.9
  )
)

plot3d(statue)
```

`texture3d()` can also start from an in-memory image object instead of a file path:

``` r
img <- array(0, dim = c(64, 64, 4))
img[, , 1] <- 1
img[, , 4] <- 1

tex <- texture3d(img, colorspace = "srgb")

mat <- pbr_material3d(
  base_color_texture = tex,
  metallic = 0.1,
  roughness = 0.9
)
```

For more advanced shading, meshes can carry explicit material descriptors. Alongside standard materials, Babylonian supports Babylon PBR materials, raw shader materials, and Node Material Editor exports:

``` r
mesh <- as_babylon_mesh(
  your_morpho_mesh,
  material = pbr_material3d(
    base_color = "#c084fc",
    metallic = 0.15,
    roughness = 0.55
  )
)

plot3d(mesh)
```

To load a node material export from `inst/extdata`, use:

``` r
node_mat <- node_material3d(
  file = system.file("extdata", "nodeMaterial-demo.json", package = "Babylonian")
)

plot3d(
  as_babylon_mesh(your_morpho_mesh, material = node_mat)
)
```
