\name{light3d}
\alias{light3d}
\alias{light3d_point}
\alias{light3d_directional}
\alias{light3d_spot}
\alias{light3d_hemispheric}
\title{Create BabylonJS scene lights}
\usage{
light3d(
  x = NULL,
  type = c("hemispheric", "point", "directional", "spot"),
  position = NULL,
  direction = NULL,
  intensity = 1,
  diffuse = "white",
  specular = "white",
  ground_color = NULL,
  angle = NULL,
  exponent = NULL,
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
)

light3d_point(
  position = c(0, 1, 0),
  intensity = 1,
  diffuse = "white",
  specular = "white",
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
)

light3d_directional(
  direction = c(0, -1, 0),
  position = NULL,
  intensity = 1,
  diffuse = "white",
  specular = "white",
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
)

light3d_spot(
  position = c(0, 1, 0),
  direction = c(0, -1, 0),
  intensity = 1,
  diffuse = "white",
  specular = "white",
  angle = pi/3,
  exponent = 1,
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
)

light3d_hemispheric(
  direction = c(0, 1, 0),
  intensity = 1,
  diffuse = "white",
  specular = "white",
  ground_color = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
)
}
\arguments{
\item{x}{Optional Babylonian htmlwidget / \code{babylon_scene} when using
\code{light3d()} in a pipe, or an unnamed alias for \code{type} in non-piped calls.}

\item{type}{Babylon light type. Supported values are \code{"point"},
\code{"directional"}, \code{"spot"}, and \code{"hemispheric"}.}

\item{position}{Optional light position for point, spot, and directional
lights.}

\item{direction}{Optional light direction for directional, spot, and
hemispheric lights.}

\item{intensity}{Light intensity multiplier.}

\item{diffuse}{Diffuse light color.}

\item{specular}{Specular light color.}

\item{ground_color}{Optional ground color for hemispheric lights.}

\item{angle}{Optional spotlight cone angle in radians.}

\item{exponent}{Optional spotlight falloff exponent.}

\item{range}{Optional light attenuation range.}

\item{name}{Optional light name.}

\item{enabled}{Whether the light should be enabled.}

\item{add}{Whether to add the object to the current Babylonian scene. Use
\code{add = FALSE} to start a fresh scene.}

\item{axes}{Whether to draw lightweight scene axes, ticks, labels, and a
bounding box.}

\item{nticks}{Approximate number of tick marks per axis when \code{axes = TRUE}.}

\item{...}{Reserved for future light options.}
}
\description{
Adds BabylonJS scene lights using either a general \code{light3d()} constructor
or dedicated helpers for point, directional, spot, and hemispheric lights.
Custom lights replace Babylonian's default fallback lighting for that scene.
}
