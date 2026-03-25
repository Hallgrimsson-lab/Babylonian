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

bg3d("black")
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


plot3d(mesh, color = "gray75", specularity = 0.3)
light3d_hemispheric(intensity = 0.35, ground_color = "gray20")
light3d_directional(
  direction = c(-0.5, -1, 0.2),
  intensity = 0.9,
  diffuse = "#fff7cc"
)



# scene editing/gizmos
testscene <- babylon(
  data = list(
    as_babylon_mesh(mesh, color = "gray75")
  )
)

# mesh$vb[-4,] <- mesh$vb[-4,]/10
register_material3d("bronze", pbr_material3d(base_color = "#CD7F32", metallic = 0.6, roughness = 0.4))

state <- edit_scene3d(testscene)
scene <- apply_scene_state(scene, state = state)
snapshot3d("figure.png", widget = scene)



# light testing

scene <- babylon(
  data = list(
    as_babylon_mesh(mesh, name = "specimen", color = "gray75", specularity = 0.35),
    
    as_babylon_light(
      type = "point",
      name = "point",
      position = c(120, 80, 120),
      intensity = 0.8,
      diffuse = "#ffd166",
      specular = "#ffffff",
      range = 500
    ),
    
    as_babylon_light(
      type = "spot",
      name = "spot",
      position = c(-140, 120, 80),
      direction = c(0.7, -0.6, -0.2),
      intensity = 1.1,
      diffuse = "#7dd3fc",
      specular = "#ffffff",
      angle = pi / 5,
      exponent = 2,
      range = 600
    ),
    
    as_babylon_light(
      type = "directional",
      name = "directional",
      position = c(0, 160, -160),
      direction = c(0.1, -1, 0.5),
      intensity = 0.7,
      diffuse = "#fff7cc",
      specular = "#ffffff"
    ),
    
    as_babylon_light(
      type = "hemispheric",
      name = "hemispheric",
      position = c(0, 180, 0),
      direction = c(0, 1, 0),
      intensity = 0.35,
      diffuse = "#ffffff",
      specular = "#dbeafe",
      ground_color = "#334155"
    )
  )
)

state <- edit_scene3d(scene)
scene <- apply_scene_state(scene, state = state)
scene2 <- apply_scene_state(scene, state)
snapshot3d("lights-demo.png", widget = scene)

scene <- babylon(
  data = list(
    as_babylon_mesh(mesh, color = "gray75"),
    as_babylon_light(
      type = "point",
      name = "key",
      position = c(100, 80, 120),
      intensity = 0.8,
      diffuse = "#ffd166"
    )
  ),
  scene = list(
    postprocess = list(
      dof3d(
        focus_distance = 200,
        f_stop = 2,
        focal_length = 50,
        blur_level = "medium"
      )
    )
  )
)

state <- edit_scene3d(scene)
scene <- apply_scene_state(scene, state = state)
snapshot3d("dof-scene.png", widget = scene)


#multiwindow w sync
paired_scene3d(
  as_babylon_mesh(mesh, color = "gray75"),
  as_babylon_mesh(mesh2, color = "tomato"),
  labels = c("Reference", "Target")
)

# pbr
pbrmesh <- as_babylon_mesh(
  mesh,
  material = pbr_material3d(
    base_color = "#c084fc",
    metallic = 0.75,
    roughness = 0.0
  )
)

babylon(data = list(pbrmesh))

# movies + animation
scene <- babylon(
  data = list(
    morph_target3d(mesh, mesh2, influence = 0, color = "gray75")
  )
)

state <- edit_scene3d(scene)
scene_prep <- apply_scene_state(scene, state = state)

nframes = 10
record_scene3d(
  scene_prep,
  file = "turntable.mp4",
  views = orbit_path3d(n = nframes, axis = "y", zoom = 1.1),
  morph = morph_path3d(n = nframes, from = 0, to = 1)
)

scene <- babylon(
  data = list(
    morph_target3d(mesh, mesh2, influence = 0, color = "gray75")
  )
)

state <- edit_scene3d(scene)
scene_prep <- apply_scene_state(scene, state = state)
bg3d("black")

record_scene3d(
  scene_prep,
  file = "heatmap.mp4",
  morph = morph_path3d(n = 30, from = 0, to = 1),
  heatmap = TRUE,
  heatmap_args = list(
    alpha = 0,
    displace = TRUE, 
    axes = F
  )
)

# gltf
brainstem_info <- model_info3d(
  system.file("extdata", "BrainStem.gltf", package = "Babylonian")
)

brainstem_info$meshes
brainstem_info$materials
brainstem_info$buffers

