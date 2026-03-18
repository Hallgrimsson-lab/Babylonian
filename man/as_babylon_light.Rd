\name{as_babylon_light}
\alias{as_babylon_light}
\title{Create a Babylonian light specification}
\usage{
as_babylon_light(
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
  ...
)
}
\arguments{
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

\item{...}{Reserved for future light options.}
}
\description{
Returns a reusable Babylonian light specification that can be included
directly in \code{babylon(data = ...)} scene object lists.
}
