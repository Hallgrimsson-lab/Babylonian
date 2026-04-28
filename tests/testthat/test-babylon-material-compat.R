context("babylon material compatibility")

make_test_mesh3d <- function(vertices, faces = matrix(c(1, 2, 3), nrow = 3)) {
  structure(
    list(
      vb = rbind(t(vertices), rep(1, nrow(vertices))),
      it = faces
    ),
    class = "mesh3d"
  )
}

testthat::test_that("named colors normalize to hex", {
  testthat::expect_identical(normalize_babylon_color("red"), "#FF0000")
  testthat::expect_identical(normalize_babylon_color("#123456"), "#123456")
})

testthat::test_that("scene post-process helpers build normalized descriptors", {
  dof <- dof3d(
    focus_distance = 150,
    f_stop = 2.8,
    focal_length = 85,
    blur_level = "high"
  )

  testthat::expect_s3_class(dof, "babylon_postprocess")
  testthat::expect_identical(dof$type, "depth_of_field")
  testthat::expect_identical(dof$blur_level, "high")
  testthat::expect_equal(dof$focus_distance, 150)
  testthat::expect_equal(dof$f_stop, 2.8)
  testthat::expect_equal(dof$focal_length, 85)
})

testthat::test_that("babylon normalizes scene post-process descriptors", {
  widget <- babylon(
    data = list(as_babylon_points(matrix(c(0, 0, 0), ncol = 3))),
    scene = list(
      postprocess = list(
        dof3d(focus_distance = 120, f_stop = 2, blur_level = "medium")
      )
    )
  )

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$scene$postprocess[[1]]$type, "depth_of_field")
  testthat::expect_identical(widget$x$scene$postprocess[[1]]$blur_level, "medium")
})

testthat::test_that("scene3d builds a first-class scene spec that babylon renders", {
  scene <- scene3d(
    objects = list(
      as_babylon_points(matrix(c(0, 0, 0), ncol = 3))
    ),
    scene = list(
      axes = FALSE,
      title = list(main = "Scene Spec")
    )
  )

  testthat::expect_s3_class(scene, "babylon_scene")

  widget <- babylon(scene)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_false(widget$x$scene$axes)
  testthat::expect_identical(widget$x$scene$title$main, "Scene Spec")
})

testthat::test_that("current_scene3d returns the accumulated additive scene", {
  clear_scene3d()

  plot3d(matrix(c(0, 0, 0), ncol = 3), add = FALSE, axes = FALSE)
  spheres3d(1, 1, 1, add = TRUE, axes = FALSE)

  scene <- current_scene3d()

  testthat::expect_s3_class(scene, "babylon_scene")
  testthat::expect_length(scene$objects, 2L)
  testthat::expect_true(is.null(last_scene_state()))
})

testthat::test_that("shade3d accepts a piped Babylonian widget as the base scene", {
  clear_scene3d()

  base_mesh <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  overlay_mesh <- make_test_mesh3d(
    rbind(
      c(0, 0, 1),
      c(1, 0, 1),
      c(0, 1, 1)
    )
  )

  widget <- plot3d(base_mesh) |>
    shade3d(overlay_mesh, color = "red", alpha = 0.5)

  scene <- current_scene3d()

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_length(widget$x$objects, 2L)
  testthat::expect_identical(widget$x$objects[[2]]$color, "#FF0000")
  testthat::expect_equal(widget$x$objects[[2]]$alpha, 0.5)
  testthat::expect_s3_class(scene, "babylon_scene")
  testthat::expect_length(scene$objects, 2L)
})

testthat::test_that("scene accumulator helpers accept a piped Babylonian widget", {
  clear_scene3d()

  base_mesh <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  overlay_mesh <- make_test_mesh3d(
    rbind(
      c(0, 0, 1),
      c(1, 0, 1),
      c(0, 1, 1)
    )
  )
  point_mat <- rbind(c(0.1, 0.1, 0.1), c(0.3, 0.3, 0.3))
  sphere_mat <- rbind(c(0.2, 0.2, 0.2))
  segment_mat <- rbind(c(0, 0, 0), c(0, 0, 1))
  line_mat <- rbind(c(0, 0, 0), c(1, 1, 1), c(1, 0, 1))
  text_mat <- rbind(c(0.5, 0.5, 0.5))

  widget <- plot3d(base_mesh) |>
    points3d(point_mat, color = "red") |>
    spheres3d(sphere_mat, color = "blue") |>
    segments3d(segment_mat, color = "green") |>
    lines3d(line_mat, color = "black") |>
    text3d(text_mat, texts = "label", color = "orange") |>
    planes3d(c(0, 0, 1, -0.25), color = "gray70") |>
    shade3d(overlay_mesh, color = "pink", alpha = 0.4) |>
    wireframe3d(overlay_mesh, color = "purple") |>
    light3d(type = "point", position = c(1, 1, 1), name = "key") |>
    lighting_preset3d("split") |>
    title3d(main = "Pipe Scene") |>
    scaleBar3d(length = 5, units = "mm")

  scene <- current_scene3d()

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_s3_class(scene, "babylon_scene")
  testthat::expect_identical(widget$x$scene$title$main, "Pipe Scene")
  testthat::expect_equal(widget$x$scene$scale_bar$length, 5)
  testthat::expect_identical(widget$x$scene$scale_bar$units, "mm")
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "points3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "spheres3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "segments3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "lines3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "text3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "planes3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) identical(obj$type, "light3d"), logical(1))))
  testthat::expect_true(any(vapply(widget$x$objects, function(obj) isTRUE(obj$wireframe), logical(1))))
})

testthat::test_that("par3d windowRect sets default widget sizing", {
  previous_par3d <- .babylon_state$par3d
  previous_last_scene <- .babylon_state$last_scene_par3d
  on.exit({
    .babylon_state$par3d <- previous_par3d
    .babylon_state$last_scene_par3d <- previous_last_scene
  }, add = TRUE)

  par3d(reset = TRUE)
  state <- par3d(windowRect = c(0, 0, 800, 800), zoom = 0.65)
  widget <- babylon(data = list(as_babylon_points(matrix(c(0, 0, 0), ncol = 3))))

  testthat::expect_equal(state$windowRect, c(0, 0, 800, 800))
  testthat::expect_identical(widget$width, 800L)
  testthat::expect_identical(widget$height, 800L)
  testthat::expect_equal(widget$x$scene$view$windowRect, c(0, 0, 800, 800))
})

testthat::test_that("scene editor state carries and reapplies post-process settings", {
  widget <- babylon(
    data = list(as_babylon_points(matrix(c(0, 0, 0), ncol = 3))),
    scene = list(
      postprocess = list(
        dof3d(focus_distance = 80, f_stop = 2.2, focal_length = 35, blur_level = "low")
      )
    )
  )

  state <- scene_state_from_widget(widget)
  testthat::expect_identical(state$postprocess[[1]]$type, "depth_of_field")
  testthat::expect_equal(state$postprocess[[1]]$focus_distance, 80)

  state$postprocess[[1]]$focus_distance <- 120
  state$postprocess[[1]]$blur_level <- "high"
  updated <- apply_scene_state(widget, state = state)

  testthat::expect_equal(updated$x$scene$postprocess[[1]]$focus_distance, 120)
  testthat::expect_identical(updated$x$scene$postprocess[[1]]$blur_level, "high")
})

testthat::test_that("apply_scene_state accepts create_pose_3d-style view payloads", {
  widget <- babylon(
    data = list(as_babylon_points(matrix(c(0, 0, 0), ncol = 3)))
  )

  pose <- list(
    zoom = 0.8,
    userMatrix = diag(4),
    bg = "#ffffff",
    camera = list(alpha = 1.2, beta = 0.8, radius = 5, target = c(0, 0, 0))
  )

  updated <- apply_scene_state(widget, state = pose)

  testthat::expect_equal(updated$x$scene$view$zoom, 0.8)
  testthat::expect_identical(updated$x$scene$view$bg, "#FFFFFF")
  testthat::expect_equal(updated$x$scene$view$camera$alpha, 1.2)
})

