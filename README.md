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
    list(type = "sphere", diameter = 1)
  )
)
```

Babylonian also interfaces with `mesh3d` objects, so you can use `plot3d()` like you would with rgl:

``` r
library(Babylonian)
library(Morpho)

mesh <- file2mesh(file = system.file("extdata", "person1.obj", package = "Babylonian"))
plot3d(mesh, color = "#2563eb", alpha = 0.95, axes = TRUE, nticks = 4)

```

Babylonian keeps a lightweight `par3d()`-style view state so camera settings can persist across new scenes:

``` r
par3d(
  windowRect = c(0, 0, 800, 800),
  zoom = 1.4,
  userMatrix = diag(4),
  bg = "white"
)

bg3d("black")
plot3d(mesh)

```

Babylonian also supports inline rendering of scenes in R/Quarto notebooks. Just plot like you normally would.

## Common Wrappers

`plot3d()` starts a fresh scene by default. Helper wrappers such as `points3d()`, `spheres3d()`, `segments3d()`, `planes3d()`, `shade3d()`, and `wireframe3d()` add to the current scene by default in a more `rgl`-like style. Unlike rgl, you don't need to initialize a plot in order to use a wrapper function. 

Points and spheres:

``` r
pts <- matrix(rnorm(60), ncol = 3) * 100

plot3d(mesh, add = FALSE, color = "gray70")
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
plot3d(mesh, color = "gray80")
planes3d(0, 0, 1, 0, color = "tomato", alpha = 0.35)
```

Shaded and wireframe surfaces:

``` r
shade3d(mesh, color = "gray75", specularity = 0.3, add = FALSE)
wireframe3d(mesh, color = "black")
```

BabylonJS light types are available through `light3d()` and dedicated wrappers:

``` r
plot3d(mesh, color = "gray75", specularity = 0.3)
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

You can also add preset portraiture rigs with code:

``` r
plot3d(mesh, color = "gray75")
# options are "three_point", "rembrandt", "butterfly", and "split"
lighting_preset3d("three_point", x = mesh)

```

For a quick side-by-side layout, use `paired_scene3d()`:

``` r
paired_scene3d(
  as_babylon_mesh(mesh, color = "gray75"),
  as_babylon_mesh(mesh2, color = "tomato"),
  labels = c("First mesh", "Second mesh")
)
```

## Annotation & analysis

### Landmarking

For interactive landmark collection on a mesh surface, use BabylonJS ray casting through `digit.fixed()`. The picked landmarks render as small spheres relative to mesh size, and in an interactive R session the function returns a 3-column coordinate matrix.

We try to mimic the core features of Geomorph's implementation by centering the specimen by default, snapping picks to the nearest mesh vertex rather than an arbitrary point on a triangle, previewing each selection so it can be accepted or retried, and optionally returning the selected vertex indices along with the landmark coordinates.

GIF placeholder: [landmarking-demo.gif](inst/extdata/landmarking-demo.gif)

``` r
digit.fixed(
  mesh,
  fixed = 10,
  index = TRUE,
  ptsize = 1,
  center = TRUE
)
```

### Vertex painting

If you want to select a whole region of vertices instead of landmarking, you can use `paint_vertices3d()`. This widget lets you select a radius size, paint, undo your last selection, and reset the selection. If you're indexing a symmetric object along x/y/z axes, you can toggle the symmetry options to also capture the other side. This function returns the painted indices of the mesh.

```r

idx <- paint_vertices3d(mesh)
plot3d(mesh)
points3d(t(mesh$vb[1:3, idx]))

```

GIF placeholder: [landmarking-demo.gif](inst/extdata/landmarking-demo.gif)

### Heatmaps

To compare two matching-topology meshes, `meshDist()` colors the reference mesh by signed vertex displacement and can optionally overlay displacement vectors:

``` r

crouzon_intercept <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_intercept.ply", package = "Babylonian"))
crouzon_age <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_age.ply", package = "Babylonian"))

bg3d("black")
meshDist(crouzon_intercept, crouzon_age, alpha = 0, displace = TRUE, backface_culling = F, axes = F)

```

You can also make a heatmap from a pre-computed per-vertex distance vector:

``` r

# distance matrix from the first point (on the nose)
meshDist(mesh, distvec = sqrt(colSums((mesh$vb[-4,] - mesh$vb[-4, 1])^2)))

```

To plot only the corresponding heatmap scale as a 2D graphic, use `heatmap_scale()` with the same arguments you passed to `meshDist()` :

``` r
heatmap_scale(mesh, distvec = sqrt(colSums((mesh$vb[-4,] - mesh$vb[-4, 1])^2)))
```

### Morphing

We offer a quick utility for creating morph targets for interactive inspection with `morph_target3d()`:

``` r

# see the midpoint between mesh and mesh2
morphed_mesh <- morph_target3d(mesh, mesh2, influence = 0.5, name = "morph10")
plot3d(morphed_mesh)

```

