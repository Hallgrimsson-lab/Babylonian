# Environment used to accumulate the current scene in an rgl-like workflow.
.babylon_state <- new.env(parent = emptyenv())
.babylon_state$current_scene <- NULL
.babylon_state$par3d <- list(
  zoom = 0.05,
  userMatrix = diag(4)
)
.babylon_state$last_scene_par3d <- .babylon_state$par3d
.babylon_state$last_live_par3d <- NULL

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
  width = NULL,
  height = NULL,
  elementId = NULL
) {
  data <- lapply(data, normalize_scene_object)
  interaction <- normalize_interaction(interaction)
  scene <- normalize_scene(scene)
  if (!is.null(scene$view)) {
    .babylon_state$last_scene_par3d <- deserialize_par3d(scene$view)
  }

  dependencies <- Filter(Negate(is.null), lapply(data, `[[`, "dep"))
  data <- lapply(data, function(d) { d$dep <- NULL; d })

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

#' Import a 3D mesh
#'
#' This function imports a 3D mesh from a file.
#'
#' @param file The path to the mesh file.
#'
#' @export
import_mesh <- function(file) {
  list(
    type = "mesh",
    file = basename(file),
    dep = htmltools::htmlDependency(
      name = tools::file_path_sans_ext(basename(file)),
      version = "1.0.0",
      src = dirname(file),
      attachment = basename(file)
    )
  )
}

#' Convert a `mesh3d` object into a Babylonian mesh specification
#'
#' This adapter is intended for `mesh3d` objects from packages such as Morpho,
#' rgl, and Rvcg. The returned list can be passed directly to [babylon()] or
#' mixed with other Babylonian scene objects.
#'
#' @param x A `mesh3d` object.
#' @param name Optional mesh name.
#' @param color Optional mesh color. Supports R color names, hex strings,
#'   palette indices, and RGB vectors.
#' @param alpha Optional mesh opacity.
#' @param specularity Optional Babylon specular intensity. Numeric scalars are
#'   converted to grayscale specular colors in the 0-1 range; RGB vectors and
#'   hex strings are also accepted.
#' @param reverse_winding Whether to reverse triangle winding when converting
#'   the mesh. Enabled by default to match common `mesh3d` orientation with
#'   Babylon's default front-face convention.
#' @param ... Reserved for future rgl-style graphical parameters.
#'
#' @export
as_babylon_mesh <- function(
  x,
  name = "mesh",
  color = NULL,
  alpha = NULL,
  specularity = "black",
  reverse_winding = TRUE,
  ...
) {
  if (!inherits(x, "mesh3d")) {
    stop("`x` must inherit from 'mesh3d'.", call. = FALSE)
  }

  vertices <- mesh3d_vertices(x)
  indices <- mesh3d_indices(x, reverse_winding = reverse_winding)

  mesh <- list(
    type = "mesh3d",
    name = name,
    vertices = vertices,
    indices = indices,
    source = list(
      vb = unname(unclass(x$vb)),
      it = unname(unclass(x$it))
    )
  )

  if (!is.null(color)) {
    mesh$color <- normalize_babylon_color(color)
  }

  if (!is.null(alpha)) {
    mesh$alpha <- alpha
  }

  if (!is.null(specularity)) {
    mesh$specularity <- normalize_babylon_specularity(specularity)
  }

  structure(mesh, class = c("babylon_mesh", "list"))
}

#' Plot 3D objects with BabylonJS
#'
#' This generic mirrors the feel of `rgl::plot3d()` while dispatching to
#' Babylonian renderers.
#'
#' @param x A supported 3D object.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param ... Additional arguments passed to methods.
#'
#' @export
plot3d <- function(x, add = FALSE, ...) {
  UseMethod("plot3d")
}

#' @export
plot3d.default <- function(x, add = FALSE, ...) {
  stop("No `plot3d()` method is available for objects of class ", paste(class(x), collapse = "/"), ".", call. = FALSE)
}

#' Plot a 3-column matrix as 3D points
#'
#' @param x A numeric matrix with three columns.
#' @param add Whether to add the point cloud to an existing widget
#'   specification. If `FALSE`, a new widget is returned.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param color Point color, or a vector of colors with one entry per row.
#' @param size Billboard point size relative to scene radius.
#' @param alpha Point opacity.
#' @param ... Reserved for future `rgl`-style parameters.
#'
#' @export
plot3d.matrix <- function(
  x,
  add = FALSE,
  axes = TRUE,
  nticks = 5,
  color = "black",
  size = 0.02,
  alpha = 1,
  ...
) {
  points <- as_babylon_points(x, color = color, size = size, alpha = alpha)
  append_current_scene(points, add = add, axes = axes, nticks = nticks)
}

#' Plot a Babylon mesh using rgl-like conventions
#'
#' @param x A `babylon_mesh` object.
#' @param add Whether to add the mesh to an existing widget specification. If
#'   `FALSE`, a new widget is returned.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Additional graphical parameters. Recognized values include
#'   `color`, `alpha`, `specularity`, `position`, `rotation`, `scaling`, and
#'   `name`.
#'
#' @export
plot3d.babylon_mesh <- function(x, add = FALSE, axes = TRUE, nticks = 5, specularity = "black", ...) {
  args <- list(...)
  if (!is.null(specularity) && is.null(args$specularity)) {
    args$specularity <- specularity
  }
  x <- modify_babylon_mesh(x, args)
  append_current_scene(x, add = add, axes = axes, nticks = nticks)
}

#' Plot a `mesh3d` object with BabylonJS
#'
#' @param x A `mesh3d` object, such as a mesh imported through Morpho.
#' @param add Whether to add the mesh to an existing widget specification. If
#'   `FALSE`, a new widget is returned.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Additional graphical parameters forwarded to
#'   [as_babylon_mesh()] and the Babylon mesh renderer.
#'
#' @export
plot3d.mesh3d <- function(x, add = FALSE, axes = TRUE, nticks = 5, ...) {
  mesh <- do.call(as_babylon_mesh, c(list(x = x), list(...)))
  plot3d.babylon_mesh(mesh, add = add, axes = axes, nticks = nticks)
}

#' @export
plot.babylon_mesh <- function(x, add = FALSE, axes = TRUE, nticks = 5, ...) {
  plot3d.babylon_mesh(x, add = add, axes = axes, nticks = nticks, ...)
}

#' Convert a 3-column matrix into a Babylonian point-cloud specification
#'
#' @param x A numeric matrix with three columns.
#' @param color Point color, or a vector of colors with one entry per row.
#' @param size Billboard point size relative to scene radius.
#' @param alpha Point opacity.
#'
#' @export
as_babylon_points <- function(x, color = "black", size = 0.02, alpha = 1) {
  x <- validate_xyz_matrix(x)
  color <- normalize_point_colors(color, nrow(x))

  structure(
    list(
      type = "points3d",
      points = unname(x),
      color = color,
      size = size,
      alpha = alpha
    ),
    class = c("babylon_points", "list")
  )
}

#' Render billboarded 3D points
#'
#' @param x,y,z Point coordinates.
#' @param color Point color, or a vector of colors with one entry per point.
#' @param size Billboard point size relative to scene radius.
#' @param alpha Point opacity.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
points3d <- function(
  x,
  y = NULL,
  z = NULL,
  color = "black",
  size = 0.02,
  alpha = 1,
  add = TRUE,
  axes = TRUE,
  nticks = 5
) {
  points <- as_babylon_points(xyz_matrix(x, y, z), color = color, size = size, alpha = alpha)
  append_current_scene(points, add = add, axes = axes, nticks = nticks)
}

#' Render a 3D scatterplot with spheres
#'
#' @param x,y,z Point coordinates.
#' @param radius Sphere radius relative to scene radius.
#' @param color Sphere color, or a vector of colors with one entry per point.
#' @param alpha Sphere opacity.
#' @param specularity Optional sphere specularity.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
spheres3d <- function(
  x,
  y = NULL,
  z = NULL,
  radius = 0.03,
  color = "gray40",
  alpha = 1,
  specularity = "black",
  add = TRUE,
  axes = TRUE,
  nticks = 5
) {
  points <- xyz_matrix(x, y, z)
  color <- normalize_point_colors(color, nrow(points))

  spheres <- list(
    type = "spheres3d",
    points = unname(points),
    radius = radius,
    color = color,
    alpha = alpha,
    specularity = normalize_babylon_specularity(specularity)
  )

  append_current_scene(spheres, add = add, axes = axes, nticks = nticks)
}

#' Render connected 3D line segments
#'
#' Consecutive point pairs define each segment, so rows 1-2, 3-4, and so on are
#' rendered as independent line segments.
#'
#' @param x,y,z Segment endpoint coordinates.
#' @param color Segment color.
#' @param alpha Reserved for future transparency support.
#' @param width Relative segment width hint. Babylon line meshes are rendered as
#'   lightweight screen-space lines, so this is currently informational only.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
segments3d <- function(
  x,
  y = NULL,
  z = NULL,
  color = "black",
  alpha = 1,
  width = 1,
  add = TRUE,
  axes = TRUE,
  nticks = 5
) {
  points <- xyz_matrix(x, y, z)

  if (nrow(points) %% 2L != 0L) {
    stop("`segments3d()` requires an even number of points; segments are drawn from row pairs.", call. = FALSE)
  }

  segments <- structure(
    list(
      type = "segments3d",
      points = unname(points),
      color = normalize_babylon_color(color),
      alpha = alpha,
      width = width
    ),
    class = c("babylon_segments", "list")
  )

  append_current_scene(segments, add = add, axes = axes, nticks = nticks)
}

#' Render one or more clipping-style planes
#'
#' Planes are specified by coefficients `(a, b, c, d)` for equations of the
#' form `a*x + b*y + c*z + d = 0`.
#'
#' @param ... Plane coefficients. Supply either four numeric vectors
#'   `a, b, c, d` of equal length or a matrix/data frame with four columns.
#' @param color Plane color.
#' @param alpha Plane opacity.
#' @param size Plane sheet size in world units. If `NULL`, Babylonian uses a
#'   scene-relative fallback.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
planes3d <- function(..., color = "gray70", alpha = 0.4, size = NULL, add = TRUE, axes = TRUE, nticks = 5) {
  coeffs <- plane_coefficients(...)
  planes <- list(
    type = "planes3d",
    coefficients = unname(coeffs),
    color = normalize_babylon_color(color),
    alpha = alpha,
    size = if (is.null(size)) NULL else as.numeric(size[[1]])
  )

  append_current_scene(planes, add = add, axes = axes, nticks = nticks)
}

#' Shade a 3D surface or mesh
#'
#' This mirrors the feel of `rgl::shade3d()` by adding a shaded surface object
#' to the current scene by default.
#'
#' @param x A `mesh3d`, `babylon_mesh`, or compatible Babylonian mesh object.
#' @param color Optional surface color.
#' @param alpha Optional surface opacity.
#' @param specularity Optional surface specularity.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Additional mesh graphical parameters.
#'
#' @export
shade3d <- function(
  x,
  color = NULL,
  alpha = NULL,
  specularity = "black",
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  if (inherits(x, "mesh3d")) {
    mesh <- do.call(
      as_babylon_mesh,
      c(list(x = x, color = color, alpha = alpha, specularity = specularity), list(...))
    )
    return(plot3d.babylon_mesh(mesh, add = add, axes = axes, nticks = nticks))
  }

  if (inherits(x, "babylon_mesh")) {
    args <- c(list(...), list(color = color, alpha = alpha, specularity = specularity))
    args <- args[!vapply(args, is.null, logical(1))]
    return(do.call(plot3d.babylon_mesh, c(list(x = x, add = add, axes = axes, nticks = nticks), args)))
  }

  if (is.list(x) && identical(x$type, "mesh3d")) {
    mesh <- normalize_scene_object(x)
    return(plot3d.babylon_mesh(mesh, add = add, axes = axes, nticks = nticks, color = color, alpha = alpha, specularity = specularity, ...))
  }

  stop("`shade3d()` currently supports `mesh3d` and `babylon_mesh` objects.", call. = FALSE)
}

#' Start an interactive landmark digitizer on a Babylon mesh
#'
#' This creates a Babylon widget that captures surface picks using BabylonJS
#' ray casting. In interactive R sessions, landmarking completes by returning a
#' three-column coordinate matrix. In non-interactive contexts, the function
#' returns the underlying widget.
#'
#' @param x A `babylon_mesh` object or `mesh3d` object.
#' @param n Optional target number of landmarks to collect.
#' @param fixed Optional matrix of fixed landmarks to show on the surface.
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

  interaction <- list(
    mode = "digitize_landmarks",
    n = if (is.null(n)) NULL else as.integer(n),
    fixed = normalize_landmarks(fixed),
    marker = list(
      color = normalize_babylon_color(marker_color),
      scale = marker_scale
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

  run_landmark_gadget(widget, n = n)
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

normalize_scene_object <- function(x) {
  if (inherits(x, "mesh3d")) {
    return(as_babylon_mesh(x))
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
    if (!is.null(x$color)) {
      x$color <- normalize_babylon_color(x$color)
    }
    if (is.null(x$specularity) && !identical(x$type, "segments3d")) {
      x$specularity <- normalize_babylon_specularity("black")
    } else if (!is.null(x$specularity)) {
      x$specularity <- normalize_babylon_specularity(x$specularity)
    }
  }

  x
}

modify_babylon_mesh <- function(x, args) {
  allowed <- c("color", "alpha", "specularity", "position", "rotation", "scaling", "name")

  for (nm in intersect(names(args), allowed)) {
    value <- args[[nm]]
    if (nm == "color") {
      value <- normalize_babylon_color(value)
    } else if (nm == "specularity") {
      value <- normalize_babylon_specularity(value)
    }
    x[[nm]] <- value
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

normalize_babylon_color <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.list(x)) {
    x <- unlist(x, recursive = TRUE, use.names = FALSE)
  }

  if (!length(x)) {
    return(NULL)
  }

  x <- x[!is.na(x)]
  if (!length(x)) {
    return(NULL)
  }

  if (is.numeric(x)) {
    if (length(x) == 1L) {
      idx <- as.integer(x[[1]])
      pal <- grDevices::palette()
      if (!is.finite(idx) || idx < 1L || idx > length(pal)) {
        stop("Numeric colors must be valid palette indices.", call. = FALSE)
      }
      x <- pal[[idx]]
    } else if (length(x) >= 3L) {
      rgb <- as.numeric(x[seq_len(3)])
      if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 1)) {
        return(sprintf("#%02X%02X%02X", round(rgb[1] * 255), round(rgb[2] * 255), round(rgb[3] * 255)))
      }
      if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 255)) {
        return(sprintf("#%02X%02X%02X", round(rgb[1]), round(rgb[2]), round(rgb[3])))
      }
      stop("Numeric RGB colors must be in the 0-1 or 0-255 range.", call. = FALSE)
    } else {
      stop("Numeric colors must be a palette index or an RGB vector.", call. = FALSE)
    }
  } else {
    x <- as.character(x[[1]])
  }

  rgba <- grDevices::col2rgb(x, alpha = TRUE)
  sprintf("#%02X%02X%02X", rgba[1, 1], rgba[2, 1], rgba[3, 1])
}

