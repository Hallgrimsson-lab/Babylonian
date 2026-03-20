from __future__ import annotations

import base64
from copy import deepcopy
from dataclasses import dataclass, field
from html import escape
import json
from pathlib import Path
import uuid
from typing import Any, Iterable, Optional, Sequence

try:
    import anywidget
    import traitlets
except ImportError:  # pragma: no cover - fallback when notebook deps are absent
    anywidget = None
    traitlets = None


SCHEMA_NAME = "babylonian.scene"
SCHEMA_VERSION = "0.1.0"
_CURRENT_SCENE: Optional["BabylonScene"] = None


def _is_trimesh(obj: Any) -> bool:
    return (
        obj is not None
        and obj.__class__.__module__.startswith("trimesh")
        and hasattr(obj, "vertices")
        and hasattr(obj, "faces")
    )


def _as_list(value: Any) -> list[Any]:
    if hasattr(value, "tolist"):
        return value.tolist()
    return list(value)


def _flatten_rows(rows: Sequence[Sequence[Any]]) -> list[float]:
    flat: list[float] = []
    for row in rows:
        flat.extend(float(x) for x in row)
    return flat


def _flatten_indices(rows: Sequence[Sequence[Any]], *, reverse_winding: bool = True) -> list[int]:
    flat: list[int] = []
    for row in rows:
        if len(row) != 3:
            raise ValueError("Faces must be triangles with exactly 3 indices per face.")
        if reverse_winding:
            flat.extend((int(row[0]), int(row[2]), int(row[1])))
        else:
            flat.extend(int(x) for x in row)
    return flat


def _normalize_vertices_faces(
    x: Any = None,
    *,
    vertices: Any = None,
    faces: Any = None,
    reverse_winding: bool = True,
) -> tuple[list[float], list[int]]:
    if x is not None and (vertices is not None or faces is not None):
        raise ValueError("Pass either `x` or explicit `vertices`/`faces`, not both.")

    if x is not None:
        if _is_trimesh(x):
            vertices = _as_list(x.vertices)
            faces = _as_list(x.faces)
        elif isinstance(x, dict) and "vertices" in x and "faces" in x:
            vertices = x["vertices"]
            faces = x["faces"]
        elif isinstance(x, (tuple, list)) and len(x) == 2:
            vertices, faces = x
        else:
            raise TypeError(
                "`plot3d()` currently supports trimesh.Trimesh, a (vertices, faces) tuple, "
                "or a dict with `vertices` and `faces`."
            )

    if vertices is None or faces is None:
        raise ValueError("Mesh data requires both `vertices` and `faces`.")

    vertex_rows = _as_list(vertices)
    face_rows = _as_list(faces)
    if not vertex_rows or not face_rows:
        raise ValueError("Mesh data cannot be empty.")

    if len(vertex_rows[0]) != 3:
        raise ValueError("Vertices must have shape (n, 3).")

    return _flatten_rows(vertex_rows), _flatten_indices(face_rows, reverse_winding=reverse_winding)


def _normalize_color(value: Optional[str], fallback: Optional[str] = None) -> Optional[str]:
    if value is None:
        return fallback
    if not isinstance(value, str) or not value:
        raise TypeError("Colors must be non-empty strings.")
    return value


