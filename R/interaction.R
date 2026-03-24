#' Start an interactive landmark digitizer on a Babylon mesh
#'
#' This creates a Babylon widget that captures surface picks using BabylonJS
#' ray casting. Landmark picks are snapped to the nearest mesh vertex so the
#' workflow more closely mirrors Geomorph's 3D digitizing tools. In interactive
#' R sessions, landmarking completes by returning a three-column coordinate
#' matrix, or a list with coordinates and vertex indices when `index = TRUE`.
#' In non-interactive contexts, the function returns the underlying widget.
#'
#' @param x A `babylon_mesh` object or `mesh3d` object.
#' @param n Optional target number of landmarks to collect.
#' @param fixed Either the number of landmarks to collect, matching Geomorph's
#'   `digit.fixed()` usage, or a matrix of fixed landmarks to show on the
#'   surface.
#' @param index Whether to also return the selected vertex indices.
#' @param ptsize Optional point-size hint, similar to Geomorph. In Babylonian
#'   this scales the landmark marker size.
#' @param center Whether to center the mesh coordinates before digitizing.
#' @param width Widget width.
#' @param height Widget height.
#' @param elementId Optional widget element id.
#' @param marker_color Landmark marker color.
#' @param marker_scale Landmark marker diameter as a fraction of mesh radius.
#'
#' @export
digitize_landmarks <- function(
  x,
  n = NULL,
  fixed = NULL,
  index = FALSE,
  ptsize = 1,
  center = TRUE,
  width = NULL,
  height = NULL,
  elementId = NULL,
  marker_color = "#dc2626",
  marker_scale = 0.015
) {
  mesh <- normalize_scene_object(x)

  if (!inherits(mesh, "babylon_mesh")) {
    stop("`x` must be a `babylon_mesh` or `mesh3d` object.", call. = FALSE)
  }

  target_n <- resolve_landmark_target_count(n = n, fixed = fixed)
  fixed_landmarks <- resolve_fixed_landmarks(fixed)
  prepared <- prepare_digitize_landmark_mesh(
    mesh,
    fixed = fixed_landmarks,
    center = center
  )
  mesh <- prepared$mesh
  fixed_landmarks <- prepared$fixed

  interaction <- list(
    mode = "digitize_landmarks",
    n = target_n,
    fixed = fixed_landmarks,
    index = isTRUE(index),
    marker = list(
      color = normalize_babylon_color(marker_color),
      scale = normalize_digitize_marker_scale(marker_scale, ptsize)
    ),
    center = isTRUE(center)
  )

  widget <- babylon(
    data = list(mesh),
    interaction = interaction,
    width = width,
    height = height,
    elementId = elementId
  )
  widget$x$scene$view <- NULL

  if (!interactive()) {
    return(widget)
  }

  run_landmark_gadget(widget, n = target_n, index = isTRUE(index))
}

#' Geomorph-style compatibility wrapper for fixed 3D landmark digitizing
#'
#' This mirrors the core interface of Geomorph's `digit.fixed()` while using
#' Babylonian's interactive mesh digitizer under the hood.
#'
#' @param spec A `mesh3d` or `babylon_mesh` object.
#' @param fixed The number of landmarks to digitize, or a matrix of fixed
#'   landmarks to display.
#' @param index Whether to also return selected vertex indices.
#' @param ptsize Optional point-size hint used to scale landmark markers.
#' @param center Whether to center the mesh before digitizing.
#' @param width Widget width.
#' @param height Widget height.
#' @param elementId Optional widget element id.
#' @param marker_color Landmark marker color.
#' @param marker_scale Landmark marker diameter as a fraction of mesh radius.
#'
#' @export
digit.fixed <- function(
  spec,
  fixed,
  index = FALSE,
  ptsize = 1,
  center = TRUE,
  width = NULL,
  height = NULL,
  elementId = NULL,
  marker_color = "#dc2626",
  marker_scale = 0.015
) {
  digitize_landmarks(
    x = spec,
    fixed = fixed,
    index = index,
    ptsize = ptsize,
    center = center,
    width = width,
    height = height,
    elementId = elementId,
    marker_color = marker_color,
    marker_scale = marker_scale
  )
}

#' Interactively paint-select vertices on a mesh
#'
#' This opens a Babylonian painting gadget that lets you brush directly on a
#' mesh surface to collect vertex indices. Painting can be toggled from the UI
#' or with the `p` key, and the selection can be mirrored across local `x`,
#' `y`, and `z` axes before finishing.
#'
#' @param x A `babylon_mesh` or `mesh3d` object.
#' @param center Whether to center the mesh coordinates before painting.
#' @param width Widget width.
#' @param height Widget height.
#' @param elementId Optional widget element id.
#' @param color Selection marker color.
#' @param marker_scale Selection marker diameter as a fraction of mesh radius.
#'
#' @export
paint_vertices3d <- function(
  x,
  center = TRUE,
  width = NULL,
  height = NULL,
  elementId = NULL,
  color = "#dc2626",
  marker_scale = 0.012
) {
  mesh <- normalize_scene_object(x)

  if (!inherits(mesh, "babylon_mesh")) {
    stop("`x` must be a `babylon_mesh` or `mesh3d` object.", call. = FALSE)
  }

  prepared <- prepare_digitize_landmark_mesh(
    mesh,
    fixed = NULL,
    center = center
  )
  mesh <- prepared$mesh

  interaction <- list(
    mode = "paint_vertices",
    center = isTRUE(center),
    marker = list(
      color = normalize_babylon_color(color),
      scale = normalize_digitize_marker_scale(marker_scale, 1)
    )
  )

  widget <- babylon(
    data = list(mesh),
    interaction = interaction,
    width = width,
    height = height,
    elementId = elementId
  )
  widget$x$scene$view <- NULL

  if (!interactive()) {
    return(widget)
  }

  run_vertex_paint_gadget(widget)
}

