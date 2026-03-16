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

babylon(
  data = list(
    as_babylon_mesh(mesh, color = "#ddb3ba", alpha = 1)
  )
)