testthat::test_that("current_pose_input prefers the last live pose over fallback", {
  previous_live <- .babylon_state$last_live_par3d
  on.exit({
    .babylon_state$last_live_par3d <- previous_live
  }, add = TRUE)

  set_last_live_par3d(list(
    zoom = 0.8,
    userMatrix = diag(4),
    bg = "#ffffff",
    camera = list(alpha = 1.2, beta = 0.8, radius = 5, target = c(0, 0, 0))
  ))

  pose <- current_pose_input(NULL, fallback = list(zoom = 0.05, userMatrix = diag(4)))

  testthat::expect_equal(pose$zoom, 0.8)
  testthat::expect_equal(pose$camera$alpha, 1.2)
})

testthat::test_that("current_scene_state_input prefers the last live scene state over fallback", {
  previous_state <- .babylon_state$last_scene_state
  on.exit({
    .babylon_state$last_scene_state <- previous_state
  }, add = TRUE)

  live_state <- list(
    view = list(zoom = 0.8, userMatrix = diag(4), bg = "#ffffff"),
    objects = list(list(index = 1, primitive_type = "points3d"))
  )
  set_last_scene_state(live_state)

  state <- current_scene_state_input(NULL, fallback = list(
    view = list(zoom = 0.05, userMatrix = diag(4)),
    objects = list()
  ))

  testthat::expect_equal(state$view$zoom, 0.8)
  testthat::expect_length(state$objects, 1L)
})

testthat::test_that("pose and scene-state helpers accept babylon_scene objects", {
  scene <- scene3d(
    objects = list(as_babylon_points(matrix(c(0, 0, 0), ncol = 3))),
    scene = list(axes = FALSE)
  )
  pose <- list(
    zoom = 0.8,
    userMatrix = diag(4),
    bg = "#ffffff"
  )

  posed_widget <- create_pose_3d(scene)
  edited_widget <- edit_scene3d(scene)
  updated_widget <- apply_scene_state(scene, state = pose)

  testthat::expect_s3_class(posed_widget, "htmlwidget")
  testthat::expect_identical(posed_widget$x$interaction$mode, "pose_3d")
  testthat::expect_s3_class(edited_widget, "htmlwidget")
  testthat::expect_identical(edited_widget$x$interaction$mode, "edit_scene3d")
  testthat::expect_s3_class(updated_widget, "htmlwidget")
  testthat::expect_equal(updated_widget$x$scene$view$zoom, 0.8)
  testthat::expect_identical(updated_widget$x$scene$view$bg, "#FFFFFF")
})

testthat::test_that("scene editor removals persist when scene state is reapplied", {
  widget <- babylon(
    data = list(
      as_babylon_points(matrix(c(0, 0, 0), ncol = 3)),
      as_babylon_light(type = "point", name = "key_light", position = c(1, 1, 1))
    )
  )

  state <- scene_state_from_widget(widget)
  state$removed_objects <- list(list(index = 2L, primitive_type = "light3d", node_type = "light", name = "key_light"))
  state$objects <- state$objects[vapply(state$objects, function(entry) !identical(entry$name %||% NULL, "key_light"), logical(1))]

  updated <- apply_scene_state(widget, state = state)

  testthat::expect_false(any(vapply(updated$x$objects, function(object) identical(object$name %||% NULL, "key_light"), logical(1))))
})

testthat::test_that("scene editor state round-trips mesh bounding box visibility", {
  widget <- babylon(
    data = list(
      as_babylon_mesh(make_test_mesh3d(rbind(c(0, 0, 0), c(1, 0, 0), c(0, 1, 0))))
    )
  )

  state <- scene_state_from_widget(widget)
  state$objects[[1]]$show_bounding_box <- TRUE
  updated <- apply_scene_state(widget, state = state)

  testthat::expect_true(isTRUE(updated$x$objects[[1]]$show_bounding_box))
})

testthat::test_that("lighting_preset3d adds named preset rigs", {
  clear_scene3d()

  mesh3d_obj <- structure(
    list(
      vb = rbind(
        c(-1, 1, 0),
        c(-1, -1, 0),
        c(0, 0, 2),
        c(1, 1, 1)
      ),
      it = matrix(c(1, 2, 3), nrow = 3)
    ),
    class = "mesh3d"
  )

  widget <- lighting_preset3d("three_point", x = mesh3d_obj, add = FALSE)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_length(widget$x$objects, 3L)
  testthat::expect_true(all(vapply(widget$x$objects, function(object) identical(object$type, "light3d"), logical(1))))
  testthat::expect_identical(vapply(widget$x$objects, `[[`, character(1), "name"), c("three_point_key", "three_point_fill", "three_point_rim"))
})

testthat::test_that("numeric palette indices normalize using the active palette", {
  value <- normalize_babylon_color(2)
  testthat::expect_type(value, "character")
  testthat::expect_equal(nchar(value), 7L)
  testthat::expect_match(value, "^#[0-9A-F]{6}$")
})

testthat::test_that("lines3d creates connected line primitives", {
  widget <- lines3d(
    x = c(0, 1, 1),
    y = c(0, 0, 1),
    z = c(0, 0, 0),
    add = FALSE,
    axes = FALSE
  )

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "lines3d")
  testthat::expect_equal(nrow(widget$x$objects[[1]]$points), 3L)
})

testthat::test_that("spheres3d applies rgl-compatible radius scaling", {
  widget <- spheres3d(0, 0, 0, radius = 0.12, add = FALSE, axes = FALSE)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "spheres3d")
  testthat::expect_equal(widget$x$objects[[1]]$radius, 0.01)
})

testthat::test_that("text3d creates projected text primitives", {
  widget <- text3d(
    x = c(0, 1),
    y = c(0, 1),
    z = c(0, 0),
    texts = c("a", "b"),
    add = FALSE,
    axes = FALSE
  )

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "text3d")
  testthat::expect_identical(widget$x$objects[[1]]$texts, c("a", "b"))
})

testthat::test_that("title3d stores scene title metadata", {
  clear_scene3d()
  widget <- title3d(main = "Main", sub = "Sub", xlab = "X", ylab = "Y", zlab = "Z", add = FALSE)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$scene$title$main, "Main")
  testthat::expect_identical(widget$x$scene$title$sub, "Sub")
  testthat::expect_identical(widget$x$scene$title$xlab, "X")
})

testthat::test_that("planes3d fits a plane from three points", {
  pts <- rbind(
    c(0, 0, 0),
    c(1, 0, 0),
    c(0, 1, 0)
  )

  widget <- planes3d(pts, add = FALSE, axes = FALSE)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "planes3d")
  testthat::expect_equal(dim(widget$x$objects[[1]]$coefficients), c(1L, 4L))
  testthat::expect_equal(widget$x$objects[[1]]$coefficients[1, 4], 0)
})

testthat::test_that("planes3d recycles coefficients like rgl", {
  widget <- planes3d(
    a = c(1, 0),
    b = 0,
    c = 1,
    d = c(0, -2),
    add = FALSE,
    axes = FALSE
  )

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "planes3d")
  testthat::expect_equal(
    widget$x$objects[[1]]$coefficients,
    cbind(c(1, 0), c(0, 0), c(1, 1), c(0, -2))
  )
})

testthat::test_that("numeric RGB vectors normalize from 0-1 and 0-255 ranges", {
  testthat::expect_identical(
    normalize_babylon_color(c(10, 20, 30)),
    "#0A141E"
  )

  rgb_unit <- normalize_babylon_color(c(0.1, 0.2, 0.3))
  testthat::expect_type(rgb_unit, "character")
  testthat::expect_equal(nchar(rgb_unit), 7L)
  testthat::expect_match(rgb_unit, "^#[0-9A-F]{6}$")
})

testthat::test_that("invalid numeric colors error cleanly", {
  testthat::expect_error(
    normalize_babylon_color(c(-1, 20, 30)),
    "Numeric RGB colors"
  )

  testthat::expect_error(
    normalize_babylon_color(999),
    "palette indices"
  )
})

testthat::test_that("scalar specularity expands to grayscale rgb", {
  testthat::expect_equal(
    normalize_babylon_specularity(0.4),
    c(0.4, 0.4, 0.4)
  )
})

testthat::test_that("vector and color specularity normalize correctly", {
  testthat::expect_equal(
    normalize_babylon_specularity(c(64, 128, 255)),
    c(64, 128, 255) / 255
  )

  hex_spec <- normalize_babylon_specularity("#666666")
  testthat::expect_equal(length(hex_spec), 3L)
  testthat::expect_equal(hex_spec, rep(102 / 255, 3))
})

