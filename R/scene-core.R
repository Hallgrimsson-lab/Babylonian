#' BabylonJS Widget
#'
#' This function creates a new BabylonJS scene.
#'
#' @param data A list of scene objects to be passed to the widget. Entries can
#'   be Babylonian primitive specifications, file-backed meshes created with
#'   [import_mesh()], or `mesh3d` objects such as those returned by Morpho.
#' @param interaction Optional interaction settings used by bespoke tools such
#'   as landmark digitizing.
#' @param scene Optional scene decorations and display settings.
#' @param width The width of the widget.
#' @param height The height of the widget.
#' @param elementId The ID of the HTML element to contain the widget.
#'
#' @export
babylon <- function(
  data = list(list(type = "sphere", diameter = 2)),
  interaction = NULL,
  scene = NULL,
  sync_group = NULL,
  sync_camera = TRUE,
  width = NULL,
  height = NULL,
  elementId = NULL
) {
  data <- lapply(data, normalize_scene_object)
  interaction <- normalize_interaction(interaction)
  scene <- normalize_scene(scene)
  if (!is.null(sync_group)) {
    scene$sync <- normalize_scene_sync(list(
      group = sync_group,
      camera = sync_camera
    ))
  }
  if (!is.null(scene$view)) {
    .babylon_state$last_scene_par3d <- deserialize_par3d(scene$view)
  }

  extracted <- extract_scene_dependencies(data)
  data <- extracted$value
  scene_extracted <- extract_scene_dependencies(scene, extracted$dependencies)
  scene <- scene_extracted$value
  dependencies <- htmltools::resolveDependencies(scene_extracted$dependencies)

  htmlwidgets::createWidget(
    name = "babylon",
    x = list(
      objects = data,
      interaction = interaction,
      scene = scene
    ),
    width = width,
    height = height,
    package = "Babylonian",
    elementId = elementId,
    dependencies = dependencies
  )
}

extract_scene_dependencies <- function(x, dependencies = list()) {
  if (!is.list(x)) {
    return(list(value = x, dependencies = dependencies))
  }

  if (!is.null(x[["dep"]])) {
    dependencies[[length(dependencies) + 1L]] <- x[["dep"]]
    x[["dep"]] <- NULL
  }

  if (length(x)) {
    for (i in seq_along(x)) {
      extracted <- extract_scene_dependencies(x[[i]], dependencies)
      x[i] <- list(extracted$value)
      dependencies <- extracted$dependencies
    }
  }

  list(value = x, dependencies = dependencies)
}

normalize_scene_object <- function(x) {
  if (inherits(x, "mesh3d")) {
    return(as_babylon_mesh(x))
  }

  if (inherits(x, "babylon_light") || identical(x$type, "light3d")) {
    return(normalize_babylon_light(x))
  }

  if (inherits(x, "babylon_points") || identical(x$type, "spheres3d")) {
    if (!is.null(x$color) && length(x$color) == 1L) {
      x$color <- normalize_babylon_color(x$color)
    }
    if (is.null(x$specularity) && !inherits(x, "babylon_points")) {
      x$specularity <- normalize_babylon_specularity("black")
    } else if (!is.null(x$specularity)) {
      x$specularity <- normalize_babylon_specularity(x$specularity)
    }
    return(x)
  }

  if (is.list(x)) {
    if (!is.null(x[["material"]])) {
      x[["material"]] <- normalize_material3d(x[["material"]])
    }
    if (!is.null(x[["material_overrides"]])) {
      x[["material_overrides"]] <- lapply(x[["material_overrides"]], function(override) {
        list(
          target = normalize_model_target(override$target),
          material = normalize_material3d(override$material)
        )
      })
    }
    if (!is.null(x[["geometry_overrides"]])) {
      x[["geometry_overrides"]] <- lapply(x[["geometry_overrides"]], function(override) {
        list(
          target = normalize_model_target(override$target),
          geometry = serialize_geometry3d(override$geometry %||% override)
        )
      })
    }
    if (!is.null(x[["vertex_attributes"]])) {
      x[["vertex_attributes"]] <- normalize_vertex_attributes(x[["vertex_attributes"]])
    }
    if (!is.null(x[["morph_target"]])) {
      x[["morph_target"]] <- normalize_morph_target_spec(x[["morph_target"]], base_vertices = x$vertices, base_indices = x$indices)
    }
    if (!is.null(x[["color"]])) {
      if (identical(x$type, "segments3d") && length(x$color) > 1L) {
        x$color <- normalize_segment_colors(x$color, nrow(x$points) / 2L)
      } else {
        x$color <- normalize_babylon_color(x$color)
      }
    }
    if (is.null(x[["specularity"]]) && !identical(x$type, "segments3d") && !identical(x$type, "mesh") && !identical(x$type, "asset3d")) {
      x$specularity <- normalize_babylon_specularity("black")
    } else if (!is.null(x[["specularity"]])) {
      x$specularity <- normalize_babylon_specularity(x$specularity)
    }
  }

  x
}