#' Interactively pose a 3D scene and return its view parameters
#'
#' This opens a Shiny gadget with a Babylonian scene, lets you rotate and zoom
#' the object, and returns the resulting `par3d()`-style view settings when you
#' finish.
#'
#' @param x A supported `plot3d()` object.
#' @param width Widget width.
#' @param height Widget height.
#' @param ... Additional arguments passed to [plot3d()] with `add = FALSE`.
#'
#' @export
create_pose_3d <- function(x, width = NULL, height = NULL, ...) {
  widget <- do.call(
    plot3d,
    c(
      list(x = x, add = FALSE),
      list(...)
    )
  )
  widget$x$interaction <- list(mode = "pose_3d")
  widget$x$scene$view <- NULL

  if (!is.null(width)) {
    widget$width <- width
  }

  if (!is.null(height)) {
    widget$height <- height
  }

  if (!interactive()) {
    return(widget)
  }

  run_pose_gadget(widget)
}

#' Interactively edit mesh and light transforms in a 3D scene
#'
#' This opens a Babylonian scene editor with native BabylonJS gizmos for mesh
#' and light primitives. The returned scene state captures the camera pose plus
#' edited mesh transforms and light placement so it can be reused later with
#' [apply_scene_state()].
#'
#' @param x A supported `plot3d()` object or an existing Babylonian htmlwidget.
#' @param width Widget width.
#' @param height Widget height.
#' @param ... Additional arguments passed to [plot3d()] with `add = FALSE` when
#'   `x` is not already a widget.
#'
#' @export
edit_scene3d <- function(x, width = NULL, height = NULL, ...) {
  if (inherits(x, "htmlwidget")) {
    widget <- babylon(
      data = x$x$objects %||% list(),
      interaction = x$x$interaction %||% NULL,
      scene = x$x$scene %||% NULL,
      width = width %||% x$width,
      height = height %||% x$height,
      elementId = NULL
    )
  } else {
    widget <- do.call(
      plot3d,
      c(
        list(x = x, add = FALSE),
        list(...)
      )
    )
  }

  widget$x$interaction <- list(mode = "edit_scene3d")

  if (!is.null(width)) {
    widget$width <- width
  }

  if (!is.null(height)) {
    widget$height <- height
  }

  if (!interactive()) {
    return(widget)
  }

  run_scene_editor_gadget(widget)
}

#' Apply a saved scene editor state
#'
#' This reapplies a scene state returned by [edit_scene3d()] to a widget or to
#' the current in-memory Babylonian scene accumulator.
#'
#' @param x Optional Babylonian htmlwidget or `plot3d()`-compatible object. If
#'   omitted, the current accumulated scene is used.
#' @param state A scene state returned by [edit_scene3d()]. Defaults to the
#'   most recent value from [last_scene_state()].
#' @param ... Additional arguments passed to [plot3d()] with `add = FALSE` when
#'   `x` is not already a widget.
#'
#' @export
apply_scene_state <- function(x = NULL, state = last_scene_state(), ...) {
  state <- normalize_scene_state(state)
  if (is.null(state)) {
    stop("No scene state is available. Run `edit_scene3d()` first or pass `state`.", call. = FALSE)
  }

  if (is.null(x)) {
    scene_spec <- current_scene_spec()
    if (is.null(scene_spec)) {
      stop("No active Babylonian scene available. Plot a scene first or pass `x`.", call. = FALSE)
    }

    edits <- state$objects
    attr(edits, "removed_objects") <- state$removed_objects %||% list()
    scene_spec$objects <- apply_scene_state_to_objects(scene_spec$objects, edits)
    scene_spec$scene <- normalize_scene(scene_spec$scene)
    if (!is.null(state$view)) {
      scene_spec$scene$view <- normalize_view(state$view)
      .babylon_state$last_scene_par3d <- deserialize_par3d(scene_spec$scene$view)
    }
    if (!is.null(state$postprocess)) {
      scene_spec$scene$postprocess <- normalize_scene_postprocesses(state$postprocess)
    }
    if (!is.null(state$scale_bar)) {
      scene_spec$scene$scale_bar <- normalize_scene_scale_bar(state$scale_bar)
    }
    if (!is.null(state$clipping)) {
      scene_spec$scene$clipping <- normalize_scene_clipping(state$clipping)
    }

    .babylon_state$current_scene <- scene_spec
    set_last_scene_state(state)
    return(babylon(scene_spec$objects, scene = scene_spec$scene))
  }

  if (inherits(x, "htmlwidget")) {
    widget <- x
  } else {
    widget <- do.call(
      plot3d,
      c(
        list(x = x, add = FALSE),
        list(...)
      )
    )
  }

  edits <- state$objects
  attr(edits, "removed_objects") <- state$removed_objects %||% list()
  widget$x$objects <- apply_scene_state_to_objects(widget$x$objects, edits)
  widget$x$scene <- normalize_scene(widget$x$scene)
  if (!is.null(state$view)) {
    widget$x$scene$view <- normalize_view(state$view)
    .babylon_state$last_scene_par3d <- deserialize_par3d(widget$x$scene$view)
  }
  if (!is.null(state$postprocess)) {
    widget$x$scene$postprocess <- normalize_scene_postprocesses(state$postprocess)
  }
  if (!is.null(state$scale_bar)) {
    widget$x$scene$scale_bar <- normalize_scene_scale_bar(state$scale_bar)
  }
  if (!is.null(state$clipping)) {
    widget$x$scene$clipping <- normalize_scene_clipping(state$clipping)
  }

  set_last_scene_state(state)
  widget
}

#' Return the last captured editable scene state
#'
#' @export
last_scene_state <- function() {
  .babylon_state$last_scene_state
}

normalize_landmarks <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (!is.matrix(x) || ncol(x) != 3) {
    stop("`fixed` must be a matrix with three columns.", call. = FALSE)
  }

  unname(x)
}

