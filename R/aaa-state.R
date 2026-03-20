# Environment used to accumulate the current scene in an rgl-like workflow.
.babylon_state <- new.env(parent = emptyenv())
.babylon_state$current_scene <- NULL
.babylon_state$par3d <- list(
  zoom = 0.05,
  userMatrix = diag(4),
  bg = "#FAFAFA"
)
.babylon_state$last_scene_par3d <- .babylon_state$par3d
.babylon_state$last_live_par3d <- NULL
.babylon_state$last_scene_state <- NULL
.babylon_state$material_registry <- list()

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}
