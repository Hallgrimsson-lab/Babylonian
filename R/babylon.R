#' BabylonJS Widget
#'
#' This function creates a new BabylonJS scene.
#'
#' @param data A list of scene objects to be passed to the widget. Entries can
#'   be Babylonian primitive specifications, file-backed meshes created with
#'   [import_mesh()], or `mesh3d` objects such as those returned by Morpho.
#' @param interaction Optional interaction settings used by bespoke tools such
#'   as landmark digitizing.
#' @param width The width of the widget.
#' @param height The height of the widget.
#' @param elementId The ID of the HTML element to contain the widget.
#'
#' @export
babylon <- function(
  data = list(list(type="sphere", diameter=2)),
  interaction = NULL,
  width = NULL,
  height = NULL,
  elementId = NULL
) {
  data <- lapply(data, normalize_scene_object)

  dependencies <- Filter(Negate(is.null), lapply(data, `[[`, "dep"))
  data <- lapply(data, function(d) { d$dep <- NULL; d })

  # create widget
  htmlwidgets::createWidget(
    name = 'babylon',
    x = list(
      objects = data,
      interaction = interaction
    ),
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

#' Convert a `mesh3d` object into a Babylonian mesh specification
#'
#' This adapter is intended for `mesh3d` objects from packages such as Morpho,
#' rgl, and Rvcg. The returned list can be passed directly to [babylon()] or
#' mixed with other Babylonian scene objects.
#'
#' @param x A `mesh3d` object.
#' @param name Optional mesh name.
#' @param color Optional mesh color.
#' @param alpha Optional mesh opacity.
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
    mesh$color <- color
  }

  if (!is.null(alpha)) {
    mesh$alpha <- alpha
  }

  structure(mesh, class = c("babylon_mesh", "list"))
}

#' Plot a Babylon mesh using rgl-like conventions
#'
#' @param x A `babylon_mesh` object.
#' @param add Whether to add the mesh to an existing widget specification. If
#'   `FALSE`, a new widget is returned.
#' @param ... Additional graphical parameters. Recognized values include
#'   `color`, `alpha`, `position`, `rotation`, and `scaling`.
#'
#' @export
plot.babylon_mesh <- function(x, add = FALSE, ...) {
  args <- list(...)
  x <- modify_babylon_mesh(x, args)

  if (isTRUE(add)) {
    return(x)
  }

  babylon(list(x))
}

#' Start an interactive landmark digitizer on a Babylon mesh
#'
#' This creates a Babylon widget that captures surface picks using BabylonJS
#' ray casting. In interactive R sessions, landmarking completes by returning a
#' three-column coordinate matrix. In non-interactive contexts, the function
#' returns the underlying widget.
#'
#' @param x A `babylon_mesh` object or `mesh3d` object.
#' @param n Optional target number of landmarks to collect.
#' @param fixed Optional matrix of fixed landmarks to show on the surface.
#' @param width Widget width.
#' @param height Widget height.
#' @param elementId Optional widget element id.
#' @param marker_color Landmark marker color.
#' @param marker_scale Landmark marker diameter as a fraction of mesh radius.
#'
#' @export
digitize_landmarks <- function(
  x,
  n = NULL,
  fixed = NULL,
  width = NULL,
  height = NULL,
  elementId = NULL,
  marker_color = "#dc2626",
  marker_scale = 0.015
) {
  mesh <- normalize_scene_object(x)

  if (!inherits(mesh, "babylon_mesh")) {
    stop("`x` must be a `babylon_mesh` or `mesh3d` object.", call. = FALSE)
  }

  interaction <- list(
    mode = "digitize_landmarks",
    n = if (is.null(n)) NULL else as.integer(n),
    fixed = normalize_landmarks(fixed),
    marker = list(
      color = marker_color,
      scale = marker_scale
    )
  )

  widget <- babylon(
    data = list(mesh),
    interaction = interaction,
    width = width,
    height = height,
    elementId = elementId
  )

  if (!interactive()) {
    return(widget)
  }

  run_landmark_gadget(widget, n = n)
}

normalize_scene_object <- function(x) {
  if (inherits(x, "mesh3d")) {
    return(as_babylon_mesh(x))
  }

  x
}

modify_babylon_mesh <- function(x, args) {
  allowed <- c("color", "alpha", "position", "rotation", "scaling", "name")

  for (nm in intersect(names(args), allowed)) {
    x[[nm]] <- args[[nm]]
  }

  x
}

normalize_landmarks <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (!is.matrix(x) || ncol(x) != 3) {
    stop("`fixed` must be a matrix with three columns.", call. = FALSE)
  }

  unname(x)
}

