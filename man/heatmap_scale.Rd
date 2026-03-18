\name{heatmap_scale}
\alias{heatmap_scale}
\title{Plot the `meshDist()` Color Scale As a 2D ggplot}
\usage{
heatmap_scale(
  reference,
  target = NULL,
  distvec = NULL,
  colorramp = c("\#1d4ed8", "\#f8fafc", "\#b91c1c"),
  palette = NULL,
  limits = NULL,
  from = NULL,
  to = NULL,
  displace = FALSE,
  alpha = NULL,
  add = FALSE,
  axes = TRUE,
  nticks = 5,
  ...
)
}
\arguments{
\item{reference}{A \code{mesh3d} or \code{babylon_mesh} object used as the base mesh.}

\item{target}{A \code{mesh3d} or \code{babylon_mesh} object with matching topology.
Defaults to \code{NULL} when \code{distvec} is used instead.}

\item{distvec}{Optional signed per-vertex distance vector. When supplied,
\code{meshDist()} uses the reference mesh normals to map values onto the
heatmap and optional displacement vectors.}

\item{colorramp}{Color ramp used for the heatmap. Accepts R color vectors,
including named colors and hex strings.}

\item{palette}{Deprecated alias for \code{colorramp}.}

\item{limits}{Optional numeric range used to clamp the heatmap scale. When
omitted, the default heatmap scale is symmetric around zero.}

\item{from}{Optional lower bound for the heatmap scale. Values below this
bound inherit the minimum color.}

\item{to}{Optional upper bound for the heatmap scale. Values above this bound
inherit the maximum color.}

\item{displace}{Whether to show per-vertex displacement vectors. Use
\code{TRUE} for a scale factor of 1, \code{FALSE} to disable, or a numeric
scalar to scale the displacement vectors.}

\item{alpha}{Optional transparency for the reference heatmap surface.}

\item{add}{Whether to add the result to the current Babylonian scene. Use
\code{add = FALSE} to start a fresh scene.}

\item{axes}{Whether to draw lightweight scene axes, ticks, labels, and a
bounding box.}

\item{nticks}{Approximate number of tick marks per axis when \code{axes = TRUE}.}

\item{...}{Reserved for future mesh-distance options.}
}
\description{
This computes the same signed-distance range and color ramp as
\code{meshDist()}, but returns only a 2D scale bar plot instead of rendering
the 3D scene.
}
