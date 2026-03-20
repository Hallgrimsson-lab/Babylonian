#' Create a Babylon texture descriptor
#'
#' @param file Path to the texture image, or an in-memory image-like object such
#'   as an array, `nativeRaster`, `raster`, `magick-image`, or `cimg`.
#' @param colorspace Texture color space. Use `"srgb"` for base-color or
#'   emissive textures and `"linear"` for data textures such as normal or ORM
#'   maps.
#' @param level Optional texture intensity multiplier.
#' @param has_alpha Optional flag indicating whether the texture uses alpha.
#' @param invert_y Whether to flip the texture vertically on load.
#' @param u_scale,v_scale Optional texture tiling multipliers.
#' @param u_offset,v_offset Optional texture offsets.
#'
#' @export
texture3d <- function(
  file,
  colorspace = c("auto", "srgb", "linear"),
  level = NULL,
  has_alpha = NULL,
  invert_y = FALSE,
  u_scale = NULL,
  v_scale = NULL,
  u_offset = NULL,
  v_offset = NULL
) {
  file <- normalize_texture_source(file)

  colorspace <- match.arg(colorspace)
  texture <- list(
    type = "texture",
    file = basename(file),
    colorspace = colorspace,
    invert_y = isTRUE(invert_y),
    dep = htmltools::htmlDependency(
      name = paste0("texture-", tools::file_path_sans_ext(basename(file))),
      version = "1.0.0",
      src = dirname(file),
      attachment = basename(file)
    )
  )

  if (!is.null(level)) {
    texture$level <- as.numeric(level[[1]])
  }
  if (!is.null(has_alpha)) {
    texture$has_alpha <- isTRUE(has_alpha)
  }
  if (!is.null(u_scale)) {
    texture$u_scale <- as.numeric(u_scale[[1]])
  }
  if (!is.null(v_scale)) {
    texture$v_scale <- as.numeric(v_scale[[1]])
  }
  if (!is.null(u_offset)) {
    texture$u_offset <- as.numeric(u_offset[[1]])
  }
  if (!is.null(v_offset)) {
    texture$v_offset <- as.numeric(v_offset[[1]])
  }

  structure(texture, class = c("babylon_texture", "list"))
}

#' Create a named Babylon material reference
#'
#' @param name Registered material name.
#'
#' @export
material_ref3d <- function(name) {
  if (!is.character(name) || !length(name) || !nzchar(name[[1]])) {
    stop("`name` must be a non-empty string.", call. = FALSE)
  }

  structure(
    list(type = "material_ref", name = as.character(name[[1]])),
    class = c("babylon_material_ref", "list")
  )
}

#' Register a reusable named material
#'
#' @param name Registry key.
#' @param material Babylonian material descriptor.
#' @param overwrite Whether to overwrite an existing entry.
#'
#' @export
register_material3d <- function(name, material, overwrite = TRUE) {
  name <- normalize_material_registry_name(name)
  if (!isTRUE(overwrite) && !is.null(.babylon_state$material_registry[[name]])) {
    stop("A material named `", name, "` is already registered.", call. = FALSE)
  }

  .babylon_state$material_registry[[name]] <- normalize_material3d(material)
  invisible(get_material3d(name))
}

#' Get a registered named material
#'
#' @param name Registry key.
#' @param default Optional fallback when the material is not found.
#'
#' @export
get_material3d <- function(name, default = NULL) {
  name <- normalize_material_registry_name(name)
  material <- .babylon_state$material_registry[[name]]
  if (is.null(material)) {
    return(default)
  }

  structure(material, class = c("babylon_material", "list"))
}

#' List registered material names
#'
#' @export
list_materials3d <- function() {
  sort(names(.babylon_state$material_registry))
}

#' Remove a registered named material
#'
#' @param name Registry key.
#'
#' @export
remove_material3d <- function(name) {
  name <- normalize_material_registry_name(name)
  existing <- .babylon_state$material_registry[[name]]
  .babylon_state$material_registry[[name]] <- NULL
  invisible(if (is.null(existing)) NULL else structure(existing, class = c("babylon_material", "list")))
}