brainstem <- import_model3d(
  system.file("extdata", "BrainStem.gltf", package = "Babylonian")
)

stempoints <- extract_geometry3d(brainstem)
plot3d(stempoints$vertices)
create_pose_3d(brainstem)
plot3d(brainstem)
babylon(data = list(brainstem))

# glb
brainstem <- import_model3d(
  system.file("extdata", "Bee.glb", package = "Babylonian")
)


digit.fixed(mesh, fixed = 3, index = TRUE, ptsize = 1, center = TRUE)

# node material editor imports
node_mat <- node_material3d(
  file = system.file("extdata", "nodeMaterial-demo.json", package = "Babylonian")
)

plot3d(
  as_babylon_mesh(mesh, material = node_mat)
)

babylon(
  data = list(as_babylon_mesh(mesh, color = "gray75")),
  scene = list(
    postprocess = list(
      dof3d(
        focus_distance = 100,
        f_stop = 1.8,
        focal_length = 30,
        blur_level = "high"
      )
    )
  )
)


# clip away submeshes/ parts of the scene - UX bad
# paint vertices index w/ symmetry support
idx <- paint_vertices3d(mesh)


#done
# - scale bars
# - shadow opacity
# - heatmap/meshdist/wireframe
# - shader support??
# - movies
# - multiwindow
# - digitize parity
# - gizmo support on lights and meshes: hard to use
# - camera focus sharpness and other postprocessing
# add lights & postprpcessoing effects in gui
# material support, adding in gui
# take the picture now in gui
# tif support
# svg support
# lighting portrait presets
# gizmo undo/reset to original state


testscene <- babylon(
  data = list(
    as_babylon_mesh(chondro_decim, color = "gray75"),
    as_babylon_mesh(osteo_decim, color = "yellow")
  )
)

# mesh$vb[-4,] <- mesh$vb[-4,]/10
register_material3d("bronze", pbr_material3d(base_color = "#CD7F32", metallic = 0.6, roughness = 0.4))

state <- edit_scene3d(testscene)
scene <- apply_scene_state(scene, state = state)
scene
snapshot3d("figure.png", widget = scene)

# chondro <- Morpho::file2mesh("AP38R4 chondrocranium.ply")
# osteo <- Morpho::file2mesh("AP38R4 osteocranium.ply")
# chondro_decim <- Rvcg::vcgQEdecim(chondro, percent = .01)
# osteo_decim <- Rvcg::vcgQEdecim(osteo, percent = .01)
# 
chondro_decim$vb[-4,] <- chondro_decim$vb[-4,]*1000
osteo_decim$vb[-4,] <- osteo_decim$vb[-4,]*1000

testscene <- babylon(
  data = list(
    as_babylon_mesh(chondro_decim, color = "gray75"),
    as_babylon_mesh(osteo_decim, color = "yellow")
  )
)

testscene <- babylon(
  data = list(
    as_babylon_mesh(bbs, color = "gray75")
  )
)

state <- edit_scene3d(testscene)

bbs <- Morpho::file2mesh("bbs.ply")

digit.fixed(mesh, 5, index = T)

repro1 <- file2mesh("~/Documents/PhenomicsLabs/phase2_outputs/optimizer_testing_diagnostic/mesh_exports/reconstructedFullTopo.obj")
repro2 <- file2mesh("~/Documents/PhenomicsLabs/testImages/optimizerTesting/151111141448.obj")

Babylonian::meshDist(repro2, repro1, alpha = 0, displace = T)

## more tests
repro3 <- file2mesh("~/Documents/PhenomicsLabs/backups/alignedRegisteredMeshes/0b93ade6-e164-4d33-9769-de6d772c87a4.obj")
repro4 <- file2mesh("~/Documents/PhenomicsLabs/backups/alignedRawMeshes/0b93ade6-e164-4d33-9769-de6d772c87a4.obj")

testscene <- babylon(
  data = list(
    as_babylon_mesh(repro1, color = "gray75"),
    # as_babylon_mesh(repro2, color = "yellow"),
    as_babylon_mesh(repro3, color = "red"),
    as_babylon_mesh(repro4, color = "blue")
  )
)

edit_scene3d(testscene)

plot3d(mesh)

edit_scene3d(shade3d(mesh2))


