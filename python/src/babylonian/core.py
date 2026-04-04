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
_CURRENT_SCENE: Optional["Scene"] = None
_LAST_SCENE_STATE: Optional[dict[str, Any]] = None


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


def _normalize_vector3(value: Sequence[float], *, name: str) -> list[float]:
    if len(value) != 3:
        raise ValueError(f"`{name}` must have length 3.")
    return [float(x) for x in value]


def _normalize_matrix4(value: Sequence[Sequence[float]], *, name: str) -> list[list[float]]:
    rows = [list(row) for row in value]
    if len(rows) != 4 or any(len(row) != 4 for row in rows):
        raise ValueError(f"`{name}` must have shape (4, 4).")
    return [[float(x) for x in row] for row in rows]


def _normalize_title_dict(
    *,
    main: Optional[str] = None,
    sub: Optional[str] = None,
    xlab: Optional[str] = None,
    ylab: Optional[str] = None,
    zlab: Optional[str] = None,
    color: Optional[str] = None,
    cex: Optional[float] = None,
) -> dict[str, Any]:
    title: dict[str, Any] = {}
    for key, value in {
        "main": main,
        "sub": sub,
        "xlab": xlab,
        "ylab": ylab,
        "zlab": zlab,
        "color": color,
    }.items():
        if value is not None:
            title[key] = str(value)
    if cex is not None:
        title["cex"] = float(cex)
    return title


def _normalize_scale_bar_dict(
    *,
    length: float,
    units: str = "mm",
    custom_units: Optional[str] = None,
    label: Optional[str] = None,
    position: str | Sequence[float] = "bottomleft",
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "enabled": True,
        "length": float(length),
        "units": str(units),
    }
    if units == "other":
        out["custom_units"] = None if custom_units is None else str(custom_units)
    if label is not None:
        out["label"] = str(label)
    if isinstance(position, str):
        out["position"] = position
    else:
        if len(position) != 2:
            raise ValueError("`position` must be a corner string or a length-2 numeric sequence.")
        out["position"] = [float(position[0]), float(position[1])]
    return out


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
class Scene:
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

    def clone(self) -> "Scene":
        return Scene(
            objects=deepcopy(self.objects),
            scene=deepcopy(self.scene),
            interaction=deepcopy(self.interaction),
        )

    def append(self, *objects: dict[str, Any]) -> "Scene":
        scene = self.clone()
        scene.objects.extend(deepcopy(list(objects)))
        return scene

    def add(self, *objects: dict[str, Any]) -> "Scene":
        self.objects.extend(deepcopy(list(objects)))
        return self

    def add_mesh(
        self,
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
    ) -> "Scene":
        return self.add(
            as_babylon_mesh(
                x,
                vertices=vertices,
                faces=faces,
                color=color,
                alpha=alpha,
                specularity=specularity,
                name=name,
                wireframe=wireframe,
                reverse_winding=reverse_winding,
            )
        )

    def add_light(
        self,
        *,
        type: str = "hemispheric",
        position: Optional[Sequence[float]] = None,
        direction: Optional[Sequence[float]] = None,
        intensity: float = 1.0,
        diffuse: Optional[str] = None,
        specular: Optional[str] = None,
        name: Optional[str] = None,
    ) -> "Scene":
        return self.add(
            light3d(
                type=type,
                position=position,
                direction=direction,
                intensity=intensity,
                diffuse=diffuse,
                specular=specular,
                name=name,
            )
        )

    def with_axes(self, axes: bool = True, *, nticks: Optional[int] = None) -> "Scene":
        self.scene["axes"] = bool(axes)
        if nticks is not None:
            self.scene["nticks"] = int(nticks)
        return self

    def with_view(
        self,
        *,
        zoom: Optional[float] = None,
        user_matrix: Optional[Sequence[Sequence[float]]] = None,
        bg: Optional[str] = None,
        camera: Optional[dict[str, Any]] = None,
    ) -> "Scene":
        view = deepcopy(self.scene.get("view", _default_view()))
        if zoom is not None:
            view["zoom"] = float(zoom)
        if user_matrix is not None:
            view["userMatrix"] = _normalize_matrix4(user_matrix, name="user_matrix")
        if bg is not None:
            view["bg"] = _normalize_color(bg)
        if camera is not None:
            next_camera = deepcopy(view.get("camera", {}))
            if "alpha" in camera:
                next_camera["alpha"] = float(camera["alpha"])
            if "beta" in camera:
                next_camera["beta"] = float(camera["beta"])
            if "radius" in camera:
                next_camera["radius"] = float(camera["radius"])
            if "target" in camera:
                next_camera["target"] = _normalize_vector3(camera["target"], name="camera.target")
            view["camera"] = next_camera
        self.scene["view"] = view
        return self

    def with_title(
        self,
        main: Optional[str] = None,
        *,
        sub: Optional[str] = None,
        xlab: Optional[str] = None,
        ylab: Optional[str] = None,
        zlab: Optional[str] = None,
        color: Optional[str] = None,
        cex: Optional[float] = None,
    ) -> "Scene":
        title = deepcopy(self.scene.get("title", {}))
        title.update(
            _normalize_title_dict(
                main=main,
                sub=sub,
                xlab=xlab,
                ylab=ylab,
                zlab=zlab,
                color=color,
                cex=cex,
            )
        )
        self.scene["title"] = title
        return self

    def with_scale_bar(
        self,
        length: float,
        *,
        units: str = "mm",
        custom_units: Optional[str] = None,
        label: Optional[str] = None,
        position: str | Sequence[float] = "bottomleft",
    ) -> "Scene":
        self.scene["scale_bar"] = _normalize_scale_bar_dict(
            length=length,
            units=units,
            custom_units=custom_units,
            label=label,
            position=position,
        )
        return self

    def show(
        self,
        *,
        width: int = 900,
        height: int = 700,
        renderer: str = "iframe",
    ) -> "BabylonWidget":
        return render_scene3d(self, width=width, height=height, renderer=renderer)

    def save_html(
        self,
        path: str | Path,
        *,
        width: int = 900,
        height: int = 700,
    ) -> Path:
        widget = BabylonHTMLWidget(scene=self, width=width, height=height)
        return widget.save_html(path)

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


