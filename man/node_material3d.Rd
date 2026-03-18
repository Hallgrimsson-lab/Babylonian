\name{node_material3d}
\alias{node_material3d}
\title{Create a Babylon node material descriptor}
\usage{
node_material3d(
  file = NULL,
  json = NULL,
  params = NULL,
  alpha = NULL,
  backface_culling = TRUE,
  name = NULL
)
}
\arguments{
\item{file}{Optional path to a Babylon Node Material JSON export.}

\item{json}{Optional JSON string, parsed list, or node material object.}

\item{params}{Optional named list of exposed input block values.}

\item{alpha}{Optional material alpha.}

\item{backface_culling}{Whether to cull back faces.}

\item{name}{Optional material name.}
}
\description{
Loads Babylon Node Material Editor exports and wraps them in a descriptor that
can be assigned to meshes with \code{\link{as_babylon_mesh}}.
}
