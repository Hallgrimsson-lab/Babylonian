# Environment used to accumulate the current scene in an rgl-like workflow.
.babylon_state <- new.env(parent = emptyenv())
.babylon_state$current_scene <- NULL
.babylon_state$par3d <- list(
  zoom = 0.05,
  userMatrix = diag(4)
)
.babylon_state$last_scene_par3d <- .babylon_state$par3d
.babylon_state$last_live_par3d <- NULL
.babylon_state$last_scene_state <- NULL

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

#' Visualize per-vertex mesh differences as a heatmap
#'
#' This compares two matching-topology meshes vertex-by-vertex, colors the
#' reference mesh by signed displacement along the reference vertex normals
#' using a Babylon shader, and can optionally overlay colored displacement
#' vectors plus a displaced wireframe.
#'
#' @param reference A `mesh3d` or `babylon_mesh` object used as the base mesh.
#' @param target A `mesh3d` or `babylon_mesh` object with matching topology.
#'   Defaults to `NULL` when `distvec` is used instead.
#' @param distvec Optional signed per-vertex distance vector. When supplied,
#'   `meshDist()` uses the reference mesh normals to map values onto the
#'   heatmap and optional displacement vectors.
#' @param colorramp Color ramp used for the heatmap. Accepts R color vectors,
#'   including named colors and hex strings.
#' @param palette Deprecated alias for `colorramp`.
#' @param limits Optional numeric range used to clamp the heatmap scale. When
#'   omitted, the default heatmap scale is symmetric around zero.
#' @param from Optional lower bound for the heatmap scale. Values below this
#'   bound inherit the minimum color.
#' @param to Optional upper bound for the heatmap scale. Values above this
#'   bound inherit the maximum color.
#' @param displace Whether to show per-vertex displacement vectors. Use `TRUE`
#'   for a scale factor of 1, `FALSE` to disable, or a numeric scalar to scale
#'   the displacement vectors.
#' @param alpha Optional transparency for the reference heatmap surface.
#' @param add Whether to add the result to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Reserved for future mesh-distance options.
#'
#' @export
meshDist <- function(
  reference,
  target = NULL,
  distvec = NULL,
  colorramp = c("#1d4ed8", "#f8fafc", "#b91c1c"),
  palette = NULL,
  limits = NULL,
  from = NULL,
  to = NULL,
  displace = FALSE,
  alpha = NULL,
  add = FALSE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  meshdist_data <- compute_meshdist_data(
    reference = reference,
    target = target,
    distvec = distvec,
    colorramp = colorramp,
    palette = palette,
    limits = limits,
    from = from,
    to = to,
    alpha = alpha
  )

  heatmap_mesh <- list(
    type = "meshdist3d",
    name = meshdist_data$reference_mesh$name,
    vertices = meshdist_data$reference_mesh$vertices,
    indices = meshdist_data$reference_mesh$indices,
    reference_normals = flatten_vertex_matrix(meshdist_data$reference_normals),
    comparison_vertices = flatten_vertex_matrix(meshdist_data$target_vertices),
    colorramp = meshdist_data$colorramp,
    diff_min = meshdist_data$limits[1],
    diff_max = meshdist_data$limits[2],
    alpha = meshdist_data$alpha
  )

  objects <- list(heatmap_mesh)
  displace_scale <- normalize_displace_scale(displace)

  if (!identical(displace_scale, 0)) {
    displaced_vertices <- meshdist_data$reference_vertices + meshdist_data$displacement * displace_scale

    segment_points <- matrix(NA_real_, nrow = nrow(meshdist_data$reference_vertices) * 2L, ncol = 3L)
    segment_points[seq(1L, nrow(segment_points), by = 2L), ] <- meshdist_data$reference_vertices
    segment_points[seq(2L, nrow(segment_points), by = 2L), ] <- displaced_vertices

    displacement_segments <- structure(
      list(
        type = "segments3d",
        points = unname(segment_points),
        color = meshdist_data$colors,
        alpha = 1,
        width = 1
      ),
      class = c("babylon_segments", "list")
    )

    objects[[length(objects) + 1L]] <- displacement_segments
  }

  widget <- append_scene_objects(objects, add = add, axes = axes, nticks = nticks)
  attr(widget, "mesh_distance") <- list(
    distances = meshdist_data$signed_distances,
    magnitudes = meshdist_data$magnitudes,
    colors = meshdist_data$colors,
    limits = meshdist_data$limits,
    displacement = meshdist_data$displacement,
    mode = meshdist_data$mode,
    scale_plot = list(
      title = "Difference Scale",
      subtitle = "Signed displacement",
      colorramp = meshdist_data$colorramp,
      palette = meshdist_data$colorramp,
      from = meshdist_data$limits[1],
      to = meshdist_data$limits[2],
      breaks = c(meshdist_data$limits[1], mean(meshdist_data$limits), meshdist_data$limits[2]),
      labels = format(signif(c(meshdist_data$limits[1], mean(meshdist_data$limits), meshdist_data$limits[2]), 4), trim = TRUE)
    )
  )
  widget
}