resolve_landmark_target_count <- function(n = NULL, fixed = NULL) {
  fixed_count <- NULL
  if (is.numeric(fixed) && length(fixed) == 1L && is.finite(fixed[[1]])) {
    fixed_count <- as.integer(fixed[[1]])
  }

  if (is.null(n) && is.null(fixed_count)) {
    return(NULL)
  }

  if (!is.null(n)) {
    n <- as.integer(n[[1]])
    if (!is.finite(n) || n < 1L) {
      stop("`n` must be a positive integer.", call. = FALSE)
    }
    if (!is.null(fixed_count) && !identical(n, fixed_count)) {
      stop("When `fixed` is used as a landmark count, it must match `n` if both are supplied.", call. = FALSE)
    }
    return(n)
  }

  if (!is.finite(fixed_count) || fixed_count < 1L) {
    stop("When numeric, `fixed` must be a positive integer landmark count.", call. = FALSE)
  }

  fixed_count
}

resolve_fixed_landmarks <- function(fixed) {
  if (is.null(fixed)) {
    return(NULL)
  }

  if (is.numeric(fixed) && length(fixed) == 1L && is.finite(fixed[[1]])) {
    return(NULL)
  }

  normalize_landmarks(fixed)
}

prepare_digitize_landmark_mesh <- function(mesh, fixed = NULL, center = TRUE) {
  if (!isTRUE(center)) {
    return(list(mesh = mesh, fixed = fixed))
  }

  vertices <- mesh_vertex_matrix(mesh)
  center_point <- colMeans(vertices)
  mesh$vertices <- flatten_vertex_matrix(sweep(vertices, 2L, center_point, "-"))

  if (!is.null(mesh$morph_target)) {
    mesh$morph_target <- lapply(mesh$morph_target, function(target) {
      if (is.null(target$vertices)) {
        return(target)
      }
      morph_vertices <- t(matrix(target$vertices, nrow = 3L))
      morph_vertices <- sweep(validate_xyz_matrix(morph_vertices), 2L, center_point, "-")
      target$vertices <- flatten_vertex_matrix(morph_vertices)
      target
    })
  }

  if (!is.null(fixed)) {
    fixed <- sweep(normalize_landmarks(fixed), 2L, center_point, "-")
  }

  list(mesh = mesh, fixed = fixed)
}

normalize_digitize_marker_scale <- function(marker_scale, ptsize = 1) {
  if (!is.numeric(marker_scale) || length(marker_scale) != 1L || !is.finite(marker_scale[[1]]) || marker_scale[[1]] <= 0) {
    stop("`marker_scale` must be a positive numeric scalar.", call. = FALSE)
  }

  if (!is.numeric(ptsize) || length(ptsize) != 1L || !is.finite(ptsize[[1]]) || ptsize[[1]] <= 0) {
    stop("`ptsize` must be a positive numeric scalar.", call. = FALSE)
  }

  as.numeric(marker_scale[[1]]) * sqrt(as.numeric(ptsize[[1]]))
}

set_last_scene_state <- function(x) {
  .babylon_state$last_scene_state <- normalize_scene_state(x)
  invisible(.babylon_state$last_scene_state)
}

current_pose_input <- function(x = NULL, fallback = NULL) {
  if (!is.null(x) && nzchar(x)) {
    return(deserialize_par3d(jsonlite::fromJSON(x, simplifyVector = TRUE)))
  }

  if (!is.null(fallback)) {
    return(fallback)
  }

  live <- last_par3d(live = TRUE)
  if (!is.null(live)) {
    return(live)
  }

  last_par3d()
}

current_scene_state_input <- function(x = NULL, fallback = NULL) {
  if (!is.null(x) && nzchar(x)) {
    return(normalize_scene_state(jsonlite::fromJSON(x, simplifyVector = FALSE)))
  }

  if (!is.null(fallback)) {
    return(normalize_scene_state(fallback))
  }

  last_scene_state()
}

scene_state_from_widget <- function(widget) {
  objects <- widget$x$objects %||% list()
  scene <- widget$x$scene %||% list()

  list(
    view = scene$view %||% serialize_par3d(.babylon_state$par3d),
    postprocess = scene$postprocess %||% NULL,
    scale_bar = scene$scale_bar %||% NULL,
    clipping = scene$clipping %||% NULL,
    objects = Filter(
      Negate(is.null),
      lapply(seq_along(objects), function(i) seed_scene_state_entry(objects[[i]], i))
    )
  )
}

seed_scene_state_entry <- function(object, index) {
  if (is.null(object$type)) {
    return(NULL)
  }

  entry <- list(
    index = as.integer(index),
    primitive_type = object$type
  )

  if (!is.null(object$name)) {
    entry$name <- as.character(object$name[[1]])
  }

  if (identical(object$type, "light3d")) {
    entry$node_type <- "light"
    entry$light_type <- object$light_type %||% "hemispheric"
    if (!is.null(object$position)) {
      entry$position <- normalize_transform_vector(object$position, "position")
    }
    if (!is.null(object$direction)) {
      entry$direction <- normalize_transform_vector(object$direction, "direction")
    }
    for (nm in c("intensity", "diffuse", "specular", "ground_color", "angle", "exponent", "range", "enabled", "shadow_enabled", "shadow_darkness")) {
      if (!is.null(object[[nm]])) {
        entry[[nm]] <- object[[nm]]
      }
    }
    return(entry)
  }

  if (object$type %in% editable_mesh_primitive_types()) {
    entry$node_type <- "mesh"
    entry$position <- normalize_transform_vector(object$position %||% c(0, 0, 0), "position")
    entry$rotation <- normalize_transform_vector(object$rotation %||% c(0, 0, 0), "rotation")
    entry$scaling <- normalize_transform_vector(object$scaling %||% c(1, 1, 1), "scaling")
    if (!is.null(object$material)) {
      entry$material <- normalize_material3d(object$material)
    }
    if (!is.null(object$morph_target)) {
      entry$morph_target <- lapply(object$morph_target, function(target) {
        list(
          name = target$name %||% NULL,
          influence = normalize_morph_influence(target$influence %||% 0)
        )
      })
    }
    return(entry)
  }

  NULL
}

