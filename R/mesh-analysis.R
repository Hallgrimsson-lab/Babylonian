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