def _default_view() -> dict[str, Any]:
    return {
        "zoom": 0.05,
        "userMatrix": [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
        "bg": "#FAFAFA",
    }


@dataclass
class BabylonScene:
    objects: list[dict[str, Any]] = field(default_factory=list)
    scene: dict[str, Any] = field(default_factory=dict)
    interaction: Optional[dict[str, Any]] = None

    def __post_init__(self) -> None:
        scene = deepcopy(self.scene)
        if "view" not in scene:
            scene["view"] = _default_view()
        if "axes" not in scene:
            scene["axes"] = True
        if "nticks" not in scene:
            scene["nticks"] = 5
        self.scene = scene
        self.objects = [deepcopy(obj) for obj in self.objects]
        if self.interaction is not None:
            self.interaction = deepcopy(self.interaction)

    def clone(self) -> "BabylonScene":
        return BabylonScene(
            objects=deepcopy(self.objects),
            scene=deepcopy(self.scene),
            interaction=deepcopy(self.interaction),
        )

    def append(self, *objects: dict[str, Any]) -> "BabylonScene":
        scene = self.clone()
        scene.objects.extend(deepcopy(list(objects)))
        return scene

    def to_payload(self) -> dict[str, Any]:
        return {
            "objects": deepcopy(self.objects),
            "scene": deepcopy(self.scene),
            "interaction": deepcopy(self.interaction),
        }

    def to_spec(self) -> dict[str, Any]:
        payload = self.to_payload()
        payload["schema"] = {
            "name": SCHEMA_NAME,
            "version": SCHEMA_VERSION,
        }
        return payload

    def to_json(self, *, indent: Optional[int] = 2) -> str:
        return json.dumps(self.to_spec(), indent=indent)


def _widget_html(scene: BabylonScene, width: int, height: int, element_id: str) -> str:
    payload = json.dumps(scene.to_payload())
    div_id = f"{element_id}-canvas"
    return f"""
<div id="{escape(element_id)}" style="width:100%; height:100%;">
  <canvas id="{escape(div_id)}" width="{width}" height="{height}" style="width:100%; height:100%; display:block;"></canvas>
</div>
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
<script>
(function() {{
  var canvas = document.getElementById({json.dumps(div_id)});
  if (!canvas) return;
  var payload = {payload};
  var engine = new BABYLON.Engine(canvas, true, {{ preserveDrawingBuffer: true, stencil: true }});
  var scene = new BABYLON.Scene(engine);
  scene.useRightHandedSystem = true;
  var bg = (payload.scene && payload.scene.view && payload.scene.view.bg) || "#FAFAFA";
  scene.clearColor = BABYLON.Color4.FromHexString(bg + "FF".slice(bg.length === 7 ? 0 : 2));
  var camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.4, 8, new BABYLON.Vector3(0, 0, 0), scene);
  camera.fov = 0.6;
  camera.minZ = 0.01;
  camera.wheelPrecision = 12;
  camera.wheelDeltaPercentage = 0.08;
  camera.attachControl(canvas, true);
  var hemi = new BABYLON.HemisphericLight("default-hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  var key = new BABYLON.DirectionalLight("default-key", new BABYLON.Vector3(-0.5, -1, 0.2), scene);
  key.intensity = 0.35;
  function color3(value, fallback) {{
    if (typeof value === "string" && value.length) {{
      try {{
        return BABYLON.Color3.FromHexString(value);
      }} catch (err) {{
        return fallback;
      }}
    }}
    return fallback;
  }}
  function applyPrimitiveMaterial(mesh, primitive) {{
    var material = new BABYLON.StandardMaterial(mesh.name + "-material", scene);
    material.backFaceCulling = true;
    material.diffuseColor = color3(primitive.color, new BABYLON.Color3(0.85, 0.85, 0.85));
    material.specularColor = color3(primitive.specularity, new BABYLON.Color3(0, 0, 0));
    if (primitive.alpha !== undefined) {{
      material.alpha = Number(primitive.alpha);
      if (material.alpha < 1) {{
        material.needDepthPrePass = true;
      }}
    }}
    if (primitive.wireframe) {{
      material.wireframe = true;
    }}
    mesh.material = material;
  }}
  function applyView(view) {{
    if (!view) return;
    if (view.camera) {{
      camera.setTarget(new BABYLON.Vector3(view.camera.target[0], view.camera.target[1], view.camera.target[2]));
      camera.alpha = view.camera.alpha;
      camera.beta = view.camera.beta;
      camera.radius = view.camera.radius;
      return;
    }}
    if (view.zoom !== undefined && Number(view.zoom) > 0) {{
      camera.radius = Math.max(8 / Number(view.zoom), 0.01);
    }}
  }}
  function renderAxes(radius) {{
    if (!payload.scene || payload.scene.axes === false) return;
    var size = Math.max(radius * 1.25, 1);
    BABYLON.MeshBuilder.CreateLineSystem("axes", {{
      lines: [
        [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(size, 0, 0)],
        [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, size, 0)],
        [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 0, size)]
      ],
      colors: [
        [new BABYLON.Color4(0.73, 0.11, 0.11, 1), new BABYLON.Color4(0.73, 0.11, 0.11, 1)],
        [new BABYLON.Color4(0.02, 0.47, 0.34, 1), new BABYLON.Color4(0.02, 0.47, 0.34, 1)],
        [new BABYLON.Color4(0.11, 0.30, 0.85, 1), new BABYLON.Color4(0.11, 0.30, 0.85, 1)]
      ]
    }}, scene);
  }}
  function renderBoundingBox(min, max) {{
    if (!payload.scene || payload.scene.axes === false) return;
    var boxColor = new BABYLON.Color4(0.58, 0.64, 0.72, 1);
    var corners = [
      new BABYLON.Vector3(min.x, min.y, min.z),
      new BABYLON.Vector3(max.x, min.y, min.z),
      new BABYLON.Vector3(max.x, max.y, min.z),
      new BABYLON.Vector3(min.x, max.y, min.z),
      new BABYLON.Vector3(min.x, min.y, max.z),
      new BABYLON.Vector3(max.x, min.y, max.z),
      new BABYLON.Vector3(max.x, max.y, max.z),
      new BABYLON.Vector3(min.x, max.y, max.z)
    ];
    var edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    BABYLON.MeshBuilder.CreateLineSystem("bbox", {{
      lines: edges.map(function(edge) {{
        return [corners[edge[0]], corners[edge[1]]];
      }}),
      colors: edges.map(function() {{
        return [boxColor, boxColor];
      }})
    }}, scene);
  }}
  var hasCustomLights = false;
  var min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  var max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  (payload.objects || []).forEach(function(object, index) {{
    if (object.type === "light3d") {{
      hasCustomLights = true;
      var lightType = object.light_type || "hemispheric";
      var direction = object.direction || [0, lightType === "hemispheric" ? 1 : -1, 0];
      var position = object.position || [0, 1, 0];
      var light;
      if (lightType === "point") {{
        light = new BABYLON.PointLight(object.name || ("light" + index), new BABYLON.Vector3(position[0], position[1], position[2]), scene);
      }} else if (lightType === "directional") {{
        light = new BABYLON.DirectionalLight(object.name || ("light" + index), new BABYLON.Vector3(direction[0], direction[1], direction[2]), scene);
        light.position = new BABYLON.Vector3(position[0], position[1], position[2]);
      }} else if (lightType === "spot") {{
        light = new BABYLON.SpotLight(
          object.name || ("light" + index),
          new BABYLON.Vector3(position[0], position[1], position[2]),
          new BABYLON.Vector3(direction[0], direction[1], direction[2]),
          object.angle === undefined ? Math.PI / 3 : Number(object.angle),
          object.exponent === undefined ? 1 : Number(object.exponent),
          scene
        );
      }} else {{
        light = new BABYLON.HemisphericLight(object.name || ("light" + index), new BABYLON.Vector3(direction[0], direction[1], direction[2]), scene);
      }}
      if (object.intensity !== undefined) light.intensity = Number(object.intensity);
      if (object.diffuse) light.diffuse = color3(object.diffuse, light.diffuse);
      if (object.specular) light.specular = color3(object.specular, light.specular);
      return;
    }}
    if (object.type !== "mesh3d") return;
    var mesh = new BABYLON.Mesh(object.name || ("mesh" + index), scene);
    var vertexData = new BABYLON.VertexData();
    var normals = [];
    vertexData.positions = object.vertices;
    vertexData.indices = object.indices;
    BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);
    applyPrimitiveMaterial(mesh, object);
    mesh.computeWorldMatrix(true);
    var box = mesh.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
  }});
  if (hasCustomLights) {{
    hemi.setEnabled(false);
    key.setEnabled(false);
  }}
  if (min.x !== Infinity) {{
    var center = min.add(max).scale(0.5);
    var extent = max.subtract(min);
    var radius = Math.max(extent.length() / 2, 1);
    camera.setTarget(center);
    camera.radius = radius * 2.5;
    renderBoundingBox(min, max);
    renderAxes(radius);
  }} else {{
    renderAxes(1);
  }}
  applyView(payload.scene ? payload.scene.view : null);
  engine.resize();
  engine.runRenderLoop(function() {{ scene.render(); }});
  window.addEventListener("resize", function() {{ engine.resize(); }});
}})();
</script>
"""


def _standalone_document(scene: BabylonScene, width: int, height: int, element_id: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>Babylonian</title>"
        "<style>html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; } "
        "body { background: #fafafa; } </style></head>"
        f"<body>{_widget_html(scene, width, height, element_id)}</body></html>"
    )


@dataclass
class BabylonHTMLWidget:
    scene: BabylonScene
    width: int = 900
    height: int = 700
    element_id: str = field(default_factory=lambda: f"babylonian-py-{uuid.uuid4().hex}")

    def _repr_html_(self) -> str:
        document = _standalone_document(self.scene, self.width, self.height, self.element_id)
        encoded = base64.b64encode(document.encode("utf-8")).decode("ascii")
        return (
            f"<iframe style='width:100%; max-width:{self.width}px; aspect-ratio:{self.width} / {self.height}; "
            "height:auto; border:0; display:block;' sandbox='allow-scripts allow-same-origin' "
            f"src=\"data:text/html;base64,{encoded}\"></iframe>"
        )

    def _repr_mimebundle_(self, include=None, exclude=None) -> dict[str, Any]:
        return {"text/html": self._repr_html_()}

    def _ipython_display_(self) -> None:
        from IPython.display import HTML, display

        display(HTML(self._repr_html_()))

    def save_html(self, path: str | Path) -> Path:
        path = Path(path)
        html = _standalone_document(self.scene, self.width, self.height, self.element_id)
        path.write_text(html, encoding="utf-8")
        return path


if anywidget is not None and traitlets is not None:  # pragma: no branch
    class BabylonWidget(anywidget.AnyWidget):
        _esm = Path(__file__).with_name("widget.js")

        scene_payload = traitlets.Dict().tag(sync=True)
        width = traitlets.Int(900).tag(sync=True)
        height = traitlets.Int(700).tag(sync=True)
        element_id = traitlets.Unicode().tag(sync=True)

        def __init__(self, scene: BabylonScene, width: int = 900, height: int = 700) -> None:
            super().__init__()
            self.scene_payload = scene.to_payload()
            self.width = int(width)
            self.height = int(height)
            self.element_id = f"babylonian-py-{uuid.uuid4().hex}"

        def save_html(self, path: str | Path) -> Path:
            scene = BabylonScene(
                objects=self.scene_payload.get("objects", []),
                scene=self.scene_payload.get("scene", {}),
                interaction=self.scene_payload.get("interaction"),
            )
            return BabylonHTMLWidget(
                scene=scene,
                width=self.width,
                height=self.height,
                element_id=self.element_id,
            ).save_html(path)
else:
    BabylonWidget = BabylonHTMLWidget


def scene3d(
    objects: Optional[Iterable[dict[str, Any]]] = None,
    *,
    scene: Optional[dict[str, Any]] = None,
    interaction: Optional[dict[str, Any]] = None,
) -> BabylonScene:
    return BabylonScene(objects=list(objects or []), scene=scene or {}, interaction=interaction)


def clear_scene3d() -> None:
    global _CURRENT_SCENE
    _CURRENT_SCENE = None


def as_babylon_mesh(
    x: Any = None,
    *,
    vertices: Any = None,
    faces: Any = None,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    specularity: Optional[str] = "#000000",
    name: Optional[str] = None,
    wireframe: bool = False,
    reverse_winding: bool = True,
) -> dict[str, Any]:
    flat_vertices, flat_indices = _normalize_vertices_faces(
        x,
        vertices=vertices,
        faces=faces,
        reverse_winding=reverse_winding,
    )
    mesh = {
        "type": "mesh3d",
        "vertices": flat_vertices,
        "indices": flat_indices,
    }
    if name is not None:
        mesh["name"] = str(name)
    if color is not None:
        mesh["color"] = _normalize_color(color)
    if alpha is not None:
        mesh["alpha"] = float(alpha)
    if specularity is not None:
        mesh["specularity"] = _normalize_color(specularity)
    if wireframe:
        mesh["wireframe"] = True
    return mesh


def light3d(
    *,
    type: str = "hemispheric",
    position: Optional[Sequence[float]] = None,
    direction: Optional[Sequence[float]] = None,
    intensity: float = 1.0,
    diffuse: Optional[str] = None,
    specular: Optional[str] = None,
    name: Optional[str] = None,
) -> dict[str, Any]:
    primitive = {
        "type": "light3d",
        "light_type": type,
        "intensity": float(intensity),
    }
    if name is not None:
        primitive["name"] = str(name)
    if position is not None:
        primitive["position"] = [float(x) for x in position]
    if direction is not None:
        primitive["direction"] = [float(x) for x in direction]
    if diffuse is not None:
        primitive["diffuse"] = _normalize_color(diffuse)
    if specular is not None:
        primitive["specular"] = _normalize_color(specular)
    return primitive


def render_scene3d(
    scene: BabylonScene,
    *,
    width: int = 900,
    height: int = 700,
    renderer: str = "iframe",
) -> BabylonWidget:
    scene = scene.clone()
    if renderer == "anywidget":
        return BabylonWidget(scene=scene, width=width, height=height)
    return BabylonHTMLWidget(scene=scene, width=width, height=height)


def _scene_from_object(
    x: Any,
    *,
    color: Optional[str],
    alpha: Optional[float],
    axes: bool,
    nticks: int,
    add: bool,
    wireframe: bool = False,
) -> BabylonScene:
    global _CURRENT_SCENE

    primitive = as_babylon_mesh(
        x,
        color=color,
        alpha=alpha,
        wireframe=wireframe,
    )
    if add and _CURRENT_SCENE is not None:
        scene = _CURRENT_SCENE.append(primitive)
    else:
        scene = scene3d(objects=[primitive], scene={"axes": bool(axes), "nticks": int(nticks)})
    _CURRENT_SCENE = scene.clone()
    return scene


def plot3d(
    x: Any,
    *,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    add: bool = False,
    width: int = 900,
    height: int = 700,
    renderer: str = "iframe",
) -> BabylonWidget:
    scene = _scene_from_object(
        x,
        color=color,
        alpha=alpha,
        axes=axes,
        nticks=nticks,
        add=add,
        wireframe=False,
    )
    return render_scene3d(scene, width=width, height=height, renderer=renderer)


def shade3d(
    x: Any,
    *,
    color: Optional[str] = None,
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    add: bool = False,
    width: int = 900,
    height: int = 700,
    renderer: str = "iframe",
) -> BabylonWidget:
    return plot3d(
        x,
        color=color,
        alpha=alpha,
        axes=axes,
        nticks=nticks,
        add=add,
        width=width,
        height=height,
        renderer=renderer,
    )


def wireframe3d(
    x: Any,
    *,
    color: Optional[str] = "#111111",
    alpha: Optional[float] = None,
    axes: bool = True,
    nticks: int = 5,
    add: bool = False,
    width: int = 900,
    height: int = 700,
    renderer: str = "iframe",
) -> BabylonWidget:
    scene = _scene_from_object(
        x,
        color=color,
        alpha=alpha,
        axes=axes,
        nticks=nticks,
        add=add,
        wireframe=True,
    )
    return render_scene3d(scene, width=width, height=height, renderer=renderer)
