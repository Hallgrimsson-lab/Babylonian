\name{render_frames3d}
\alias{render_frames3d}
\title{Render a Babylonian animation to individual frames}
\usage{
render_frames3d(
  x = NULL,
  dir,
  views = NULL,
  morph = NULL,
  morph_target = NULL,
  heatmap = FALSE,
  heatmap_args = NULL,
  filename_pattern = "frame_\%04d.png",
  vwidth = 1600,
  vheight = 1600,
  delay = 0.5,
  overwrite = TRUE,
  snapshot_fun = snapshot3d,
  ...
)
}
\arguments{
\item{x}{Optional Babylonian htmlwidget or `plot3d()`-compatible object. If
omitted, the current accumulated scene is used.}

\item{dir}{Output directory for rendered frames.}

\item{views}{Optional camera views, such as those returned by
\code{\link{orbit_path3d}}.}

\item{morph}{Optional morph-influence sequence, such as that returned by
\code{\link{morph_path3d}}.}

\item{morph_target}{Optional mesh selector used when applying \code{morph}.}

\item{heatmap}{Whether to render each frame as a \code{\link{meshDist}}
heatmap derived from the selected morph-target mesh instead of snapshotting
the original scene directly.}

\item{heatmap_args}{Optional named list of additional arguments forwarded to
\code{\link{meshDist}} when \code{heatmap = TRUE}.}

\item{filename_pattern}{\code{sprintf()}-style filename pattern for frames.}

\item{vwidth}{Frame width in pixels.}

\item{vheight}{Frame height in pixels.}

\item{delay}{Delay passed to \code{\link{snapshot3d}} for each frame.}

\item{overwrite}{Whether to overwrite existing frame files.}

\item{snapshot_fun}{Advanced override used to capture each frame.}

\item{...}{Additional arguments forwarded to \code{\link{snapshot3d}}.}
}
\description{
Renders a sequence of Babylonian scene views and morph states to individual
high-resolution PNG frames. When \code{heatmap = TRUE}, each frame is first
converted into a fresh \code{\link{meshDist}} comparison scene before being
captured.
}