testthat::test_that("advanced material constructors build normalized descriptors", {
  standard <- standard_material3d(diffuse = "red", specular = c(0.2, 0.3, 0.4), alpha = 0.5)
  pbr <- pbr_material3d(base_color = "#123456", metallic = 0.2, roughness = 0.8, unlit = TRUE)
  shader <- shader_material3d(
    name = "demo",
    vertex = "void main(void) { gl_Position = vec4(position, 1.0); }",
    fragment = "void main(void) { gl_FragColor = vec4(1.0); }",
    uniforms = list(scale = 2, tint = list(type = "color3", value = c(1, 0, 0)))
  )

  testthat::expect_s3_class(standard, "babylon_material")
  testthat::expect_identical(standard$type, "standard")
  testthat::expect_identical(standard$diffuse, "#FF0000")
  testthat::expect_equal(standard$specular, c(0.2, 0.3, 0.4))
  testthat::expect_equal(standard$alpha, 0.5)

  testthat::expect_s3_class(pbr, "babylon_material")
  testthat::expect_identical(pbr$type, "pbr")
  testthat::expect_identical(pbr$base_color, "#123456")
  testthat::expect_equal(pbr$metallic, 0.2)
  testthat::expect_equal(pbr$roughness, 0.8)
  testthat::expect_true(isTRUE(pbr$unlit))

  testthat::expect_s3_class(shader, "babylon_material")
  testthat::expect_identical(shader$type, "shader")
  testthat::expect_identical(shader$name, "demo")
  testthat::expect_true("position" %in% shader$attributes)
  testthat::expect_equal(shader$uniforms$scale, 2)
})

testthat::test_that("material registry stores named materials and scene refs can use them", {
  previous_registry <- .babylon_state$material_registry
  on.exit({
    .babylon_state$material_registry <- previous_registry
  }, add = TRUE)
  .babylon_state$material_registry <- list()

  register_material3d("bronze", pbr_material3d(base_color = "#CD7F32", metallic = 0.6, roughness = 0.4))

  testthat::expect_true("bronze" %in% list_materials3d())
  testthat::expect_s3_class(get_material3d("bronze"), "babylon_material")

  mesh3d_obj <- structure(
    list(
      vb = rbind(
        c(0, 1, 0),
        c(0, 0, 1),
        c(0, 0, 0),
        c(1, 1, 1)
      ),
      it = matrix(c(1, 2, 3), nrow = 3)
    ),
    class = "mesh3d"
  )

  mesh <- as_babylon_mesh(mesh3d_obj, material = material_ref3d("bronze"))
  widget <- plot3d(mesh)

  testthat::expect_identical(widget$x$objects[[1]]$material$type, "material_ref")
  testthat::expect_identical(widget$x$objects[[1]]$material$name, "bronze")
  testthat::expect_identical(widget$x$scene$materials$bronze$type, "pbr")
  testthat::expect_equal(widget$x$scene$materials$bronze$metallic, 0.6)

  removed <- remove_material3d("bronze")
  testthat::expect_s3_class(removed, "babylon_material")
  testthat::expect_false("bronze" %in% list_materials3d())
})

testthat::test_that("node materials load from packaged JSON exports", {
  file <- system.file("extdata", "nodeMaterial-demo.json", package = "Babylonian")
  if (!nzchar(file)) {
    file <- normalizePath(file.path("..", "..", "inst", "extdata", "nodeMaterial-demo.json"), winslash = "/", mustWork = TRUE)
  }

  material <- node_material3d(file = file, params = list("Surface Color" = list(type = "color3", value = c(0.1, 0.2, 0.3))))

  testthat::expect_s3_class(material, "babylon_material")
  testthat::expect_identical(material$type, "node")
  testthat::expect_true(is.list(material$source))
  testthat::expect_identical(material$params[["Surface Color"]]$type, "color3")
})

testthat::test_that("node materials without exposed params survive mesh normalization", {
  file <- system.file("extdata", "nodeMaterial-demo.json", package = "Babylonian")
  if (!nzchar(file)) {
    file <- normalizePath(file.path("..", "..", "inst", "extdata", "nodeMaterial-demo.json"), winslash = "/", mustWork = TRUE)
  }

  mesh3d_obj <- structure(
    list(
      vb = rbind(
        c(0, 1, 0),
        c(0, 0, 1),
        c(0, 0, 0),
        c(1, 1, 1)
      ),
      it = matrix(c(1, 2, 3), nrow = 3)
    ),
    class = "mesh3d"
  )

  material <- node_material3d(file = file)
  mesh <- as_babylon_mesh(mesh3d_obj, material = material)
  widget <- plot3d(mesh)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$material$type, "node")
  testthat::expect_equal(length(widget$x$objects[[1]]$material$params), 0L)
})

testthat::test_that("meshes can carry advanced materials and custom vertex attributes", {
  mesh3d_obj <- structure(
    list(
      vb = rbind(
        c(0, 1, 0),
        c(0, 0, 1),
        c(0, 0, 0),
        c(1, 1, 1)
      ),
      it = matrix(c(1, 2, 3), nrow = 3)
    ),
    class = "mesh3d"
  )

  mesh <- as_babylon_mesh(
    mesh3d_obj,
    material = pbr_material3d(base_color = "white", metallic = 0.4, roughness = 0.6),
    vertex_attributes = list(comparisonPosition = matrix(c(0, 0, 0, 1, 0, 0, 0, 1, 0), ncol = 3, byrow = TRUE))
  )

  testthat::expect_identical(mesh$material$type, "pbr")
  testthat::expect_equal(mesh$vertex_attributes$comparisonPosition$size, 3L)
  testthat::expect_equal(length(mesh$vertex_attributes$comparisonPosition$data), 9L)
})

testthat::test_that("texture3d descriptors can be embedded in PBR materials", {
  tmp <- tempfile(fileext = ".png")
  writeBin(as.raw(c(0x89, 0x50, 0x4E, 0x47)), tmp)

  tex <- texture3d(tmp, colorspace = "srgb", invert_y = TRUE)
  mat <- pbr_material3d(
    base_color_texture = tex,
    normal_texture = tex,
    metallic = 0.2,
    roughness = 0.7
  )

  testthat::expect_s3_class(tex, "babylon_texture")
  testthat::expect_identical(mat$type, "pbr")
  testthat::expect_identical(mat$base_color_texture$file, basename(tmp))
  testthat::expect_identical(mat$normal_texture$invert_y, TRUE)
})

testthat::test_that("texture3d supports in-memory image arrays", {
  img <- array(0, dim = c(2, 2, 4))
  img[, , 1] <- 1
  img[, , 4] <- 1

  tex <- texture3d(img, colorspace = "srgb")

  testthat::expect_s3_class(tex, "babylon_texture")
  testthat::expect_true(file.exists(file.path(tex$dep$src$file, tex$file)))
})

testthat::test_that("import_model3d discovers gltf sidecars and metadata", {
  tmp_dir <- tempfile("babylon_gltf_")
  dir.create(tmp_dir, recursive = TRUE)
  gltf_path <- file.path(tmp_dir, "example.gltf")
  writeLines(
    c(
      "{",
      '  "asset": {"version": "2.0"},',
      '  "buffers": [{"uri": "example.bin", "byteLength": 0}],',
      '  "images": [{"uri": "albedo.png"}],',
      '  "materials": [{"name": "Suit"}],',
      '  "meshes": [{"name": "Body"}],',
      '  "nodes": [{"name": "Root"}]',
      "}"
    ),
    gltf_path
  )
  writeBin(raw(0), file.path(tmp_dir, "example.bin"))
  writeBin(as.raw(c(0x89, 0x50, 0x4E, 0x47)), file.path(tmp_dir, "albedo.png"))

  asset <- import_model3d(gltf_path, name = "example-asset")

  testthat::expect_identical(asset$type, "asset3d")
  testthat::expect_identical(asset$file, "example.gltf")
  testthat::expect_true(all(c("example.gltf", "example.bin", "albedo.png") %in% asset$dep$attachment))
  testthat::expect_identical(asset$info$materials, "Suit")
  testthat::expect_identical(asset$info$meshes, "Body")
  testthat::expect_identical(asset$info$nodes, "Root")
})

