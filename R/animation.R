rotation_axis_matrix4 <- function(theta, axis = c(0, 1, 0)) {
  axis <- normalize_rotation_axis(axis)
  ux <- axis[1]
  uy <- axis[2]
  uz <- axis[3]
  ctheta <- cos(theta)
  stheta <- sin(theta)
  one_minus <- 1 - ctheta

  rot3 <- matrix(
    c(
      ctheta + ux * ux * one_minus,
      ux * uy * one_minus - uz * stheta,
      ux * uz * one_minus + uy * stheta,
      uy * ux * one_minus + uz * stheta,
      ctheta + uy * uy * one_minus,
      uy * uz * one_minus - ux * stheta,
      uz * ux * one_minus - uy * stheta,
      uz * uy * one_minus + ux * stheta,
      ctheta + uz * uz * one_minus
    ),
    nrow = 3,
    byrow = TRUE
  )

  rot4 <- diag(4)
  rot4[seq_len(3), seq_len(3)] <- rot3
  rot4
}

#' Create a camera orbit path around the current subject
#'
#' @param n Number of animation frames.
#' @param axis Rotation axis as `"x"`, `"y"`, `"z"`, or a numeric length-3
#'   vector.
#' @param turns Number of full turns when `end` is not supplied.
#' @param start Starting angle in radians.
#' @param end Optional ending angle in radians.
#' @param base_view Optional base view list with `zoom` and `userMatrix`.
#' @param zoom Optional zoom override for the generated views.
#' @param userMatrix Optional user-matrix override for the generated views.
#' @param include_endpoint Whether to include the ending angle as an extra frame.
#'
#' @export
orbit_path3d <- function(
  n = 120,
  axis = "y",
  turns = 1,
  start = 0,
  end = NULL,
  base_view = NULL,
  zoom = NULL,
  userMatrix = NULL,
  include_endpoint = FALSE
) {
  n <- as.integer(n[[1]])
  if (!is.finite(n) || n < 1L) {
    stop("`n` must be a positive integer.", call. = FALSE)
  }

  if (is.null(end)) {
    end <- start + (2 * pi * as.numeric(turns[[1]]))
  }

  base_view <- normalize_animation_base_view(base_view = base_view, zoom = zoom, userMatrix = userMatrix)
  frame_count <- if (isTRUE(include_endpoint)) n else n + 1L
  angles <- seq(as.numeric(start[[1]]), as.numeric(end[[1]]), length.out = frame_count)
  if (!isTRUE(include_endpoint)) {
    angles <- angles[-length(angles)]
  }

  path <- lapply(angles, function(theta) {
    list(
      zoom = base_view$zoom,
      userMatrix = rotation_axis_matrix4(theta, axis = axis) %*% base_view$userMatrix,
      bg = base_view$bg
    )
  })

  structure(path, class = c("babylon_view_path", "list"))
}

#' Create a morph-influence animation path
#'
#' @param n Number of animation frames.
#' @param from Starting morph influence.
#' @param to Ending morph influence.
#' @param easing Easing function to apply.
#' @param ping_pong Whether to append the reversed path for a back-and-forth
#'   animation.
#'
#' @export
morph_path3d <- function(
  n = 60,
  from = 0,
  to = 1,
  easing = c("linear", "ease_in", "ease_out", "ease_in_out"),
  ping_pong = FALSE
) {
  easing <- match.arg(easing)
  n <- as.integer(n[[1]])
  if (!is.finite(n) || n < 1L) {
    stop("`n` must be a positive integer.", call. = FALSE)
  }

  t <- seq(0, 1, length.out = n)
  eased <- switch(
    easing,
    linear = t,
    ease_in = t ^ 2,
    ease_out = 1 - (1 - t) ^ 2,
    ease_in_out = ifelse(t < 0.5, 2 * t ^ 2, 1 - 2 * (1 - t) ^ 2)
  )

  values <- as.numeric(from[[1]]) + (as.numeric(to[[1]]) - as.numeric(from[[1]])) * eased
  if (isTRUE(ping_pong) && length(values) > 1L) {
    values <- c(values, rev(values[-c(1L, length(values))]))
  }

  structure(values, class = c("babylon_morph_path", "numeric"))
}

