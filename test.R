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

plot3d(mesh, color = "#ddb3ba", alpha = 1)


plot3d(mesh, color = "steelblue", alpha = 0.7, specularity = 0.25)
plot3d(mesh, color = 2, specularity = c(1, 1, 1))
plot3d(mesh, color = c(0.2, 0.4, 0.8), specularity = "#666666")

