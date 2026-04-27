#' Import a 3D mesh
#'
#' This function imports a 3D mesh from a file.
#'
#' @param file The path to the mesh file.
#' @param ... Additional arguments forwarded to [import_model3d()].
#'
#' @export
import_mesh <- function(file, ...) {
  asset <- import_model3d(file, ...)
  asset$type <- "mesh"
  asset
}

#' Import an external 3D asset
#'
#' This creates a lightweight scene descriptor for `glb`, `gltf`, `obj`, and
#' similar file-backed assets that BabylonJS will load directly in the browser.
#'
#' @param file Path to the model file.
#' @param name Optional asset name.
#' @param position Optional asset position.
#' @param rotation Optional asset rotation.
#' @param scaling Optional asset scaling.
#' @param material Optional whole-asset material override.
#' @param preserve_materials Whether to keep the materials authored in the
#'   source asset when no override is supplied.
#'
#' @export
import_model3d <- function(
  file,
  name = NULL,
  position = NULL,
  rotation = NULL,
  scaling = NULL,
  material = NULL,
  preserve_materials = TRUE
) {
  if (!is.character(file) || !length(file) || !nzchar(file[[1]])) {
    stop("`file` must be a non-empty model path.", call. = FALSE)
  }

  file <- normalizePath(file[[1]], winslash = "/", mustWork = FALSE)
  if (!file.exists(file)) {
    stop("`file` does not exist: ", file, call. = FALSE)
  }

  attachments <- resolve_model_attachments(file)
  asset <- list(
    type = "asset3d",
    file = basename(file),
    format = tolower(tools::file_ext(file)),
    name = if (is.null(name)) tools::file_path_sans_ext(basename(file)) else as.character(name[[1]]),
    preserve_materials = isTRUE(preserve_materials),
    material_overrides = list(),
    info = model_info3d(file),
    dep = htmltools::htmlDependency(
      name = paste0("asset-", tools::file_path_sans_ext(basename(file))),
      version = "1.0.0",
      src = dirname(file),
      attachment = attachments
    )
  )

  if (!is.null(position)) {
    asset$position <- normalize_transform_vector(position, "position")
  }
  if (!is.null(rotation)) {
    asset$rotation <- normalize_transform_vector(rotation, "rotation")
  }
  if (!is.null(scaling)) {
    asset$scaling <- normalize_transform_vector(scaling, "scaling")
  }
  if (!is.null(material)) {
    asset$material <- normalize_material3d(material)
  }

  structure(asset, class = c("babylon_asset", "list"))
}

#' Add a material override to an imported asset
#'
#' @param x An imported asset created by [import_model3d()] or [import_mesh()].
#' @param material Material descriptor to apply.
#' @param target Optional mesh or material selector. Character targets match
#'   imported mesh names and source material names. Numeric targets match mesh
#'   indices in load order.
#'
#' @export
set_material3d <- function(x, material, target = NULL) {
  asset <- normalize_model3d_asset(x)
  material <- normalize_material3d(material)

  if (is.null(target)) {
    asset$material <- material
    return(structure(asset, class = class(x)))
  }

  asset$material_overrides[[length(asset$material_overrides) + 1L]] <- list(
    target = normalize_model_target(target),
    material = material
  )

  structure(asset, class = class(x))
}

#' Extract editable mesh geometry from an imported asset
#'
#' @param x A model path or imported asset descriptor.
#' @param target Optional mesh selector. Character values match mesh names;
#'   numeric values select by mesh index.
#'
#' @export
extract_geometry3d <- function(x, target = NULL) {
  file <- resolve_model_file(x)
  ext <- tolower(tools::file_ext(file))

  geometries <- if (ext %in% c("gltf", "glb")) {
    extract_gltf_geometries(file)
  } else if (ext %in% c("obj")) {
    extract_obj_geometries(file)
  } else {
    stop("Geometry extraction is currently supported for `obj`, `gltf`, and `glb` assets.", call. = FALSE)
  }

  select_geometry3d(geometries, target = target)
}