testthat::test_that("digitize_landmarks supports geomorph-style landmark count and centering", {
  mesh <- make_test_mesh3d(
    vertices = rbind(
      c(10, 0, 0),
      c(12, 0, 0),
      c(10, 2, 0)
    )
  )

  widget <- digitize_landmarks(
    mesh,
    fixed = 5,
    index = TRUE,
    center = TRUE,
    ptsize = 4,
    marker_scale = 0.01
  )

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$interaction$n, 5L)
  testthat::expect_true(isTRUE(widget$x$interaction$index))
  testthat::expect_equal(colMeans(mesh_vertex_matrix(widget$x$objects[[1]])), c(0, 0, 0), tolerance = 1e-8)
  testthat::expect_equal(widget$x$interaction$marker$scale, 0.02, tolerance = 1e-8)
})

testthat::test_that("digitize_landmarks centers fixed landmarks with the mesh", {
  mesh <- make_test_mesh3d(
    vertices = rbind(
      c(1, 1, 1),
      c(3, 1, 1),
      c(1, 3, 1)
    )
  )
  fixed <- matrix(c(1, 1, 1), ncol = 3)

  widget <- digitize_landmarks(mesh, fixed = fixed, center = TRUE)

  testthat::expect_equal(widget$x$interaction$fixed, matrix(c(-2 / 3, -2 / 3, 0), ncol = 3), tolerance = 1e-8)
})

testthat::test_that("digitize_landmarks can return vertex indices alongside coordinates", {
  payload <- list(
    list(x = 1, y = 2, z = 3, index = 4),
    list(x = 5, y = 6, z = 7, index = 8)
  )

  result <- landmark_result(payload, index = TRUE)

  testthat::expect_equal(result$coords, matrix(c(1, 2, 3, 5, 6, 7), ncol = 3, byrow = TRUE))
  testthat::expect_equal(result$index, matrix(c(4L, 8L), ncol = 1L))
})

testthat::test_that("landmark parsing tolerates list-backed matrix payloads", {
  payload <- matrix(
    list(1, 2, 3, 4, 5, 6, 7, 8),
    ncol = 4,
    byrow = TRUE
  )
  colnames(payload) <- c("x", "y", "z", "index")

  testthat::expect_equal(
    landmarks_to_matrix(payload),
    matrix(c(1, 2, 3, 5, 6, 7), ncol = 3, byrow = TRUE)
  )
  testthat::expect_equal(landmark_indices(payload), matrix(c(4L, 8L), ncol = 1L))
})

testthat::test_that("digit.fixed forwards to Babylonian landmark digitizing", {
  mesh <- make_test_mesh3d(
    vertices = rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )

  widget <- digit.fixed(mesh, fixed = 3, index = TRUE, center = TRUE)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$interaction$n, 3L)
  testthat::expect_true(isTRUE(widget$x$interaction$index))
})

testthat::test_that("import_model3d does not require missing gltf sidecars for metadata", {
  tmp_dir <- tempfile("babylon_gltf_missing_")
  dir.create(tmp_dir, recursive = TRUE)
  gltf_path <- file.path(tmp_dir, "example.gltf")
  writeLines(
    c(
      "{",
      '  "asset": {"version": "2.0"},',
      '  "buffers": [{"uri": "missing.bin", "byteLength": 0}],',
      '  "images": [{"uri": "missing.png"}],',
      '  "materials": [{"name": "Suit"}],',
      '  "meshes": [{"name": "Body"}],',
      '  "nodes": [{"name": "Root"}]',
      "}"
    ),
    gltf_path
  )

  asset <- import_model3d(gltf_path)

  testthat::expect_identical(asset$file, "example.gltf")
  testthat::expect_identical(asset$info$materials, "Suit")
  testthat::expect_identical(asset$dep$attachment, "example.gltf")
})

testthat::test_that("extract_geometry3d errors clearly when gltf sidecars are missing", {
  tmp_dir <- tempfile("babylon_gltf_missing_geo_")
  dir.create(tmp_dir, recursive = TRUE)
  gltf_path <- file.path(tmp_dir, "example.gltf")
  writeLines(
    c(
      "{",
      '  "asset": {"version": "2.0"},',
      '  "buffers": [{"uri": "missing.bin", "byteLength": 0}],',
      '  "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 0}],',
      '  "accessors": [{"bufferView": 0, "componentType": 5126, "count": 0, "type": "VEC3"}],',
      '  "meshes": [{"name": "Body", "primitives": [{"attributes": {"POSITION": 0}}]}]',
      "}"
    ),
    gltf_path
  )

  testthat::expect_error(
    extract_geometry3d(gltf_path, target = "Body"),
    "Geometry extraction requires the external glTF buffer `missing.bin`"
  )
})

testthat::test_that("set_material3d adds targeted overrides to imported assets", {
  tmp <- tempfile(fileext = ".obj")
  writeLines(c("o Mesh", "v 0 0 0"), tmp)

  asset <- import_model3d(tmp)
  updated <- set_material3d(
    asset,
    target = c("Mesh", "MaterialA"),
    material = pbr_material3d(base_color = "tomato")
  )

  testthat::expect_length(updated$material_overrides, 1L)
  testthat::expect_equal(updated$material_overrides[[1]]$target, c("Mesh", "MaterialA"))
  testthat::expect_identical(updated$material_overrides[[1]]$material$type, "pbr")
})

testthat::test_that("babylon accepts imported assets without misreading material_overrides as material", {
  tmp_dir <- tempfile("babylon_gltf_asset_")
  dir.create(tmp_dir, recursive = TRUE)
  gltf_path <- file.path(tmp_dir, "triangle.gltf")

  positions <- writeBin(as.numeric(c(0, 0, 0, 1, 0, 0, 0, 1, 0)), raw(), size = 4, endian = "little")
  indices <- writeBin(as.integer(c(0, 1, 2)), raw(), size = 2, endian = "little")
  bin <- c(positions, indices)
  writeBin(bin, file.path(tmp_dir, "triangle.bin"))

  writeLines(
    c(
      "{",
      '  "asset": {"version": "2.0"},',
      '  "buffers": [{"uri": "triangle.bin", "byteLength": 42}],',
      '  "bufferViews": [',
      '    {"buffer": 0, "byteOffset": 0, "byteLength": 36},',
      '    {"buffer": 0, "byteOffset": 36, "byteLength": 6}',
      "  ],",
      '  "accessors": [',
      '    {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},',
      '    {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"}',
      "  ],",
      '  "meshes": [{"name": "Triangle", "primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]',
      "}"
    ),
    gltf_path
  )

  asset <- import_model3d(gltf_path)
  widget <- babylon(data = list(asset))

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "asset3d")
})

testthat::test_that("plot3d supports imported babylon assets", {
  tmp_dir <- tempfile("babylon_gltf_plot_")
  dir.create(tmp_dir, recursive = TRUE)
  gltf_path <- file.path(tmp_dir, "triangle.gltf")

  positions <- writeBin(as.numeric(c(0, 0, 0, 1, 0, 0, 0, 1, 0)), raw(), size = 4, endian = "little")
  indices <- writeBin(as.integer(c(0, 1, 2)), raw(), size = 2, endian = "little")
  bin <- c(positions, indices)
  writeBin(bin, file.path(tmp_dir, "triangle.bin"))

  writeLines(
    c(
      "{",
      '  "asset": {"version": "2.0"},',
      '  "buffers": [{"uri": "triangle.bin", "byteLength": 42}],',
      '  "bufferViews": [',
      '    {"buffer": 0, "byteOffset": 0, "byteLength": 36},',
      '    {"buffer": 0, "byteOffset": 36, "byteLength": 6}',
      "  ],",
      '  "accessors": [',
      '    {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},',
      '    {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"}',
      "  ],",
      '  "meshes": [{"name": "Triangle", "primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]',
      "}"
    ),
    gltf_path
  )

  asset <- import_model3d(gltf_path)
  widget <- plot3d(asset, scaling = c(2, 2, 2))

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$objects[[1]]$type, "asset3d")
  testthat::expect_equal(widget$x$objects[[1]]$scaling, c(2, 2, 2))
})

testthat::test_that("extract_geometry3d reads OBJ geometry and geometry helpers edit it", {
  tmp <- tempfile(fileext = ".obj")
  writeLines(
    c(
      "o Mesh",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ),
    tmp
  )

  geometry <- extract_geometry3d(tmp, target = "Mesh")
  moved <- translate_geometry3d(geometry, c(1, 2, 3))
  scaled <- scale_geometry3d(geometry, 2)
  reset <- set_vertices3d(geometry, geometry$vertices + 1)

  testthat::expect_s3_class(geometry, "babylon_geometry")
  testthat::expect_equal(dim(geometry$vertices), c(3L, 3L))
  testthat::expect_equal(moved$vertices[1, ], c(1, 2, 3))
  testthat::expect_equal(scaled$vertices[2, ], c(2, 0, 0))
  testthat::expect_equal(reset$vertices[1, ], c(1, 1, 1))
})