normalize_babylon_specularity <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.list(x)) {
    x <- unlist(x, recursive = TRUE, use.names = FALSE)
  }

  if (!length(x)) {
    return(NULL)
  }

  x <- x[!is.na(x)]
  if (!length(x)) {
    return(NULL)
  }

  if (is.numeric(x) && length(x) == 1L) {
    value <- max(0, min(1, as.numeric(x[[1]])))
    return(unname(rep(value, 3L)))
  }

  if (is.numeric(x) && length(x) >= 3L) {
    rgb <- as.numeric(x[seq_len(3)])
    if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 255)) {
      rgb <- rgb / 255
    }
    if (!all(is.finite(rgb)) || !all(rgb >= 0) || !all(rgb <= 1)) {
      stop("Numeric specularity vectors must be in the 0-1 or 0-255 range.", call. = FALSE)
    }
    return(unname(rgb))
  }

  hex <- normalize_babylon_color(x)
  rgba <- grDevices::col2rgb(hex) / 255
  unname(as.numeric(rgba[, 1]))
}


babylon_material_compat_helper <- function() {
  list(
    red = normalize_babylon_color("red"),
    palette_2 = normalize_babylon_color(2),
    rgb_unit = normalize_babylon_color(c(0.1, 0.2, 0.3)),
    rgb_byte = normalize_babylon_color(c(10, 20, 30)),
    spec_scalar = normalize_babylon_specularity(0.4),
    spec_hex = normalize_babylon_specularity("#666666")
  )
}

