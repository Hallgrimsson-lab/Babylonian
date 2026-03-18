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
  material = NULL,
  vertex_attributes = NULL,
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

  if (!is.null(material)) {
    mesh$material <- normalize_material3d(material)
  }

  if (!is.null(vertex_attributes)) {
    mesh$vertex_attributes <- normalize_vertex_attributes(vertex_attributes)
  }

  structure(mesh, class = c("babylon_mesh", "list"))
}

#' Create a morph-target-enabled Babylon mesh
#'
#' This wraps a reference mesh together with a same-topology morph target mesh
#' so BabylonJS can interpolate between them with a numeric influence value.
#'
#' @param x A `mesh3d` or `babylon_mesh` object used as the base mesh.
#' @param target A `mesh3d` or `babylon_mesh` object with matching topology.
#' @param influence Initial morph-target influence.
#' @param ... Additional graphical parameters forwarded to [as_babylon_mesh()]
#'   or applied to an existing `babylon_mesh`.
#'
#' @export
morph_target3d <- function(x, target, influence = 0, ...) {
  if (inherits(x, "mesh3d")) {
    mesh <- do.call(as_babylon_mesh, c(list(x = x), list(...)))
  } else if (inherits(x, "babylon_mesh")) {
    mesh <- modify_babylon_mesh(x, list(...))
  } else if (is.list(x) && identical(x$type, "mesh3d")) {
    mesh <- normalize_scene_object(x)
  } else {
    stop("`x` must be a `mesh3d` or `babylon_mesh` object.", call. = FALSE)
  }

  target_mesh <- normalize_morph_target_mesh(target, arg = "target")
  validate_matching_mesh_topology(mesh, target_mesh, "x", "target")

  mesh$morph_target <- normalize_morph_target_spec(
    list(
      name = paste0(mesh$name %||% "mesh", "-morph"),
      vertices = target_mesh$vertices,
      influence = influence
    ),
    base_vertices = mesh$vertices,
    base_indices = mesh$indices
  )

  structure(mesh, class = c("babylon_mesh", "list"))
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

normalize_morph_target_mesh <- function(x, arg = "target") {
  mesh <- normalize_scene_object(x)

  if (!is.list(mesh) || !identical(mesh$type, "mesh3d")) {
    stop(sprintf("`%s` must be a `mesh3d` or `babylon_mesh` object.", arg), call. = FALSE)
  }

  mesh
}

validate_matching_mesh_topology <- function(reference, target, reference_arg = "reference", target_arg = "target") {
  reference_vertices <- mesh_vertex_matrix(reference)
  target_vertices <- mesh_vertex_matrix(target)

  if (nrow(reference_vertices) != nrow(target_vertices)) {
    stop("`", reference_arg, "` and `", target_arg, "` must contain the same number of vertices.", call. = FALSE)
  }

  if (!identical(reference$indices, target$indices)) {
    stop("`", reference_arg, "` and `", target_arg, "` must use identical triangle topology.", call. = FALSE)
  }

  invisible(TRUE)
}

normalize_morph_target_spec <- function(x, base_vertices, base_indices) {
  if (is.null(x)) {
    return(NULL)
  }

  if (!is.list(x)) {
    stop("`morph_target` must be a list.", call. = FALSE)
  }

  vertices <- x$vertices %||% x$positions %||% NULL
  if (is.matrix(vertices)) {
    vertices <- flatten_vertex_matrix(vertices)
  }

  if (!is.numeric(vertices) || !length(vertices) || any(!is.finite(vertices))) {
    stop("`morph_target$vertices` must be a finite numeric vertex array.", call. = FALSE)
  }

  if (length(vertices) != length(base_vertices)) {
    stop("`morph_target$vertices` must have the same length as the base mesh vertex array.", call. = FALSE)
  }

  list(
    name = if (is.null(x$name)) NULL else as.character(x$name[[1]]),
    vertices = as.numeric(vertices),
    influence = normalize_morph_influence(x$influence %||% 0)
  )
}

normalize_morph_influence <- function(x) {
  value <- as.numeric(x[[1]])
  if (!is.finite(value)) {
    stop("`influence` must be a finite numeric scalar.", call. = FALSE)
  }

  value
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
