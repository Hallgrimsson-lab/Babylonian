\name{paired_scene3d}
\alias{paired_scene3d}
\title{Display two Babylonian scenes side by side}
\usage{
paired_scene3d(
  left,
  right,
  sync = TRUE,
  sync_group = NULL,
  labels = NULL,
  gap = "16px",
  height = NULL,
  width = "100%",
  ...
)
}
\arguments{
\item{left, right}{Babylonian htmlwidgets or objects accepted by \code{plot3d()}.}

\item{sync}{Whether to synchronize camera motion between the two views.}

\item{sync_group}{Optional sync-group identifier. When omitted and
\code{sync = TRUE}, a unique group id is generated automatically.}

\item{labels}{Optional character vector of length two used as panel labels.}

\item{gap}{CSS gap between panels.}

\item{height}{Optional widget height applied to both panels.}

\item{width}{Overall container width.}

\item{...}{Additional arguments passed to \code{plot3d()} when \code{left} or
\code{right} are not already Babylonian widgets.}
}
\description{
Lays out two Babylonian scenes next to each other and can keep their camera
views synchronized when both widgets are shown on the same page.
}