#' Replace editable mesh geometry inside an imported asset
#'
#' @param x An imported asset created by [import_model3d()] or [import_mesh()].
#' @param geometry Replacement geometry as a `babylon_geometry` object or
#'   `mesh3d`.
#' @param target Optional mesh selector. Defaults to `geometry$name` when
#'   available.
#'
#' @export
replace_geometry3d <- function(x, geometry, target = NULL) {
  asset <- normalize_model3d_asset(x)
  geometry <- normalize_geometry3d(geometry)

  if (is.null(target)) {
    target <- geometry$name %||% NULL
  }
  if (is.null(target)) {
    stop("Supply `target` or use a geometry object that carries a mesh `name`.", call. = FALSE)
  }

  asset$geometry_overrides <- asset$geometry_overrides %||% list()
  asset$geometry_overrides[[length(asset$geometry_overrides) + 1L]] <- list(
    target = normalize_model_target(target),
    geometry = serialize_geometry3d(geometry)
  )

  structure(asset, class = class(x))
}

#' Translate extracted mesh geometry
#'
#' @param x A `babylon_geometry` object or `mesh3d`.
#' @param by Length-3 numeric translation vector.
#'
#' @export
translate_geometry3d <- function(x, by) {
  geometry <- normalize_geometry3d(x)
  geometry$vertices <- sweep(geometry$vertices, 2L, normalize_transform_vector(by, "by"), "+")
  structure(geometry, class = c("babylon_geometry", "list"))
}

#' Scale extracted mesh geometry
#'
#' @param x A `babylon_geometry` object or `mesh3d`.
#' @param by Scalar or length-3 numeric scale.
#'
#' @export
scale_geometry3d <- function(x, by) {
  geometry <- normalize_geometry3d(x)
  scale_vec <- if (length(by) == 1L) rep(as.numeric(by[[1]]), 3L) else normalize_transform_vector(by, "by")
  geometry$vertices <- sweep(geometry$vertices, 2L, scale_vec, "*")
  structure(geometry, class = c("babylon_geometry", "list"))
}

#' Replace the vertex matrix of extracted mesh geometry
#'
#' @param x A `babylon_geometry` object or `mesh3d`.
#' @param vertices Replacement vertex matrix with three columns.
#'
#' @export
set_vertices3d <- function(x, vertices) {
  geometry <- normalize_geometry3d(x)
  vertices <- validate_xyz_matrix(as.matrix(vertices))
  if (nrow(vertices) != nrow(geometry$vertices)) {
    stop("Replacement `vertices` must have the same number of rows as the existing geometry.", call. = FALSE)
  }
  geometry$vertices <- vertices
  structure(geometry, class = c("babylon_geometry", "list"))
}

