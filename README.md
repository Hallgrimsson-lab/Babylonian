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
