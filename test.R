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
    as_babylon_mesh(mesh, color = "gray75"),
    as_babylon_light(
      type = "directional",
      name = "key",
      direction = c(-0.5, -1, 0.2),
      intensity = 0.9,
      diffuse = "#fff7cc",
      specular = "#ffffff"
    )
  )
)

mesh$vb[-4,] <- mesh$vb[-4,]/10
testscene <- plot3d(mesh)

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




#done
# - heatmap/meshdist/wireframe
# - shader support??
# - movies
# - multiwindow
# - digitize parity
# - gizmo support on lights and meshes: hard to use
# - camera focus sharpness and other postprocessing

# scale bars
# lighting portrait presets
# add lights & postprpcessoing effects in gui
# material support, adding in gui
# take the picture now in gui
# tif support
# svg support
# shadow opacity
# clip away submeshes/ parts of the scene
