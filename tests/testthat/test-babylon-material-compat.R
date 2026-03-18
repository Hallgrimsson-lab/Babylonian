context("babylon material compatibility")

testthat::test_that("named colors normalize to hex", {
  testthat::expect_identical(normalize_babylon_color("red"), "#FF0000")
  testthat::expect_identical(normalize_babylon_color("#123456"), "#123456")
})

testthat::test_that("numeric palette indices normalize using the active palette", {
  value <- normalize_babylon_color(2)
  testthat::expect_type(value, "character")
  testthat::expect_equal(nchar(value), 7L)
  testthat::expect_match(value, "^#[0-9A-F]{6}$")
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
    scene = list(view = serialize_par3d(list(zoom = 1, userMatrix = diag(4))))
  )

  state <- list(
    view = list(zoom = 1.5, userMatrix = diag(4)),
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
  testthat::expect_equal(last_scene_state()$objects[[1]]$position, c(1, 2, 3))
})

make_test_mesh3d <- function(vertices, faces = matrix(c(1, 2, 3), nrow = 3)) {
  structure(
    list(
      vb = rbind(t(vertices), rep(1, nrow(vertices))),
      it = faces
    ),
    class = "mesh3d"
  )
}

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
  testthat::expect_identical(widget$x$objects[[1]]$type, "meshdist3d")
  testthat::expect_equal(length(widget$x$objects[[1]]$comparison_vertices), 9L)
  testthat::expect_identical(widget$x$objects[[1]]$colorramp, c("#1D4ED8", "#F8FAFC", "#B91C1C"))
  testthat::expect_equal(widget$x$objects[[1]]$alpha, 0.4)
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
  testthat::expect_equal(widget$x$objects[[1]]$diff_min, 0)
  testthat::expect_equal(widget$x$objects[[1]]$diff_max, 0.25)
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
    widget$x$objects[[1]]$colorramp,
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
  testthat::expect_equal(length(widget$x$objects[[1]]$comparison_vertices), 9L)
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
