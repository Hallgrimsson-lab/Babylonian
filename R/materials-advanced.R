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
#' @param metallic Metallic factor in the 0-1 range.
#' @param roughness Roughness factor in the 0-1 range.
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
  metallic = 0,
  roughness = 1,
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

  stop("Unsupported material type: ", type, call. = FALSE)
}

normalize_material_bindings <- function(x, arg) {
  if (is.null(x)) {
    return(list())
  }

  if (!is.list(x) || is.null(names(x)) || any(!nzchar(names(x)))) {
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
