\name{record_scene3d}
\alias{record_scene3d}
\title{Record a Babylonian scene to GIF or video}
\usage{
record_scene3d(
  x = NULL,
  file,
  views = NULL,
  morph = NULL,
  morph_target = NULL,
  heatmap = FALSE,
  heatmap_args = NULL,
  type = NULL,
  fps = 30,
  loop = 0,
  vwidth = 1600,
  vheight = 1600,
  delay = 0.5,
  overwrite = TRUE,
  keep_frames = FALSE,
  render_fun = render_frames3d,
  system_runner = system2,
  ...
)
}
\arguments{
\item{x}{Optional Babylonian htmlwidget or `plot3d()`-compatible object. If
omitted, the current accumulated scene is used.}

\item{file}{Output animation path.}

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

\item{type}{Output type. Use `"gif"`, `"video"`, or \code{NULL} to infer from
the file extension.}

\item{fps}{Frames per second.}

\item{loop}{GIF loop count.}

\item{vwidth}{Frame width in pixels.}

\item{vheight}{Frame height in pixels.}

\item{delay}{Delay passed to \code{\link{snapshot3d}} for each frame.}

\item{overwrite}{Whether to overwrite an existing output file.}

\item{keep_frames}{Whether to keep intermediate PNG frames.}

\item{render_fun}{Advanced override used to render frames.}

\item{system_runner}{Advanced override used to run external encoders.}

\item{...}{Additional arguments forwarded to \code{\link{render_frames3d}}.}
}
\description{
Renders animation frames with Babylonian and then encodes either a GIF or a
video using ImageMagick or ffmpeg. Heatmap animation mode can be used to
recompute a \code{\link{meshDist}} comparison for every frame of a morph
sequence before encoding.
}
