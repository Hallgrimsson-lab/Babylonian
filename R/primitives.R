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

# Babylon spheres read larger than rgl spheres for the same nominal radius, so
# keep a small compatibility factor here to better match rgl expectations.
rgl_sphere_radius_factor <- function() {
  1 / 12
}

#' Render a 3D scatterplot with spheres
#'
#' @param x,y,z Point coordinates.
#' @param radius Sphere radius relative to scene radius. Babylonian applies a
#'   small compatibility factor internally so values feel closer to
#'   `rgl::spheres3d()`.
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
  radius <- as.numeric(radius[[1]]) * rgl_sphere_radius_factor()

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

#' Render connected 3D lines
#'
#' Consecutive points are connected into a single polyline, mirroring the feel
#' of `rgl::lines3d()`.
#'
#' @param x,y,z Line coordinates.
#' @param color Line color.
#' @param alpha Reserved for future transparency support.
#' @param width Relative line width hint.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
lines3d <- function(
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
  if (nrow(points) < 2L) {
    stop("`lines3d()` requires at least two points.", call. = FALSE)
  }

  lines <- structure(
    list(
      type = "lines3d",
      points = unname(points),
      color = normalize_babylon_color(color),
      alpha = alpha,
      width = width
    ),
    class = c("babylon_lines", "list")
  )

  append_current_scene(lines, add = add, axes = axes, nticks = nticks)
}

#' Render lightweight projected 3D text labels
#'
#' @param texts Character vector of labels.
#' @param x,y,z Label coordinates.
#' @param color Label color.
#' @param cex Relative text size multiplier.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
text3d <- function(
  x,
  y = NULL,
  z = NULL,
  texts,
  color = "black",
  cex = 1,
  add = TRUE,
  axes = TRUE,
  nticks = 5
) {
  points <- xyz_matrix(x, y, z)
  texts <- as.character(texts)

  if (length(texts) == 1L && nrow(points) > 1L) {
    texts <- rep(texts, nrow(points))
  }
  if (length(texts) != nrow(points)) {
    stop("`text3d()` requires one label per point.", call. = FALSE)
  }

  labels <- structure(
    list(
      type = "text3d",
      points = unname(points),
      texts = unname(texts),
      color = normalize_babylon_color(color),
      cex = as.numeric(cex[[1]])
    ),
    class = c("babylon_text", "list")
  )

  append_current_scene(labels, add = add, axes = axes, nticks = nticks)
}

#' Add rgl-style scene titles and axis labels
#'
#' @param main Optional main title.
#' @param sub Optional subtitle.
#' @param xlab,ylab,zlab Optional axis-label overrides.
#' @param color Title and label color.
#' @param cex Relative title size multiplier.
#' @param add Whether to add the title settings to the current scene. Use
#'   `add = FALSE` to start a fresh empty scene carrying only the title.
#'
#' @export
title3d <- function(main = NULL, sub = NULL, xlab = NULL, ylab = NULL, zlab = NULL, color = "black", cex = 1, add = TRUE) {
  scene_spec <- current_scene_spec()

  if (!isTRUE(add) || is.null(scene_spec)) {
    scene_spec <- list(
      objects = list(),
      scene = list(
        axes = TRUE,
        nticks = 5L,
        view = serialize_par3d(.babylon_state$par3d)
      )
    )
  }

  scene_spec$scene$title <- normalize_scene_title(list(
    main = main,
    sub = sub,
    xlab = xlab,
    ylab = ylab,
    zlab = zlab,
    color = color,
    cex = cex
  ))

  .babylon_state$current_scene <- scene_spec
  babylon(scene_spec$objects, scene = scene_spec$scene)
}

#' Add a 2D scale bar overlay to the current scene
#'
#' @param length Scale bar length in scene units.
#' @param units Optional unit label such as `"mm"`, `"cm"`,
#'   `"procrustes distance"`, or `"other"`.
#' @param custom_units Optional custom unit label used when `units = "other"`.
#' @param label Optional explicit scale bar label. When omitted, Babylonian
#'   builds a label from `length` and the unit text.
#' @param position Corner keyword (`"topleft"`, `"topright"`, `"bottomleft"`,
#'   `"bottomright"`) or a numeric vector of length 2 giving the top-left
#'   insertion point in screen pixels.
#' @param add Whether to add the scale bar to the current scene. Use
#'   `add = FALSE` to start a fresh empty scene carrying only the scale bar.
#'
#' @export
scaleBar3d <- function(length, units = NULL, custom_units = NULL, label = NULL, position = "bottomright", add = TRUE) {
  scene_spec <- current_scene_spec()

  if (!isTRUE(add) || is.null(scene_spec)) {
    scene_spec <- list(
      objects = list(),
      scene = list(
        axes = TRUE,
        nticks = 5L,
        view = serialize_par3d(.babylon_state$par3d)
      )
    )
  }

  scene_spec$scene$scale_bar <- normalize_scene_scale_bar(list(
    enabled = TRUE,
    length = length,
    units = units,
    custom_units = custom_units,
    label = label,
    position = position
  ))

  .babylon_state$current_scene <- scene_spec
  babylon(scene_spec$objects, scene = scene_spec$scene)
}

#' Render one or more clipping-style planes
#'
#' Planes are specified by coefficients `(a, b, c, d)` for equations of the
#' form `a*x + b*y + c*z + d = 0`.
#'
#' @param ... Plane coefficients. Supply either four numeric vectors
#'   `a, b, c, d` of equal length, a matrix/data frame with four columns, or a
#'   `3 x 3` matrix of points used to fit a single plane.
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