#' Create a standard Babylon material descriptor
#'
#' @param diffuse Diffuse surface color.
#' @param specular Specular highlight color.
#' @param emissive Optional emissive color.
#' @param alpha Optional material alpha.
#' @param wireframe Whether to render the material in wireframe mode.
#' @param backface_culling Whether to cull back faces.
#' @param name Optional material name.
#'
#' @export
standard_material3d <- function(
  diffuse = "white",
  specular = "black",
  emissive = NULL,
  alpha = NULL,
  wireframe = FALSE,
  backface_culling = TRUE,
  name = NULL
) {
  material <- list(
    type = "standard",
    diffuse = normalize_babylon_color(diffuse),
    specular = normalize_babylon_specularity(specular),
    wireframe = isTRUE(wireframe),
    backface_culling = isTRUE(backface_culling)
  )

  if (!is.null(emissive)) {
    material$emissive <- normalize_babylon_color(emissive)
  }

  if (!is.null(alpha)) {
    material$alpha <- normalize_alpha_value(alpha)
  }

  if (!is.null(name)) {
    material$name <- as.character(name[[1]])
  }

  structure(material, class = c("babylon_material", "list"))
}

#' Create a Babylon PBR material descriptor
#'
#' @param base_color Base surface color.
#' @param base_color_texture Optional base-color texture.
#' @param metallic Metallic factor in the 0-1 range.
#' @param roughness Roughness factor in the 0-1 range.
#' @param metallic_roughness_texture Optional metallic-roughness texture.
#' @param normal_texture Optional normal map texture.
#' @param occlusion_texture Optional ambient occlusion texture.
#' @param emissive_texture Optional emissive texture.
#' @param emissive Optional emissive color.
#' @param alpha Optional material alpha.
#' @param wireframe Whether to render the material in wireframe mode.
#' @param backface_culling Whether to cull back faces.
#' @param unlit Whether to disable scene lighting for the material.
#' @param name Optional material name.
#'
#' @export
pbr_material3d <- function(
  base_color = "white",
  base_color_texture = NULL,
  metallic = 0,
  roughness = 1,
  metallic_roughness_texture = NULL,
  normal_texture = NULL,
  occlusion_texture = NULL,
  emissive_texture = NULL,
  emissive = NULL,
  alpha = NULL,
  wireframe = FALSE,
  backface_culling = TRUE,
  unlit = FALSE,
  name = NULL
) {
  material <- list(
    type = "pbr",
    base_color = normalize_babylon_color(base_color),
    metallic = normalize_unit_interval(metallic, "metallic"),
    roughness = normalize_unit_interval(roughness, "roughness"),
    wireframe = isTRUE(wireframe),
    backface_culling = isTRUE(backface_culling),
    unlit = isTRUE(unlit)
  )

  if (!is.null(base_color_texture)) {
    material$base_color_texture <- normalize_texture3d(base_color_texture)
  }

  if (!is.null(metallic_roughness_texture)) {
    material$metallic_roughness_texture <- normalize_texture3d(metallic_roughness_texture)
  }

  if (!is.null(normal_texture)) {
    material$normal_texture <- normalize_texture3d(normal_texture)
  }

  if (!is.null(occlusion_texture)) {
    material$occlusion_texture <- normalize_texture3d(occlusion_texture)
  }

  if (!is.null(emissive_texture)) {
    material$emissive_texture <- normalize_texture3d(emissive_texture)
  }

  if (!is.null(emissive)) {
    material$emissive <- normalize_babylon_color(emissive)
  }

  if (!is.null(alpha)) {
    material$alpha <- normalize_alpha_value(alpha)
  }

  if (!is.null(name)) {
    material$name <- as.character(name[[1]])
  }

  structure(material, class = c("babylon_material", "list"))
}