#' Inspect a model file and return lightweight scene-graph metadata
#'
#' @param x A model path or imported asset descriptor.
#'
#' @export
model_info3d <- function(x) {
  file <- resolve_model_file(x)
  file <- normalizePath(file, winslash = "/", mustWork = FALSE)
  ext <- tolower(tools::file_ext(file))

  if (identical(ext, "gltf")) {
    return(inspect_gltf_model(file))
  }

  if (identical(ext, "obj")) {
    return(inspect_obj_model(file))
  }

  list(
    file = basename(file),
    format = ext,
    nodes = character(0),
    meshes = character(0),
    materials = character(0),
    images = character(0),
    animations = character(0)
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
#' @param name What to name the morphtarget.
#' @param ... Additional graphical parameters forwarded to [as_babylon_mesh()]
#'   or applied to an existing `babylon_mesh`.
#'
#' @export
morph_target3d <- function(x, target, influence = 0, name = NULL, ...) {
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

  next_target <- normalize_morph_target_spec(
    list(
      name = if(is.null(name)){paste0(mesh$name %||% "mesh", "-morph")} else{name},
      vertices = target_mesh$vertices,
      influence = influence
    ),
    base_vertices = mesh$vertices,
    base_indices = mesh$indices
  )
  existing_targets <- normalize_morph_target_spec(
    mesh$morph_target %||% list(),
    base_vertices = mesh$vertices,
    base_indices = mesh$indices
  )
  mesh$morph_target <- c(existing_targets, next_target)

  structure(mesh, class = c("babylon_mesh", "list"))
}

normalize_model3d_asset <- function(x) {
  if (!is.list(x) || !(identical(x$type, "asset3d") || identical(x$type, "mesh"))) {
    stop("`x` must be an imported asset created by `import_model3d()` or `import_mesh()`.", call. = FALSE)
  }

  x
}

normalize_geometry3d <- function(x) {
  if (inherits(x, "mesh3d")) {
    vertices <- t(matrix(mesh3d_vertices(x), nrow = 3L))
    indices <- x$it
    geometry <- list(
      name = "geometry",
      vertices = vertices,
      indices = unname(indices),
      normals = if (!is.null(x$normals)) t(as.matrix(x$normals[seq_len(3), , drop = FALSE])) else NULL,
      uvs = NULL
    )
    return(structure(geometry, class = c("babylon_geometry", "list")))
  }

  if (!inherits(x, "babylon_geometry")) {
    stop("`geometry` must be a `babylon_geometry` object or `mesh3d`.", call. = FALSE)
  }

  x$vertices <- validate_xyz_matrix(as.matrix(x$vertices))
  if (!is.null(x$indices)) {
    x$indices <- normalize_geometry_indices(x$indices)
  }
  if (!is.null(x$normals)) {
    x$normals <- validate_xyz_matrix(as.matrix(x$normals))
  }
  if (!is.null(x$uvs)) {
    x$uvs <- validate_uv_matrix(as.matrix(x$uvs))
  }
  structure(x, class = c("babylon_geometry", "list"))
}

serialize_geometry3d <- function(x) {
  x <- normalize_geometry3d(x)
  list(
    name = x$name %||% NULL,
    vertices = flatten_vertex_matrix(x$vertices),
    indices = as.integer(c(unname(x$indices)) - 1L),
    normals = if (is.null(x$normals)) NULL else flatten_vertex_matrix(x$normals),
    uvs = if (is.null(x$uvs)) NULL else as.numeric(t(unname(x$uvs)))
  )
}

normalize_model_target <- function(x) {
  if (is.character(x)) {
    x <- unname(as.character(x[nzchar(x)]))
    if (!length(x)) {
      stop("Character `target` selectors must contain at least one non-empty name.", call. = FALSE)
    }
    return(x)
  }

  if (is.numeric(x)) {
    x <- as.integer(x)
    if (!length(x) || any(!is.finite(x))) {
      stop("Numeric `target` selectors must contain finite mesh indices.", call. = FALSE)
    }
    return(x)
  }

  stop("`target` must be NULL, a character vector of mesh/material names, or numeric mesh indices.", call. = FALSE)
}

resolve_model_file <- function(x) {
  if (is.character(x)) {
    return(x[[1]])
  }
  if (is.list(x) && !is.null(x$file) && !is.null(x$dep$src$file)) {
    return(file.path(x$dep$src$file, x$file))
  }

  stop("`x` must be a model path or imported asset descriptor.", call. = FALSE)
}

resolve_model_attachments <- function(file) {
  ext <- tolower(tools::file_ext(file))
  attachments <- basename(file)

  if (identical(ext, "gltf")) {
    json <- jsonlite::fromJSON(file, simplifyVector = FALSE)
    refs <- c(
      vapply(json$buffers %||% list(), `[[`, character(1), "uri"),
      vapply(json$images %||% list(), `[[`, character(1), "uri")
    )
    refs <- refs[!grepl("^(data:|https?://)", refs)]
    refs <- basename(refs[nzchar(refs)])
    existing <- refs[file.exists(file.path(dirname(file), refs))]
    attachments <- unique(c(attachments, existing))
  } else if (identical(ext, "obj")) {
    obj_lines <- readLines(file, warn = FALSE)
    mtl_refs <- trimws(sub("^mtllib\\s+", "", obj_lines[grepl("^mtllib\\s+", obj_lines)]))
    mtl_refs <- basename(mtl_refs[nzchar(mtl_refs)])
    existing_mtl <- mtl_refs[file.exists(file.path(dirname(file), mtl_refs))]
    attachments <- unique(c(attachments, existing_mtl))
    for (mtl in existing_mtl) {
      attachments <- unique(c(attachments, resolve_mtl_attachments(file.path(dirname(file), mtl))))
    }
  }

  attachments
}

resolve_mtl_attachments <- function(file) {
  lines <- readLines(file, warn = FALSE)
  refs <- trimws(sub("^[A-Za-z_]+\\s+", "", lines[grepl("^(map_|bump|norm|disp)\\s+", lines)]))
  refs <- basename(refs[nzchar(refs)])
  refs[file.exists(file.path(dirname(file), refs))]
}

inspect_gltf_model <- function(file) {
  payload <- read_gltf_json_only(file)
  json <- payload$json
  list(
    file = basename(file),
    format = payload$format,
    nodes = extract_named_entries(json$nodes),
    meshes = extract_named_entries(json$meshes),
    materials = extract_named_entries(json$materials),
    images = extract_uri_entries(json$images),
    animations = extract_named_entries(json$animations),
    buffers = extract_uri_entries(json$buffers)
  )
}

read_gltf_json_only <- function(file) {
  ext <- tolower(tools::file_ext(file))
  if (identical(ext, "gltf")) {
    return(list(
      format = "gltf",
      json = jsonlite::fromJSON(file, simplifyVector = FALSE)
    ))
  }

  if (!identical(ext, "glb")) {
    stop("Expected a `.gltf` or `.glb` file.", call. = FALSE)
  }

  raw_data <- readBin(file, what = "raw", n = file.info(file)$size)
  header <- read_uint32_vector(raw_data[1:12], n = 3L)
  if (!identical(header[[1]], 0x46546C67L)) {
    stop("Invalid GLB header.", call. = FALSE)
  }

  offset <- 13L
  json <- NULL
  while (offset <= length(raw_data)) {
    chunk_header <- read_uint32_vector(raw_data[offset:(offset + 7L)], n = 2L)
    chunk_length <- chunk_header[[1]]
    chunk_type <- chunk_header[[2]]
    chunk_data <- raw_data[(offset + 8L):(offset + 7L + chunk_length)]
    if (identical(chunk_type, 0x4E4F534AL)) {
      json <- jsonlite::fromJSON(rawToChar(chunk_data), simplifyVector = FALSE)
      break
    }
    offset <- offset + 8L + chunk_length
  }

  if (is.null(json)) {
    stop("GLB file does not contain a JSON chunk.", call. = FALSE)
  }

  list(format = "glb", json = json)
}

extract_gltf_geometries <- function(file) {
  payload <- read_gltf_payload(file)
  json <- payload$json
  meshes <- json$meshes %||% list()
  if (!length(meshes)) {
    stop("No meshes were found in the asset.", call. = FALSE)
  }

  geometries <- list()
  for (mesh_index in seq_along(meshes)) {
    mesh <- meshes[[mesh_index]]
    primitives <- mesh$primitives %||% list()
    if (!length(primitives)) {
      next
    }
    primitive <- primitives[[1L]]
    attributes <- primitive$attributes %||% list()
    if (is.null(attributes$POSITION)) {
      next
    }

    vertices <- read_gltf_accessor(payload, attributes$POSITION)
    geometry <- list(
      name = mesh$name %||% paste0("mesh-", mesh_index),
      vertices = vertices,
      indices = if (!is.null(primitive$indices)) {
        normalize_geometry_indices(read_gltf_indices(payload, primitive$indices))
      } else {
        matrix(seq_len(nrow(vertices)), nrow = 3L)
      },
      normals = if (!is.null(attributes$NORMAL)) read_gltf_accessor(payload, attributes$NORMAL) else NULL,
      uvs = if (!is.null(attributes$TEXCOORD_0)) read_gltf_accessor(payload, attributes$TEXCOORD_0) else NULL,
      metadata = list(
        mesh_index = mesh_index,
        material_index = primitive$material %||% NULL,
        format = payload$format
      )
    )
    geometries[[length(geometries) + 1L]] <- structure(geometry, class = c("babylon_geometry", "list"))
  }

  geometries
}

extract_obj_geometries <- function(file) {
  lines <- readLines(file, warn = FALSE)
  positions <- list()
  texcoords <- list()
  normals <- list()
  groups <- list()
  current_group <- "default"
  groups[[current_group]] <- init_obj_group()

  for (line in lines) {
    line <- trimws(sub("#.*$", "", line))
    if (!nzchar(line)) {
      next
    }

    if (grepl("^v\\s+", line)) {
      positions[[length(positions) + 1L]] <- as.numeric(strsplit(sub("^v\\s+", "", line), "\\s+")[[1L]][seq_len(3L)])
      next
    }
    if (grepl("^vt\\s+", line)) {
      texcoords[[length(texcoords) + 1L]] <- as.numeric(strsplit(sub("^vt\\s+", "", line), "\\s+")[[1L]][seq_len(2L)])
      next
    }
    if (grepl("^vn\\s+", line)) {
      normals[[length(normals) + 1L]] <- as.numeric(strsplit(sub("^vn\\s+", "", line), "\\s+")[[1L]][seq_len(3L)])
      next
    }
    if (grepl("^(o|g)\\s+", line)) {
      current_group <- trimws(sub("^(o|g)\\s+", "", line))
      if (!nzchar(current_group)) {
        current_group <- paste0("group-", length(groups) + 1L)
      }
      if (is.null(groups[[current_group]])) {
        groups[[current_group]] <- init_obj_group()
      }
      next
    }
    if (!grepl("^f\\s+", line)) {
      next
    }

    tokens <- strsplit(sub("^f\\s+", "", line), "\\s+")[[1L]]
    triangles <- triangulate_obj_face(tokens)
    for (tri in triangles) {
      for (token in tri) {
        parsed <- parse_obj_face_token(token)
        key <- paste(parsed$v %||% "", parsed$vt %||% "", parsed$vn %||% "", sep = "/")
        idx <- groups[[current_group]]$map[[key]]
        if (is.null(idx)) {
          idx <- nrow(groups[[current_group]]$vertices) + 1L
          groups[[current_group]]$map[[key]] <- idx
          groups[[current_group]]$vertices <- rbind(groups[[current_group]]$vertices, matrix(unlist(positions[[parsed$v]]), nrow = 1L))
          if (!is.null(parsed$vt) && length(texcoords) >= parsed$vt) {
            groups[[current_group]]$uvs <- rbind(groups[[current_group]]$uvs, matrix(unlist(texcoords[[parsed$vt]]), nrow = 1L))
          } else if (nrow(groups[[current_group]]$uvs)) {
            groups[[current_group]]$uvs <- rbind(groups[[current_group]]$uvs, c(NA_real_, NA_real_))
          }
          if (!is.null(parsed$vn) && length(normals) >= parsed$vn) {
            groups[[current_group]]$normals <- rbind(groups[[current_group]]$normals, matrix(unlist(normals[[parsed$vn]]), nrow = 1L))
          } else if (nrow(groups[[current_group]]$normals)) {
            groups[[current_group]]$normals <- rbind(groups[[current_group]]$normals, c(NA_real_, NA_real_, NA_real_))
          }
        }
        groups[[current_group]]$indices <- c(groups[[current_group]]$indices, idx)
      }
    }
  }

  lapply(names(groups), function(name) {
    group <- groups[[name]]
    structure(
      list(
        name = name,
        vertices = group$vertices,
        indices = normalize_geometry_indices(matrix(group$indices, nrow = 3L)),
        normals = if (nrow(group$normals)) group$normals else NULL,
        uvs = if (nrow(group$uvs)) group$uvs else NULL,
        metadata = list(format = "obj")
      ),
      class = c("babylon_geometry", "list")
    )
  })
}

inspect_obj_model <- function(file) {
  lines <- readLines(file, warn = FALSE)
  list(
    file = basename(file),
    format = "obj",
    nodes = unique(trimws(sub("^[og]\\s+", "", lines[grepl("^[og]\\s+", lines)]))),
    meshes = unique(trimws(sub("^[og]\\s+", "", lines[grepl("^[og]\\s+", lines)]))),
    materials = unique(trimws(sub("^usemtl\\s+", "", lines[grepl("^usemtl\\s+", lines)]))),
    images = resolve_mtl_texture_names(file),
    animations = character(0),
    buffers = character(0)
  )
}

resolve_mtl_texture_names <- function(file) {
  obj_lines <- readLines(file, warn = FALSE)
  mtl_refs <- trimws(sub("^mtllib\\s+", "", obj_lines[grepl("^mtllib\\s+", obj_lines)]))
  textures <- character(0)
  for (mtl in mtl_refs[file.exists(file.path(dirname(file), basename(mtl_refs)))]) {
    mtl_file <- file.path(dirname(file), basename(mtl))
    textures <- c(textures, resolve_mtl_attachments(mtl_file))
  }
  unique(basename(textures))
}

extract_named_entries <- function(x) {
  if (is.null(x)) {
    return(character(0))
  }

  names <- vapply(x, function(entry) entry$name %||% "", character(1))
  unname(names[nzchar(names)])
}

extract_uri_entries <- function(x) {
  if (is.null(x)) {
    return(character(0))
  }

  uris <- vapply(x, function(entry) entry$uri %||% "", character(1))
  unname(uris[nzchar(uris)])
}

select_geometry3d <- function(geometries, target = NULL) {
  geometries <- Filter(Negate(is.null), geometries)
  if (!length(geometries)) {
    stop("No extractable mesh geometry was found.", call. = FALSE)
  }

  if (is.null(target)) {
    if (length(geometries) == 1L) {
      return(geometries[[1L]])
    }
    stop("Multiple meshes are available. Supply `target` to choose one.", call. = FALSE)
  }

  if (is.numeric(target)) {
    idx <- as.integer(target[[1]])
    if (!idx %in% seq_along(geometries)) {
      stop("`target` index is out of range.", call. = FALSE)
    }
    return(geometries[[idx]])
  }

  target <- as.character(target[[1]])
  matches <- which(vapply(geometries, function(g) identical(g$name, target), logical(1)))
  if (!length(matches)) {
    stop("No mesh geometry matched `target`.", call. = FALSE)
  }
  geometries[[matches[[1L]]]]
}

read_gltf_payload <- function(file) {
  ext <- tolower(tools::file_ext(file))
  if (identical(ext, "gltf")) {
    json <- jsonlite::fromJSON(file, simplifyVector = FALSE)
    buffers <- lapply(json$buffers %||% list(), function(buffer) read_gltf_buffer_uri(buffer$uri, dirname(file)))
    return(list(format = "gltf", json = json, buffers = buffers))
  }
  if (!identical(ext, "glb")) {
    stop("Expected a `.gltf` or `.glb` file.", call. = FALSE)
  }

  raw_data <- readBin(file, what = "raw", n = file.info(file)$size)
  header <- read_uint32_vector(raw_data[1:12], n = 3L)
  if (!identical(header[[1]], 0x46546C67L)) {
    stop("Invalid GLB header.", call. = FALSE)
  }

  offset <- 13L
  json <- NULL
  bin_chunk <- raw()
  while (offset <= length(raw_data)) {
    chunk_header <- read_uint32_vector(raw_data[offset:(offset + 7L)], n = 2L)
    chunk_length <- chunk_header[[1]]
    chunk_type <- chunk_header[[2]]
    chunk_data <- raw_data[(offset + 8L):(offset + 7L + chunk_length)]
    if (identical(chunk_type, 0x4E4F534AL)) {
      json <- jsonlite::fromJSON(rawToChar(chunk_data), simplifyVector = FALSE)
    } else if (identical(chunk_type, 0x004E4942L)) {
      bin_chunk <- chunk_data
    }
    offset <- offset + 8L + chunk_length
  }

  if (is.null(json)) {
    stop("GLB file does not contain a JSON chunk.", call. = FALSE)
  }

  buffers <- lapply(seq_along(json$buffers %||% list()), function(i) {
    uri <- json$buffers[[i]]$uri %||% NULL
    if (!is.null(uri)) {
      return(read_gltf_buffer_uri(uri, dirname(file)))
    }
    bin_chunk
  })

  list(format = "glb", json = json, buffers = buffers)
}

read_gltf_indices <- function(payload, accessor_index) {
  as.integer(read_gltf_accessor(payload, accessor_index, drop = TRUE)) + 1L
}

read_gltf_accessor <- function(payload, accessor_index, drop = FALSE) {
  accessor <- payload$json$accessors[[as.integer(accessor_index) + 1L]]
  if (!is.null(accessor$sparse)) {
    stop("Sparse accessors are not yet supported in `extract_geometry3d()`.", call. = FALSE)
  }

  buffer_view <- payload$json$bufferViews[[as.integer(accessor$bufferView) + 1L]]
  buffer <- payload$buffers[[as.integer(buffer_view$buffer) + 1L]]
  component_count <- gltf_accessor_component_count(accessor$type)
  component_size <- gltf_component_size(accessor$componentType)
  count <- as.integer(accessor$count)
  stride <- buffer_view$byteStride %||% (component_count * component_size)
  start <- as.integer((buffer_view$byteOffset %||% 0) + (accessor$byteOffset %||% 0)) + 1L

  out <- matrix(NA_real_, nrow = count, ncol = component_count)
  for (i in seq_len(count)) {
    element_start <- start + ((i - 1L) * stride)
    element_end <- element_start + (component_count * component_size) - 1L
    out[i, ] <- read_typed_raw_values(buffer[element_start:element_end], accessor$componentType, component_count)
  }

  if (isTRUE(drop) && ncol(out) == 1L) {
    return(out[, 1L])
  }
  out
}

read_typed_raw_values <- function(raw_data, component_type, n) {
  con <- rawConnection(raw_data)
  on.exit(close(con), add = TRUE)

  switch(
    as.character(component_type),
    "5120" = as.numeric(readBin(con, "integer", n = n, size = 1L, signed = TRUE, endian = "little")),
    "5121" = as.numeric(readBin(con, "integer", n = n, size = 1L, signed = FALSE, endian = "little")),
    "5122" = as.numeric(readBin(con, "integer", n = n, size = 2L, signed = TRUE, endian = "little")),
    "5123" = as.numeric(readBin(con, "integer", n = n, size = 2L, signed = FALSE, endian = "little")),
    "5125" = as.numeric(readBin(con, "integer", n = n, size = 4L, signed = FALSE, endian = "little")),
    "5126" = as.numeric(readBin(con, "numeric", n = n, size = 4L, endian = "little")),
    stop("Unsupported glTF accessor component type: ", component_type, call. = FALSE)
  )
}

read_uint32_vector <- function(raw_data, n) {
  con <- rawConnection(raw_data)
  on.exit(close(con), add = TRUE)
  as.integer(readBin(con, "integer", n = n, size = 4L, signed = FALSE, endian = "little"))
}

read_gltf_buffer_uri <- function(uri, dir) {
  if (grepl("^data:", uri)) {
    encoded <- sub("^data:.*;base64,", "", uri)
    return(jsonlite::base64_dec(encoded))
  }
  path <- file.path(dir, uri)
  if (!file.exists(path)) {
    display_path <- tryCatch(
      normalizePath(path, winslash = "/", mustWork = FALSE),
      error = function(...) path
    )
    stop(
      "Geometry extraction requires the external glTF buffer `", basename(uri),
      "`, but it was not found at `", display_path, "`. ",
      "Metadata import via `import_model3d()` still works without sidecars, ",
      "but `extract_geometry3d()` needs the referenced `.bin` or embedded geometry data.",
      call. = FALSE
    )
  }
  readBin(path, what = "raw", n = file.info(path)$size)
}

gltf_accessor_component_count <- function(type) {
  switch(
    type,
    SCALAR = 1L,
    VEC2 = 2L,
    VEC3 = 3L,
    VEC4 = 4L,
    MAT2 = 4L,
    MAT3 = 9L,
    MAT4 = 16L,
    stop("Unsupported glTF accessor type: ", type, call. = FALSE)
  )
}

gltf_component_size <- function(type) {
  switch(
    as.character(type),
    "5120" = 1L,
    "5121" = 1L,
    "5122" = 2L,
    "5123" = 2L,
    "5125" = 4L,
    "5126" = 4L,
    stop("Unsupported glTF accessor component type: ", type, call. = FALSE)
  )
}

init_obj_group <- function() {
  list(
    vertices = matrix(numeric(0), ncol = 3L),
    uvs = matrix(numeric(0), ncol = 2L),
    normals = matrix(numeric(0), ncol = 3L),
    indices = integer(0),
    map = new.env(parent = emptyenv())
  )
}

triangulate_obj_face <- function(tokens) {
  if (length(tokens) < 3L) {
    return(list())
  }
  if (length(tokens) == 3L) {
    return(list(tokens))
  }
  lapply(seq(2L, length(tokens) - 1L), function(i) c(tokens[[1L]], tokens[[i]], tokens[[i + 1L]]))
}

parse_obj_face_token <- function(token) {
  parts <- strsplit(token, "/", fixed = TRUE)[[1L]]
  list(
    v = parse_obj_index(parts[[1L]]),
    vt = if (length(parts) >= 2L) parse_obj_index(parts[[2L]]) else NULL,
    vn = if (length(parts) >= 3L) parse_obj_index(parts[[3L]]) else NULL
  )
}

parse_obj_index <- function(x) {
  if (is.null(x) || !nzchar(x)) {
    return(NULL)
  }
  as.integer(x)
}

normalize_geometry_indices <- function(x) {
  if (is.vector(x)) {
    if (length(x) %% 3L != 0L) {
      stop("Geometry indices must define triangles.", call. = FALSE)
    }
    x <- matrix(as.integer(x), nrow = 3L)
  }

  if (!is.matrix(x) || nrow(x) != 3L) {
    stop("Geometry indices must be a 3 x n integer matrix or a multiple-of-3 vector.", call. = FALSE)
  }

  storage.mode(x) <- "integer"
  x
}

validate_uv_matrix <- function(x) {
  if (!is.matrix(x) || ncol(x) != 2L) {
    stop("Expected a numeric matrix with exactly two columns for UV coordinates.", call. = FALSE)
  }
  storage.mode(x) <- "numeric"
  x
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

plane_coefficients <- function(a, b = NULL, c = NULL, d = 0) {
  if (missing(a)) {
    stop("Supply planes as `(a, b, c, d)` coefficients, a four-column coefficient matrix, or a 3 x 3 point matrix.", call. = FALSE)
  }

  if (is.data.frame(a)) {
    a <- as.matrix(a)
  }

  if (is.matrix(a)) {
    if (ncol(a) == 3L && nrow(a) == 3L && is.null(b) && is.null(c)) {
      return(matrix(plane_coefficients_from_points(a), nrow = 1L))
    }

    if (ncol(a) == 4L && is.null(b) && is.null(c)) {
      storage.mode(a) <- "numeric"
      return(a)
    }
  }

  if (is.null(b) && is.null(c) && is.atomic(a) && length(a) == 4L) {
    coeffs <- matrix(as.numeric(a), nrow = 1L)
    if (!all(is.finite(coeffs))) {
      stop("Plane coefficients must be finite numeric values.", call. = FALSE)
    }
    return(coeffs)
  }

  coords <- grDevices::xyz.coords(a, y = b, z = c, recycle = TRUE, setLab = FALSE)
  normals <- cbind(
    as.numeric(coords$x),
    as.numeric(coords$y),
    as.numeric(coords$z)
  )
  offsets <- rep_len(as.numeric(d), nrow(normals))

  cbind(normals, offsets)
}

plane_coefficients_from_points <- function(x) {
  points <- validate_xyz_matrix(x)
  p1 <- points[1, ]
  p2 <- points[2, ]
  p3 <- points[3, ]
  normal <- cross_product3d(p2 - p1, p3 - p1)

  if (!all(is.finite(normal)) || sqrt(sum(normal ^ 2)) <= 1e-12) {
    stop("The supplied points must span a non-degenerate plane.", call. = FALSE)
  }

  d <- -sum(normal * p1)
  c(normal, d)
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
    stop("`morph_target` must be a list of morph target specifications.", call. = FALSE)
  }

  if (!is_morph_target_entry(x)) {
    targets <- lapply(x, normalize_single_morph_target_spec, base_vertices = base_vertices, base_indices = base_indices)
    targets <- Filter(Negate(is.null), targets)
    return(unname(targets))
  }

  list(normalize_single_morph_target_spec(x, base_vertices = base_vertices, base_indices = base_indices))
}

is_morph_target_entry <- function(x) {
  is.list(x) && any(c("vertices", "positions", "influence", "name") %in% names(x))
}

normalize_single_morph_target_spec <- function(x, base_vertices, base_indices) {
  if (is.null(x)) {
    return(NULL)
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