#' Render a Babylonian animation to individual frames
#'
#' @param x Optional Babylonian htmlwidget or `plot3d()`-compatible object. If
#'   omitted, the current accumulated scene is used.
#' @param dir Output directory for rendered frames.
#' @param views Optional camera views, such as those returned by
#'   [orbit_path3d()].
#' @param morph Optional morph-influence sequence, such as that returned by
#'   [morph_path3d()].
#' @param morph_target Optional mesh selector used when applying `morph`.
#' @param heatmap Whether to render each frame as a `meshDist()` heatmap derived
#'   from the selected morph-target mesh instead of snapshotting the original
#'   scene directly.
#' @param heatmap_args Optional named list of additional arguments forwarded to
#'   [meshDist()] when `heatmap = TRUE`.
#' @param filename_pattern `sprintf()`-style filename pattern for frames.
#' @param vwidth Frame width in pixels.
#' @param vheight Frame height in pixels.
#' @param delay Delay passed to [snapshot3d()] for each frame.
#' @param overwrite Whether to overwrite existing frame files.
#' @param snapshot_fun Advanced override used to capture each frame.
#' @param ... Additional arguments forwarded to [snapshot3d()].
#'
#' @export
render_frames3d <- function(
  x = NULL,
  dir,
  views = NULL,
  morph = NULL,
  morph_target = NULL,
  heatmap = FALSE,
  heatmap_args = NULL,
  filename_pattern = "frame_%04d.png",
  vwidth = 1600,
  vheight = 1600,
  delay = 0.5,
  overwrite = TRUE,
  snapshot_fun = snapshot3d,
  ...
) {
  widget <- resolve_animation_widget(x)
  dir.create(dir, recursive = TRUE, showWarnings = FALSE)
  heatmap_args <- normalize_heatmap_animation_args(heatmap_args)

  view_seq <- normalize_view_sequence(views)
  morph_seq <- normalize_morph_sequence(morph)
  n_frames <- resolve_animation_frame_count(view_seq, morph_seq)

  if (!length(view_seq)) {
    view_seq <- vector("list", n_frames)
  } else if (length(view_seq) == 1L && n_frames > 1L) {
    view_seq <- rep(view_seq, n_frames)
  }

  if (!length(morph_seq)) {
    morph_seq <- rep(NA_real_, n_frames)
  } else if (length(morph_seq) == 1L && n_frames > 1L) {
    morph_seq <- rep(morph_seq, n_frames)
  }

  files <- character(n_frames)
  for (i in seq_len(n_frames)) {
    file <- file.path(dir, sprintf(filename_pattern, i))
    if (file.exists(file) && !isTRUE(overwrite)) {
      stop("Frame file already exists: ", file, call. = FALSE)
    }

    frame_widget <- if (isTRUE(heatmap)) {
      heatmap_animation_frame_widget(
        widget,
        view = view_seq[[i]],
        morph = if (is.na(morph_seq[[i]])) NULL else morph_seq[[i]],
        morph_target = morph_target,
        heatmap_args = heatmap_args
      )
    } else {
      animation_frame_widget(
        widget,
        view = view_seq[[i]],
        morph = if (is.na(morph_seq[[i]])) NULL else morph_seq[[i]],
        morph_target = morph_target
      )
    }

    snapshot_fun(
      file,
      widget = frame_widget,
      vwidth = vwidth,
      vheight = vheight,
      delay = delay,
      ...
    )
    files[[i]] <- file
  }

  structure(files, class = c("babylon_frame_sequence", "character"))
}

