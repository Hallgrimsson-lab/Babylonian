#' Create a scene post-process descriptor
#'
#' @param type Post-process type. Currently `"depth_of_field"` is supported.
#' @param ... Additional type-specific parameters.
#'
#' @export
postprocess3d <- function(type, ...) {
  if (!is.character(type) || !length(type) || !nzchar(type[[1]])) {
    stop("`type` must be a non-empty string.", call. = FALSE)
  }

  normalize_scene_postprocess(c(list(type = as.character(type[[1]])), list(...)))
}

#' Create a depth-of-field post-process descriptor
#'
#' @param focus_distance Focus distance in scene units.
#' @param f_stop Camera f-stop used by Babylon's depth-of-field effect.
#' @param focal_length Focal length in millimeters.
#' @param blur_level Blur quality level: `"low"`, `"medium"`, or `"high"`.
#'
#' @export
dof3d <- function(
  focus_distance = NULL,
  f_stop = NULL,
  focal_length = NULL,
  blur_level = c("low", "medium", "high")
) {
  blur_level <- match.arg(blur_level)
  args <- list(type = "depth_of_field", blur_level = blur_level)

  if (!is.null(focus_distance)) {
    args$focus_distance <- as.numeric(focus_distance[[1]])
  }
  if (!is.null(f_stop)) {
    args$f_stop <- as.numeric(f_stop[[1]])
  }
  if (!is.null(focal_length)) {
    args$focal_length <- as.numeric(focal_length[[1]])
  }

  normalize_scene_postprocess(args)
}

normalize_scene_postprocesses <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.list(x) && !length(x)) {
    return(list())
  }

  if (is.list(x) && !is.null(x$type)) {
    return(list(normalize_scene_postprocess(x)))
  }

  if (!is.list(x)) {
    stop("`scene$postprocess` must be a post-process descriptor or a list of descriptors.", call. = FALSE)
  }

  lapply(x, normalize_scene_postprocess)
}

normalize_scene_postprocess <- function(x) {
  if (inherits(x, "babylon_postprocess")) {
    return(unclass(x))
  }

  if (!is.list(x) || is.null(x$type)) {
    stop("Scene post-process descriptors must be lists with a `type` entry.", call. = FALSE)
  }

  type <- tolower(as.character(x$type[[1]]))

  if (identical(type, "depth_of_field")) {
    out <- list(
      type = "depth_of_field",
      blur_level = normalize_dof_blur_level(x$blur_level %||% "low")
    )

    if (!is.null(x$focus_distance)) {
      out$focus_distance <- normalize_scene_effect_scalar(x$focus_distance, "focus_distance")
    }
    if (!is.null(x$f_stop)) {
      out$f_stop <- normalize_scene_effect_scalar(x$f_stop, "f_stop")
    }
    if (!is.null(x$focal_length)) {
      out$focal_length <- normalize_scene_effect_scalar(x$focal_length, "focal_length")
    }

    return(structure(out, class = c("babylon_postprocess", "list")))
  }

  stop("Unsupported scene post-process type: ", type, call. = FALSE)
}

normalize_dof_blur_level <- function(x) {
  value <- tolower(as.character(x[[1]]))
  if (!value %in% c("low", "medium", "high")) {
    stop("`blur_level` must be one of \"low\", \"medium\", or \"high\".", call. = FALSE)
  }
  value
}

normalize_scene_effect_scalar <- function(x, arg) {
  if (!is.numeric(x) || !length(x) || !is.finite(x[[1]])) {
    stop("`", arg, "` must be a finite numeric scalar.", call. = FALSE)
  }
  as.numeric(x[[1]])
}