babylon_material_compat_self_test <- function() {
  helper <- babylon_material_compat_helper()

  stopifnot(identical(helper$red, "#FF0000"))
  stopifnot(is.character(helper$palette_2), nchar(helper$palette_2) == 7L)
  stopifnot(identical(helper$rgb_byte, "#0A141E"))
  stopifnot(is.character(helper$rgb_unit), nchar(helper$rgb_unit) == 7L)
  stopifnot(is.numeric(helper$spec_scalar), length(helper$spec_scalar) == 3L)
  stopifnot(all(abs(helper$spec_scalar - c(0.4, 0.4, 0.4)) < 1e-8))
  stopifnot(is.numeric(helper$spec_hex), length(helper$spec_hex) == 3L)

  invisible(helper)
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

  x
}

current_scene_spec <- function() {
  .babylon_state$current_scene
}

append_current_scene <- function(object, add = TRUE, axes = TRUE, nticks = 5) {
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

  scene_spec$objects[[length(scene_spec$objects) + 1L]] <- object
  .babylon_state$current_scene <- scene_spec

  babylon(scene_spec$objects, scene = scene_spec$scene)
}

#' Get or set Babylonian view parameters
#'
#' This stores lightweight `par3d()`-style view settings that new Babylonian
#' scenes will use, including `zoom` and `userMatrix`.
#'
#' @param zoom Optional zoom multiplier.
#' @param userMatrix Optional 4 x 4 user matrix used to rotate the scene pose.
#' @param reset Whether to restore the default view state.
#'
#' @export
par3d <- function(zoom = NULL, userMatrix = NULL, reset = FALSE) {
  if (isTRUE(reset)) {
    .babylon_state$par3d <- list(
      zoom = 0.05,
      userMatrix = diag(4)
    )
  }

  if (!is.null(zoom)) {
    .babylon_state$par3d$zoom <- as.numeric(zoom[[1]])
  }

  if (!is.null(userMatrix)) {
    .babylon_state$par3d$userMatrix <- normalize_user_matrix(userMatrix)
  }

  .babylon_state$par3d
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

  serialize_par3d(list(
    zoom = zoom,
    userMatrix = user_matrix
  ))
}