#' Create a Babylon shader material descriptor
#'
#' @param name Shader name used to register source code in Babylon's shader store.
#' @param vertex Vertex shader GLSL source.
#' @param fragment Fragment shader GLSL source.
#' @param attributes Vertex attributes consumed by the shader.
#' @param uniforms Named list of shader uniforms.
#' @param textures Optional named list of textures or sampler sources.
#' @param alpha Optional material alpha.
#' @param backface_culling Whether to cull back faces.
#'
#' @export
shader_material3d <- function(
  name,
  vertex,
  fragment,
  attributes = c("position", "normal"),
  uniforms = NULL,
  textures = NULL,
  alpha = NULL,
  backface_culling = TRUE
) {
  if (!is.character(name) || !length(name) || !nzchar(name[[1]])) {
    stop("`name` must be a non-empty string.", call. = FALSE)
  }

  if (!is.character(vertex) || !length(vertex) || !nzchar(vertex[[1]])) {
    stop("`vertex` must be a non-empty shader source string.", call. = FALSE)
  }

  if (!is.character(fragment) || !length(fragment) || !nzchar(fragment[[1]])) {
    stop("`fragment` must be a non-empty shader source string.", call. = FALSE)
  }

  material <- list(
    type = "shader",
    name = as.character(name[[1]]),
    vertex = as.character(vertex[[1]]),
    fragment = as.character(fragment[[1]]),
    attributes = normalize_material_names(attributes, "attributes"),
    uniforms = normalize_material_bindings(uniforms, "uniforms"),
    textures = normalize_material_bindings(textures, "textures"),
    backface_culling = isTRUE(backface_culling)
  )

  if (!is.null(alpha)) {
    material$alpha <- normalize_alpha_value(alpha)
  }

  structure(material, class = c("babylon_material", "list"))
}

#' Create a Babylon node material descriptor
#'
#' @param file Optional path to a Babylon Node Material JSON export.
#' @param json Optional JSON string, parsed list, or node material object.
#' @param params Optional named list of exposed input block values.
#' @param alpha Optional material alpha.
#' @param backface_culling Whether to cull back faces.
#' @param name Optional material name.
#'
#' @export
node_material3d <- function(
  file = NULL,
  json = NULL,
  params = NULL,
  alpha = NULL,
  backface_culling = TRUE,
  name = NULL
) {
  if (is.null(file) && is.null(json)) {
    stop("Supply either `file` or `json` to `node_material3d()`.", call. = FALSE)
  }

  if (!is.null(file) && !is.null(json)) {
    stop("Supply only one of `file` or `json` to `node_material3d()`.", call. = FALSE)
  }

  source <- if (!is.null(file)) {
    if (!file.exists(file)) {
      stop("`file` does not exist: ", file, call. = FALSE)
    }
    jsonlite::fromJSON(file, simplifyVector = FALSE)
  } else {
    normalize_node_material_source(json)
  }

  material <- list(
    type = "node",
    source = source,
    params = normalize_material_bindings(params, "params"),
    backface_culling = isTRUE(backface_culling)
  )

  material$name <- if (!is.null(name)) {
    as.character(name[[1]])
  } else if (!is.null(source$name) && nzchar(as.character(source$name[[1]]))) {
    as.character(source$name[[1]])
  } else {
    "node-material"
  }

  if (!is.null(alpha)) {
    material$alpha <- normalize_alpha_value(alpha)
  }

  structure(material, class = c("babylon_material", "list"))
}

normalize_material3d <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (inherits(x, "babylon_material_ref")) {
    return(unclass(material_ref3d(x$name)))
  }

  if (inherits(x, "babylon_material")) {
    return(unclass(x))
  }

  if (!is.list(x) || is.null(x$type)) {
    stop("`material` must be a Babylonian material descriptor.", call. = FALSE)
  }

  type <- as.character(x$type[[1]])
  if (identical(type, "standard")) {
    return(unclass(do.call(standard_material3d, x[setdiff(names(x), "type")])))
  }
  if (identical(type, "pbr")) {
    return(unclass(do.call(pbr_material3d, x[setdiff(names(x), "type")])))
  }
  if (identical(type, "shader")) {
    return(unclass(do.call(shader_material3d, x[setdiff(names(x), "type")])))
  }
  if (identical(type, "node")) {
    args <- x[setdiff(names(x), "type")]
    if (!is.null(args$source) && is.null(args$json)) {
      args$json <- args$source
      args$source <- NULL
    }
    return(unclass(do.call(node_material3d, args)))
  }
  if (identical(type, "material_ref")) {
    return(unclass(material_ref3d(x$name)))
  }

  stop("Unsupported material type: ", type, call. = FALSE)
}

