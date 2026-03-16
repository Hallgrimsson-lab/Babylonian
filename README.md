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

`Babylonian` now includes a `babylon_mesh` class so mesh plotting can start to
look like `rgl` code:

```r
library(Babylonian)

mesh <- as_babylon_mesh(your_morpho_mesh, color = "#d97706")
plot(mesh)
```

You can also override basic graphical settings at plot time:

```r
plot(mesh, color = "#2563eb", alpha = 0.95)
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
