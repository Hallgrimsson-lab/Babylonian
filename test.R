library(Babylonian)

# Create a scene with a single sphere
babylon(
  data = list(
    list(type = "sphere", diameter = 1)
  )
)

library(Morpho)
library(Babylonian)

# Any Morpho mesh that inherits from `mesh3d`
mesh <- file2mesh("../../PhenomicsLabs/backups/alignedRegisteredMeshes2/130101010417.obj")
mesh2 <- file2mesh("../../PhenomicsLabs/backups/alignedRegisteredMeshes2/130102045435.obj")


#pose it
create_pose_3d(mesh)

#now reuse the pose
par3d(zoom = parZoom, userMatrix = parUserMatrix)

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

create_pose_3d(mesh)


segments3d(rbind(
  c(0, 0, 0), c(1, 0, 0),
  c(0, 1, 0), c(0, 1, 1)
), add = T)

planes3d(0, 0, 1, -0.5, color = "tomato", alpha = 0.3)

shade3d(mesh, color = "gray70")


plot3d(mesh)
wireframe3d(mesh)
segments3d(rbind(
  c(0, 0, 0), c(1, 0, 0),
  c(0, 1, 0), c(0, 1, 1)
))


Babylonian::meshDist(mesh2, mesh, axes = F, alpha = 0, displace = T)
Babylonian::meshDist(mesh2, mesh, axes = F, alpha = 0.5, displace = T, from =-2, to = 12)

Babylonian::meshDist(
  mesh,
  mesh2,
  colorramp = c("navy", "white", "gold", "firebrick"),
  displace = TRUE
)


Babylonian::meshDist(
  mesh,
  distvec = runif(ncol(mesh$vb), -100, 100),
  colorramp = c("navy", "white", "gold", "firebrick"),
  displace = F
)

heatmap_scale(mesh, mesh2)

heatmap_scale(
  mesh,
  distvec = runif(ncol(mesh$vb), -100, 100),
  colorramp = c("navy", "white", "firebrick"),
  from = -2,
  to = 2
)

# - digitize parity
# - shader support??
# - lights
# - multiwindow
# - movies
# - gizmo support on lights and meshes

#done
# - heatmap/meshdist/wireframe