#' Record a Babylonian scene to GIF or video
#'
#' @param x Optional Babylonian htmlwidget or `plot3d()`-compatible object. If
#'   omitted, the current accumulated scene is used.
#' @param file Output animation path.
#' @param views Optional camera views, such as those returned by
#'   [orbit_path3d()].
#' @param morph Optional morph-influence sequence, such as that returned by
#'   [morph_path3d()].
#' @param morph_target Optional mesh selector used when applying `morph`.
#' @param heatmap Whether to render each frame as a `meshDist()` heatmap derived
#'   from the selected morph-target mesh instead of snapshotting the original
#'   scene directly.
#' @param heatmap_args Optional named list of additional arguments forwarded to
#'   [meshDist()] when `heatmap = TRUE`.
#' @param type Output type. Use `"gif"`, `"video"`, or `NULL` to infer from the
#'   file extension.
#' @param fps Frames per second.
#' @param loop GIF loop count.
#' @param vwidth Frame width in pixels.
#' @param vheight Frame height in pixels.
#' @param delay Delay passed to [snapshot3d()] for each frame.
#' @param overwrite Whether to overwrite an existing output file.
#' @param keep_frames Whether to keep intermediate PNG frames.
#' @param render_fun Advanced override used to render frames.
#' @param system_runner Advanced override used to run external encoders.
#' @param ... Additional arguments forwarded to [render_frames3d()].
#'
#' @export
record_scene3d <- function(
  x = NULL,
  file,
  views = NULL,
  morph = NULL,
  morph_target = NULL,
  heatmap = FALSE,
  heatmap_args = NULL,
  type = NULL,
  fps = 30,
  loop = 0,
  vwidth = 1600,
  vheight = 1600,
  delay = 0.5,
  overwrite = TRUE,
  keep_frames = FALSE,
  render_fun = render_frames3d,
  system_runner = system2,
  ...
) {
  if (!is.character(file) || !length(file) || !nzchar(file[[1]])) {
    stop("`file` must be a non-empty output path.", call. = FALSE)
  }

  file <- file[[1]]
  if (file.exists(file) && !isTRUE(overwrite)) {
    stop("Output file already exists: ", file, call. = FALSE)
  }

  output_type <- resolve_animation_output_type(file, type = type)
  tmp_dir <- tempfile("babylon_frames_")
  dir.create(tmp_dir, recursive = TRUE, showWarnings = FALSE)
  if (!isTRUE(keep_frames)) {
    on.exit(unlink(tmp_dir, recursive = TRUE, force = TRUE), add = TRUE)
  }

  frame_pattern <- "frame_%05d.png"
  frames <- render_fun(
    x = x,
    dir = tmp_dir,
    views = views,
    morph = morph,
    morph_target = morph_target,
    heatmap = heatmap,
    heatmap_args = heatmap_args,
    filename_pattern = frame_pattern,
    vwidth = vwidth,
    vheight = vheight,
    delay = delay,
    overwrite = TRUE,
    ...
  )

  if (identical(output_type, "gif")) {
    encode_gif_frames(frames, file = file, fps = fps, loop = loop, system_runner = system_runner)
  } else {
    encode_video_frames(
      pattern = file.path(tmp_dir, frame_pattern),
      file = file,
      fps = fps,
      system_runner = system_runner
    )
  }

  invisible(file)
}

resolve_animation_widget <- function(x = NULL) {
  if (is.null(x)) {
    scene_spec <- current_scene_spec()
    if (is.null(scene_spec)) {
      stop("No active Babylonian scene available. Plot a scene first or pass `x`.", call. = FALSE)
    }
    return(babylon(scene_spec$objects, scene = scene_spec$scene))
  }

  if (inherits(x, "htmlwidget")) {
    return(x)
  }

  plot3d(x, add = FALSE)
}

