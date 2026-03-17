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

testthat::test_that("mesh argument mutation applies compatibility layer", {
  mesh <- structure(list(type = "mesh3d"), class = c("babylon_mesh", "list"))
  out <- modify_babylon_mesh(mesh, list(color = c(10, 20, 30), specularity = 0.5))

  testthat::expect_identical(out$color, "#0A141E")
  testthat::expect_equal(out$specularity, c(0.5, 0.5, 0.5))
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