testthat::test_that("extract_geometry3d reads gltf geometry and replace_geometry3d stores overrides", {
  tmp_dir <- tempfile("babylon_gltf_geo_")
  dir.create(tmp_dir, recursive = TRUE)
  gltf_path <- file.path(tmp_dir, "triangle.gltf")

  positions <- writeBin(as.numeric(c(0, 0, 0, 1, 0, 0, 0, 1, 0)), raw(), size = 4, endian = "little")
  indices <- writeBin(as.integer(c(0, 1, 2)), raw(), size = 2, endian = "little")
  bin <- c(positions, indices)
  writeBin(bin, file.path(tmp_dir, "triangle.bin"))

  writeLines(
    c(
      "{",
      '  "asset": {"version": "2.0"},',
      '  "buffers": [{"uri": "triangle.bin", "byteLength": 42}],',
      '  "bufferViews": [',
      '    {"buffer": 0, "byteOffset": 0, "byteLength": 36},',
      '    {"buffer": 0, "byteOffset": 36, "byteLength": 6}',
      "  ],",
      '  "accessors": [',
      '    {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},',
      '    {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"}',
      "  ],",
      '  "meshes": [{"name": "Triangle", "primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]',
      "}"
    ),
    gltf_path
  )

  geometry <- extract_geometry3d(gltf_path, target = "Triangle")
  asset <- import_model3d(gltf_path)
  replaced <- replace_geometry3d(asset, translate_geometry3d(geometry, c(0, 0, 2)), target = "Triangle")

  testthat::expect_s3_class(geometry, "babylon_geometry")
  testthat::expect_equal(geometry$vertices[2, ], c(1, 0, 0))
  testthat::expect_length(replaced$geometry_overrides, 1L)
  testthat::expect_equal(replaced$geometry_overrides[[1]]$geometry$vertices[9], 2)
})

testthat::test_that("babylon collects nested asset and texture dependencies", {
  tmp_dir <- tempfile("babylon_asset_dep_")
  dir.create(tmp_dir, recursive = TRUE)
  obj_path <- file.path(tmp_dir, "asset.obj")
  tex_path <- file.path(tmp_dir, "albedo.png")
  writeLines(c("o Mesh", "v 0 0 0"), obj_path)
  writeBin(as.raw(c(0x89, 0x50, 0x4E, 0x47)), tex_path)

  asset <- import_model3d(obj_path)
  asset <- set_material3d(
    asset,
    material = pbr_material3d(base_color_texture = texture3d(tex_path))
  )

  widget <- babylon(data = list(asset))

  attachment_sets <- unlist(lapply(widget$dependencies, function(dep) dep$attachment), use.names = FALSE)
  testthat::expect_true("asset.obj" %in% attachment_sets)
  testthat::expect_true("albedo.png" %in% attachment_sets)
  testthat::expect_null(widget$x$objects[[1]]$dep)
  testthat::expect_null(widget$x$objects[[1]]$material$base_color_texture$dep)
})

testthat::test_that("morph_target3d stores same-topology morph targets", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  mesh <- morph_target3d(reference, target, influence = 0.3, color = "gray70")

  testthat::expect_s3_class(mesh, "babylon_mesh")
  testthat::expect_true(is.list(mesh$morph_target))
  testthat::expect_length(mesh$morph_target, 1L)
  testthat::expect_equal(mesh$morph_target[[1]]$influence, 0.3)
  testthat::expect_equal(length(mesh$morph_target[[1]]$vertices), 9L)
})

testthat::test_that("morph_target3d appends multiple morph targets", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target_a <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )
  target_b <- make_test_mesh3d(
    rbind(
      c(0.1, 0, 0),
      c(1, 0.2, 0),
      c(0, 1, 0.4)
    )
  )

  mesh <- morph_target3d(reference, target_a, influence = 0.3, name = "a", color = "gray70")
  mesh <- morph_target3d(mesh, target_b, influence = 0.6, name = "b")

  testthat::expect_length(mesh$morph_target, 2L)
  testthat::expect_equal(mesh$morph_target[[1]]$name, "a")
  testthat::expect_equal(mesh$morph_target[[2]]$name, "b")
  testthat::expect_equal(mesh$morph_target[[2]]$influence, 0.6)
})

testthat::test_that("apply_scene_state can update morph target influence", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  widget <- babylon(data = list(morph_target3d(reference, target, influence = 0.1, color = "gray70")))
  updated <- apply_scene_state(
    widget,
    state = list(
      objects = list(
        list(
          index = 1L,
          primitive_type = "mesh3d",
          node_type = "mesh",
          morph_target = list(list(influence = 0.8))
        )
      )
    )
  )

  testthat::expect_equal(updated$x$objects[[1]]$morph_target[[1]]$influence, 0.8)
})

testthat::test_that("morph_target3d validates mesh topology", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0),
      c(0, 0, 1)
    ),
    faces = matrix(c(1, 2, 3), nrow = 3)
  )

  testthat::expect_error(
    morph_target3d(reference, target),
    "same number of vertices"
  )
})

testthat::test_that("paint_vertices3d returns a painting widget in non-interactive mode", {
  mesh <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )

  widget <- paint_vertices3d(mesh)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$interaction$mode, "paint_vertices")
})

testthat::test_that("orbit_path3d returns normalized view states", {
  par3d(zoom = 0.8, userMatrix = diag(4), bg = "white")
  path <- orbit_path3d(n = 4, axis = "z", turns = 0.5, zoom = 1.25)

  testthat::expect_length(path, 4L)
  testthat::expect_equal(path[[1]]$zoom, 1.25)
  testthat::expect_identical(dim(path[[1]]$userMatrix), c(4L, 4L))
  testthat::expect_identical(path[[1]]$bg, "#FFFFFF")
})

testthat::test_that("apply_scene_state updates the stored base view for later animation paths", {
  widget <- babylon(data = list(list(type = "sphere", diameter = 1)))
  expected_user_matrix <- matrix(
    c(
      0, 0, 1, 0,
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 0, 1
    ),
    nrow = 4,
    byrow = TRUE
  )
  state <- list(
    view = list(
      zoom = 1.4,
      userMatrix = expected_user_matrix,
      bg = "#112233"
    ),
    objects = list()
  )

  apply_scene_state(widget, state = state)
  path <- orbit_path3d(n = 1)

  testthat::expect_equal(path[[1]]$zoom, 1.4)
  testthat::expect_equal(path[[1]]$userMatrix, expected_user_matrix)
  testthat::expect_identical(path[[1]]$bg, "#112233")
})

testthat::test_that("par3d and bg3d persist the scene background color", {
  old_view <- par3d()
  on.exit(par3d(zoom = old_view$zoom, userMatrix = old_view$userMatrix, bg = old_view$bg), add = TRUE)

  updated <- par3d(bg = "black")
  testthat::expect_identical(updated$bg, "#000000")
  testthat::expect_identical(bg3d(), "#000000")

  serialized <- serialize_par3d(updated)
  testthat::expect_identical(serialized$bg, "#000000")
  testthat::expect_identical(deserialize_par3d(serialized)$bg, "#000000")
})

testthat::test_that("scale bar units survive scene normalization", {
  scene <- normalize_scene(list(
    scale_bar = list(
      enabled = TRUE,
      length = 5,
      units = "other",
      custom_units = "mya"
    )
  ))

  testthat::expect_true(scene$scale_bar$enabled)
  testthat::expect_equal(scene$scale_bar$length, 5)
  testthat::expect_identical(scene$scale_bar$units, "other")
  testthat::expect_identical(scene$scale_bar$custom_units, "mya")
})

testthat::test_that("scale bar positions normalize from corners and coordinates", {
  scene_keyword <- normalize_scene(list(
    scale_bar = list(
      enabled = TRUE,
      length = 5,
      position = "topleft"
    )
  ))
  scene_coords <- normalize_scene(list(
    scale_bar = list(
      enabled = TRUE,
      length = 5,
      position = c(20, 30)
    )
  ))

  testthat::expect_identical(scene_keyword$scale_bar$position, "topleft")
  testthat::expect_equal(scene_coords$scale_bar$position, c(20, 30))
})