normalize_scene_material_library <- function(x = NULL) {
  registry <- .babylon_state$material_registry %||% list()
  registry <- if (length(registry)) {
    stats::setNames(lapply(registry, normalize_material3d), names(registry))
  } else {
    list()
  }

  if (is.null(x)) {
    return(registry)
  }

  if (!is.list(x)) {
    stop("`scene$materials` must be a named list of material descriptors.", call. = FALSE)
  }

  if (!length(x)) {
    return(registry)
  }

  if (is.null(names(x)) || any(!nzchar(names(x)))) {
    stop("`scene$materials` must be a named list of material descriptors.", call. = FALSE)
  }

  overrides <- stats::setNames(lapply(x, normalize_material3d), names(x))
  utils::modifyList(registry, overrides)
}

normalize_material_registry_name <- function(x) {
  if (!is.character(x) || !length(x) || !nzchar(x[[1]])) {
    stop("`name` must be a non-empty string.", call. = FALSE)
  }

  as.character(x[[1]])
}

normalize_material_bindings <- function(x, arg) {
  if (is.null(x)) {
    return(list())
  }

  if (!is.list(x)) {
    stop("`", arg, "` must be a named list.", call. = FALSE)
  }

  if (!length(x)) {
    return(list())
  }

  if (is.null(names(x)) || any(!nzchar(names(x)))) {
    stop("`", arg, "` must be a named list.", call. = FALSE)
  }

  x
}

normalize_material_names <- function(x, arg) {
  if (is.null(x)) {
    return(character(0))
  }

  x <- as.character(x)
  x <- x[nzchar(x)]
  if (!length(x)) {
    stop("`", arg, "` must contain at least one non-empty name.", call. = FALSE)
  }

  unname(unique(x))
}

normalize_texture3d <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (inherits(x, "babylon_texture")) {
    return(unclass(x))
  }

  if (is.character(x) && length(x) == 1L) {
    return(unclass(texture3d(x)))
  }

  if (!is.list(x) || !identical(x$type, "texture")) {
    stop("Texture bindings must be file paths or `texture3d()` descriptors.", call. = FALSE)
  }

  file <- x$file %||% x$path %||% NULL
  if (is.null(file)) {
    stop("Texture descriptors must include `file`.", call. = FALSE)
  }

  x$type <- "texture"
  x$file <- as.character(file[[1]])
  if (!is.null(x$colorspace)) {
    x$colorspace <- match.arg(as.character(x$colorspace[[1]]), c("auto", "srgb", "linear"))
  }
  x
}

normalize_texture_source <- function(x) {
  if (is.character(x) && length(x) == 1L && nzchar(x[[1]])) {
    file <- normalizePath(x[[1]], winslash = "/", mustWork = FALSE)
    if (!file.exists(file)) {
      stop("`file` does not exist: ", x[[1]], call. = FALSE)
    }
    return(file)
  }

  if (inherits(x, "magick-image")) {
    if (!requireNamespace("magick", quietly = TRUE)) {
      stop("Package 'magick' is required to serialize `magick-image` textures.", call. = FALSE)
    }
    file <- tempfile("babylon_texture_", fileext = ".png")
    magick::image_write(x, path = file, format = "png")
    return(file)
  }

  if (inherits(x, "cimg")) {
    x <- as.array(x)
    if (length(dim(x)) == 4L) {
      x <- x[, , 1L, , drop = FALSE]
      dim(x) <- c(dim(x)[1L], dim(x)[2L], dim(x)[4L])
    }
  }

  if (is.matrix(x) || is.array(x) || inherits(x, "nativeRaster") || inherits(x, "raster")) {
    raster <- image_like_to_raster(x)
    file <- tempfile("babylon_texture_", fileext = ".png")
    grDevices::png(filename = file, width = ncol(raster), height = nrow(raster), bg = "transparent")
    grid::grid.newpage()
    grid::grid.raster(raster, interpolate = FALSE)
    grDevices::dev.off()
    return(file)
  }

  stop("`texture3d()` expects a file path or an image-like R object.", call. = FALSE)
}

