\name{morph_target3d}
\alias{morph_target3d}
\title{Create a morph-target-enabled Babylon mesh}
\usage{
morph_target3d(x, target, influence = 0, ...)
}
\arguments{
\item{x}{A `mesh3d` or `babylon_mesh` object used as the base mesh.}

\item{target}{A `mesh3d` or `babylon_mesh` object with matching topology.}

\item{influence}{Initial morph-target influence.}

\item{...}{Additional graphical parameters forwarded to
\code{\link{as_babylon_mesh}} or applied to an existing `babylon_mesh`.}
}
\description{
Wraps a reference mesh together with a same-topology morph target mesh so
BabylonJS can interpolate between them with a numeric influence value.
}
