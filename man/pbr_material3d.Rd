\name{pbr_material3d}
\alias{pbr_material3d}
\title{Create a Babylon PBR material descriptor}
\usage{
pbr_material3d(
  base_color = "white",
  base_color_texture = NULL,
  metallic = 0,
  roughness = 1,
  metallic_roughness_texture = NULL,
  normal_texture = NULL,
  occlusion_texture = NULL,
  emissive_texture = NULL,
  emissive = NULL,
  alpha = NULL,
  wireframe = FALSE,
  backface_culling = TRUE,
  unlit = FALSE,
  name = NULL
)
}
\arguments{
\item{base_color}{Base surface color.}

\item{base_color_texture}{Optional base-color texture.}

\item{metallic}{Metallic factor in the 0-1 range.}

\item{roughness}{Roughness factor in the 0-1 range.}

\item{metallic_roughness_texture}{Optional metallic-roughness texture.}

\item{normal_texture}{Optional normal map texture.}

\item{occlusion_texture}{Optional ambient occlusion texture.}

\item{emissive_texture}{Optional emissive texture.}

\item{emissive}{Optional emissive color.}

\item{alpha}{Optional material alpha.}

\item{wireframe}{Whether to render the material in wireframe mode.}

\item{backface_culling}{Whether to cull back faces.}

\item{unlit}{Whether to disable scene lighting for the material.}

\item{name}{Optional material name.}
}
\description{
Creates a lightweight descriptor for Babylon's physically based renderer,
including base color, metallic, roughness, emissive controls, and optional
texture maps.
}