You can also use morphtargets interactively with the scene editor (that we'll explain in the next section!), save the resulting camera and lighting setup, and then reuse it:

``` r
# how the syndrome atlas works--morphtargets on a base mesh
crouzon_intercept <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_intercept.ply", package = "Babylonian"))
crouzon_age <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_age.ply", package = "Babylonian"))
crouzon_sex <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_sex.ply", package = "Babylonian"))
crouzon_severity <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_severity.ply", package = "Babylonian"))

# build as targets on intercept
morphed_mesh <- morph_target3d(crouzon_intercept, crouzon_age, influence = 0.2, name = "age50")
morphed_mesh <- morph_target3d(morphed_mesh, crouzon_sex, influence = 0.5, name = "maleness")
morphed_mesh <- morph_target3d(morphed_mesh, crouzon_severity, influence = 0, name = "severity")

state <- edit_scene3d(morphed_mesh)
scene <- apply_scene_state(scene, state = state)
snapshot3d("morph-scene.png", widget = scene)
```

## Showing off your work

To save a static screenshot of the current scene, use `snapshot3d()` or the aliases `rgl.snapshot()` and `snapshot()`:

``` r
plot3d(mesh)
snapshot3d("scene.png")
```

### The scene editor

We offer several utilities for easy figure making and screenshotting (to .png & .tif). `create_pose3d()` is a lightweight widget to orient and frame a mesh. It returns the posed settings that can be passed along to `par3d()` for consistent figure making:

``` r

pose <- create_pose_3d(mesh)
par3d(zoom = pose$zoom, userMatrix = pose$userMatrix, bg = pose$bg)
plot3d(mesh)

```

`edit_scene3d()` is a more fully-featured GUI for creating a scene and either directly screenshotting from within the widget, or for applying the scene settings to future uses. From within `edit_scene3d()` you can pose meshes with the camera, move/rotate/scale meshes about the scene, create and adjust lights, and several more things. When you're happy with your scene you can save the snapshot directly or click done and apply the scene programatically across many meshes.  

``` r

scene <- plot3d(mesh)
state <- edit_scene3d(scene)
scene <- apply_scene_state(scene, state = state)
snapshot3d("edited-scene.png", widget = scene)

# set scene on first mesh and use the state across multiple meshes
my_mesh_list <- list(mesh, mesh2)
for(i in 1:2){
  scene <- apply_scene_state(plot3d(my_mesh_list[[i]]), state = state) # how to create a meshlist??
  snapshot3d(paste0("edited-scene", i, ".png"), widget = scene)
}

```

GIF placeholder: [scene-editor-demo.gif](inst/extdata/scene-editor-demo.gif)

There are a couple ways to get multiple meshes into the scene editor for posing:
```r

# build up a scene piecemeal and edit
plot3d(mesh)
edit_scene3d(shade3d(mesh2, color = "red"))

# use lower level functions to build the scene with multiple meshes from the get go
scene <- babylon(data = list(
    as_babylon_mesh(mesh, color = "gray75"),
    as_babylon_mesh(mesh2, color = "yellow"),
  )
)

scene_state <- edit_scene3d(scene)

```

### Animation

Babylonian can generate camera paths, animate morph-target influence, render high-resolution PNG frames, and then encode either a GIF or a video.

GIF placeholder: [animation-demo.gif](inst/extdata/animation-demo.gif)

Create a morphing scene:

``` r

scene <- plot3d(morph_target3d(crouzon_intercept, crouzon_age, influence = 0, color = "gray75"))
state <- edit_scene3d(scene)
scene <- apply_scene_state(scene, state)

```

Generate a camera orbit path:

``` r

views <- orbit_path3d(n = 15, axis = "y", zoom = 1.1)

```

Render frames directly if you want the PNG sequence:

``` r

render_frames3d(
  scene,
  dir = "frames",
  views = views,
  morph = morph_path3d(n = 15, from = 0, to = .5)
)

```

Or encode a movie or GIF in one step:

``` r

record_scene3d(
  scene,
  file = "turntable.mp4",
  morph = morph_path3d(n = 45, from = 0, to = .5)
)

record_scene3d(
  scene,
  file = "heatmap-turntable.mp4",
  views = views,
  morph = morph_path3d(n = 15, from = 0, to = 1),
  heatmap = TRUE,
  heatmap_args = list(
    alpha = 0,
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

# toon shader, wut. Need to add light blocks to the material to make it responsive to scene lights...
node_mat <- node_material3d(
  file = system.file("extdata", "nodeMaterial-demo.json", package = "Babylonian")
)

# options for adding materials to meshes
plot3d(
  as_babylon_mesh(mesh, material = node_mat)
)
```

## The material registry

Different types of materials can be created/loaded into memory and registered. This registry can be used in the scene editor to assign materials to meshes.
