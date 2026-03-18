\name{shader_material3d}
\alias{shader_material3d}
\title{Create a Babylon shader material descriptor}
\usage{
shader_material3d(
  name,
  vertex,
  fragment,
  attributes = c("position", "normal"),
  uniforms = NULL,
  textures = NULL,
  alpha = NULL,
  backface_culling = TRUE
)
}
\arguments{
\item{name}{Shader name used to register source code in Babylon's shader store.}

\item{vertex}{Vertex shader GLSL source.}

\item{fragment}{Fragment shader GLSL source.}

\item{attributes}{Vertex attributes consumed by the shader.}

\item{uniforms}{Named list of shader uniforms.}

\item{textures}{Optional named list of textures or sampler sources.}

\item{alpha}{Optional material alpha.}

\item{backface_culling}{Whether to cull back faces.}
}
\description{
Creates a generic Babylon \code{ShaderMaterial} descriptor so custom GLSL
vertex and fragment shaders can be attached to Babylonian mesh primitives.
}
