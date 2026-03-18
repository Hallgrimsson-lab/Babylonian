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
