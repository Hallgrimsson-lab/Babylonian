\name{pbr_material3d}
\alias{pbr_material3d}
\title{Create a Babylon PBR material descriptor}
\usage{
pbr_material3d(
  base_color = "white",
  metallic = 0,
  roughness = 1,
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

\item{metallic}{Metallic factor in the 0-1 range.}

\item{roughness}{Roughness factor in the 0-1 range.}

\item{emissive}{Optional emissive color.}

\item{alpha}{Optional material alpha.}

\item{wireframe}{Whether to render the material in wireframe mode.}

\item{backface_culling}{Whether to cull back faces.}

\item{unlit}{Whether to disable scene lighting for the material.}

\item{name}{Optional material name.}
}
\description{
Creates a lightweight descriptor for Babylon's physically based renderer,
including base color, metallic, roughness, and emissive controls.
}