#' Plot the `meshDist()` color scale as a 2D ggplot
#'
#' This computes the same signed-distance range and color ramp as [meshDist()],
#' but returns only a 2D scale bar plot instead of rendering the 3D scene.
#'
#' @inheritParams meshDist
#'
#' @export
heatmap_scale <- function(
  reference,
  target = NULL,
  distvec = NULL,
  colorramp = c("#1d4ed8", "#f8fafc", "#b91c1c"),
  palette = NULL,
  limits = NULL,
  from = NULL,
  to = NULL,
  displace = FALSE,
  alpha = NULL,
  add = FALSE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  if (!requireNamespace("ggplot2", quietly = TRUE)) {
    stop("Package 'ggplot2' is required for `heatmap_scale()`.", call. = FALSE)
  }

  meshdist_data <- compute_meshdist_data(
    reference = reference,
    target = target,
    distvec = distvec,
    colorramp = colorramp,
    palette = palette,
    limits = limits,
    from = from,
    to = to,
    alpha = alpha
  )

  scale_df <- data.frame(
    x = seq(meshdist_data$limits[1], meshdist_data$limits[2], length.out = 256L),
    y = 1,
    fill = seq(meshdist_data$limits[1], meshdist_data$limits[2], length.out = 256L)
  )
  breaks <- unique(c(meshdist_data$limits[1], 0, meshdist_data$limits[2]))

  ggplot2::ggplot(scale_df, ggplot2::aes(x = x, y = y, fill = fill)) +
    ggplot2::geom_raster() +
    ggplot2::scale_fill_gradientn(colors = meshdist_data$colorramp, limits = meshdist_data$limits, guide = "none") +
    ggplot2::scale_x_continuous(breaks = breaks, expand = c(0, 0)) +
    ggplot2::scale_y_continuous(expand = c(0, 0)) +
    ggplot2::labs(title = "Difference Scale", subtitle = "Signed displacement", x = NULL, y = NULL) +
    ggplot2::theme_minimal(base_size = 11) +
    ggplot2::theme(
      panel.grid = ggplot2::element_blank(),
      axis.text.y = ggplot2::element_blank(),
      axis.ticks.y = ggplot2::element_blank(),
      axis.title = ggplot2::element_blank(),
      plot.title.position = "plot"
    )
}

#' Create a Babylonian light specification
#'
#' This returns a reusable light specification that can be included directly in
#' [babylon()] scene `data` lists.
#'
#' @inheritParams light3d
#'
#' @export
as_babylon_light <- function(
  type = c("hemispheric", "point", "directional", "spot"),
  position = NULL,
  direction = NULL,
  intensity = 1,
  diffuse = "white",
  specular = "white",
  ground_color = NULL,
  angle = NULL,
  exponent = NULL,
  range = NULL,
  name = NULL,
  enabled = TRUE,
  ...
) {
  create_babylon_light(
    type = type,
    position = position,
    direction = direction,
    intensity = intensity,
    diffuse = diffuse,
    specular = specular,
    ground_color = ground_color,
    angle = angle,
    exponent = exponent,
    range = range,
    name = name,
    enabled = enabled
  )
}