normalize_scene_state <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (!is.list(x)) {
    stop("`state` must be a list returned by `edit_scene3d()`.", call. = FALSE)
  }

  state <- list(
    view = NULL,
    postprocess = NULL,
    scale_bar = NULL,
    clipping = NULL,
    objects = list(),
    removed_objects = list()
  )

  if (!is.null(x$view)) {
    state$view <- normalize_view(x$view)
  }

  if (!is.null(x$postprocess)) {
    state$postprocess <- normalize_scene_postprocesses(x$postprocess)
  }

  if (!is.null(x$scale_bar)) {
    state$scale_bar <- normalize_scene_scale_bar(x$scale_bar)
  }

  if (!is.null(x$clipping)) {
    state$clipping <- normalize_scene_clipping(x$clipping)
  }

  objects <- x$objects %||% list()
  if (is.data.frame(objects)) {
    objects <- data_frame_rows_to_list(objects)
  }
  if (length(objects)) {
    state$objects <- lapply(objects, normalize_scene_state_entry)
  }

  removed_objects <- x$removed_objects %||% list()
  if (is.data.frame(removed_objects)) {
    removed_objects <- data_frame_rows_to_list(removed_objects)
  }
  if (length(removed_objects)) {
    state$removed_objects <- lapply(removed_objects, normalize_scene_state_lookup)
  }

  for (nm in c("selected", "gizmo_mode", "gizmos_visible")) {
    if (!is.null(x[[nm]])) {
      state[[nm]] <- x[[nm]]
    }
  }

  state
}

normalize_scene_state_lookup <- function(x) {
  if (is.data.frame(x)) {
    x <- data_frame_rows_to_list(x)
    if (length(x) != 1L) {
      stop("Each removed scene-state entry must describe exactly one object.", call. = FALSE)
    }
    x <- x[[1]]
  }

  if (!is.list(x)) {
    stop("Each removed scene-state entry must be a list.", call. = FALSE)
  }

  entry <- list(index = as.integer(x$index[[1]]))
  if (!is.finite(entry$index) || entry$index < 1L) {
    stop("Removed scene-state object indices must be positive integers.", call. = FALSE)
  }

  if (!is.null(x$name)) {
    entry$name <- as.character(x$name[[1]])
  }

  if (!is.null(x$primitive_type)) {
    entry$primitive_type <- as.character(x$primitive_type[[1]])
  }

  if (!is.null(x$node_type)) {
    entry$node_type <- as.character(x$node_type[[1]])
  }

  entry
}

normalize_scene_state_entry <- function(x) {
  if (is.data.frame(x)) {
    x <- data_frame_rows_to_list(x)
    if (length(x) != 1L) {
      stop("Each `state$objects` entry must describe exactly one object.", call. = FALSE)
    }
    x <- x[[1]]
  }

  if (!is.list(x)) {
    stop("Each `state$objects` entry must be a list.", call. = FALSE)
  }

  entry <- list(
    index = as.integer(x$index[[1]]),
    primitive_type = x$primitive_type %||% x$type %||% NULL,
    node_type = x$node_type %||% NULL
  )

  if (!is.finite(entry$index) || entry$index < 1L) {
    stop("Scene state object indices must be positive integers.", call. = FALSE)
  }

  if (!is.null(x$name)) {
    entry$name <- as.character(x$name[[1]])
  }

  for (nm in c("position", "rotation", "scaling", "direction")) {
    if (!is.null(x[[nm]])) {
      entry[[nm]] <- normalize_transform_vector(x[[nm]], nm)
    }
  }

  if (!is.null(x$material)) {
    entry$material <- normalize_material3d(x$material)
  }

  if (!is.null(x$morph_target)) {
    morph_target <- x$morph_target
    if (!is.list(morph_target)) {
      stop("`morph_target` scene-state entries must be lists.", call. = FALSE)
    }
    if (!is.null(morph_target$influence) || !is.null(morph_target$name)) {
      morph_target <- list(morph_target)
    }
    entry$morph_target <- lapply(morph_target, function(target) {
      if (!is.list(target)) {
        stop("Each `morph_target` scene-state entry must be a list.", call. = FALSE)
      }
      list(
        name = target$name %||% NULL,
        influence = normalize_morph_influence(target$influence %||% 0)
      )
    })
  }

  if (!is.null(x$light_type)) {
    entry$light_type <- as.character(x$light_type[[1]])
  }

  for (nm in c("intensity", "angle", "exponent", "range", "shadow_darkness")) {
    if (!is.null(x[[nm]])) {
      entry[[nm]] <- as.numeric(x[[nm]][[1]])
    }
  }

  for (nm in c("diffuse", "ground_color")) {
    if (!is.null(x[[nm]])) {
      entry[[nm]] <- normalize_babylon_color(x[[nm]])
    }
  }

  if (!is.null(x$specular)) {
    entry$specular <- normalize_babylon_specularity(x$specular)
  }

  if (!is.null(x$enabled)) {
    entry$enabled <- isTRUE(x$enabled)
  }

  if (!is.null(x$shadow_enabled)) {
    entry$shadow_enabled <- isTRUE(x$shadow_enabled)
  }

  if (!is.null(x$created_in_editor)) {
    entry$created_in_editor <- isTRUE(x$created_in_editor)
  }

  entry
}

data_frame_rows_to_list <- function(x) {
  if (!is.data.frame(x) || !nrow(x)) {
    return(list())
  }

  rows <- vector("list", nrow(x))
  for (i in seq_len(nrow(x))) {
    row <- lapply(x, function(column) {
      value <- column[[i]]
      if (is.data.frame(value)) {
        return(data_frame_rows_to_list(value))
      }
      value
    })
    rows[[i]] <- row
  }
  rows
}

