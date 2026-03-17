library(Babylonian)

# Create a scene with a single sphere
babylon(
  data = list(
    list(type = "sphere", diameter = 1)
  )
)

library(Babylonian)
library(Morpho)

# Any Morpho mesh that inherits from `mesh3d`
mesh <- file2mesh("../../PhenomicsLabs/backups/alignedRegisteredMeshes2/130101010417.obj")

#pose it
create_pose_3d(mesh)

#now reuse the pose
pose <- par3d()
par3d(zoom = .05, userMatrix = pose$userMatrix)

plot3d(mesh, color = "steelblue", alpha = 0.7, specularity = 0.25)
plot3d(mesh, color = 2, specularity = c(1, 1, 1))
plot3d(mesh, color = c(0.2, 0.4, 0.8), specularity = "#666666")

pts <- matrix(rnorm(300), ncol = 3) *100
cols <- rep(c("tomato", "steelblue", "goldenrod"), length.out = nrow(pts))

plot3d(pts, color = cols)
points3d(pts, color = cols)
spheres3d(pts, color = cols, radius = 0.02)


plot3d(mesh, color = 2, specularity = c(1, 1, 1))
points3d(pts, color = cols)

digitize_landmarks(
  mesh,
  n = 5
)