testthat::test_that("scaleBar3d stores scale bar scene metadata", {
  clear_scene3d()
  widget <- scaleBar3d(length = 10, units = "mm", position = "bottomleft", add = FALSE)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_equal(widget$x$scene$scale_bar$length, 10)
  testthat::expect_identical(widget$x$scene$scale_bar$units, "mm")
  testthat::expect_identical(widget$x$scene$scale_bar$position, "bottomleft")
})

testthat::test_that("planes3d keeps a single coefficient vector as one plane", {
  coeffs <- plane_coefficients(c(0, 0, 1, 0))
  widget <- planes3d(c(0, 0, 1, 0), add = FALSE, axes = FALSE)

  testthat::expect_equal(dim(coeffs), c(1L, 4L))
  testthat::expect_equal(as.numeric(coeffs[1, ]), c(0, 0, 1, 0))
  testthat::expect_equal(dim(widget$x$objects[[1]]$coefficients), c(1L, 4L))
})

testthat::test_that("scale bar custom units may be temporarily blank in editor state", {
  scene <- normalize_scene(list(
    scale_bar = list(
      enabled = TRUE,
      length = 5,
      units = "other",
      custom_units = ""
    )
  ))

  testthat::expect_identical(scene$scale_bar$units, "other")
  testthat::expect_null(scene$scale_bar$custom_units %||% NULL)
})

testthat::test_that("morph_path3d returns eased numeric sequences", {
  path <- morph_path3d(n = 5, from = 0, to = 1, easing = "ease_in_out")

  testthat::expect_equal(length(path), 5L)
  testthat::expect_equal(path[[1]], 0)
  testthat::expect_equal(path[[5]], 1)
  testthat::expect_true(all(diff(path) >= 0))
})

testthat::test_that("render_frames3d applies view and morph frames with a custom snapshotter", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  scene <- babylon(data = list(morph_target3d(reference, target, influence = 0)))
  calls <- list()
  snapshot_stub <- function(filename, widget, vwidth, vheight, delay, ...) {
    calls[[length(calls) + 1L]] <<- list(
      filename = filename,
      view = widget$x$scene$view,
      influence = widget$x$objects[[1]]$morph_target[[1]]$influence
    )
    writeLines("", filename)
    filename
  }

  frames <- render_frames3d(
    scene,
    dir = tempfile("babylon_frames_"),
    views = orbit_path3d(n = 3, zoom = 1.1),
    morph = morph_path3d(n = 3, from = 0, to = 0.5),
    snapshot_fun = snapshot_stub
  )

  testthat::expect_length(frames, 3L)
  testthat::expect_equal(length(calls), 3L)
  testthat::expect_equal(calls[[1]]$influence, 0)
  testthat::expect_equal(calls[[3]]$influence, 0.5)
  testthat::expect_equal(calls[[1]]$view$zoom, 1.1)
})

testthat::test_that("render_frames3d can derive heatmap frames from morph targets", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  scene <- babylon(data = list(morph_target3d(reference, target, influence = 0)))
  calls <- list()
  snapshot_stub <- function(filename, widget, vwidth, vheight, delay, ...) {
    calls[[length(calls) + 1L]] <<- list(
      filename = filename,
      view = widget$x$scene$view,
      comparison = widget$x$objects[[1]]$vertex_attributes$comparisonPosition$data,
      legend = widget$x$objects[[1]]$heatmap_legend
    )
    writeLines("", filename)
    filename
  }

  frames <- render_frames3d(
    scene,
    dir = tempfile("babylon_heatmap_frames_"),
    views = orbit_path3d(n = 2, zoom = 1.2),
    morph = morph_path3d(n = 2, from = 0, to = 1),
    heatmap = TRUE,
    heatmap_args = list(alpha = 0.4),
    snapshot_fun = snapshot_stub
  )

  testthat::expect_length(frames, 2L)
  testthat::expect_equal(length(calls), 2L)
  testthat::expect_equal(calls[[1]]$comparison, mesh3d_vertices(reference))
  testthat::expect_equal(calls[[2]]$comparison, mesh3d_vertices(target))
  testthat::expect_equal(calls[[1]]$view$zoom, 1.2)
  testthat::expect_identical(calls[[1]]$legend$title, "Difference Scale")
})

testthat::test_that("render_frames3d heatmap mode allows axes to be disabled", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  scene <- babylon(data = list(morph_target3d(reference, target, influence = 0)))
  calls <- list()
  snapshot_stub <- function(filename, widget, vwidth, vheight, delay, ...) {
    calls[[length(calls) + 1L]] <<- list(
      axes = widget$x$scene$axes
    )
    writeLines("", filename)
    filename
  }

  render_frames3d(
    scene,
    dir = tempfile("babylon_heatmap_noaxes_"),
    views = orbit_path3d(n = 1, zoom = 1.1),
    morph = morph_path3d(n = 1, from = 0, to = 1),
    heatmap = TRUE,
    heatmap_args = list(axes = FALSE),
    snapshot_fun = snapshot_stub
  )

  testthat::expect_length(calls, 1L)
  testthat::expect_identical(calls[[1]]$axes, FALSE)
})

testthat::test_that("record_scene3d builds ffmpeg and magick command arguments", {
  ffmpeg_args <- build_ffmpeg_video_args("frame_%05d.png", "movie.mp4", fps = 24)
  magick_args <- build_magick_gif_args(c("f1.png", "f2.png"), "movie.gif", fps = 20, loop = 0)

  testthat::expect_true(all(c("-framerate", "24", "movie.mp4") %in% ffmpeg_args))
  testthat::expect_true(all(c("-delay", "5", "-loop", "0", "movie.gif") %in% magick_args))
})

testthat::test_that("record_scene3d forwards heatmap arguments to the renderer", {
  render_calls <- list()
  render_stub <- function(..., heatmap = FALSE, heatmap_args = NULL) {
    render_calls[[length(render_calls) + 1L]] <<- list(
      heatmap = heatmap,
      heatmap_args = heatmap_args
    )
    tmp_dir <- list(...)$dir
    frames <- file.path(tmp_dir, sprintf("frame_%05d.png", 1:2))
    for (frame in frames) {
      writeLines("", frame)
    }
    frames
  }
  runner_stub <- function(command, args) 0L

  output <- tempfile(fileext = ".mp4")
  record_scene3d(
    babylon(data = list(list(type = "sphere", diameter = 1))),
    file = output,
    views = orbit_path3d(n = 2),
    heatmap = TRUE,
    heatmap_args = list(alpha = 0.5, axes = FALSE),
    render_fun = render_stub,
    system_runner = runner_stub
  )

  testthat::expect_length(render_calls, 1L)
  testthat::expect_true(isTRUE(render_calls[[1]]$heatmap))
  testthat::expect_equal(render_calls[[1]]$heatmap_args$alpha, 0.5)
  testthat::expect_identical(render_calls[[1]]$heatmap_args$axes, FALSE)
})

testthat::test_that("scene object normalization applies compatibility layer", {
  obj <- normalize_scene_object(list(
    type = "sphere",
    diameter = 1,
    color = 2,
    specularity = 0.25
  ))

  testthat::expect_type(obj$color, "character")
  testthat::expect_match(obj$color, "^#[0-9A-F]{6}$")
  testthat::expect_equal(obj$specularity, c(0.25, 0.25, 0.25))
})

testthat::test_that("babylon stores normalized sync group settings", {
  widget <- babylon(
    data = list(list(type = "sphere", diameter = 1)),
    sync_group = "linked-view"
  )

  testthat::expect_identical(widget$x$scene$sync$group, "linked-view")
  testthat::expect_true(isTRUE(widget$x$scene$sync$camera))
})

testthat::test_that("paired_scene3d applies a shared sync group to both panels", {
  left <- babylon(data = list(list(type = "sphere", diameter = 1)))
  right <- babylon(data = list(list(type = "box", size = 1)))

  paired <- paired_scene3d(left, right, sync_group = "paired-test", labels = c("Left", "Right"))

  left_widget <- paired$children[[1]]$children[[2]]
  right_widget <- paired$children[[2]]$children[[2]]

  testthat::expect_s3_class(left_widget, "htmlwidget")
  testthat::expect_s3_class(right_widget, "htmlwidget")
  testthat::expect_identical(left_widget$x$scene$sync$group, "paired-test")
  testthat::expect_identical(right_widget$x$scene$sync$group, "paired-test")
})

