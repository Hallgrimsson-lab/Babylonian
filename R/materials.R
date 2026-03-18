modify_babylon_mesh <- function(x, args) {
  allowed <- c("color", "alpha", "specularity", "position", "rotation", "scaling", "name", "wireframe")

  for (nm in intersect(names(args), allowed)) {
    value <- args[[nm]]
    if (nm == "color") {
      value <- normalize_babylon_color(value)
    } else if (nm == "specularity") {
      value <- normalize_babylon_specularity(value)
    } else if (nm == "wireframe") {
      value <- isTRUE(value)
    }
    x[[nm]] <- value
  }

  x
}

normalize_babylon_color <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.list(x)) {
    x <- unlist(x, recursive = TRUE, use.names = FALSE)
  }

  if (!length(x)) {
    return(NULL)
  }

  x <- x[!is.na(x)]
  if (!length(x)) {
    return(NULL)
  }

  if (is.numeric(x)) {
    if (length(x) == 1L) {
      idx <- as.integer(x[[1]])
      pal <- grDevices::palette()
      if (!is.finite(idx) || idx < 1L || idx > length(pal)) {
        stop("Numeric colors must be valid palette indices.", call. = FALSE)
      }
      x <- pal[[idx]]
    } else if (length(x) >= 3L) {
      rgb <- as.numeric(x[seq_len(3)])
      if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 1)) {
        return(sprintf("#%02X%02X%02X", round(rgb[1] * 255), round(rgb[2] * 255), round(rgb[3] * 255)))
      }
      if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 255)) {
        return(sprintf("#%02X%02X%02X", round(rgb[1]), round(rgb[2]), round(rgb[3])))
      }
      stop("Numeric RGB colors must be in the 0-1 or 0-255 range.", call. = FALSE)
    } else {
      stop("Numeric colors must be a palette index or an RGB vector.", call. = FALSE)
    }
  } else {
    x <- as.character(x[[1]])
  }

  rgba <- grDevices::col2rgb(x, alpha = TRUE)
  sprintf("#%02X%02X%02X", rgba[1, 1], rgba[2, 1], rgba[3, 1])
}

normalize_babylon_specularity <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }

  if (is.list(x)) {
    x <- unlist(x, recursive = TRUE, use.names = FALSE)
  }

  if (!length(x)) {
    return(NULL)
  }

  x <- x[!is.na(x)]
  if (!length(x)) {
    return(NULL)
  }

  if (is.numeric(x) && length(x) == 1L) {
    value <- max(0, min(1, as.numeric(x[[1]])))
    return(unname(rep(value, 3L)))
  }

  if (is.numeric(x) && length(x) >= 3L) {
    rgb <- as.numeric(x[seq_len(3)])
    if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 1)) {
      return(unname(rgb))
    }
    if (all(is.finite(rgb)) && all(rgb >= 0) && all(rgb <= 255)) {
      return(unname(rgb / 255))
    }
    if (!all(is.finite(rgb)) || !all(rgb >= 0) || !all(rgb <= 255)) {
      stop("Numeric specularity vectors must be in the 0-1 or 0-255 range.", call. = FALSE)
    }
  }

  hex <- normalize_babylon_color(x)
  rgba <- grDevices::col2rgb(hex) / 255
  unname(as.numeric(rgba[, 1]))
}

babylon_material_compat_helper <- function() {
  list(
    red = normalize_babylon_color("red"),
    palette_2 = normalize_babylon_color(2),
    rgb_unit = normalize_babylon_color(c(0.1, 0.2, 0.3)),
    rgb_byte = normalize_babylon_color(c(10, 20, 30)),
    spec_scalar = normalize_babylon_specularity(0.4),
    spec_hex = normalize_babylon_specularity("#666666")
  )
}

babylon_material_compat_self_test <- function() {
  helper <- babylon_material_compat_helper()

  stopifnot(identical(helper$red, "#FF0000"))
  stopifnot(is.character(helper$palette_2), nchar(helper$palette_2) == 7L)
  stopifnot(identical(helper$rgb_byte, "#0A141E"))
  stopifnot(is.character(helper$rgb_unit), nchar(helper$rgb_unit) == 7L)
  stopifnot(is.numeric(helper$spec_scalar), length(helper$spec_scalar) == 3L)
  stopifnot(all(abs(helper$spec_scalar - c(0.4, 0.4, 0.4)) < 1e-8))
  stopifnot(is.numeric(helper$spec_hex), length(helper$spec_hex) == 3L)

  invisible(helper)
}

normalize_point_colors <- function(color, n) {
  if (is_single_color_spec(color)) {
    return(normalize_babylon_color(color))
  }

  if (length(color) != n) {
    stop("`color` must have length 1 or match the number of rows in the coordinate matrix.", call. = FALSE)
  }

  unname(vapply(color, normalize_babylon_color, character(1)))
}

normalize_segment_colors <- function(color, n) {
  if (is_single_color_spec(color)) {
    return(normalize_babylon_color(color))
  }

  if (length(color) != n) {
    stop("`color` must have length 1 or match the number of segments.", call. = FALSE)
  }

  unname(vapply(color, normalize_babylon_color, character(1)))
}

normalize_alpha_value <- function(x) {
  if (!is.numeric(x) || !length(x) || !is.finite(x[[1]])) {
    stop("`alpha` must be a finite numeric scalar.", call. = FALSE)
  }

  max(0, min(1, as.numeric(x[[1]])))
}

hex_colors_to_rgba <- function(colors, alpha = 1) {
  colors <- unname(vapply(colors, normalize_babylon_color, character(1)))
  alpha <- rep_len(as.numeric(alpha), length(colors))
  alpha[!is.finite(alpha)] <- 1
  alpha <- pmax(0, pmin(1, alpha))
  rgb <- grDevices::col2rgb(colors) / 255
  as.numeric(rbind(rgb, alpha))
}

is_single_color_spec <- function(x) {
  if (length(x) == 1L) {
    return(TRUE)
  }

  is.numeric(x) && length(x) %in% c(3L, 4L) && all(is.finite(x))
}