def _widget_html(scene: Scene, width: int, height: int, element_id: str) -> str:
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
  function emitHostEvent(eventName, value) {{
    var payload = {{
      source: "babylonian",
      widgetId: {json.dumps(element_id)},
      event: eventName,
      value: value
    }};
    try {{
      window.dispatchEvent(new CustomEvent("babylonian-host-event", {{ detail: payload }}));
    }} catch (err) {{}}
    try {{
      if (window.parent && window.parent !== window && typeof window.parent.postMessage === "function") {{
        window.parent.postMessage(payload, "*");
      }}
    }} catch (err) {{}}
  }}
  function currentPar3dState() {{
    var target = camera.getTarget();
    return {{
      zoom: camera.radius > 0 ? 8 / camera.radius : 0.05,
      bg: bg,
      camera: {{
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: [target.x, target.y, target.z]
      }}
    }};
  }}
  function currentSceneState() {{
    var nextPayload = JSON.parse(JSON.stringify(payload || {{}}));
    if (!nextPayload.scene) {{
      nextPayload.scene = {{}};
    }}
    nextPayload.scene.view = currentPar3dState();
    return nextPayload;
  }}
  var publishViewStateHandle = null;
  function scheduleHostStatePublish() {{
    if (publishViewStateHandle !== null) {{
      return;
    }}
    publishViewStateHandle = window.requestAnimationFrame(function() {{
      publishViewStateHandle = null;
      emitHostEvent("par3d", currentPar3dState());
      emitHostEvent("scene_state", currentSceneState());
    }});
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
  camera.onViewMatrixChangedObservable.add(function() {{
    scheduleHostStatePublish();
  }});
  engine.resize();
  engine.runRenderLoop(function() {{ scene.render(); }});
  window.addEventListener("resize", function() {{ engine.resize(); }});
  scheduleHostStatePublish();
}})();
</script>
"""


def _standalone_document(scene: Scene, width: int, height: int, element_id: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>Babylonian</title>"
        "<style>html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; } "
        "body { background: #fafafa; } </style></head>"
        f"<body>{_widget_html(scene, width, height, element_id)}</body></html>"
    )


@dataclass
class BabylonHTMLWidget:
    scene: Scene
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

        def __init__(self, scene: Scene, width: int = 900, height: int = 700) -> None:
            super().__init__()
            self.scene_payload = scene.to_payload()
            self.width = int(width)
            self.height = int(height)
            self.element_id = f"babylonian-py-{uuid.uuid4().hex}"

        def save_html(self, path: str | Path) -> Path:
            scene = Scene(
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


BabylonScene = Scene


def scene3d(
    objects: Optional[Iterable[dict[str, Any]]] = None,
    *,
    scene: Optional[dict[str, Any]] = None,
    interaction: Optional[dict[str, Any]] = None,
) -> Scene:
    return Scene(objects=list(objects or []), scene=scene or {}, interaction=interaction)


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
    scene: Scene,
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
) -> Scene:
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


# ---------------------------------------------------------------------------
# Scene-state helpers (mirrors interaction.R)
# ---------------------------------------------------------------------------

def _editable_mesh_primitive_types() -> tuple[str, ...]:
    return ("sphere", "box", "plane", "cylinder", "cone", "mesh3d")


def _normalize_morph_influence(x: Any) -> float:
    return max(0.0, min(1.0, float(x)))


def _normalize_transform_vector(x: Any, name: str) -> list[float]:
    """Validate and return a length-3 finite numeric list."""
    if isinstance(x, dict):
        x = [x.get("x", 0.0), x.get("y", 0.0), x.get("z", 0.0)]
    if hasattr(x, "tolist"):
        x = x.tolist()
    x = list(x)
    if len(x) != 3:
        raise ValueError(f"`{name}` must be a finite numeric vector of length 3.")
    result = [float(v) for v in x]
    if any(v != v for v in result):  # NaN check
        raise ValueError(f"`{name}` must contain finite values.")
    return result


def _seed_scene_state_entry(obj: dict[str, Any], index: int) -> Optional[dict[str, Any]]:
    """Build an initial scene-state entry from an object dict (1-based index).

    Mirrors ``seed_scene_state_entry`` in R/interaction.R.
    """
    if obj.get("type") is None:
        return None

    entry: dict[str, Any] = {
        "index": index,
        "primitive_type": obj["type"],
    }

    if obj.get("name") is not None:
        entry["name"] = str(obj["name"])

    if obj["type"] == "light3d":
        entry["node_type"] = "light"
        entry["light_type"] = obj.get("light_type", "hemispheric")
        if obj.get("position") is not None:
            entry["position"] = _normalize_transform_vector(obj["position"], "position")
        if obj.get("direction") is not None:
            entry["direction"] = _normalize_transform_vector(obj["direction"], "direction")
        for nm in (
            "intensity", "diffuse", "specular", "ground_color", "angle",
            "exponent", "range", "enabled", "shadow_enabled", "shadow_darkness",
        ):
            if obj.get(nm) is not None:
                entry[nm] = obj[nm]
        return entry

    if obj["type"] in _editable_mesh_primitive_types():
        entry["node_type"] = "mesh"
        entry["position"] = _normalize_transform_vector(
            obj.get("position", [0, 0, 0]), "position"
        )
        entry["rotation"] = _normalize_transform_vector(
            obj.get("rotation", [0, 0, 0]), "rotation"
        )
        entry["scaling"] = _normalize_transform_vector(
            obj.get("scaling", [1, 1, 1]), "scaling"
        )
        if obj.get("show_bounding_box") is not None:
            entry["show_bounding_box"] = bool(obj["show_bounding_box"])
        if obj.get("material") is not None:
            entry["material"] = deepcopy(obj["material"])
        if obj.get("morph_target") is not None:
            entry["morph_target"] = [
                {
                    "name": t.get("name"),
                    "influence": _normalize_morph_influence(t.get("influence", 0)),
                }
                for t in obj["morph_target"]
            ]
        return entry

    return None


def _scene_state_from_scene(scene: "Scene") -> dict[str, Any]:
    """Extract the initial scene-state dict from a Scene object.

    Mirrors ``scene_state_from_widget`` in R/interaction.R.
    """
    entries = []
    for i, obj in enumerate(scene.objects):
        entry = _seed_scene_state_entry(obj, i + 1)  # 1-based, matching R
        if entry is not None:
            entries.append(entry)

    return {
        "view": deepcopy(scene.scene.get("view")),
        "postprocess": scene.scene.get("postprocess"),
        "scale_bar": scene.scene.get("scale_bar"),
        "clipping": scene.scene.get("clipping"),
        "objects": entries,
        "removed_objects": [],
    }


def _normalize_scene_state_lookup(x: dict[str, Any]) -> dict[str, Any]:
    """Normalize a single removed-object lookup entry.

    Mirrors ``normalize_scene_state_lookup`` in R/interaction.R.
    """
    entry: dict[str, Any] = {"index": int(x["index"])}
    if not (entry["index"] >= 1):
        raise ValueError("Removed scene-state object indices must be positive integers.")
    if x.get("name") is not None:
        entry["name"] = str(x["name"])
    if x.get("primitive_type") is not None:
        entry["primitive_type"] = str(x["primitive_type"])
    if x.get("node_type") is not None:
        entry["node_type"] = str(x["node_type"])
    return entry


def _normalize_scene_state_entry(x: dict[str, Any]) -> dict[str, Any]:
    """Normalize a single scene-state object entry.

    Mirrors ``normalize_scene_state_entry`` in R/interaction.R.
    """
    entry: dict[str, Any] = {
        "index": int(x["index"]),
        "primitive_type": x.get("primitive_type") or x.get("type"),
        "node_type": x.get("node_type"),
    }

    if not (entry["index"] >= 1):
        raise ValueError("Scene state object indices must be positive integers.")

    if x.get("name") is not None:
        entry["name"] = str(x["name"])

    for nm in ("position", "rotation", "scaling", "direction"):
        if x.get(nm) is not None:
            entry[nm] = _normalize_transform_vector(x[nm], nm)

    if x.get("material") is not None:
        entry["material"] = deepcopy(x["material"])

    if x.get("show_bounding_box") is not None:
        entry["show_bounding_box"] = bool(x["show_bounding_box"])

    if x.get("morph_target") is not None:
        mt = x["morph_target"]
        # A bare single-target dict (not wrapped in a list)
        if isinstance(mt, dict) and ("influence" in mt or "name" in mt):
            mt = [mt]
        entry["morph_target"] = [
            {
                "name": t.get("name"),
                "influence": _normalize_morph_influence(t.get("influence", 0)),
            }
            for t in mt
        ]

    if x.get("light_type") is not None:
        entry["light_type"] = str(x["light_type"])

    for nm in ("intensity", "angle", "exponent", "range", "shadow_darkness"):
        if x.get(nm) is not None:
            entry[nm] = float(x[nm])

    for nm in ("diffuse", "ground_color"):
        if x.get(nm) is not None:
            entry[nm] = str(x[nm])

    if x.get("specular") is not None:
        entry["specular"] = str(x["specular"])

    if x.get("enabled") is not None:
        entry["enabled"] = bool(x["enabled"])

    if x.get("shadow_enabled") is not None:
        entry["shadow_enabled"] = bool(x["shadow_enabled"])

    if x.get("created_in_editor") is not None:
        entry["created_in_editor"] = bool(x["created_in_editor"])

    return entry


def _normalize_scene_state(x: Optional[Any]) -> Optional[dict[str, Any]]:
    """Validate and normalise an edit_scene3d() scene-state dict.

    Accepts a dict, a JSON string, or None.  Mirrors ``normalize_scene_state``
    in R/interaction.R.
    """
    if x is None:
        return None

    if isinstance(x, str):
        try:
            x = json.loads(x)
        except (json.JSONDecodeError, ValueError) as exc:
            raise TypeError(
                "`state` must be a dict returned by `edit_scene3d()`."
            ) from exc

    if not isinstance(x, dict):
        raise TypeError("`state` must be a dict returned by `edit_scene3d()`.")

    state: dict[str, Any] = {
        "view": None,
        "postprocess": None,
        "scale_bar": None,
        "clipping": None,
        "objects": [],
        "removed_objects": [],
    }

    if x.get("view") is not None:
        state["view"] = deepcopy(x["view"])

    for nm in ("postprocess", "scale_bar", "clipping"):
        if x.get(nm) is not None:
            state[nm] = deepcopy(x[nm])

    objects = x.get("objects") or []
    if objects:
        state["objects"] = [_normalize_scene_state_entry(e) for e in objects]

    removed = x.get("removed_objects") or []
    if removed:
        state["removed_objects"] = [_normalize_scene_state_lookup(e) for e in removed]

    for nm in ("selected", "gizmo_mode", "gizmos_visible"):
        if x.get(nm) is not None:
            state[nm] = x[nm]

    return state


def _set_last_scene_state(state: Optional[Any]) -> None:
    global _LAST_SCENE_STATE
    _LAST_SCENE_STATE = _normalize_scene_state(state)


def _locate_scene_state_object(
    objects: list[dict[str, Any]], entry: dict[str, Any]
) -> Optional[int]:
    """Return the 0-based index of the object matching *entry*, or None.

    Name takes priority; falls back to 1-based ``index`` field.
    Mirrors ``locate_scene_state_object`` in R/interaction.R.
    """
    if entry.get("name") is not None:
        matches = [i for i, obj in enumerate(objects) if obj.get("name") == entry["name"]]
        if len(matches) == 1:
            return matches[0]

    idx = int(entry["index"]) - 1  # 1-based (R) → 0-based (Python)
    if 0 <= idx < len(objects):
        return idx

    return None


def _apply_scene_state_entry(
    obj: dict[str, Any], entry: dict[str, Any]
) -> dict[str, Any]:
    """Return a new object dict with *entry*'s edits applied.

    Mirrors ``apply_scene_state_entry`` in R/interaction.R.
    """
    obj = deepcopy(obj)

    for nm in ("position", "rotation", "scaling", "direction"):
        if entry.get(nm) is not None:
            obj[nm] = _normalize_transform_vector(entry[nm], nm)

    for nm in (
        "intensity", "angle", "exponent", "range", "enabled",
        "light_type", "shadow_enabled", "shadow_darkness",
    ):
        if entry.get(nm) is not None:
            obj[nm] = entry[nm]

    for nm in ("diffuse", "specular", "ground_color"):
        if entry.get(nm) is not None:
            obj[nm] = entry[nm]

    if entry.get("material") is not None:
        obj["material"] = deepcopy(entry["material"])

    if entry.get("show_bounding_box") is not None:
        obj["show_bounding_box"] = bool(entry["show_bounding_box"])

    if entry.get("morph_target") is not None and obj.get("morph_target") is not None:
        for i in range(min(len(entry["morph_target"]), len(obj["morph_target"]))):
            obj["morph_target"][i]["influence"] = _normalize_morph_influence(
                entry["morph_target"][i].get("influence", 0)
            )
            if entry["morph_target"][i].get("name") is not None:
                obj["morph_target"][i]["name"] = entry["morph_target"][i]["name"]

    return obj


def _create_scene_object_from_state(entry: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Create a new scene object from an editor-created state entry.

    Currently only handles ``light3d`` (the only type the R editor can add).
    Mirrors ``create_scene_object_from_state`` in R/interaction.R.
    """
    primitive_type = entry.get("primitive_type")

    if primitive_type == "light3d":
        obj: dict[str, Any] = {
            "type": "light3d",
            "light_type": entry.get("light_type", "hemispheric"),
            "intensity": float(entry.get("intensity", 1.0)),
        }
        for nm in ("name", "position", "direction", "diffuse", "specular", "ground_color"):
            if entry.get(nm) is not None:
                obj[nm] = entry[nm]
        if entry.get("enabled") is not None:
            obj["enabled"] = bool(entry["enabled"])
        return obj

    return None


