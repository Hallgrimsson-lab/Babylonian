\name{wireframe3d}
\alias{wireframe3d}
\title{Render a 3D mesh as a wireframe}
\usage{
wireframe3d(
  x,
  mesh = NULL,
  color = NULL,
  alpha = NULL,
  specularity = "black",
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
)
}
\arguments{
\item{x}{A \code{mesh3d}, \code{babylon_mesh}, compatible Babylonian mesh object, or a
Babylonian htmlwidget / \code{babylon_scene} when using \code{wireframe3d()} in a pipe.}

\item{mesh}{Optional mesh to add when \code{x} is an existing Babylonian
htmlwidget or \code{babylon_scene}, for example \code{plot3d(base) |> wireframe3d(mesh)}.}

\item{color}{Optional wireframe color.}

\item{alpha}{Optional wireframe opacity.}

\item{specularity}{Optional surface specularity.}

\item{add}{Whether to add the object to the current Babylonian scene. Use
\code{add = FALSE} to start a fresh scene.}

\item{axes}{Whether to draw lightweight scene axes, ticks, labels, and a
bounding box.}

\item{nticks}{Approximate number of tick marks per axis when \code{axes = TRUE}.}

\item{...}{Additional mesh graphical parameters.}
}
\description{
This mirrors the feel of \code{rgl::wire3d()}/wireframe-style plotting by
rendering mesh edges using Babylon's wireframe material mode.
}
