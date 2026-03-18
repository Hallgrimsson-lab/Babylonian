\name{orbit_path3d}
\alias{orbit_path3d}
\title{Create a camera orbit path around the current subject}
\usage{
orbit_path3d(
  n = 120,
  axis = "y",
  turns = 1,
  start = 0,
  end = NULL,
  base_view = NULL,
  zoom = NULL,
  userMatrix = NULL,
  include_endpoint = FALSE
)
}
\arguments{
\item{n}{Number of animation frames.}

\item{axis}{Rotation axis as `"x"`, `"y"`, `"z"`, or a numeric length-3
vector.}

\item{turns}{Number of full turns when \code{end} is not supplied.}

\item{start}{Starting angle in radians.}

\item{end}{Optional ending angle in radians.}

\item{base_view}{Optional base view list with \code{zoom} and
\code{userMatrix}.}

\item{zoom}{Optional zoom override for the generated views.}

\item{userMatrix}{Optional user-matrix override for the generated views.}

\item{include_endpoint}{Whether to include the ending angle as an extra frame.}
}
\description{
Generates a sequence of Babylonian view states suitable for turntable-style
camera animation.
}
