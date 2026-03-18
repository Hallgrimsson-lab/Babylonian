#' Display two Babylonian scenes side by side
#'
#' This helper lays out two Babylonian scenes next to each other and can keep
#' their camera views synchronized when both widgets are shown on the same
#' page.
#'
#' @param left,right Babylonian htmlwidgets or objects accepted by [plot3d()].
#' @param sync Whether to synchronize camera motion between the two views.
#' @param sync_group Optional sync-group identifier. When omitted and
#'   `sync = TRUE`, a unique group id is generated automatically.
#' @param labels Optional character vector of length two used as panel labels.
#' @param gap CSS gap between panels.
#' @param height Optional widget height applied to both panels.
#' @param width Overall container width.
#' @param ... Additional arguments passed to [plot3d()] when `left` or `right`
#'   are not already Babylonian widgets.
#'
#' @export
paired_scene3d <- function(
  left,
  right,
  sync = TRUE,
  sync_group = NULL,
  labels = NULL,
  gap = "16px",
  height = NULL,
  width = "100%",
  ...
) {
  if (!is.null(labels) && length(labels) != 2L) {
    stop("`labels` must be NULL or a character vector of length 2.", call. = FALSE)
  }

  if (isTRUE(sync) && is.null(sync_group)) {
    sync_group <- paste0("paired-scene-", as.integer(stats::runif(1, 1, 1e9)))
  }

  left_widget <- as_paired_scene_widget(left, sync = sync, sync_group = sync_group, height = height, ...)
  right_widget <- as_paired_scene_widget(right, sync = sync, sync_group = sync_group, height = height, ...)

  htmltools::browsable(
    htmltools::div(
      style = paste(
        "display:flex;",
        "flex-wrap:wrap;",
        "align-items:stretch;",
        paste0("gap:", gap, ";"),
        paste0("width:", width, ";")
      ),
      paired_scene_panel(left_widget, if (is.null(labels)) NULL else labels[[1]]),
      paired_scene_panel(right_widget, if (is.null(labels)) NULL else labels[[2]])
    )
  )
}

normalize_scene_sync <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.character(x) && length(x) == 1L) {
    x <- list(group = x, camera = TRUE)
  }

  if (!is.list(x)) {
    stop("`scene$sync` must be a list or a single sync-group string.", call. = FALSE)
  }

  group <- x$group %||% x$id %||% x$name
  if (is.null(group) || !nzchar(as.character(group[[1]]))) {
    stop("`scene$sync$group` must be a non-empty string.", call. = FALSE)
  }

  list(
    group = as.character(group[[1]]),
    camera = if (is.null(x$camera)) TRUE else isTRUE(x$camera)
  )
}

as_paired_scene_widget <- function(x, sync = TRUE, sync_group = NULL, height = NULL, ...) {
  if (inherits(x, "htmlwidget")) {
    widget <- x
    widget$x$scene <- normalize_scene(widget$x$scene)
  } else {
    widget <- do.call(
      plot3d,
      c(
        list(x = x, add = FALSE),
        list(...)
      )
    )
  }

  if (isTRUE(sync)) {
    widget$x$scene$sync <- normalize_scene_sync(list(group = sync_group, camera = TRUE))
  } else {
    widget$x$scene$sync <- NULL
  }

  widget$width <- "100%"
  if (!is.null(height)) {
    widget$height <- height
  }

  widget
}

paired_scene_panel <- function(widget, label = NULL) {
  children <- list()

  if (!is.null(label)) {
    children[[length(children) + 1L]] <- htmltools::div(
      style = paste(
        "font-family:Menlo, Monaco, Consolas, monospace;",
        "font-size:12px;",
        "font-weight:700;",
        "margin-bottom:8px;",
        "color:#0f172a;"
      ),
      label
    )
  }

  children[[length(children) + 1L]] <- widget

  do.call(
    htmltools::div,
    c(
      list(
        style = paste(
          "flex:1 1 0;",
          "min-width:320px;"
        )
      ),
      children
    )
  )
}
