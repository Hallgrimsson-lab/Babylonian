# app.py
from shiny import App, render, ui
import trimesh

from babylonian import scene_input_value, shiny_scene3d

mesh = trimesh.load("../../../PhenomicsLabs/backups/alignedRegisteredMeshes2/130101010417.obj", force="mesh")

app_ui = ui.page_fluid(
    shiny_scene3d("specimen_scene", mesh, color="#d97706"),
    ui.output_text_verbatim("camera_state"),
)

def server(input, output, session):
    @output
    @render.text
    def camera_state():
        return str(scene_input_value(input, "specimen_scene", "par3d", default={}))

app = App(app_ui, server)
