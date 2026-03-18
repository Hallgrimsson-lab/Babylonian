\name{edit_scene3d}
\alias{edit_scene3d}
\alias{apply_scene_state}
\alias{last_scene_state}
\title{Edit and reuse Babylonian scene states}
\usage{
edit_scene3d(x, width = NULL, height = NULL, ...)

apply_scene_state(x = NULL, state = last_scene_state(), ...)

last_scene_state()
}
\arguments{
\item{x}{A supported \code{plot3d()} object, an existing Babylonian htmlwidget,
or \code{NULL} when applying a saved state to the current accumulated scene.}

\item{width}{Widget width.}

\item{height}{Widget height.}

\item{state}{A scene state returned by \code{edit_scene3d()}. Defaults to the
most recent value from \code{last_scene_state()}.}

\item{...}{Additional arguments passed to \code{plot3d()} with
\code{add = FALSE} when \code{x} is not already a widget.}
}
\description{
\code{edit_scene3d()} opens a BabylonJS gizmo editor for mesh and light
placement. The returned scene state captures camera pose plus edited mesh
transforms and light placement/direction. \code{apply_scene_state()} reapplies
that saved state to a widget or to the current in-memory Babylonian scene so it
can be rendered again or passed to \code{snapshot3d()}.
}
