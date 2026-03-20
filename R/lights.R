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

#' Add a named lighting preset
#'
#' This creates a small rig of lights using a familiar studio-lighting layout.
#' Presets mirror the scene editor options and are positioned relative to a
#' target mesh when supplied.
#'
#' @param preset Lighting preset name. Supported values are `"three_point"`,
#'   `"rembrandt"`, `"butterfly"`, and `"split"`.
#' @param x Optional `mesh3d` or `babylon_mesh` used to estimate scene center
#'   and scale for the preset.
#' @param center Optional manual scene center. Overrides the center derived from
#'   `x`.
#' @param radius Optional manual scene radius. Overrides the radius derived from
#'   `x`.
#' @param add Whether to add the preset lights to the current scene. Use
#'   `add = FALSE` to start a fresh scene with just the preset lights.
#' @param axes Whether to draw lightweight scene axes, ticks, labels, and a
#'   bounding box.
#' @param nticks Approximate number of tick marks per axis when `axes = TRUE`.
#'
#' @export
lighting_preset3d <- function(
  preset = c("three_point", "rembrandt", "butterfly", "split"),
  x = NULL,
  center = NULL,
  radius = NULL,
  add = TRUE,
  axes = TRUE,
  nticks = 5
) {
  preset <- match.arg(preset)
  placement <- resolve_lighting_preset_placement(x = x, center = center, radius = radius)
  lights <- lighting_preset_definitions(
    preset = preset,
    center = placement$center,
    radius = placement$radius
  )

  append_scene_objects(lights, add = add, axes = axes, nticks = nticks)
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
  shadow_enabled = NULL,
  shadow_darkness = NULL,
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

  if (!is.null(shadow_enabled)) {
    light$shadow_enabled <- isTRUE(shadow_enabled)
  }

  if (!is.null(shadow_darkness)) {
    light$shadow_darkness <- normalize_light_scalar(shadow_darkness, "shadow_darkness", lower = 0)
    if (light$shadow_darkness > 1) {
      stop("`shadow_darkness` must be less than or equal to 1.", call. = FALSE)
    }
  }

  if (!is.null(name)) {
    light$name <- as.character(name[[1]])
  }

  structure(light, class = c("babylon_light", "list"))
}

resolve_lighting_preset_placement <- function(x = NULL, center = NULL, radius = NULL) {
  if (!is.null(center)) {
    center <- normalize_transform_vector(center, "center")
  }
  if (!is.null(radius)) {
    radius <- normalize_light_scalar(radius, "radius", lower = 0)
  }

  if (is.null(x)) {
    return(list(
      center = center %||% c(0, 0, 0),
      radius = radius %||% 1
    ))
  }

  mesh <- normalize_scene_object(x)
  if (!inherits(mesh, "babylon_mesh")) {
    stop("`x` must be a `mesh3d` or `babylon_mesh` when used with `lighting_preset3d()`.", call. = FALSE)
  }

  vertices <- mesh_vertex_matrix(mesh)
  mesh_center <- colMeans(vertices)
  mesh_radius <- max(sqrt(rowSums((vertices - matrix(mesh_center, nrow(vertices), 3, byrow = TRUE))^2)))
  if (!is.finite(mesh_radius) || mesh_radius <= 0) {
    mesh_radius <- 1
  }

  list(
    center = center %||% mesh_center,
    radius = radius %||% mesh_radius
  )
}

lighting_preset_definitions <- function(preset, center, radius) {
  center <- normalize_transform_vector(center, "center")
  radius <- normalize_light_scalar(radius, "radius", lower = 0)

  at <- function(x, y, z) {
    center + c(x, y, z) * radius
  }
  toward_center <- function(position) {
    as.numeric(center - position)
  }

  if (identical(preset, "rembrandt")) {
    key <- at(0.9, 1.1, 1.0)
    fill <- at(-0.9, 0.35, 0.9)
    rim <- at(0.2, 0.9, -1.2)
    return(list(
      as_babylon_light(type = "spot", name = "rembrandt_key", position = key, direction = toward_center(key), intensity = 1.2, diffuse = "#FFF4DD", specular = "#FFFFFF", angle = pi / 3, exponent = 1),
      as_babylon_light(type = "point", name = "rembrandt_fill", position = fill, intensity = 0.35, diffuse = "#DCEBFF", specular = "#FFFFFF"),
      as_babylon_light(type = "point", name = "rembrandt_rim", position = rim, intensity = 0.55, diffuse = "#FFFFFF", specular = "#FFFFFF")
    ))
  }

  if (identical(preset, "butterfly")) {
    key <- at(0, 1.35, 1.1)
    fill <- at(0, -0.25, 1.0)
    rim <- at(0, 0.7, -1.1)
    return(list(
      as_babylon_light(type = "spot", name = "butterfly_key", position = key, direction = toward_center(key), intensity = 1.25, diffuse = "#FFF4DD", specular = "#FFFFFF", angle = pi / 3, exponent = 1),
      as_babylon_light(type = "point", name = "butterfly_fill", position = fill, intensity = 0.3, diffuse = "#FFFFFF", specular = "#FFFFFF"),
      as_babylon_light(type = "point", name = "butterfly_rim", position = rim, intensity = 0.4, diffuse = "#EEF2FF", specular = "#FFFFFF")
    ))
  }

  if (identical(preset, "split")) {
    key <- at(1.2, 0.4, 0.9)
    rim <- at(-1.0, 0.8, -1.0)
    return(list(
      as_babylon_light(type = "spot", name = "split_key", position = key, direction = toward_center(key), intensity = 1.15, diffuse = "#FFF4DD", specular = "#FFFFFF", angle = pi / 3, exponent = 1),
      as_babylon_light(type = "point", name = "split_rim", position = rim, intensity = 0.25, diffuse = "#DCEBFF", specular = "#FFFFFF")
    ))
  }

  key <- at(1.0, 1.0, 1.1)
  fill <- at(-1.1, 0.5, 0.9)
  rim <- at(0.1, 0.9, -1.3)
  list(
    as_babylon_light(type = "spot", name = "three_point_key", position = key, direction = toward_center(key), intensity = 1.2, diffuse = "#FFF4DD", specular = "#FFFFFF", angle = pi / 3, exponent = 1),
    as_babylon_light(type = "point", name = "three_point_fill", position = fill, intensity = 0.45, diffuse = "#DCEBFF", specular = "#FFFFFF"),
    as_babylon_light(type = "point", name = "three_point_rim", position = rim, intensity = 0.65, diffuse = "#FFFFFF", specular = "#FFFFFF")
  )
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
    shadow_enabled = x$shadow_enabled,
    shadow_darkness = x$shadow_darkness,
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