run_landmark_gadget <- function(widget, n = NULL) {
  if (!requireNamespace("shiny", quietly = TRUE)) {
    warning("Package 'shiny' is required for interactive landmark collection; returning the widget instead.")
    return(widget)
  }

  if (!requireNamespace("miniUI", quietly = TRUE)) {
    warning("Package 'miniUI' is required for interactive landmark collection; returning the widget instead.")
    return(widget)
  }

  if (is.null(widget$elementId) || identical(widget$elementId, "")) {
    widget$elementId <- paste0("babylon_landmarks_", as.integer(stats::runif(1, 1, 1e9)))
  }

  ui <- miniUI::miniPage(
    miniUI::gadgetTitleBar("Digitize Landmarks"),
    miniUI::miniContentPanel(
      widget,
      shiny::div(
        style = "padding-top: 10px; font-family: monospace;",
        shiny::textOutput("landmark_status")
      )
    )
  )

  server <- function(input, output, session) {
    landmark_input <- paste0(widget$elementId, "_landmarks")

    output$landmark_status <- shiny::renderText({
      pts <- input[[landmark_input]]
      count <- landmark_count(pts)
      if (is.null(n)) {
        paste("Collected", count, "landmarks")
      } else {
        paste("Collected", count, "of", n, "landmarks")
      }
    })

    shiny::observeEvent(input[[landmark_input]], {
      pts <- input[[landmark_input]]
      if (!is.null(n) && landmark_count(pts) >= n) {
        coords <- landmarks_to_matrix(pts)
        shiny::stopApp(coords)
      }
    }, ignoreNULL = TRUE)

    shiny::observeEvent(input$done, {
      pts <- input[[landmark_input]]
      if (landmark_count(pts) == 0) {
        shiny::stopApp(matrix(numeric(0), ncol = 3))
      }

      shiny::stopApp(landmarks_to_matrix(pts))
    })

    shiny::observeEvent(input$cancel, {
      shiny::stopApp(NULL)
    })
  }

  viewer <- shiny::dialogViewer(
    "Digitize Landmarks",
    width = normalize_viewer_dimension(widget$width, default = 900),
    height = normalize_viewer_dimension(widget$height, default = 700)
  )
  result <- shiny::runGadget(ui, server, viewer = viewer)

  if (is.null(result)) {
    return(invisible(NULL))
  }

  result
}

normalize_viewer_dimension <- function(x, default) {
  if (is.null(x)) {
    return(default)
  }

  if (is.numeric(x) && length(x) == 1) {
    return(x)
  }

  if (is.character(x) && length(x) == 1) {
    if (grepl("%", x, fixed = TRUE)) {
      return(default)
    }

    parsed <- suppressWarnings(as.numeric(gsub("[^0-9.]+", "", x)))
    if (is.finite(parsed)) {
      return(parsed)
    }
  }

  default
}

landmark_count <- function(x) {
  if (is.null(x)) {
    return(0L)
  }

  coords <- tryCatch(extract_landmark_matrix(x), error = function(e) NULL)
  if (!is.null(coords)) {
    return(nrow(coords))
  }

  length(x)
}

landmarks_to_matrix <- function(x) {
  if (is.null(x) || landmark_count(x) == 0) {
    return(matrix(numeric(0), ncol = 3))
  }

  coords <- extract_landmark_matrix(x)
  if (is.null(coords)) {
    stop("Could not convert landmark payload into a 3-column matrix.", call. = FALSE)
  }

  coords
}

extract_landmark_matrix <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.character(x) && length(x) == 1L) {
    return(parse_landmark_json(x))
  }

  if (is.matrix(x)) {
    return(normalize_landmark_columns(x))
  }

  if (is.data.frame(x)) {
    return(normalize_landmark_columns(as.matrix(x)))
  }

  if (is_coordinate_columns(x)) {
    return(unname(cbind(x[["x"]], x[["y"]], x[["z"]])))
  }

  if (is.list(x) && length(x)) {
    numeric_parts <- x[vapply(x, function(part) {
      (is.atomic(part) || is.matrix(part) || is.data.frame(part)) && length(part) > 0
    }, logical(1))]

    for (part in numeric_parts) {
      candidate <- tryCatch(extract_landmark_matrix(part), error = function(e) NULL)
      if (!is.null(candidate)) {
        return(candidate)
      }
    }

    rowwise <- tryCatch(
      unname(do.call(rbind, lapply(x, function(row) unlist(row, use.names = FALSE)))),
      error = function(e) NULL
    )
    rowwise <- normalize_landmark_columns(rowwise)
    if (!is.null(rowwise)) {
      return(rowwise)
    }
  }

  NULL
}

parse_landmark_json <- function(x) {
  if (!nzchar(x)) {
    return(matrix(numeric(0), ncol = 3))
  }

  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required to parse landmark data.", call. = FALSE)
  }

  parsed <- jsonlite::fromJSON(x, simplifyVector = TRUE)
  normalize_landmark_columns(parsed)
}

normalize_landmark_columns <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.vector(x) && !is.list(x)) {
    if (length(x) %% 3L != 0L) {
      return(NULL)
    }
    x <- matrix(x, ncol = 3, byrow = TRUE)
  }

  if (is.null(dim(x))) {
    return(NULL)
  }

  x <- unname(x)
  storage.mode(x) <- "numeric"

  if (ncol(x) == 3L) {
    return(x)
  }

  if (!is.null(colnames(x))) {
    xyz <- match(c("x", "y", "z"), tolower(colnames(x)))
    if (all(!is.na(xyz))) {
      return(unname(x[, xyz, drop = FALSE]))
    }
  }

  if (ncol(x) > 3L) {
    numeric_cols <- which(vapply(seq_len(ncol(x)), function(i) all(is.finite(x[, i]) | is.na(x[, i])), logical(1)))
    if (length(numeric_cols) >= 3L) {
      return(x[, numeric_cols[seq_len(3)], drop = FALSE])
    }
  }

  NULL
}

is_coordinate_columns <- function(x) {
  is.list(x) &&
    all(c("x", "y", "z") %in% names(x)) &&
    all(vapply(x[c("x", "y", "z")], function(col) is.atomic(col) && is.null(dim(col)), logical(1))) &&
    length(unique(vapply(x[c("x", "y", "z")], length, integer(1)))) == 1L
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