image_like_to_raster <- function(x) {
  if (inherits(x, "nativeRaster") || inherits(x, "raster")) {
    return(as.raster(x))
  }

  if (is.matrix(x) && is.character(x)) {
    return(as.raster(x))
  }

  if (is.matrix(x) && is.numeric(x)) {
    x <- pmax(0, pmin(1, x))
    return(as.raster(matrix(grDevices::gray(x), nrow = nrow(x), ncol = ncol(x))))
  }

  if (is.array(x) && length(dim(x)) == 3L && dim(x)[3L] %in% c(3L, 4L)) {
    arr <- array(as.numeric(x), dim = dim(x))
    storage.mode(arr) <- "numeric"
    arr_dim <- dim(arr)
    if (max(arr, na.rm = TRUE) > 1) {
      arr <- arr / 255
    }
    arr <- array(pmax(0, pmin(1, arr)), dim = arr_dim)
    alpha <- if (arr_dim[3L] == 4L) arr[, , 4L] else 1
    cols <- grDevices::rgb(arr[, , 1L], arr[, , 2L], arr[, , 3L], alpha = alpha)
    return(as.raster(matrix(cols, nrow = arr_dim[1L], ncol = arr_dim[2L])))
  }

  if (is.array(x) && length(dim(x)) == 2L) {
    return(image_like_to_raster(as.matrix(x)))
  }

  stop("Unsupported in-memory image shape for `texture3d()`.", call. = FALSE)
}

normalize_node_material_source <- function(x) {
  if (is.character(x) && length(x) == 1L && nzchar(x[[1]])) {
    return(jsonlite::fromJSON(x[[1]], simplifyVector = FALSE))
  }

  if (!is.list(x)) {
    stop("`json` must be a JSON string or parsed node material list.", call. = FALSE)
  }

  x
}

normalize_vertex_attributes <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (!is.list(x) || is.null(names(x)) || any(!nzchar(names(x)))) {
    stop("`vertex_attributes` must be a named list.", call. = FALSE)
  }

  out <- vector("list", length(x))
  names(out) <- names(x)

  for (nm in names(x)) {
    entry <- x[[nm]]
    size <- 3L
    data <- entry

    if (is.matrix(entry)) {
      size <- ncol(entry)
      data <- as.numeric(t(entry))
    } else if (is.list(entry)) {
      data <- entry$data %||% entry$values %||% NULL
      size <- entry$size %||% if (is.matrix(data)) ncol(data) else 3L
      if (is.matrix(data)) {
        data <- as.numeric(t(data))
      }
    }

    if (!is.numeric(data) || !length(data) || any(!is.finite(data))) {
      stop("Each `vertex_attributes` entry must contain finite numeric data.", call. = FALSE)
    }

    size <- as.integer(size[[1]])
    if (!is.finite(size) || size < 1L) {
      stop("Vertex attribute sizes must be positive integers.", call. = FALSE)
    }

    if (length(data) %% size != 0L) {
      stop("Each vertex attribute data vector must be a multiple of its `size`.", call. = FALSE)
    }

    out[[nm]] <- list(
      data = as.numeric(data),
      size = size
    )
  }

  out
}

normalize_unit_interval <- function(x, arg) {
  value <- as.numeric(x[[1]])
  if (!is.finite(value) || value < 0 || value > 1) {
    stop("`", arg, "` must be a numeric scalar between 0 and 1.", call. = FALSE)
  }
  value
}