apply_scene_state_to_objects <- function(objects, edits) {
  removed <- attr(edits, "removed_objects", exact = TRUE) %||% list()

  if (!length(edits) && !length(removed)) {
    return(objects)
  }

  edited <- objects
  if (length(removed)) {
    removal_order <- order(vapply(removed, function(entry) as.integer(entry$index[[1]]), integer(1)), decreasing = TRUE)
    for (entry in removed[removal_order]) {
      idx <- locate_scene_state_object(edited, entry)
      if (!is.na(idx)) {
        edited[[idx]] <- NULL
      }
    }
  }
  for (entry in edits) {
    idx <- locate_scene_state_object(edited, entry)
    if (is.na(idx)) {
      created <- create_scene_object_from_state(entry)
      if (!is.null(created)) {
        edited[[length(edited) + 1L]] <- created
      }
      next
    }
    edited[[idx]] <- apply_scene_state_entry(edited[[idx]], entry)
  }

  edited
}

locate_scene_state_object <- function(objects, entry) {
  if (!is.null(entry$name)) {
    matches <- which(vapply(objects, function(object) identical(object$name %||% NULL, entry$name), logical(1)))
    if (length(matches) == 1L) {
      return(matches[[1]])
    }
  }

  idx <- as.integer(entry$index[[1]])
  if (is.finite(idx) && idx >= 1L && idx <= length(objects)) {
    return(idx)
  }

  NA_integer_
}

apply_scene_state_entry <- function(object, entry) {
  if (!is.null(entry$position)) {
    object$position <- normalize_transform_vector(entry$position, "position")
  }
  if (!is.null(entry$rotation)) {
    object$rotation <- normalize_transform_vector(entry$rotation, "rotation")
  }
  if (!is.null(entry$scaling)) {
    object$scaling <- normalize_transform_vector(entry$scaling, "scaling")
  }
  if (!is.null(entry$direction)) {
    object$direction <- normalize_transform_vector(entry$direction, "direction")
  }

  for (nm in c("intensity", "angle", "exponent", "range", "enabled", "light_type", "shadow_enabled", "shadow_darkness")) {
    if (!is.null(entry[[nm]])) {
      object[[nm]] <- entry[[nm]]
    }
  }

  for (nm in c("diffuse", "specular", "ground_color")) {
    if (!is.null(entry[[nm]])) {
      object[[nm]] <- entry[[nm]]
    }
  }

  if (!is.null(entry$material)) {
    object$material <- normalize_material3d(entry$material)
  }

  if (!is.null(entry$morph_target) && !is.null(object$morph_target)) {
    for (i in seq_len(min(length(entry$morph_target), length(object$morph_target)))) {
      object$morph_target[[i]]$influence <- normalize_morph_influence(entry$morph_target[[i]]$influence %||% 0)
      if (!is.null(entry$morph_target[[i]]$name)) {
        object$morph_target[[i]]$name <- entry$morph_target[[i]]$name
      }
    }
  }

  object
}

create_scene_object_from_state <- function(entry) {
  primitive_type <- entry$primitive_type %||% NULL

  if (identical(primitive_type, "light3d")) {
    return(create_babylon_light(
      type = entry$light_type %||% "hemispheric",
      position = entry$position %||% NULL,
      direction = entry$direction %||% NULL,
      intensity = entry$intensity %||% 1,
      diffuse = entry$diffuse %||% "white",
      specular = entry$specular %||% "white",
      ground_color = entry$ground_color %||% NULL,
      angle = entry$angle %||% NULL,
      exponent = entry$exponent %||% NULL,
      range = entry$range %||% NULL,
      shadow_enabled = entry$shadow_enabled %||% NULL,
      shadow_darkness = entry$shadow_darkness %||% NULL,
      name = entry$name %||% NULL,
      enabled = entry$enabled %||% TRUE
    ))
  }

  NULL
}

save_scene_editor_snapshot <- function(widget, state, request = NULL) {
  state <- normalize_scene_state(state)
  if (is.null(state)) {
    stop("No scene state is available for snapshot export.", call. = FALSE)
  }

  request <- request %||% list()
  format <- tolower(as.character(request$format %||% "png"))
  filename <- as.character(request$filename %||% paste0("scene.", format))
  if (!nzchar(filename)) {
    filename <- paste0("scene.", format)
  }
  if (grepl("\\.[A-Za-z0-9]+$", filename)) {
    filename <- sub("\\.[A-Za-z0-9]+$", paste0(".", format), filename)
  } else {
    filename <- paste0(filename, ".", format)
  }

  width <- suppressWarnings(as.integer(request$vwidth %||% widget$width %||% 1100L))
  height <- suppressWarnings(as.integer(request$vheight %||% widget$height %||% 800L))
  if (!is.finite(width) || width < 1L) {
    width <- 1100L
  }
  if (!is.finite(height) || height < 1L) {
    height <- 800L
  }

  output_path <- normalizePath(filename, winslash = "/", mustWork = FALSE)
  clean_widget <- apply_scene_state(widget, state = state)
  clean_widget$x$interaction <- NULL
  extension <- tolower(tools::file_ext(output_path))
  if (!nzchar(extension)) {
    extension <- format
  }

  if (extension %in% c("png", "jpg", "jpeg", "webp", "pdf")) {
    snapshot3d(output_path, widget = clean_widget, vwidth = width, vheight = height)
    return(output_path)
  }

  tmp_png <- tempfile(fileext = ".png")
  snapshot3d(tmp_png, widget = clean_widget, vwidth = width, vheight = height)

  if (extension %in% c("tif", "tiff")) {
    if (!requireNamespace("magick", quietly = TRUE)) {
      stop("Package 'magick' is required to export TIFF snapshots from `edit_scene3d()`.", call. = FALSE)
    }
    image <- magick::image_read(tmp_png)
    magick::image_write(image, path = output_path, format = "tiff")
    return(output_path)
  }

  if (identical(extension, "svg")) {
    encoded <- jsonlite::base64_enc(tmp_png)
    svg <- paste0(
      "<svg xmlns='http://www.w3.org/2000/svg' width='", width, "' height='", height,
      "' viewBox='0 0 ", width, " ", height, "'>",
      "<image width='", width, "' height='", height,
      "' href='data:image/png;base64,", encoded, "' />",
      "</svg>"
    )
    writeLines(svg, con = output_path, useBytes = TRUE)
    return(output_path)
  }

  stop("Unsupported snapshot format for `edit_scene3d()`: ", extension, call. = FALSE)
}