normalize_animation_base_view <- function(base_view = NULL, zoom = NULL, userMatrix = NULL) {
  if (is.null(base_view)) {
    base_view <- last_par3d()
  } else {
    base_view <- deserialize_par3d(normalize_view(base_view))
  }

  if (!is.null(zoom)) {
    base_view$zoom <- as.numeric(zoom[[1]])
  }
  if (!is.null(userMatrix)) {
    base_view$userMatrix <- userMatrix
  }

  list(
    zoom = as.numeric(base_view$zoom[[1]]),
    userMatrix = normalize_user_matrix(base_view$userMatrix),
    bg = normalize_babylon_color(base_view$bg %||% .babylon_state$par3d$bg)
  )
}

normalize_rotation_axis <- function(axis) {
  if (is.character(axis) && length(axis) == 1L) {
    axis <- switch(
      tolower(axis[[1]]),
      x = c(1, 0, 0),
      y = c(0, 1, 0),
      z = c(0, 0, 1),
      stop("`axis` must be \"x\", \"y\", \"z\", or a numeric vector of length 3.", call. = FALSE)
    )
  }

  axis <- as.numeric(axis)
  if (length(axis) != 3L || any(!is.finite(axis))) {
    stop("`axis` must be a finite numeric vector of length 3.", call. = FALSE)
  }

  norm <- sqrt(sum(axis ^ 2))
  if (!is.finite(norm) || norm <= 0) {
    stop("`axis` must have non-zero length.", call. = FALSE)
  }

  axis / norm
}

normalize_view_sequence <- function(x) {
  if (is.null(x)) {
    return(list())
  }

  if (inherits(x, "babylon_view_path")) {
    return(lapply(unclass(x), normalize_view))
  }

  if (is.list(x) && !is.null(x$zoom)) {
    return(list(normalize_view(x)))
  }

  if (!is.list(x)) {
    stop("`views` must be NULL, a single view, or a list of views.", call. = FALSE)
  }

  lapply(x, normalize_view)
}

normalize_morph_sequence <- function(x) {
  if (is.null(x)) {
    return(numeric(0))
  }

  if (!is.numeric(x) || !length(x) || any(!is.finite(x))) {
    stop("`morph` must be NULL or a finite numeric vector.", call. = FALSE)
  }

  as.numeric(x)
}

resolve_animation_frame_count <- function(views, morph) {
  counts <- c(length(views), length(morph))
  counts <- counts[counts > 0L]
  if (!length(counts)) {
    stop("Provide at least one of `views` or `morph`.", call. = FALSE)
  }

  max_count <- max(counts)
  incompatible <- counts[counts != 1L & counts != max_count]
  if (length(incompatible)) {
    stop("`views` and `morph` must either have the same length or length 1.", call. = FALSE)
  }

  max_count
}

animation_frame_widget <- function(widget, view = NULL, morph = NULL, morph_target = NULL) {
  frame_widget <- unserialize(serialize(widget, NULL))
  frame_widget$x$scene <- normalize_scene(frame_widget$x$scene)

  if (!is.null(view)) {
    frame_widget$x$scene$view <- normalize_view(view)
  }

  if (!is.null(morph)) {
    frame_widget$x$objects <- apply_morph_influence_to_objects(
      frame_widget$x$objects %||% list(),
      influence = morph,
      target = morph_target
    )
  }

  frame_widget
}