crouzon_intercept <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_intercept.ply", package = "Babylonian"))
crouzon_age <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_age.ply", package = "Babylonian"))
crouzon_sex <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_sex.ply", package = "Babylonian"))
crouzon_severity <- file2mesh(file = system.file("extdata", "Crouzon Syndrome_severity.ply", package = "Babylonian"))
# adjust amount of age displacement for crouzon
age_vec <- (crouzon_age$vb - crouzon_intercept$vb)/2 + crouzon_intercept$vb
crouzon_age$vb <- age_vec
sex_vec <- (crouzon_sex$vb - crouzon_intercept$vb)*4 + crouzon_intercept$vb
crouzon_sex$vb <- sex_vec
sev_vec <- (crouzon_severity$vb - crouzon_intercept$vb)/2 + crouzon_intercept$vb
crouzon_severity$vb <- sev_vec

plot3d(crouzon_severity)

mesh2ply(crouzon_age, filename = "inst/extdata/Crouzon Syndrome_age")
mesh2ply(crouzon_sex, filename = "inst/extdata/Crouzon Syndrome_sex")
mesh2ply(crouzon_severity, filename = "inst/extdata/Crouzon Syndrome_severity")


# build as targets on intercept
morphed_mesh <- morph_target3d(crouzon_intercept, crouzon_age, influence = 0.2, name = "age50")
morphed_mesh <- morph_target3d(morphed_mesh, crouzon_sex, influence = 0.5, name = "maleness")
morphed_mesh <- morph_target3d(morphed_mesh, crouzon_severity, influence = 0, name = "severity")

state <- edit_scene3d(morphed_mesh)
scene <- apply_scene_state(scene, state = state)
snapshot3d("morph-scene.png", widget = scene)


test1 <- file2mesh("~/Documents/PhenomicsLabs/phase2_outputs/optimizer_testing_diagnostic/mesh_exports/ground_truth_subset.obj")
test2 <- file2mesh("~/Documents/PhenomicsLabs/phase2_outputs/optimizer_testing_diagnostic/mesh_exports/151111141448_1_fit_subset.obj")

testarray <- array(NA, dim = c(ncol(test1$vb), 3, 2))
testarray[,,1] <- t(test1$vb[-4,])
testarray[,,2] <- t(test2$vb[-4,])

testgpa <- procSym(testarray)

test1$vb[-4,] <- t(testgpa$rotated[,,1]*testgpa$size[1])
test2$vb[-4,] <- t(testgpa$rotated[,,2]*testgpa$size[2])

plot3d(test1)
shade3d(test2, color = "orange", alpha = .5)

bg3d("black")
meshDist(test1, test2, alpha = 0, displace = T, from = -2, to = 2)
edit_scene3d(shade3d)



measure_anteverted_nares <- function(
    mesh,
    planeFile     = system.file("extdata", "3pointplane.pp", package = "HPO"),
    landmarksFile = system.file("extdata", "antervertednares.pp", package = "HPO"),
    plot          = FALSE
) {
  if (!inherits(mesh, "mesh3d"))
    stop("`mesh` must be a mesh3d object.", call. = FALSE)
  
  # align to atlas
  sample400 <- sample(1:ncol(atlas$vb), 400)
  mesh <- rotmesh.onto(
    mesh,
    refmat = t(mesh$vb[-4, sample400]),
    tarmat = t(atlas$vb[-4, sample400]),
    scale  = FALSE
  )$mesh
  
  # plane
  plane_pts <- read.mpp(planeFile)
  # plane_pts <- t(rbind(plane_pts, c(0,0,0)))
  centroid  <- colMeans(plane_pts)
  X         <- plane_pts - matrix(centroid, nrow = nrow(plane_pts), ncol = 3, byrow = TRUE)
  n         <- svd(X)$v[, 3]
  n         <- n / sqrt(sum(n^2))
  d0        <- -sum(n * centroid)
  
  # nasal landmarks
  vec_idx      <- templateClosestVertices(pointsFile = landmarksFile)
  vec_vertices <- t(mesh$vb[-4, vec_idx])
  nasal_tip    <- vec_vertices[1, ]
  columella    <- vec_vertices[2, ]
  v            <- nasal_tip - columella
  
  cos_vn    <- abs(sum(v * n)) / sqrt(sum(v^2))
  angle_deg <- 90 - acos(cos_vn) * 180 / pi
  
  if (plot) {
    # rgl::par3d(windowRect = c(20, 20, 820, 820), zoom = .75, userMatrix = front.face)
    plot3d(mesh, aspect = "iso", col = "lightgrey", alpha = 0.3)
    # planes3d(a = n[1], b = n[2], c = n[3], d = d0, col = "cyan", alpha = 0.4)
    spheres3d(plane_pts,    col = "blue",   radius = .15)
    spheres3d(vec_vertices, col = "yellow", radius = .15)
    segments3d(rbind(columella, nasal_tip), col = "red")
  }
  
  angle_deg
}

measure_anteverted_nares(mesh, plot = T)

