\name{standard_material3d}
\alias{standard_material3d}
\title{Create a standard Babylon material descriptor}
\usage{
standard_material3d(
  diffuse = "white",
  specular = "black",
  emissive = NULL,
  alpha = NULL,
  wireframe = FALSE,
  backface_culling = TRUE,
  name = NULL
)
}
\arguments{
\item{diffuse}{Diffuse surface color.}

\item{specular}{Specular highlight color.}

\item{emissive}{Optional emissive color.}

\item{alpha}{Optional material alpha.}

\item{wireframe}{Whether to render the material in wireframe mode.}

\item{backface_culling}{Whether to cull back faces.}

\item{name}{Optional material name.}
}
\description{
Builds an explicit Babylon standard-material descriptor that can be attached to
meshes with \code{\link{as_babylon_mesh}}.
}
