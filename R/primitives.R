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
#'   `color`, `alpha`, `specularity`, `position`, `rotation`, `scaling`,
#'   `name`, and `wireframe`.
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

modify_babylon_asset <- function(x, args) {
  allowed <- c("position", "rotation", "scaling", "name", "material", "preserve_materials")

  for (nm in intersect(names(args), allowed)) {
    value <- args[[nm]]
    if (nm == "material") {
      value <- normalize_material3d(value)
    } else if (nm == "preserve_materials") {
      value <- isTRUE(value)
    }
    x[[nm]] <- value
  }

  structure(x, class = class(x))
}

#' Plot a Babylon imported asset using rgl-like conventions
#'
#' @param x A `babylon_asset` object created by [import_model3d()].
#' @param add Whether to add the asset to an existing widget specification. If
#'   `FALSE`, a new widget is returned.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Additional graphical parameters. Recognized values include
#'   `position`, `rotation`, `scaling`, `name`, `material`, and
#'   `preserve_materials`.
#'
#' @export
plot3d.babylon_asset <- function(x, add = FALSE, axes = TRUE, nticks = 5, ...) {
  x <- modify_babylon_asset(normalize_model3d_asset(x), list(...))
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

#' @export
plot.babylon_asset <- function(x, add = FALSE, axes = TRUE, nticks = 5, ...) {
  plot3d.babylon_asset(x, add = add, axes = axes, nticks = nticks, ...)
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
      color = normalize_segment_colors(color, nrow(points) / 2L),
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

#' Render a 3D mesh as a wireframe
#'
#' This mirrors the feel of `rgl::wire3d()`/`wireframe`-style plotting by
#' rendering mesh edges using Babylon's wireframe material mode.
#'
#' @param x A `mesh3d`, `babylon_mesh`, or compatible Babylonian mesh object.
#' @param color Optional wireframe color.
#' @param alpha Optional wireframe opacity.
#' @param specularity Optional surface specularity.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Additional mesh graphical parameters.
#'
#' @export
wireframe3d <- function(
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
    return(plot3d.babylon_mesh(mesh, add = add, axes = axes, nticks = nticks, wireframe = TRUE))
  }

  if (inherits(x, "babylon_mesh")) {
    args <- c(list(...), list(color = color, alpha = alpha, specularity = specularity, wireframe = TRUE))
    args <- args[!vapply(args, is.null, logical(1))]
    return(do.call(plot3d.babylon_mesh, c(list(x = x, add = add, axes = axes, nticks = nticks), args)))
  }

  if (is.list(x) && identical(x$type, "mesh3d")) {
    mesh <- normalize_scene_object(x)
    return(plot3d.babylon_mesh(mesh, add = add, axes = axes, nticks = nticks, color = color, alpha = alpha, specularity = specularity, wireframe = TRUE, ...))
  }

  stop("`wireframe3d()` currently supports `mesh3d` and `babylon_mesh` objects.", call. = FALSE)
}
