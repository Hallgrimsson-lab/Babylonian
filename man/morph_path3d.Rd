\name{morph_path3d}
\alias{morph_path3d}
\title{Create a morph-influence animation path}
\usage{
morph_path3d(
  n = 60,
  from = 0,
  to = 1,
  easing = c("linear", "ease_in", "ease_out", "ease_in_out"),
  ping_pong = FALSE
)
}
\arguments{
\item{n}{Number of animation frames.}

\item{from}{Starting morph influence.}

\item{to}{Ending morph influence.}

\item{easing}{Easing function to apply.}

\item{ping_pong}{Whether to append the reversed path for a back-and-forth
animation.}
}
\description{
Builds a numeric sequence of morph-target influences that can be fed into
\code{\link{render_frames3d}} or \code{\link{record_scene3d}}.
}