testthat::test_that("paired_scene3d validates panel labels", {
  testthat::expect_error(
    paired_scene3d(
      babylon(data = list(list(type = "sphere", diameter = 1))),
      babylon(data = list(list(type = "box", size = 1))),
      labels = "Only one"
    ),
    "`labels` must be NULL or a character vector of length 2."
  )
})

testthat::test_that("mesh argument mutation applies compatibility layer", {
  mesh <- structure(list(type = "mesh3d"), class = c("babylon_mesh", "list"))
  out <- modify_babylon_mesh(mesh, list(color = c(10, 20, 30), specularity = 0.5))

  testthat::expect_identical(out$color, "#0A141E")
  testthat::expect_equal(out$specularity, c(0.5, 0.5, 0.5))
})

testthat::test_that("mesh argument mutation preserves wireframe flags", {
  mesh <- structure(list(type = "mesh3d"), class = c("babylon_mesh", "list"))
  out <- modify_babylon_mesh(mesh, list(wireframe = TRUE))

  testthat::expect_identical(out$wireframe, TRUE)
})


testthat::test_that("snapshot aliases map to snapshot3d", {
  testthat::expect_identical(snapshot, snapshot3d)
  testthat::expect_identical(rgl.snapshot, snapshot3d)
})

testthat::test_that("snapshot3d errors when no scene is available", {
  clear_scene3d()
  testthat::expect_error(
    snapshot3d(tempfile(fileext = ".png")),
    "No active Babylonian scene available"
  )
})

testthat::test_that("wireframe3d marks meshes for wireframe rendering", {
  mesh <- structure(list(type = "mesh3d"), class = c("babylon_mesh", "list"))

  widget <- wireframe3d(mesh, add = FALSE, axes = FALSE)

  testthat::expect_true(isTRUE(widget$x$objects[[1]]$wireframe))
})

testthat::test_that("light3d builds Babylon light primitives", {
  widget <- light3d(
    type = "spot",
    position = c(1, 2, 3),
    direction = c(0, -1, 0),
    intensity = 0.75,
    diffuse = "red",
    specular = c(0, 128, 255),
    angle = pi / 4,
    exponent = 2,
    range = 10,
    name = "key",
    add = FALSE,
    axes = FALSE
  )

  light <- widget$x$objects[[1]]

  testthat::expect_identical(light$type, "light3d")
  testthat::expect_identical(light$light_type, "spot")
  testthat::expect_equal(light$position, c(1, 2, 3))
  testthat::expect_equal(light$direction, c(0, -1, 0))
  testthat::expect_equal(light$intensity, 0.75)
  testthat::expect_identical(light$diffuse, "#FF0000")
  testthat::expect_equal(light$specular, c(0, 128, 255) / 255)
  testthat::expect_equal(light$angle, pi / 4)
  testthat::expect_equal(light$exponent, 2)
  testthat::expect_equal(light$range, 10)
  testthat::expect_identical(light$name, "key")
})

testthat::test_that("light3d wrappers set the expected Babylon light types", {
  point <- light3d_point(position = c(1, 1, 1), add = FALSE, axes = FALSE)
  directional <- light3d_directional(direction = c(1, -1, 0), add = FALSE, axes = FALSE)
  hemispheric <- light3d_hemispheric(ground_color = "gray40", add = FALSE, axes = FALSE)

  testthat::expect_identical(point$x$objects[[1]]$light_type, "point")
  testthat::expect_equal(point$x$objects[[1]]$position, c(1, 1, 1))

  testthat::expect_identical(directional$x$objects[[1]]$light_type, "directional")
  testthat::expect_equal(directional$x$objects[[1]]$direction, c(1, -1, 0))

  testthat::expect_identical(hemispheric$x$objects[[1]]$light_type, "hemispheric")
  testthat::expect_identical(hemispheric$x$objects[[1]]$ground_color, "#666666")
})

testthat::test_that("as_babylon_light creates reusable light specs", {
  light <- as_babylon_light(
    type = "directional",
    name = "key",
    direction = c(-0.5, -1, 0.2),
    intensity = 0.9
  )

  testthat::expect_s3_class(light, "babylon_light")
  testthat::expect_identical(light$type, "light3d")
  testthat::expect_identical(light$light_type, "directional")
  testthat::expect_equal(light$direction, c(-0.5, -1, 0.2))
})

testthat::test_that("light3d validates light arguments", {
  testthat::expect_error(
    light3d(type = "laser", add = FALSE, axes = FALSE),
    "'arg' should be one of"
  )

  testthat::expect_error(
    light3d(type = "point", position = c(1, 2), add = FALSE, axes = FALSE),
    "`position` must be a finite numeric vector of length 3."
  )

  testthat::expect_error(
    light3d(type = "spot", angle = -1, add = FALSE, axes = FALSE),
    "`angle` must be a finite numeric scalar greater than or equal to 0."
  )
})

testthat::test_that("edit_scene3d returns an editor widget in non-interactive mode", {
  mesh <- structure(list(type = "mesh3d"), class = c("babylon_mesh", "list"))

  widget <- edit_scene3d(mesh)

  testthat::expect_identical(widget$x$interaction$mode, "edit_scene3d")
})

testthat::test_that("edit_scene3d accepts Babylon widgets directly", {
  scene <- babylon(
    data = list(
      list(type = "sphere", diameter = 1),
      create_babylon_light(type = "directional", direction = c(0, -1, 0), name = "key")
    )
  )

  widget <- edit_scene3d(scene)

  testthat::expect_s3_class(widget, "htmlwidget")
  testthat::expect_identical(widget$x$interaction$mode, "edit_scene3d")
  testthat::expect_equal(length(widget$x$objects), 2L)
})

testthat::test_that("apply_scene_state updates meshes, lights, and view state", {
  mesh <- structure(
    list(
      type = "mesh3d",
      name = "specimen",
      position = c(0, 0, 0),
      rotation = c(0, 0, 0),
      scaling = c(1, 1, 1)
    ),
    class = c("babylon_mesh", "list")
  )
  key <- create_babylon_light(
    type = "directional",
    name = "key",
    direction = c(0, -1, 0),
    intensity = 0.5
  )

  widget <- babylon(
    data = list(mesh, key),
    scene = list(view = serialize_par3d(list(zoom = 1, userMatrix = diag(4), bg = "#FAFAFA")))
  )

  state <- list(
    view = list(zoom = 1.5, userMatrix = diag(4), bg = "#445566"),
    objects = list(
      list(index = 1, name = "specimen", position = c(1, 2, 3), rotation = c(0.1, 0.2, 0.3), scaling = c(2, 2, 2)),
      list(index = 2, name = "key", direction = c(1, -1, 0), intensity = 0.9)
    )
  )

  updated <- apply_scene_state(widget, state = state)

  testthat::expect_equal(updated$x$objects[[1]]$position, c(1, 2, 3))
  testthat::expect_equal(updated$x$objects[[1]]$rotation, c(0.1, 0.2, 0.3))
  testthat::expect_equal(updated$x$objects[[1]]$scaling, c(2, 2, 2))
  testthat::expect_equal(updated$x$objects[[2]]$direction, c(1, -1, 0))
  testthat::expect_equal(updated$x$objects[[2]]$intensity, 0.9)
  testthat::expect_equal(updated$x$scene$view$zoom, 1.5)
  testthat::expect_identical(updated$x$scene$view$bg, "#445566")
  testthat::expect_equal(last_scene_state()$objects[[1]]$position, c(1, 2, 3))
})

testthat::test_that("apply_scene_state preserves editor shadow settings on lights", {
  mesh <- structure(
    list(
      type = "mesh3d",
      name = "specimen"
    ),
    class = c("babylon_mesh", "list")
  )
  key <- create_babylon_light(
    type = "directional",
    name = "key",
    direction = c(0, -1, 0),
    intensity = 0.5
  )

  widget <- babylon(data = list(mesh, key))
  state <- list(
    objects = list(
      list(
        index = 2,
        name = "key",
        shadow_enabled = TRUE,
        shadow_darkness = 0.35
      )
    )
  )

  updated <- apply_scene_state(widget, state = state)

  testthat::expect_true(updated$x$objects[[2]]$shadow_enabled)
  testthat::expect_equal(updated$x$objects[[2]]$shadow_darkness, 0.35)
})