heatmap_animation_frame_widget <- function(widget, view = NULL, morph = NULL, morph_target = NULL, heatmap_args = NULL) {
  frame_widget <- animation_frame_widget(
    widget,
    view = view,
    morph = morph,
    morph_target = morph_target
  )
  heatmap_object <- resolve_heatmap_animation_object(frame_widget$x$objects %||% list(), target = morph_target)
  reference_mesh <- strip_animation_morph_target(heatmap_object)
  active_morph_target <- select_animation_morph_target(heatmap_object$morph_target)
  influence <- if (is.null(morph)) active_morph_target$influence else normalize_morph_influence(morph)
  comparison_mesh <- evaluate_animation_morph_target(reference_mesh, active_morph_target, influence = influence)

  scene_args <- utils::modifyList(
    list(
      reference = reference_mesh,
      target = comparison_mesh,
      add = FALSE,
      axes = frame_widget$x$scene$axes %||% TRUE,
      nticks = frame_widget$x$scene$nticks %||% 5L
    ),
    heatmap_args
  )
  heatmap_widget <- do.call(meshDist, scene_args)
  heatmap_widget$x$scene <- normalize_scene(heatmap_widget$x$scene)
  heatmap_widget$x$scene$view <- if (is.null(view)) {
    frame_widget$x$scene$view
  } else {
    normalize_view(view)
  }

  heatmap_widget
}

apply_morph_influence_to_objects <- function(objects, influence, target = NULL) {
  influence <- normalize_morph_influence(influence)
  matched <- FALSE

  updated <- lapply(seq_along(objects), function(i) {
    object <- objects[[i]]
    if (is.null(object$morph_target)) {
      return(object)
    }

    if (!morph_target_matches(object, index = i, target = target)) {
      return(object)
    }

    object$morph_target <- lapply(object$morph_target, function(spec) {
      spec$influence <- influence
      spec
    })
    matched <<- TRUE
    object
  })

  if (!matched) {
    stop("No morph-target-enabled mesh matched `morph_target`.", call. = FALSE)
  }

  updated
}

morph_target_matches <- function(object, index, target = NULL) {
  if (is.null(target)) {
    return(TRUE)
  }

  if (is.numeric(target)) {
    return(index %in% as.integer(target))
  }

  if (is.character(target)) {
    return((object$name %||% NULL) %in% as.character(target))
  }

  stop("`morph_target` must be NULL, a numeric index, or a mesh name.", call. = FALSE)
}

normalize_heatmap_animation_args <- function(x = NULL) {
  if (is.null(x)) {
    return(list())
  }

  if (!is.list(x) || is.null(names(x))) {
    stop("`heatmap_args` must be `NULL` or a named list.", call. = FALSE)
  }

  forbidden <- intersect(names(x), c("reference", "target", "distvec", "add"))
  if (length(forbidden)) {
    stop(
      "`heatmap_args` should not include ",
      paste(sprintf("`%s`", forbidden), collapse = ", "),
      "; those values are controlled by `render_frames3d()`.",
      call. = FALSE
    )
  }

  x
}

resolve_heatmap_animation_object <- function(objects, target = NULL) {
  if (!length(objects)) {
    stop("No scene objects are available to render as heatmaps.", call. = FALSE)
  }

  matches <- which(vapply(
    seq_along(objects),
    function(i) {
      object <- objects[[i]]
      !is.null(object$morph_target) && morph_target_matches(object, index = i, target = target)
    },
    logical(1)
  ))

  if (!length(matches)) {
    stop("No morph-target-enabled mesh matched `morph_target` for heatmap rendering.", call. = FALSE)
  }

  if (is.null(target) && length(matches) > 1L) {
    stop("Multiple morph-target-enabled meshes are present; supply `morph_target` to choose which one to render as a heatmap.", call. = FALSE)
  }

  objects[[matches[[1L]]]]
}

strip_animation_morph_target <- function(x) {
  x$morph_target <- NULL
  x
}

evaluate_animation_morph_target <- function(reference_mesh, morph_target, influence) {
  influence <- normalize_morph_influence(influence)
  base_vertices <- mesh_vertex_matrix(reference_mesh)
  target_vertices <- t(matrix(as.numeric(morph_target$vertices), nrow = 3L))
  interpolated_vertices <- base_vertices + ((target_vertices - base_vertices) * influence)

  comparison_mesh <- reference_mesh
  comparison_mesh$vertices <- flatten_vertex_matrix(interpolated_vertices)
  if (!is.null(comparison_mesh$source$vb) && nrow(comparison_mesh$source$vb) >= 3L) {
    comparison_mesh$source$vb[seq_len(3), ] <- t(interpolated_vertices)
  }
  comparison_mesh$morph_target <- NULL
  comparison_mesh
}