#' Create a BabylonJS scene light
#'
#' This adds a configurable BabylonJS light to the current scene. Use
#' `type` to choose the underlying Babylon light model, or call the dedicated
#' wrappers such as [light3d_point()] and [light3d_hemispheric()].
#'
#' @param type Babylon light type. Supported values are `"point"`,
#'   `"directional"`, `"spot"`, and `"hemispheric"`.
#' @param position Optional light position for point, spot, and directional
#'   lights.
#' @param direction Optional light direction for directional, spot, and
#'   hemispheric lights.
#' @param intensity Light intensity multiplier.
#' @param diffuse Diffuse light color.
#' @param specular Specular light color.
#' @param ground_color Optional ground color for hemispheric lights.
#' @param angle Optional spotlight cone angle in radians.
#' @param exponent Optional spotlight falloff exponent.
#' @param range Optional light attenuation range.
#' @param name Optional light name.
#' @param enabled Whether the light should be enabled.
#' @param add Whether to add the object to the current Babylonian scene. Use
#'   `add = FALSE` to start a fresh scene.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#' @param ... Reserved for future light options.
#'
#' @export
light3d <- function(
  type = c("hemispheric", "point", "directional", "spot"),
  position = NULL,
  direction = NULL,
  intensity = 1,
  diffuse = "white",
  specular = "white",
  ground_color = NULL,
  angle = NULL,
  exponent = NULL,
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  light <- create_babylon_light(
    type = type,
    position = position,
    direction = direction,
    intensity = intensity,
    diffuse = diffuse,
    specular = specular,
    ground_color = ground_color,
    angle = angle,
    exponent = exponent,
    range = range,
    name = name,
    enabled = enabled
  )

  append_current_scene(light, add = add, axes = axes, nticks = nticks)
}

#' Create a BabylonJS point light
#'
#' @inheritParams light3d
#'
#' @export
light3d_point <- function(
  position = c(0, 1, 0),
  intensity = 1,
  diffuse = "white",
  specular = "white",
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  light3d(
    type = "point",
    position = position,
    intensity = intensity,
    diffuse = diffuse,
    specular = specular,
    range = range,
    name = name,
    enabled = enabled,
    add = add,
    axes = axes,
    nticks = nticks,
    ...
  )
}

#' Create a BabylonJS directional light
#'
#' @inheritParams light3d
#'
#' @export
light3d_directional <- function(
  direction = c(0, -1, 0),
  position = NULL,
  intensity = 1,
  diffuse = "white",
  specular = "white",
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  light3d(
    type = "directional",
    position = position,
    direction = direction,
    intensity = intensity,
    diffuse = diffuse,
    specular = specular,
    range = range,
    name = name,
    enabled = enabled,
    add = add,
    axes = axes,
    nticks = nticks,
    ...
  )
}

#' Create a BabylonJS spotlight
#'
#' @inheritParams light3d
#'
#' @export
light3d_spot <- function(
  position = c(0, 1, 0),
  direction = c(0, -1, 0),
  intensity = 1,
  diffuse = "white",
  specular = "white",
  angle = pi / 3,
  exponent = 1,
  range = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  light3d(
    type = "spot",
    position = position,
    direction = direction,
    intensity = intensity,
    diffuse = diffuse,
    specular = specular,
    angle = angle,
    exponent = exponent,
    range = range,
    name = name,
    enabled = enabled,
    add = add,
    axes = axes,
    nticks = nticks,
    ...
  )
}