testthat::test_that("apply_scene_state preserves scene scale bar settings", {
  mesh <- structure(
    list(type = "mesh3d", name = "specimen"),
    class = c("babylon_mesh", "list")
  )
  widget <- babylon(data = list(mesh))

  state <- list(
    scale_bar = list(
      enabled = TRUE,
      length = 5
    )
  )

  updated <- apply_scene_state(widget, state = state)

  testthat::expect_true(updated$x$scene$scale_bar$enabled)
  testthat::expect_equal(updated$x$scene$scale_bar$length, 5)
})

testthat::test_that("apply_scene_state preserves scene clipping settings", {
  mesh <- structure(
    list(type = "mesh3d", name = "specimen"),
    class = c("babylon_mesh", "list")
  )
  widget <- babylon(data = list(mesh))

  state <- list(
    clipping = list(
      enabled = TRUE,
      material = "specimen-material",
      x = 1,
      y = 0,
      z = 0
    )
  )

  updated <- apply_scene_state(widget, state = state)

  testthat::expect_true(updated$x$scene$clipping$enabled)
  testthat::expect_identical(updated$x$scene$clipping$material, "specimen-material")
  testthat::expect_equal(updated$x$scene$clipping$x, 1)
})

testthat::test_that("apply_scene_state preserves exact camera view data when supplied", {
  widget <- babylon(
    data = list(
      structure(
        list(type = "mesh3d", name = "specimen"),
        class = c("babylon_mesh", "list")
      )
    ),
    scene = list(view = serialize_par3d(list(zoom = 1, userMatrix = diag(4), bg = "#FAFAFA")))
  )

  state <- list(
    view = list(
      zoom = 1.2,
      userMatrix = diag(4),
      bg = "#112233",
      camera = list(alpha = 0.5, beta = 1.1, radius = 12, target = c(1, 2, 3))
    ),
    objects = list()
  )

  updated <- apply_scene_state(widget, state = state)

  testthat::expect_equal(updated$x$scene$view$camera$alpha, 0.5)
  testthat::expect_equal(updated$x$scene$view$camera$beta, 1.1)
  testthat::expect_equal(updated$x$scene$view$camera$radius, 12)
  testthat::expect_equal(updated$x$scene$view$camera$target, c(1, 2, 3))
})

testthat::test_that("segments3d supports per-segment colors", {
  pts <- rbind(
    c(0, 0, 0),
    c(1, 0, 0),
    c(0, 1, 0),
    c(1, 1, 0)
  )

  widget <- segments3d(pts, color = c("red", "blue"), add = FALSE, axes = FALSE)

  testthat::expect_identical(widget$x$objects[[1]]$color, c("#FF0000", "#0000FF"))
})

testthat::test_that("meshDist colors the reference mesh and overlays displacement geometry", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  widget <- meshDist(reference, target, displace = TRUE, alpha = 0.4, axes = FALSE)

  testthat::expect_equal(length(widget$x$objects), 2L)
  testthat::expect_identical(widget$x$objects[[1]]$type, "mesh3d")
  testthat::expect_identical(widget$x$objects[[1]]$material$type, "shader")
  testthat::expect_true(all(c("referenceNormal", "comparisonPosition") %in% names(widget$x$objects[[1]]$vertex_attributes)))
  testthat::expect_equal(length(widget$x$objects[[1]]$vertex_attributes$comparisonPosition$data), 9L)
  testthat::expect_identical(widget$x$objects[[1]]$heatmap_legend$colorramp, c("#1D4ED8", "#F8FAFC", "#B91C1C"))
  testthat::expect_equal(widget$x$objects[[1]]$material$alpha, 0.4)
  testthat::expect_equal(length(widget$x$objects[[2]]$color), 3L)
  testthat::expect_true(all(grepl("^#[0-9A-F]{6}$", widget$x$objects[[2]]$color)))

  info <- attr(widget, "mesh_distance")
  testthat::expect_equal(info$distances, c(0, 0.5, 0.25))
  testthat::expect_equal(info$magnitudes, c(0, 0.5, 0.25))
  testthat::expect_equal(info$limits, c(-0.5, 0.5))
  testthat::expect_identical(info$scale_plot$colorramp, c("#1D4ED8", "#F8FAFC", "#B91C1C"))
  testthat::expect_equal(info$scale_plot$breaks, c(-0.5, 0, 0.5))
})

testthat::test_that("meshDist supports manual from/to scale limits", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  widget <- meshDist(reference, target, from = 0, to = 0.25, axes = FALSE)
  info <- attr(widget, "mesh_distance")

  testthat::expect_equal(info$limits, c(0, 0.25))
  testthat::expect_equal(widget$x$objects[[1]]$material$uniforms$diffMin, 0)
  testthat::expect_equal(widget$x$objects[[1]]$material$uniforms$diffMax, 0.25)
  testthat::expect_identical(info$colors[2], info$colors[3])
})

testthat::test_that("meshDist accepts custom R color ramps", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  widget <- meshDist(reference, target, colorramp = c("navy", "#FFFFFF", "gold", "firebrick"), axes = FALSE)

  testthat::expect_identical(
    widget$x$objects[[1]]$heatmap_legend$colorramp,
    c("#000080", "#FFFFFF", "#FFD700", "#B22222")
  )
})

testthat::test_that("meshDist supports signed distvec input", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )

  widget <- meshDist(reference, distvec = c(-0.2, 0, 0.3), displace = TRUE, axes = FALSE)
  info <- attr(widget, "mesh_distance")

  testthat::expect_identical(info$mode, "distvec")
  testthat::expect_equal(info$distances, c(-0.2, 0, 0.3))
  testthat::expect_equal(info$magnitudes, c(0.2, 0, 0.3))
  testthat::expect_equal(info$limits, c(-0.3, 0.3))
  testthat::expect_equal(length(widget$x$objects), 2L)
  testthat::expect_equal(length(widget$x$objects[[1]]$vertex_attributes$comparisonPosition$data), 9L)
})

testthat::test_that("meshDist heatmap material is double-sided", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0.1),
      c(1, 0, 0.1),
      c(0, 1, 0.1)
    )
  )

  widget <- meshDist(reference, target, axes = FALSE)

  testthat::expect_identical(widget$x$objects[[1]]$material$type, "shader")
  testthat::expect_false(widget$x$objects[[1]]$material$backface_culling)
})

testthat::test_that("meshDist heatmap stays transparent without depth prepass metadata", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0.1),
      c(1, 0, 0.1),
      c(0, 1, 0.1)
    )
  )

  widget <- meshDist(reference, target, alpha = 0.4, axes = FALSE)

  testthat::expect_equal(widget$x$objects[[1]]$material$alpha, 0.4)
  testthat::expect_identical(widget$x$objects[[1]]$material$type, "shader")
})

testthat::test_that("heatmap_scale returns a ggplot with matching limits", {
  testthat::skip_if_not_installed("ggplot2")

  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0.5),
      c(0, 1, 0.25)
    )
  )

  plot <- heatmap_scale(reference, target, colorramp = c("navy", "white", "firebrick"))

  testthat::expect_s3_class(plot, "ggplot")
  testthat::expect_equal(plot$scales$get_scales("fill")$limits, c(-0.5, 0.5))
  testthat::expect_identical(plot$labels$title, "Difference Scale")
})

testthat::test_that("meshDist rejects mismatched topology", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )
  target <- structure(
    list(
      vb = rbind(
        c(0, 1, 0, 0),
        c(0, 0, 1, 0),
        c(0, 0, 0, 1),
        c(1, 1, 1, 1)
      ),
      it = matrix(c(1, 2, 4), nrow = 3)
    ),
    class = "mesh3d"
  )

  testthat::expect_error(
    meshDist(reference, target),
    "same number of vertices"
  )
})

testthat::test_that("meshDist validates manual from/to ordering", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )

  testthat::expect_error(
    meshDist(reference, reference, from = 1, to = 0),
    "`from` must be less than or equal to `to`."
  )
})

testthat::test_that("meshDist validates target/distvec inputs", {
  reference <- make_test_mesh3d(
    rbind(
      c(0, 0, 0),
      c(1, 0, 0),
      c(0, 1, 0)
    )
  )

  testthat::expect_error(
    meshDist(reference),
    "Provide either `target` or `distvec`"
  )

  testthat::expect_error(
    meshDist(reference, reference, distvec = c(0, 0, 0)),
    "Supply only one of `target` or `distvec`"
  )

  testthat::expect_error(
    meshDist(reference, distvec = c(0, 1)),
    "`distvec` must be a finite numeric vector"
  )
})