select_animation_morph_target <- function(morph_target) {
  if (is.null(morph_target)) {
    stop("No morph target is available for animation.", call. = FALSE)
  }
  if (is.list(morph_target) && !is.null(morph_target$vertices)) {
    return(morph_target)
  }
  if (is.list(morph_target) && length(morph_target)) {
    return(morph_target[[1L]])
  }
  stop("`morph_target` must contain at least one morph target specification.", call. = FALSE)
}

resolve_animation_output_type <- function(file, type = NULL) {
  if (!is.null(type)) {
    type <- match.arg(type, c("gif", "video"))
    return(type)
  }

  ext <- tolower(tools::file_ext(file))
  if (identical(ext, "gif")) {
    return("gif")
  }

  if (ext %in% supported_video_extensions()) {
    return("video")
  }

  stop("Could not infer animation type from `file`. Use a `.gif`, `.mp4`, `.mov`, or `.webm` extension, or set `type` explicitly.", call. = FALSE)
}

supported_video_extensions <- function() {
  c("mp4", "mov", "webm")
}

encode_gif_frames <- function(frames, file, fps = 20, loop = 0, system_runner = system2) {
  fps <- normalize_animation_fps(fps)
  loop <- as.integer(loop[[1]])

  if (requireNamespace("magick", quietly = TRUE)) {
    images <- magick::image_read(frames)
    animation <- magick::image_animate(images, fps = fps, loop = loop)
    magick::image_write(animation, path = file)
    return(invisible(file))
  }

  magick_bin <- Sys.which("magick")
  if (!nzchar(magick_bin)) {
    stop("Package 'magick' or the `magick` executable is required to write GIF animations.", call. = FALSE)
  }

  status <- system_runner(
    magick_bin,
    build_magick_gif_args(frames, file = file, fps = fps, loop = loop)
  )
  if (!identical(status, 0L) && !identical(status, 0)) {
    stop("ImageMagick failed while writing the GIF animation.", call. = FALSE)
  }

  invisible(file)
}

encode_video_frames <- function(pattern, file, fps = 30, system_runner = system2) {
  ffmpeg_bin <- Sys.which("ffmpeg")
  if (!nzchar(ffmpeg_bin)) {
    stop("The `ffmpeg` executable is required to write video animations.", call. = FALSE)
  }

  status <- system_runner(
    ffmpeg_bin,
    build_ffmpeg_video_args(pattern = pattern, file = file, fps = fps)
  )
  if (!identical(status, 0L) && !identical(status, 0)) {
    stop("ffmpeg failed while writing the video animation.", call. = FALSE)
  }

  invisible(file)
}

build_magick_gif_args <- function(frames, file, fps = 20, loop = 0) {
  delay <- max(1L, as.integer(round(100 / normalize_animation_fps(fps))))
  c(frames, "-delay", as.character(delay), "-loop", as.character(loop), file)
}

build_ffmpeg_video_args <- function(pattern, file, fps = 30) {
  fps <- normalize_animation_fps(fps)
  ext <- tolower(tools::file_ext(file))

  base <- c("-y", "-framerate", as.character(fps), "-i", pattern)
  codec <- switch(
    ext,
    mp4 = c("-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"),
    mov = c("-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"),
    webm = c("-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0"),
    stop("Unsupported video format: .", ext, call. = FALSE)
  )

  c(base, codec, file)
}

normalize_animation_fps <- function(x) {
  value <- as.numeric(x[[1]])
  if (!is.finite(value) || value <= 0) {
    stop("`fps` must be a positive numeric scalar.", call. = FALSE)
  }

  value
}