normalize_interaction <- function(x) {
  if (is.null(x) || !is.list(x)) {
    return(x)
  }

  if (is.list(x$marker) && !is.null(x$marker$color)) {
    x$marker$color <- normalize_babylon_color(x$marker$color)
  }

  x
}

normalize_scene <- function(x) {
  if (is.null(x)) {
    x <- list()
  }

  if (!is.null(x$nticks)) {
    x$nticks <- as.integer(x$nticks)
  }

  if (is.null(x$view)) {
    x$view <- serialize_par3d(.babylon_state$par3d)
  } else {
    x$view <- normalize_view(x$view)
  }

  if (!is.null(x$sync)) {
    x$sync <- normalize_scene_sync(x$sync)
  }

  if (!is.null(x$postprocess)) {
    x$postprocess <- normalize_scene_postprocesses(x$postprocess)
  }

  x$materials <- normalize_scene_material_library(x$materials %||% NULL)

  x
}

current_scene_spec <- function() {
  .babylon_state$current_scene
}

append_current_scene <- function(object, add = TRUE, axes = TRUE, nticks = 5) {
  append_scene_objects(list(object), add = add, axes = axes, nticks = nticks)
}

append_scene_objects <- function(objects, add = TRUE, axes = TRUE, nticks = 5) {
  scene_spec <- current_scene_spec()

  if (!isTRUE(add) || is.null(scene_spec)) {
    scene_spec <- list(
      objects = list(),
      scene = list(
        axes = isTRUE(axes),
        nticks = as.integer(nticks),
        view = serialize_par3d(.babylon_state$par3d)
      )
    )
  } else {
    if (!missing(axes)) {
      scene_spec$scene$axes <- isTRUE(axes)
    }
    if (!missing(nticks) && !is.null(nticks)) {
      scene_spec$scene$nticks <- as.integer(nticks)
    }
  }

  for (object in objects) {
    scene_spec$objects[[length(scene_spec$objects) + 1L]] <- object
  }
  .babylon_state$current_scene <- scene_spec

  babylon(scene_spec$objects, scene = scene_spec$scene)
}

#' Get or set Babylonian view parameters
#'
#' This stores lightweight `par3d()`-style view settings that new Babylonian
#' scenes will use, including `zoom`, `userMatrix`, and background color.
#'
#' @param zoom Optional zoom multiplier.
#' @param userMatrix Optional 4 x 4 user matrix used to rotate the scene pose.
#' @param bg Optional background color for the scene canvas.
#' @param reset Whether to restore the default view state.
#'
#' @export
par3d <- function(zoom = NULL, userMatrix = NULL, bg = NULL, reset = FALSE) {
  if (isTRUE(reset)) {
    .babylon_state$par3d <- list(
      zoom = 0.05,
      userMatrix = diag(4),
      bg = "#FAFAFA"
    )
  }

  if (!is.null(zoom)) {
    .babylon_state$par3d$zoom <- as.numeric(zoom[[1]])
  }

  if (!is.null(userMatrix)) {
    .babylon_state$par3d$userMatrix <- normalize_user_matrix(userMatrix)
  }

  if (!is.null(bg)) {
    .babylon_state$par3d$bg <- normalize_babylon_color(bg)
  }

  .babylon_state$last_scene_par3d <- .babylon_state$par3d
  .babylon_state$par3d
}

#' Get or set the persistent Babylonian scene background color
#'
#' This is a small convenience wrapper around [par3d()] for the scene canvas
#' background. The color persists across new scenes the same way `zoom` and
#' `userMatrix` do.
#'
#' @param color Optional background color. When omitted, the current background
#'   color is returned.
#'
#' @export
bg3d <- function(color = NULL) {
  if (is.null(color)) {
    return(par3d()$bg)
  }

  par3d(bg = color)$bg
}

