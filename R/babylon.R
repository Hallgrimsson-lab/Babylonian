#' BabylonJS Widget
#'
#' This function creates a new BabylonJS scene.
#'
#' @param data A list of data to be passed to the widget.
#' @param width The width of the widget.
#' @param height The height of the widget.
#' @param elementId The ID of the HTML element to contain the widget.
#'
#' @export
babylon <- function(data = list(list(type="sphere", diameter=2)), width = NULL, height = NULL, elementId = NULL) {

  dependencies <- Filter(Negate(is.null), lapply(data, `[[`, "dep"))
  data <- lapply(data, function(d) { d$dep <- NULL; d })

  # create widget
  htmlwidgets::createWidget(
    name = 'babylon',
    x = data,
    width = width,
    height = height,
    package = 'Babylonian',
    elementId = elementId,
    dependencies = dependencies
  )
}

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