serialize_par3d <- function(x) {
  mat <- normalize_user_matrix(x$userMatrix)
  list(
    zoom = as.numeric(x$zoom[[1]]),
    userMatrix = unname(split(mat, row(mat)))
  )
}

deserialize_par3d <- function(x) {
  if (is.null(x)) {
    return(.babylon_state$par3d)
  }

  list(
    zoom = as.numeric(x$zoom[[1]]),
    userMatrix = normalize_user_matrix(x$userMatrix)
  )
}

set_last_live_par3d <- function(x) {
  .babylon_state$last_live_par3d <- deserialize_par3d(x)
  invisible(.babylon_state$last_live_par3d)
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

#' Save a Babylonian scene snapshot to an image file
#'
#' Captures a rendered Babylonian scene and writes it to an image file via
#' `webshot2`. Because screenshots are raster images, the output is a 2D image
#' of the current 3D view. When `widget` is omitted, the current in-memory
#' scene accumulator is used.
#'
#' @param filename Output image path.
#' @param widget Optional Babylonian htmlwidget. If omitted, the current scene
#'   from the `plot3d()` accumulator is rendered.
#' @param vwidth Viewport width passed to [webshot2::webshot()].
#' @param vheight Viewport height passed to [webshot2::webshot()].
#' @param delay Delay (seconds) before the screenshot is taken.
#' @param ... Additional arguments forwarded to [webshot2::webshot()].
#'
#' @export
snapshot3d <- function(filename = "snapshot3d.png", widget = NULL, vwidth = 800, vheight = 800, delay = 0.5, ...) {
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
snapshot2d <- snapshot3d

#' @rdname snapshot3d
#' @export
rgl.snapshot <- snapshot3d

#' @rdname snapshot3d
#' @export
snapshot <- snapshot3d

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

xyz_matrix <- function(x, y = NULL, z = NULL) {
  if (is.matrix(x)) {
    return(validate_xyz_matrix(x))
  }

  if (is.null(y) || is.null(z)) {
    stop("Provide either an n x 3 matrix or matching `x`, `y`, and `z` vectors.", call. = FALSE)
  }

  coords <- cbind(x, y, z)
  validate_xyz_matrix(coords)
}

validate_xyz_matrix <- function(x) {
  if (!is.matrix(x) || ncol(x) != 3) {
    stop("Expected a numeric matrix with exactly three columns.", call. = FALSE)
  }

  storage.mode(x) <- "numeric"
  x
}

normalize_point_colors <- function(color, n) {
  if (length(color) == 1L) {
    return(normalize_babylon_color(color))
  }

  if (length(color) != n) {
    stop("`color` must have length 1 or match the number of rows in the coordinate matrix.", call. = FALSE)
  }

  unname(vapply(color, normalize_babylon_color, character(1)))
}

plane_coefficients <- function(...) {
  args <- list(...)

  if (length(args) == 1L) {
    x <- args[[1]]
    if (is.data.frame(x)) {
      x <- as.matrix(x)
    }
    if (is.matrix(x)) {
      if (ncol(x) != 4L) {
        stop("Plane coefficient matrices must have exactly four columns.", call. = FALSE)
      }
      storage.mode(x) <- "numeric"
      return(x)
    }
  }

  if (length(args) != 4L) {
    stop("Supply planes as four coefficient vectors `(a, b, c, d)` or a matrix with four columns.", call. = FALSE)
  }

  lens <- vapply(args, length, integer(1))
  if (length(unique(lens)) != 1L) {
    stop("Plane coefficient vectors must all have the same length.", call. = FALSE)
  }

  coeffs <- cbind(
    as.numeric(args[[1]]),
    as.numeric(args[[2]]),
    as.numeric(args[[3]]),
    as.numeric(args[[4]])
  )

  if (ncol(coeffs) != 4L) {
    stop("Plane coefficients must define four values per plane.", call. = FALSE)
  }

  coeffs
}

run_landmark_gadget <- function(widget, n = NULL) {
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
        coords <- landmarks_to_matrix(pts)
        shiny::stopApp(coords)
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input$done, {
      pts <- input[[landmark_input]]
      if (landmark_count(pts) == 0) {
        shiny::stopApp(matrix(numeric(0), ncol = 3))
      }

      shiny::stopApp(landmarks_to_matrix(pts))
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

  if (is.vector(x) && !is.list(x)) {
    if (length(x) %% 3L != 0L) {
      return(NULL)
    }
    x <- matrix(x, ncol = 3, byrow = TRUE)
  }

  if (is.null(dim(x))) {
    return(NULL)
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

mesh3d_vertices <- function(x) {
  vb <- x$vb

  if (is.null(vb)) {
    stop("`mesh3d` objects must include a `vb` vertex matrix.", call. = FALSE)
  }

  if (nrow(vb) < 3) {
    stop("`mesh3d$vb` must have at least three rows for x/y/z coordinates.", call. = FALSE)
  }

  coords <- vb[seq_len(3), , drop = FALSE]

  if (nrow(vb) >= 4) {
    w <- vb[4, ]
    finite_w <- is.finite(w) & w != 0
    coords[, finite_w] <- sweep(coords[, finite_w, drop = FALSE], 2, w[finite_w], "/")
  }

  as.numeric(coords)
}

mesh3d_indices <- function(x, reverse_winding = TRUE) {
  faces <- x$it

  if (is.null(faces) || !length(faces)) {
    stop("`mesh3d` objects must include triangular faces in `it`.", call. = FALSE)
  }

  if (nrow(faces) != 3) {
    stop("Only triangular `mesh3d` faces are currently supported.", call. = FALSE)
  }

  if (isTRUE(reverse_winding)) {
    faces <- faces[c(1, 3, 2), , drop = FALSE]
  }

  as.integer(c(faces) - 1L)
}