editable_mesh_primitive_types <- function() {
  c("sphere", "box", "plane", "cylinder", "cone", "mesh3d")
}

normalize_transform_vector <- function(x, arg) {
  if (is.list(x)) {
    x <- unlist(x, recursive = TRUE, use.names = FALSE)
  }

  if (!is.numeric(x) || length(x) != 3L || !all(is.finite(x))) {
    stop("`", arg, "` must be a finite numeric vector of length 3.", call. = FALSE)
  }

  unname(as.numeric(x))
}

run_landmark_gadget <- function(widget, n = NULL, index = FALSE) {
  if (!requireNamespace("shiny", quietly = TRUE)) {
    warning("Package 'shiny' is required for interactive landmark collection; returning the widget instead.")
    return(widget)
  }

  if (!requireNamespace("miniUI", quietly = TRUE)) {
    warning("Package 'miniUI' is required for interactive landmark collection; returning the widget instead.")
    return(widget)
  }

  if (is.null(widget$elementId) || identical(widget$elementId, "")) {
    widget$elementId <- paste0("babylon_landmarks_", as.integer(stats::runif(1, 1, 1e9)))
  }

  ui <- miniUI::miniPage(
    miniUI::gadgetTitleBar("Digitize Landmarks"),
    miniUI::miniContentPanel(
      widget,
      shiny::div(
        style = "padding-top: 10px; font-family: monospace;",
        shiny::textOutput("landmark_status")
      )
    )
  )

  server <- function(input, output, session) {
    landmark_input <- paste0(widget$elementId, "_landmarks")
    par3d_input <- paste0(widget$elementId, "_par3d")

    output$landmark_status <- shiny::renderText({
      pts <- input[[landmark_input]]
      count <- landmark_count(pts)
      if (is.null(n)) {
        paste("Collected", count, "landmarks")
      } else {
        paste("Collected", count, "of", n, "landmarks")
      }
    })

    shiny::observeEvent(input[[par3d_input]], {
      value <- input[[par3d_input]]
      if (!is.null(value) && nzchar(value)) {
        set_last_live_par3d(jsonlite::fromJSON(value, simplifyVector = TRUE))
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input[[landmark_input]], {
      pts <- input[[landmark_input]]
      if (!is.null(n) && landmark_count(pts) >= n) {
        shiny::stopApp(landmark_result(pts, index = index))
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input$done, {
      pts <- input[[landmark_input]]
      if (landmark_count(pts) == 0) {
        shiny::stopApp(landmark_result(NULL, index = index))
      }

      shiny::stopApp(landmark_result(pts, index = index))
    })

    shiny::observeEvent(input$cancel, {
      shiny::stopApp(NULL)
    })
  }

  viewer <- shiny::dialogViewer(
    "Digitize Landmarks",
    width = normalize_viewer_dimension(widget$width, default = 900),
    height = normalize_viewer_dimension(widget$height, default = 700)
  )
  result <- shiny::runGadget(ui, server, viewer = viewer)

  if (is.null(result)) {
    return(invisible(NULL))
  }

  result
}

run_vertex_paint_gadget <- function(widget) {
  if (!requireNamespace("shiny", quietly = TRUE)) {
    warning("Package 'shiny' is required for interactive vertex painting; returning the widget instead.")
    return(widget)
  }

  if (!requireNamespace("miniUI", quietly = TRUE)) {
    warning("Package 'miniUI' is required for interactive vertex painting; returning the widget instead.")
    return(widget)
  }

  if (is.null(widget$elementId) || identical(widget$elementId, "")) {
    widget$elementId <- paste0("babylon_vertex_paint_", as.integer(stats::runif(1, 1, 1e9)))
  }

  ui <- miniUI::miniPage(
    miniUI::gadgetTitleBar("Paint Vertices"),
    miniUI::miniContentPanel(widget)
  )

  server <- function(input, output, session) {
    selection_input <- paste0(widget$elementId, "_vertex_selection")
    par3d_input <- paste0(widget$elementId, "_par3d")

    shiny::observeEvent(input[[par3d_input]], {
      value <- input[[par3d_input]]
      if (!is.null(value) && nzchar(value)) {
        set_last_live_par3d(jsonlite::fromJSON(value, simplifyVector = TRUE))
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input$done, {
      value <- input[[selection_input]]
      if (is.null(value) || !nzchar(value)) {
        shiny::stopApp(integer(0))
      }
      parsed <- jsonlite::fromJSON(value, simplifyVector = TRUE)
      indices <- sort(unique(as.integer(parsed$indices %||% integer(0))))
      indices <- indices[is.finite(indices) & indices > 0L]
      shiny::stopApp(indices)
    })

    shiny::observeEvent(input$cancel, {
      shiny::stopApp(NULL)
    })
  }

  viewer <- shiny::dialogViewer(
    "Paint Vertices",
    width = normalize_viewer_dimension(widget$width, default = 1000),
    height = normalize_viewer_dimension(widget$height, default = 760)
  )
  result <- shiny::runGadget(ui, server, viewer = viewer)

  if (is.null(result)) {
    return(invisible(NULL))
  }

  sort(unique(as.integer(result)))
}

run_pose_gadget <- function(widget) {
  if (!requireNamespace("shiny", quietly = TRUE)) {
    warning("Package 'shiny' is required for interactive pose capture; returning the widget instead.")
    return(widget)
  }

  if (!requireNamespace("miniUI", quietly = TRUE)) {
    warning("Package 'miniUI' is required for interactive pose capture; returning the widget instead.")
    return(widget)
  }

  if (is.null(widget$elementId) || identical(widget$elementId, "")) {
    widget$elementId <- paste0("babylon_pose_", as.integer(stats::runif(1, 1, 1e9)))
  }

  .babylon_state$last_live_par3d <- NULL

  ui <- miniUI::miniPage(
    miniUI::gadgetTitleBar("Pose 3D Scene"),
    miniUI::miniContentPanel(widget)
  )

  server <- function(input, output, session) {
    par3d_input <- paste0(widget$elementId, "_par3d")
    initial_pose <- list(
      zoom = 0.05,
      userMatrix = diag(4)
    )

    shiny::observeEvent(input[[par3d_input]], {
      value <- input[[par3d_input]]
      if (!is.null(value) && nzchar(value)) {
        set_last_live_par3d(jsonlite::fromJSON(value, simplifyVector = TRUE))
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input$done, {
      shiny::stopApp(current_pose_input(input[[par3d_input]], fallback = initial_pose))
    })

    shiny::observeEvent(input$cancel, {
      shiny::stopApp(NULL)
    })
  }

  viewer <- shiny::dialogViewer(
    "Pose 3D Scene",
    width = normalize_viewer_dimension(widget$width, default = 900),
    height = normalize_viewer_dimension(widget$height, default = 700)
  )
  result <- shiny::runGadget(ui, server, viewer = viewer)

  if (is.null(result)) {
    return(invisible(NULL))
  }

  par3d(zoom = result$zoom, userMatrix = result$userMatrix)
}

run_scene_editor_gadget <- function(widget) {
  if (!requireNamespace("shiny", quietly = TRUE)) {
    warning("Package 'shiny' is required for interactive scene editing; returning the widget instead.")
    return(widget)
  }

  if (!requireNamespace("miniUI", quietly = TRUE)) {
    warning("Package 'miniUI' is required for interactive scene editing; returning the widget instead.")
    return(widget)
  }

  if (is.null(widget$elementId) || identical(widget$elementId, "")) {
    widget$elementId <- paste0("babylon_scene_editor_", as.integer(stats::runif(1, 1, 1e9)))
  }

  initial_state <- scene_state_from_widget(widget)
  set_last_scene_state(initial_state)

  ui <- miniUI::miniPage(
    miniUI::gadgetTitleBar("Edit 3D Scene"),
    miniUI::miniContentPanel(widget)
  )

  server <- function(input, output, session) {
    scene_state_input <- paste0(widget$elementId, "_scene_state")
    par3d_input <- paste0(widget$elementId, "_par3d")
    snapshot_input <- paste0(widget$elementId, "_snapshot_request")
    material_save_input <- paste0(widget$elementId, "_material_library_save")

    shiny::observeEvent(input[[par3d_input]], {
      value <- input[[par3d_input]]
      if (!is.null(value) && nzchar(value)) {
        set_last_live_par3d(jsonlite::fromJSON(value, simplifyVector = TRUE))
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input[[scene_state_input]], {
      value <- input[[scene_state_input]]
      if (!is.null(value) && nzchar(value)) {
        set_last_scene_state(jsonlite::fromJSON(value, simplifyVector = FALSE))
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input[[snapshot_input]], {
      request <- input[[snapshot_input]]
      state <- current_scene_state_input(input[[scene_state_input]], fallback = initial_state)
      tryCatch({
        path <- save_scene_editor_snapshot(widget, state = state, request = request)
        shiny::showNotification(
          paste("Saved snapshot to", path),
          type = "message",
          duration = 4
        )
      }, error = function(e) {
        shiny::showNotification(
          conditionMessage(e),
          type = "error",
          duration = 6
        )
      })
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input[[material_save_input]], {
      payload <- input[[material_save_input]]
      if (is.null(payload) || !is.list(payload) || is.null(payload$name) || is.null(payload$material)) {
        return()
      }

      tryCatch({
        register_material3d(payload$name, payload$material, overwrite = TRUE)
        shiny::showNotification(
          paste("Saved material", shQuote(as.character(payload$name[[1]])), "to the registry"),
          type = "message",
          duration = 4
        )
      }, error = function(e) {
        shiny::showNotification(
          conditionMessage(e),
          type = "error",
          duration = 6
        )
      })
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input$done, {
      state <- current_scene_state_input(input[[scene_state_input]], fallback = initial_state)
      set_last_scene_state(state)
      shiny::stopApp(TRUE)
    })

    shiny::observeEvent(input$cancel, {
      shiny::stopApp(NULL)
    })
  }

  viewer <- shiny::dialogViewer(
    "Edit 3D Scene",
    width = normalize_viewer_dimension(widget$width, default = 1100),
    height = normalize_viewer_dimension(widget$height, default = 800)
  )
  result <- shiny::runGadget(ui, server, viewer = viewer)

  if (is.null(result)) {
    return(invisible(NULL))
  }

  if (isTRUE(result)) {
    result <- last_scene_state()
  }

  set_last_scene_state(result)
  result
}

normalize_viewer_dimension <- function(x, default) {
  if (is.null(x)) {
    return(default)
  }

  if (is.numeric(x) && length(x) == 1) {
    return(x)
  }

  if (is.character(x) && length(x) == 1) {
    if (grepl("%", x, fixed = TRUE)) {
      return(default)
    }

    parsed <- suppressWarnings(as.numeric(gsub("[^0-9.]+", "", x)))
    if (is.finite(parsed)) {
      return(parsed)
    }
  }

  default
}

landmark_count <- function(x) {
  if (is.null(x)) {
    return(0L)
  }

  coords <- tryCatch(extract_landmark_matrix(x), error = function(e) NULL)
  if (!is.null(coords)) {
    return(nrow(coords))
  }

  length(x)
}

landmark_result <- function(x, index = FALSE) {
  coords <- landmarks_to_matrix(x)
  if (!isTRUE(index)) {
    return(coords)
  }

  list(
    coords = coords,
    index = landmark_indices(x)
  )
}

landmarks_to_matrix <- function(x) {
  if (is.null(x) || landmark_count(x) == 0) {
    return(matrix(numeric(0), ncol = 3))
  }

  coords <- extract_landmark_matrix(x)
  if (is.null(coords)) {
    stop("Could not convert landmark payload into a 3-column matrix.", call. = FALSE)
  }

  coords
}

landmark_indices <- function(x) {
  if (is.null(x) || landmark_count(x) == 0) {
    return(matrix(integer(0), ncol = 1L))
  }

  indices <- extract_landmark_indices(x)
  if (is.null(indices)) {
    return(matrix(integer(0), ncol = 1L))
  }

  matrix(as.integer(indices), ncol = 1L)
}

extract_landmark_matrix <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.character(x) && length(x) == 1L) {
    return(parse_landmark_json(x))
  }

  if (is.matrix(x)) {
    return(normalize_landmark_columns(x))
  }

  if (is.data.frame(x)) {
    return(normalize_landmark_columns(as.matrix(x)))
  }

  if (is_coordinate_columns(x)) {
    return(unname(cbind(x[["x"]], x[["y"]], x[["z"]])))
  }

  if (is.list(x) && length(x)) {
    numeric_parts <- x[vapply(x, function(part) {
      (is.atomic(part) || is.matrix(part) || is.data.frame(part)) && length(part) > 0
    }, logical(1))]

    for (part in numeric_parts) {
      candidate <- tryCatch(extract_landmark_matrix(part), error = function(e) NULL)
      if (!is.null(candidate)) {
        return(candidate)
      }
    }

    rowwise <- tryCatch(
      unname(do.call(rbind, lapply(x, function(row) unlist(row, use.names = FALSE)))),
      error = function(e) NULL
    )
    rowwise <- normalize_landmark_columns(rowwise)
    if (!is.null(rowwise)) {
      return(rowwise)
    }
  }

  NULL
}

extract_landmark_indices <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.character(x) && length(x) == 1L) {
    if (!nzchar(x)) {
      return(NULL)
    }
    if (!requireNamespace("jsonlite", quietly = TRUE)) {
      stop("Package 'jsonlite' is required to parse landmark data.", call. = FALSE)
    }
    parsed <- jsonlite::fromJSON(x, simplifyVector = TRUE)
    return(extract_landmark_indices(parsed))
  }

  if (is.data.frame(x) && "index" %in% tolower(names(x))) {
    idx <- match("index", tolower(names(x)))
    return(as.integer(x[[idx]]))
  }

  if (is.matrix(x) && !is.null(colnames(x)) && "index" %in% tolower(colnames(x))) {
    idx <- match("index", tolower(colnames(x)))
    return(as.integer(x[, idx]))
  }

  if (is.list(x) && is_coordinate_columns(x) && "index" %in% names(x)) {
    return(as.integer(x[["index"]]))
  }

  if (is.list(x) && length(x)) {
    row_indices <- lapply(x, function(row) {
      if (is.list(row) && !is.null(row[["index"]])) {
        return(as.integer(row[["index"]]))
      }
      NULL
    })
    row_indices <- Filter(Negate(is.null), row_indices)
    if (length(row_indices)) {
      return(unlist(row_indices, use.names = FALSE))
    }
  }

  NULL
}

parse_landmark_json <- function(x) {
  if (!nzchar(x)) {
    return(matrix(numeric(0), ncol = 3))
  }

  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required to parse landmark data.", call. = FALSE)
  }

  parsed <- jsonlite::fromJSON(x, simplifyVector = TRUE)
  normalize_landmark_columns(parsed)
}

normalize_landmark_columns <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.list(x) && is_coordinate_columns(x)) {
    return(unname(cbind(x[["x"]], x[["y"]], x[["z"]])))
  }

  if (is.list(x) && is.null(dim(x))) {
    rowwise <- tryCatch(
      unname(do.call(rbind, lapply(x, function(row) unlist(row, use.names = FALSE)))),
      error = function(e) NULL
    )
    if (!is.null(rowwise)) {
      x <- rowwise
    }
  }

  if (is.vector(x) && !is.list(x)) {
    if (length(x) %% 3L != 0L) {
      return(NULL)
    }
    x <- matrix(x, ncol = 3, byrow = TRUE)
  }

  if (is.null(dim(x))) {
    return(NULL)
  }

  if (is.list(x)) {
    x <- tryCatch(
      apply(x, c(1, 2), function(value) {
        value <- unlist(value, recursive = TRUE, use.names = FALSE)
        if (!length(value)) {
          return(NA_real_)
        }
        as.numeric(value[[1]])
      }),
      error = function(e) NULL
    )
    if (is.null(x)) {
      return(NULL)
    }
  }

  x <- unname(x)
  storage.mode(x) <- "numeric"

  if (ncol(x) == 3L) {
    return(x)
  }

  if (!is.null(colnames(x))) {
    xyz <- match(c("x", "y", "z"), tolower(colnames(x)))
    if (all(!is.na(xyz))) {
      return(unname(x[, xyz, drop = FALSE]))
    }
  }

  if (ncol(x) > 3L) {
    numeric_cols <- which(vapply(seq_len(ncol(x)), function(i) all(is.finite(x[, i]) | is.na(x[, i])), logical(1)))
    if (length(numeric_cols) >= 3L) {
      return(x[, numeric_cols[seq_len(3)], drop = FALSE])
    }
  }

  NULL
}

is_coordinate_columns <- function(x) {
  is.list(x) &&
    all(c("x", "y", "z") %in% names(x)) &&
    all(vapply(x[c("x", "y", "z")], function(col) is.atomic(col) && is.null(dim(col)), logical(1))) &&
    length(unique(vapply(x[c("x", "y", "z")], length, integer(1)))) == 1L
}