def _apply_scene_state_to_objects(
    objects: list[dict[str, Any]],
    edits: list[dict[str, Any]],
    removed_objects: Optional[list[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Apply a list of scene-state edits (and optional removals) to *objects*.

    Returns a new list; does not mutate the input.
    Mirrors ``apply_scene_state_to_objects`` in R/interaction.R.
    """
    removed = removed_objects or []

    if not edits and not removed:
        return list(objects)

    edited = list(objects)

    # Remove objects in descending index order so earlier removals don't shift
    # the indices of later ones (same logic as R).
    if removed:
        for entry in sorted(removed, key=lambda e: int(e["index"]), reverse=True):
            idx = _locate_scene_state_object(edited, entry)
            if idx is not None:
                del edited[idx]

    for entry in edits:
        idx = _locate_scene_state_object(edited, entry)
        if idx is None:
            created = _create_scene_object_from_state(entry)
            if created is not None:
                edited.append(created)
        else:
            edited[idx] = _apply_scene_state_entry(edited[idx], entry)

    return edited


def _is_interactive() -> bool:
    """Return True when running inside an interactive IPython/Jupyter session."""
    try:
        shell = get_ipython()  # type: ignore[name-defined]
        return shell is not None
    except NameError:
        return False


# ---------------------------------------------------------------------------
# Public edit-scene API
# ---------------------------------------------------------------------------

def last_scene_state() -> Optional[dict[str, Any]]:
    """Return the most recent scene state captured by :func:`edit_scene3d`.

    Returns ``None`` if no editing session has completed yet.
    Mirrors ``last_scene_state()`` in R/interaction.R.
    """
    return _LAST_SCENE_STATE


def apply_scene_state(
    x: Optional[Any] = None,
    state: Optional[Any] = None,
    **kwargs: Any,
) -> "Scene":
    """Apply a saved scene editor state to a scene.

    Reapplies a scene state returned by :func:`edit_scene3d` — restoring
    mesh transforms, light placement, material assignments, morph-target
    influences, camera pose, post-processing, scale-bar, and clipping-plane
    settings — and returns the updated :class:`Scene`.

    Parameters
    ----------
    x:
        A :class:`Scene` or any object accepted by :func:`plot3d`.  When
        omitted the current accumulated scene (set by :func:`plot3d`) is used.
    state:
        Scene state dict as returned by :func:`edit_scene3d`.  Defaults to
        the value of :func:`last_scene_state`.

    Mirrors ``apply_scene_state()`` in R/interaction.R.
    """
    global _CURRENT_SCENE

    if state is None:
        state = last_scene_state()

    state = _normalize_scene_state(state)
    if state is None:
        raise RuntimeError(
            "No scene state is available. Run `edit_scene3d()` first or pass `state`."
        )

    if x is None:
        if _CURRENT_SCENE is None:
            raise RuntimeError(
                "No active scene available. Plot a scene first or pass `x`."
            )
        scene = _CURRENT_SCENE.clone()
    elif isinstance(x, Scene):
        scene = x.clone()
    else:
        scene = _scene_from_object(
            x, color=None, alpha=None, axes=True, nticks=5, add=False
        )

    edits = state.get("objects", [])
    removed = state.get("removed_objects", [])
    scene.objects = _apply_scene_state_to_objects(scene.objects, edits, removed)

    if state.get("view") is not None:
        current_view = deepcopy(scene.scene.get("view", _default_view()))
        current_view.update(state["view"])
        scene.scene["view"] = current_view

    for nm in ("postprocess", "scale_bar", "clipping"):
        if state.get(nm) is not None:
            scene.scene[nm] = deepcopy(state[nm])

    _set_last_scene_state(state)
    return scene


def edit_scene3d(
    x: Any,
    *,
    width: Optional[int] = None,
    height: Optional[int] = None,
    **kwargs: Any,
) -> Any:
    """Interactively edit mesh and light transforms in a 3D scene.

    Opens a Babylonian scene editor with native BabylonJS gizmos for mesh
    and light primitives.  The returned object captures the camera pose plus
    edited mesh transforms and light placement so it can be reused later with
    :func:`apply_scene_state`.

    In interactive Jupyter/IPython contexts an :class:`EditSceneWidget` is
    returned; its :attr:`~EditSceneWidget.scene_state` property updates live
    as you interact with the browser editor, and :func:`last_scene_state`
    always reflects the latest captured state.

    In non-interactive contexts (scripts, CI) a :class:`Scene` with
    ``interaction = {"mode": "edit_scene3d"}`` is returned so the payload can
    still be serialised via :meth:`~Scene.save_html` or :meth:`~Scene.to_json`.

    Parameters
    ----------
    x:
        A :class:`Scene` or any object accepted by :func:`plot3d`.
    width:
        Widget width in pixels (default 1 100).
    height:
        Widget height in pixels (default 800).

    Mirrors ``edit_scene3d()`` in R/interaction.R.
    """
    if isinstance(x, Scene):
        scene = x.clone()
    elif hasattr(x, "scene") and isinstance(getattr(x, "scene", None), Scene):
        # BabylonHTMLWidget / BabylonWidget already wrapping a Scene
        scene = x.scene.clone()
    elif hasattr(x, "scene_payload") and isinstance(getattr(x, "scene_payload", None), dict):
        # anywidget BabylonWidget — reconstruct Scene from payload
        p = x.scene_payload
        scene = Scene(
            objects=p.get("objects", []),
            scene=p.get("scene", {}),
            interaction=p.get("interaction"),
        )
    else:
        scene = _scene_from_object(
            x, color=None, alpha=None, axes=True, nticks=5, add=False, **kwargs
        )

    scene = scene.clone()
    scene.interaction = {"mode": "edit_scene3d"}

    w = int(width) if width is not None else 1100
    h = int(height) if height is not None else 800

    initial_state = _scene_state_from_scene(scene)
    _set_last_scene_state(initial_state)

    if not _is_interactive():
        return scene

    # Lazy import so the interactive path does not import heavy deps at
    # module load time and works even when anywidget is absent.
    from .interaction import _make_edit_widget  # noqa: PLC0415
    return _make_edit_widget(scene, width=w, height=h)