#' Get the last Babylonian scene view state
#'
#' @param live Whether to prefer the last live camera state reported back from a
#'   Shiny-backed Babylonian widget. If unavailable, the last constructed scene
#'   view is returned.
#'
#' @export
last_par3d <- function(live = FALSE) {
  if (isTRUE(live) && !is.null(.babylon_state$last_live_par3d)) {
    return(.babylon_state$last_live_par3d)
  }

  .babylon_state$last_scene_par3d
}

normalize_view <- function(x) {
  if (is.null(x)) {
    return(serialize_par3d(.babylon_state$par3d))
  }

  zoom <- x$zoom
  if (is.null(zoom)) {
    zoom <- .babylon_state$par3d$zoom
  }

  user_matrix <- x$userMatrix
  if (is.null(user_matrix)) {
    user_matrix <- .babylon_state$par3d$userMatrix
  }

  bg <- x$bg
  if (is.null(bg)) {
    bg <- .babylon_state$par3d$bg
  } else {
    bg <- normalize_babylon_color(bg)
  }

  view <- serialize_par3d(list(
    zoom = zoom,
    userMatrix = user_matrix,
    bg = bg
  ))

  if (!is.null(x$camera)) {
    view$camera <- normalize_view_camera(x$camera)
  }

  view
}

serialize_par3d <- function(x) {
  mat <- normalize_user_matrix(x$userMatrix)
  list(
    zoom = as.numeric(x$zoom[[1]]),
    userMatrix = unname(split(mat, row(mat))),
    bg = normalize_babylon_color(x$bg %||% .babylon_state$par3d$bg)
  )
}

deserialize_par3d <- function(x) {
  if (is.null(x)) {
    return(.babylon_state$par3d)
  }

  list(
    zoom = as.numeric(x$zoom[[1]]),
    userMatrix = normalize_user_matrix(x$userMatrix),
    bg = normalize_babylon_color(x$bg %||% .babylon_state$par3d$bg)
  )
}

set_last_live_par3d <- function(x) {
  .babylon_state$last_live_par3d <- deserialize_par3d(x)
  invisible(.babylon_state$last_live_par3d)
}

normalize_view_camera <- function(x) {
  if (is.null(x) || !is.list(x)) {
    stop("`view$camera` must be a list with `alpha`, `beta`, `radius`, and `target`.", call. = FALSE)
  }

  alpha <- as.numeric(x$alpha[[1]])
  beta <- as.numeric(x$beta[[1]])
  radius <- as.numeric(x$radius[[1]])
  target <- x$target
  if (is.list(target)) {
    target <- unlist(target, recursive = TRUE, use.names = FALSE)
  }
  target <- as.numeric(target)

  if (!is.finite(alpha) || !is.finite(beta) || !is.finite(radius) || radius <= 0) {
    stop("`view$camera` must contain finite `alpha`, `beta`, and positive `radius` values.", call. = FALSE)
  }
  if (length(target) != 3L || !all(is.finite(target))) {
    stop("`view$camera$target` must be a finite numeric vector of length 3.", call. = FALSE)
  }

  list(
    alpha = alpha,
    beta = beta,
    radius = radius,
    target = unname(target)
  )
}

normalize_user_matrix <- function(x) {
  if (is.list(x) && length(x) == 4L) {
    x <- do.call(rbind, lapply(x, unlist, use.names = FALSE))
  }

  x <- as.matrix(x)

  if (!identical(dim(x), c(4L, 4L))) {
    stop("`userMatrix` must be a 4 x 4 matrix.", call. = FALSE)
  }

  storage.mode(x) <- "numeric"
  x
}

#' Clear the current Babylonian scene accumulator
#'
#' This clears the in-memory scene state used by `plot3d(..., add = TRUE)` and
#' helper wrappers such as [points3d()] and [spheres3d()].
#'
#' @export
clear_scene3d <- function() {
  .babylon_state$current_scene <- NULL
  invisible(NULL)
}

#' Register knitr hooks for inline Babylonian notebook output
#'
#' This registers a `babylon` chunk hook for knitr-based documents such as R
#' Markdown and Quarto notebooks. When a chunk uses `babylon = TRUE`, the
#' Babylonian scene accumulator is cleared before the chunk runs so inline
#' widget output starts from a fresh scene.
#'
#' @export
use_babylon_knitr <- function() {
  if (!requireNamespace("knitr", quietly = TRUE)) {
    stop("Package 'knitr' is required to register Babylonian notebook hooks.", call. = FALSE)
  }

  knitr::knit_hooks$set(
    babylon = function(before, options, envir) {
      if (isTRUE(before)) {
        clear_scene3d()
      }
      NULL
    }
  )

  invisible(TRUE)
}