#' Create a BabylonJS hemispheric light
#'
#' @inheritParams light3d
#'
#' @export
light3d_hemispheric <- function(
  direction = c(0, 1, 0),
  intensity = 1,
  diffuse = "white",
  specular = "white",
  ground_color = NULL,
  name = NULL,
  enabled = TRUE,
  add = TRUE,
  axes = TRUE,
  nticks = 5,
  ...
) {
  light3d(
    type = "hemispheric",
    direction = direction,
    intensity = intensity,
    diffuse = diffuse,
    specular = specular,
    ground_color = ground_color,
    name = name,
    enabled = enabled,
    add = add,
    axes = axes,
    nticks = nticks,
    ...
  )
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

    scene_spec$objects <- apply_scene_state_to_objects(scene_spec$objects, state$objects)
    scene_spec$scene <- normalize_scene(scene_spec$scene)
    if (!is.null(state$view)) {
      scene_spec$scene$view <- normalize_view(state$view)
      .babylon_state$last_scene_par3d <- deserialize_par3d(scene_spec$scene$view)
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

  widget$x$objects <- apply_scene_state_to_objects(widget$x$objects, state$objects)
  widget$x$scene <- normalize_scene(widget$x$scene)
  if (!is.null(state$view)) {
    widget$x$scene$view <- normalize_view(state$view)
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
    if (!is.null(x$color)) {
      if (identical(x$type, "segments3d") && length(x$color) > 1L) {
        x$color <- normalize_segment_colors(x$color, nrow(x$points) / 2L)
      } else {
        x$color <- normalize_babylon_color(x$color)
      }
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
  allowed <- c("color", "alpha", "specularity", "position", "rotation", "scaling", "name", "wireframe")

  for (nm in intersect(names(args), allowed)) {
    value <- args[[nm]]
    if (nm == "color") {
      value <- normalize_babylon_color(value)
    } else if (nm == "specularity") {
      value <- normalize_babylon_specularity(value)
    } else if (nm == "wireframe") {
      value <- isTRUE(value)
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
    if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 1)) {
      return(unname(rgb))
    }
    if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 255)) {
      return(unname(rgb / 255))
    }
    if (!all(is.finite(rgb)) || !all(rgb >= 0) || !all(rgb <= 255)) {
      stop("Numeric specularity vectors must be in the 0-1 or 0-255 range.", call. = FALSE)
    }
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
    for (nm in c("intensity", "diffuse", "specular", "ground_color", "angle", "exponent", "range", "enabled")) {
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
    objects = list()
  )

  if (!is.null(x$view)) {
    state$view <- normalize_view(x$view)
  }

  objects <- x$objects %||% list()
  if (is.data.frame(objects)) {
    objects <- data_frame_rows_to_list(objects)
  }
  if (length(objects)) {
    state$objects <- lapply(objects, normalize_scene_state_entry)
  }

  for (nm in c("selected", "gizmo_mode", "gizmos_visible")) {
    if (!is.null(x[[nm]])) {
      state[[nm]] <- x[[nm]]
    }
  }

  state
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

  if (!is.null(x$light_type)) {
    entry$light_type <- as.character(x$light_type[[1]])
  }

  for (nm in c("intensity", "angle", "exponent", "range")) {
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
  if (!length(edits)) {
    return(objects)
  }

  edited <- objects
  for (entry in edits) {
    idx <- locate_scene_state_object(edited, entry)
    if (is.na(idx)) {
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

  for (nm in c("intensity", "angle", "exponent", "range", "enabled", "light_type")) {
    if (!is.null(entry[[nm]])) {
      object[[nm]] <- entry[[nm]]
    }
  }

  for (nm in c("diffuse", "specular", "ground_color")) {
    if (!is.null(entry[[nm]])) {
      object[[nm]] <- entry[[nm]]
    }
  }

  object
}

editable_mesh_primitive_types <- function() {
  c("sphere", "box", "plane", "cylinder", "cone", "mesh3d", "meshdist3d")
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
#' `webshot2`. When `widget` is omitted, the current in-memory scene
#' accumulator is used.
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
  if (is_single_color_spec(color)) {
    return(normalize_babylon_color(color))
  }

  if (length(color) != n) {
    stop("`color` must have length 1 or match the number of rows in the coordinate matrix.", call. = FALSE)
  }

  unname(vapply(color, normalize_babylon_color, character(1)))
}

create_babylon_light <- function(
  type = c("hemispheric", "point", "directional", "spot"),
  position = NULL,
  direction = NULL,
  intensity = 1,
  diffuse = "white",
  specular = "white",
  ground_color = NULL,
  angle = NULL,
  exponent = NULL,
  range = NULL,
  name = NULL,
  enabled = TRUE
) {
  type <- match.arg(type)

  if (is.null(position) && type %in% c("point", "spot")) {
    position <- c(0, 1, 0)
  }

  if (is.null(direction) && type == "hemispheric") {
    direction <- c(0, 1, 0)
  } else if (is.null(direction) && type %in% c("directional", "spot")) {
    direction <- c(0, -1, 0)
  }

  light <- list(
    type = "light3d",
    light_type = type,
    intensity = normalize_light_scalar(intensity, "intensity", lower = 0),
    diffuse = normalize_babylon_color(diffuse),
    specular = normalize_babylon_specularity(specular),
    enabled = isTRUE(enabled)
  )

  if (!is.null(position)) {
    light$position <- normalize_xyz_vector(position, "position")
  }

  if (!is.null(direction)) {
    light$direction <- normalize_xyz_vector(direction, "direction")
  }

  if (!is.null(ground_color)) {
    light$ground_color <- normalize_babylon_color(ground_color)
  }

  if (!is.null(angle)) {
    light$angle <- normalize_light_scalar(angle, "angle", lower = 0)
  }

  if (!is.null(exponent)) {
    light$exponent <- normalize_light_scalar(exponent, "exponent", lower = 0)
  }

  if (!is.null(range)) {
    light$range <- normalize_light_scalar(range, "range", lower = 0)
  }

  if (!is.null(name)) {
    light$name <- as.character(name[[1]])
  }

  structure(light, class = c("babylon_light", "list"))
}

normalize_babylon_light <- function(x) {
  create_babylon_light(
    type = x$light_type %||% x$subtype %||% x$kind %||% x$type_name %||% x$type,
    position = x$position,
    direction = x$direction,
    intensity = x$intensity %||% 1,
    diffuse = x$diffuse %||% "white",
    specular = x$specular %||% "white",
    ground_color = x$ground_color %||% x$groundColor,
    angle = x$angle,
    exponent = x$exponent,
    range = x$range,
    name = x$name,
    enabled = x$enabled %||% TRUE
  )
}

normalize_xyz_vector <- function(x, arg) {
  if (is.list(x)) {
    x <- unlist(x, recursive = TRUE, use.names = FALSE)
  }

  if (!is.numeric(x) || length(x) != 3L || !all(is.finite(x))) {
    stop("`", arg, "` must be a finite numeric vector of length 3.", call. = FALSE)
  }

  unname(as.numeric(x))
}

normalize_light_scalar <- function(x, arg, lower = -Inf) {
  value <- as.numeric(x[[1]])
  if (!is.finite(value) || value < lower) {
    stop("`", arg, "` must be a finite numeric scalar", if (is.finite(lower)) " greater than or equal to " else "", if (is.finite(lower)) lower else "", ".", call. = FALSE)
  }
  value
}

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

normalize_segment_colors <- function(color, n) {
  if (is_single_color_spec(color)) {
    return(normalize_babylon_color(color))
  }

  if (length(color) != n) {
    stop("`color` must have length 1 or match the number of segments.", call. = FALSE)
  }

  unname(vapply(color, normalize_babylon_color, character(1)))
}

compute_meshdist_data <- function(reference, target = NULL, distvec = NULL, colorramp, palette = NULL, limits = NULL, from = NULL, to = NULL, alpha = NULL) {
  if (!is.null(palette)) {
    colorramp <- palette
  }

  reference_mesh <- normalize_meshdist_mesh(reference, "reference")
  reference_vertices <- mesh_vertex_matrix(reference_mesh)
  reference_normals <- vertex_normals_from_mesh(reference_mesh)
  meshdist_input <- resolve_meshdist_input(
    reference_mesh = reference_mesh,
    reference_vertices = reference_vertices,
    reference_normals = reference_normals,
    target = target,
    distvec = distvec
  )

  scale_limits <- resolve_meshdist_limits(meshdist_input$signed_distances, limits = limits, from = from, to = to)
  normalized_colorramp <- normalize_heatmap_colorramp(colorramp)

  list(
    reference_mesh = reference_mesh,
    reference_vertices = reference_vertices,
    reference_normals = reference_normals,
    target_vertices = meshdist_input$target_vertices,
    displacement = meshdist_input$displacement,
    signed_distances = meshdist_input$signed_distances,
    magnitudes = meshdist_input$magnitudes,
    mode = meshdist_input$mode,
    limits = scale_limits,
    colorramp = normalized_colorramp,
    colors = map_numeric_to_colors(meshdist_input$signed_distances, palette = normalized_colorramp, limits = scale_limits),
    alpha = if (is.null(alpha)) {
      if (is.null(reference_mesh$alpha)) 1 else reference_mesh$alpha
    } else {
      normalize_alpha_value(alpha)
    }
  )
}

resolve_meshdist_input <- function(reference_mesh, reference_vertices, reference_normals, target = NULL, distvec = NULL) {
  if (is.null(target) && is.null(distvec)) {
    stop("Provide either `target` or `distvec` to `meshDist()`.", call. = FALSE)
  }

  if (!is.null(target) && !is.null(distvec)) {
    stop("Supply only one of `target` or `distvec` to `meshDist()`.", call. = FALSE)
  }

  if (!is.null(distvec)) {
    signed_distances <- normalize_distvec(distvec, nrow(reference_vertices))
    displacement <- reference_normals * signed_distances

    return(list(
      mode = "distvec",
      target_vertices = reference_vertices + displacement,
      displacement = displacement,
      signed_distances = signed_distances,
      magnitudes = abs(signed_distances)
    ))
  }

  target_mesh <- normalize_meshdist_mesh(target, "target")
  target_vertices <- mesh_vertex_matrix(target_mesh)

  if (nrow(reference_vertices) != nrow(target_vertices)) {
    stop("`reference` and `target` must contain the same number of vertices.", call. = FALSE)
  }

  if (!identical(reference_mesh$indices, target_mesh$indices)) {
    stop("`reference` and `target` must use identical triangle topology for `meshDist()`.", call. = FALSE)
  }

  displacement <- target_vertices - reference_vertices

  list(
    mode = "target",
    target_vertices = target_vertices,
    displacement = displacement,
    signed_distances = rowSums(displacement * reference_normals),
    magnitudes = sqrt(rowSums(displacement ^ 2))
  )
}

normalize_meshdist_mesh <- function(x, arg) {
  mesh <- normalize_scene_object(x)

  if (!is.list(mesh) || !identical(mesh$type, "mesh3d")) {
    stop(sprintf("`%s` must be a `mesh3d` or `babylon_mesh` object.", arg), call. = FALSE)
  }

  mesh
}

normalize_distvec <- function(x, n) {
  if (!is.numeric(x) || length(x) != n || any(!is.finite(x))) {
    stop("`distvec` must be a finite numeric vector with one value per reference vertex.", call. = FALSE)
  }

  as.numeric(x)
}

mesh_vertex_matrix <- function(x) {
  vertices <- x$vertices

  if (is.null(vertices) || length(vertices) %% 3L != 0L) {
    stop("Mesh objects must include a flat `vertices` array with x/y/z triplets.", call. = FALSE)
  }

  t(matrix(as.numeric(vertices), nrow = 3L))
}

flatten_vertex_matrix <- function(x) {
  as.numeric(t(unname(x)))
}

vertex_normals_from_mesh <- function(x) {
  if (!is.null(x$source$vb) && !is.null(x$source$it)) {
    source_mesh <- structure(
      list(vb = x$source$vb, it = x$source$it),
      class = "mesh3d"
    )
    vertices <- t(matrix(mesh3d_vertices(source_mesh), nrow = 3L))
    indices <- x$source$it
  } else {
    vertices <- mesh_vertex_matrix(x)
    indices <- matrix(as.integer(x$indices) + 1L, nrow = 3L)
  }

  normals <- matrix(0, nrow = nrow(vertices), ncol = 3L)

  for (i in seq_len(ncol(indices))) {
    face <- indices[, i]
    p1 <- vertices[face[1], ]
    p2 <- vertices[face[2], ]
    p3 <- vertices[face[3], ]
    face_normal <- cross_product3d(p2 - p1, p3 - p1)
    normals[face, ] <- normals[face, , drop = FALSE] +
      matrix(rep(face_normal, 3L), nrow = 3L, byrow = TRUE)
  }

  lengths <- sqrt(rowSums(normals ^ 2))
  keep <- lengths > 0 & is.finite(lengths)
  normals[keep, ] <- normals[keep, , drop = FALSE] / lengths[keep]
  normals[!keep, 3] <- 1
  normals
}

cross_product3d <- function(a, b) {
  c(
    a[2] * b[3] - a[3] * b[2],
    a[3] * b[1] - a[1] * b[3],
    a[1] * b[2] - a[2] * b[1]
  )
}

normalize_numeric_limits <- function(x, limits = NULL) {
  if (is.null(limits)) {
    limits <- range(x, na.rm = TRUE, finite = TRUE)
  }

  if (!is.numeric(limits) || length(limits) != 2L || any(!is.finite(limits))) {
    stop("`limits` must be `NULL` or a finite numeric vector of length 2.", call. = FALSE)
  }

  limits <- sort(as.numeric(limits))
  if (identical(limits[1], limits[2])) {
    limits <- limits + c(-0.5, 0.5)
  }

  limits
}

resolve_meshdist_limits <- function(x, limits = NULL, from = NULL, to = NULL) {
  if (is.null(limits)) {
    scale_limits <- symmetric_meshdist_limits(x)
  } else {
    scale_limits <- normalize_numeric_limits(x, limits)
  }

  if (!is.null(from)) {
    scale_limits[1] <- normalize_heatmap_limit(from, "from")
  }

  if (!is.null(to)) {
    scale_limits[2] <- normalize_heatmap_limit(to, "to")
  }

  if (scale_limits[1] > scale_limits[2]) {
    stop("`from` must be less than or equal to `to`.", call. = FALSE)
  }

  if (identical(scale_limits[1], scale_limits[2])) {
    scale_limits <- scale_limits + c(-0.5, 0.5)
  }

  scale_limits
}

symmetric_meshdist_limits <- function(x) {
  finite_x <- x[is.finite(x)]
  if (!length(finite_x)) {
    return(c(-0.5, 0.5))
  }

  max_abs <- max(abs(finite_x))
  if (!is.finite(max_abs) || identical(max_abs, 0)) {
    return(c(-0.5, 0.5))
  }

  c(-max_abs, max_abs)
}

normalize_heatmap_limit <- function(x, name) {
  if (!is.numeric(x) || !length(x) || !is.finite(x[[1]])) {
    stop(sprintf("`%s` must be a finite numeric scalar.", name), call. = FALSE)
  }

  as.numeric(x[[1]])
}

map_numeric_to_colors <- function(x, palette, limits) {
  if (!length(palette)) {
    stop("`palette` must contain at least one color.", call. = FALSE)
  }

  ramp <- grDevices::colorRampPalette(unname(vapply(palette, normalize_babylon_color, character(1))))(256L)
  scaled <- (x - limits[1]) / diff(limits)
  scaled <- pmax(0, pmin(1, scaled))
  indices <- pmax(1L, pmin(256L, as.integer(floor(scaled * 255)) + 1L))
  colors <- ramp[indices]
  colors[is.na(x)] <- "#808080"
  unname(colors)
}

normalize_heatmap_colorramp <- function(colorramp) {
  if (!length(colorramp)) {
    stop("`colorramp` must contain at least one color.", call. = FALSE)
  }

  colorramp <- unname(vapply(colorramp, normalize_babylon_color, character(1)))
  if (length(colorramp) == 1L) {
    return(rep(colorramp, 2L))
  }

  colorramp
}

normalize_heatmap_palette <- function(palette) {
  if (!length(palette)) {
    stop("`palette` must contain at least one color.", call. = FALSE)
  }

  normalize_heatmap_colorramp(palette)
}

normalize_alpha_value <- function(x) {
  if (!is.numeric(x) || !length(x) || !is.finite(x[[1]])) {
    stop("`alpha` must be a finite numeric scalar.", call. = FALSE)
  }

  max(0, min(1, as.numeric(x[[1]])))
}

hex_colors_to_rgba <- function(colors, alpha = 1) {
  colors <- unname(vapply(colors, normalize_babylon_color, character(1)))
  alpha <- rep_len(as.numeric(alpha), length(colors))
  alpha[!is.finite(alpha)] <- 1
  alpha <- pmax(0, pmin(1, alpha))
  rgb <- grDevices::col2rgb(colors) / 255
  as.numeric(rbind(rgb, alpha))
}

normalize_displace_scale <- function(x) {
  if (isTRUE(x)) {
    return(1)
  }

  if (isFALSE(x) || is.null(x)) {
    return(0)
  }

  if (is.numeric(x) && length(x) == 1L && is.finite(x)) {
    return(as.numeric(x))
  }

  stop("`displace` must be TRUE, FALSE, or a finite numeric scalar.", call. = FALSE)
}

is_single_color_spec <- function(x) {
  if (length(x) == 1L) {
    return(TRUE)
  }

  is.numeric(x) && length(x) %in% c(3L, 4L) && all(is.finite(x))
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

    shiny::observeEvent(input$done, {
      state <- current_scene_state_input(input[[scene_state_input]], fallback = initial_state)
      set_last_scene_state(state)
      shiny::stopApp(state)
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
