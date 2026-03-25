#' Save a Babylonian scene snapshot to an image file
#'
#' Captures a rendered Babylonian scene and writes it to an image file via
#' `webshot2`. When `widget` is omitted, the current in-memory scene
#' accumulator is used.
#'
#' @param filename Output image path.
#' @param widget Optional Babylonian htmlwidget. If omitted, the current scene
#'   from the `plot3d()` accumulator is rendered.
#' @param vwidth Viewport width passed to [webshot2::webshot()]. When `NULL`,
#'   Babylonian uses the current `par3d(windowRect=...)` width.
#' @param vheight Viewport height passed to [webshot2::webshot()]. When `NULL`,
#'   Babylonian uses the current `par3d(windowRect=...)` height.
#' @param delay Delay (seconds) before the screenshot is taken.
#' @param ... Additional arguments forwarded to [webshot2::webshot()].
#'
#' @export
snapshot3d <- function(filename = "snapshot3d.png", widget = NULL, vwidth = NULL, vheight = NULL, delay = 0.5, ...) {
  dimensions <- resolve_widget_dimensions(width = vwidth, height = vheight)
  vwidth <- dimensions$width
  vheight <- dimensions$height

  if (is.null(widget)) {
    scene_spec <- current_scene_spec()
    if (is.null(scene_spec)) {
      stop("No active Babylonian scene available. Plot a scene first or pass `widget`.", call. = FALSE)
    }
    widget <- babylon(scene_spec$objects, scene = scene_spec$scene)
  }

  if (!inherits(widget, "htmlwidget")) {
    stop("`widget` must be an htmlwidget created by `babylon()`.", call. = FALSE)
  }

  if (!requireNamespace("webshot2", quietly = TRUE)) {
    stop("Package 'webshot2' is required for `snapshot3d()`.", call. = FALSE)
  }

  tmp_html <- tempfile(fileext = ".html")
  tmp_libdir <- paste0(tmp_html, "_files")

  htmlwidgets::saveWidget(widget, file = tmp_html, selfcontained = FALSE, libdir = tmp_libdir)

  webshot2::webshot(
    url = paste0("file://", normalizePath(tmp_html, winslash = "/", mustWork = TRUE)),
    file = filename,
    selector = "canvas",
    vwidth = vwidth,
    vheight = vheight,
    delay = delay,
    ...
  )

  invisible(filename)
}

#' @rdname snapshot3d
#' @export
rgl.snapshot <- snapshot3d

#' @rdname snapshot3d
#' @export
snapshot <- snapshot3d
