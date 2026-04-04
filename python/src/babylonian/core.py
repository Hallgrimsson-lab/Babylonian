from __future__ import annotations

import base64
from copy import deepcopy
from dataclasses import dataclass, field
from html import escape
import json
import os
from pathlib import Path
import uuid
from typing import Any, Iterable, Optional, Sequence

try:
    import anywidget
    import traitlets
except ImportError:  # pragma: no cover - fallback when notebook deps are absent
    anywidget = None
    traitlets = None


import re
import time

SCHEMA_NAME = "babylonian.scene"
SCHEMA_VERSION = "0.1.0"
_CURRENT_SCENE: Optional["Scene"] = None
_LAST_ANYWIDGET: Optional[Any] = None  # last BabylonWidget rendered (for snapshot3d)

# ---------------------------------------------------------------------------
# Local BabylonJS library files (copied from inst/htmlwidgets/lib at install).
# Read once at module load so every renderer can use them without a CDN fetch.
# ---------------------------------------------------------------------------
_LIB_DIR = Path(__file__).parent / "lib"
_BABYLON_JS: str = (_LIB_DIR / "babylon.js").read_text(encoding="utf-8")
_BABYLON_LOADERS_JS: str = (_LIB_DIR / "babylonjs.loaders.min.js").read_text(encoding="utf-8")
# Combined ESM for the anywidget renderer: babylon.js and loaders are prepended
# to widget.js so they execute in the same ESM module scope.  Inside a real ESM
# neither `define` (RequireJS) nor `exports` (CommonJS) are in scope, so the
# UMD wrappers in both libraries fall through to `e.BABYLON = t()` (e = self =
# window) — no CDN required and no RequireJS interference.
_WIDGET_JS: str = (Path(__file__).with_name("widget.js")).read_text(encoding="utf-8")


def _in_ipython_kernel() -> bool:
    try:
        from IPython import get_ipython
    except ImportError:
        return False
    shell = get_ipython()
    return shell is not None and shell.__class__.__name__ == "ZMQInteractiveShell"


def _should_explicitly_display() -> bool:
    return _in_ipython_kernel() and "VSCODE_PID" in os.environ


def _display_in_notebook(widget: Any) -> None:
    if not _should_explicitly_display():
        return
    try:
        from IPython.display import display
    except ImportError:
        return
    display(widget)


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
        # Accept a file path — load with trimesh if available.
        if isinstance(x, (str, Path)):
            file_path = Path(x)
            if file_path.exists():
                try:
                    import trimesh
                except ImportError:
                    raise ImportError(
                        "trimesh is required to load mesh files.  "
                        "Install it with: pip install trimesh"
                    )
                x = trimesh.load(str(file_path), force="mesh")
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
                "`plot3d()` / `add_mesh()` accepts a file path, trimesh.Trimesh, "
                "a (vertices, faces) tuple, or a dict with `vertices` and `faces`."
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


_SUPPORTED_MODEL_FORMATS = {"obj", "stl", "ply", "gltf", "glb", "babylon"}


def _resolve_obj_companions(file_path: Path) -> dict[str, str]:
    """Find and base64-encode companion files for an OBJ (e.g. MTL + textures)."""
    companions: dict[str, str] = {}
    text = file_path.read_text(encoding="utf-8", errors="replace")
    for match in re.finditer(r"^mtllib\s+(.+)$", text, re.MULTILINE):
        mtl_name = match.group(1).strip()
        mtl_path = file_path.parent / mtl_name
        if mtl_path.exists():
            companions[mtl_name] = base64.b64encode(
                mtl_path.read_bytes()
            ).decode("ascii")
            # Scan the MTL for texture map references.
            mtl_text = mtl_path.read_text(encoding="utf-8", errors="replace")
            for tex_match in re.finditer(
                r"^(?:map_Kd|map_Ks|map_Ka|map_Bump|map_d|bump|disp|refl)\s+(.+)$",
                mtl_text,
                re.MULTILINE,
            ):
                tex_name = tex_match.group(1).strip()
                tex_path = mtl_path.parent / tex_name
                if tex_path.exists() and tex_name not in companions:
                    companions[tex_name] = base64.b64encode(
                        tex_path.read_bytes()
                    ).decode("ascii")
    return companions


def _resolve_gltf_companions(file_path: Path) -> dict[str, str]:
    """Find and base64-encode companion files for a GLTF (bin + images)."""
    companions: dict[str, str] = {}
    gltf = json.loads(file_path.read_text(encoding="utf-8"))
    for buf in gltf.get("buffers", []):
        uri = buf.get("uri", "")
        if uri and not uri.startswith("data:"):
            buf_path = file_path.parent / uri
            if buf_path.exists():
                companions[uri] = base64.b64encode(buf_path.read_bytes()).decode("ascii")
    for img in gltf.get("images", []):
        uri = img.get("uri", "")
        if uri and not uri.startswith("data:"):
            img_path = file_path.parent / uri
            if img_path.exists():
                companions[uri] = base64.b64encode(img_path.read_bytes()).decode("ascii")
    return companions


def import_model3d(
    file: str | Path,
    *,
    name: Optional[str] = None,
    position: Optional[Sequence[float]] = None,
    rotation: Optional[Sequence[float]] = None,
    scaling: Optional[Sequence[float]] = None,
    preserve_materials: bool = True,
) -> dict[str, Any]:
    """Import a 3D model file (OBJ, GLTF, GLB, STL, PLY) for use in a scene.

    The file is base64-encoded so it can be transferred to the browser without
    a dedicated file server.

    Parameters
    ----------
    file:
        Path to a 3D model file.
    name:
        Display name.  Defaults to the file stem.
    position, rotation, scaling:
        Optional 3-element sequences for initial transform.
    preserve_materials:
        Whether to keep the model's authored materials (default True).

    Returns
    -------
    A dict suitable for ``Scene.add()`` with ``type="asset3d"``.
    """
    file_path = Path(file).resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"Model file not found: {file_path}")

    fmt = file_path.suffix.lstrip(".").lower()
    if fmt not in _SUPPORTED_MODEL_FORMATS:
        raise ValueError(
            f"Unsupported format '.{fmt}'. Supported: {', '.join(sorted(_SUPPORTED_MODEL_FORMATS))}"
        )

    data_b64 = base64.b64encode(file_path.read_bytes()).decode("ascii")

    # Resolve companion files (MTL for OBJ, bin/images for GLTF).
    companions: dict[str, str] = {}
    if fmt == "obj":
        companions = _resolve_obj_companions(file_path)
    elif fmt == "gltf":
        companions = _resolve_gltf_companions(file_path)

    obj: dict[str, Any] = {
        "type": "asset3d",
        "file": file_path.name,
        "format": fmt,
        "name": name or file_path.stem,
        "data_b64": data_b64,
        "preserve_materials": bool(preserve_materials),
    }
    if companions:
        obj["companion_files"] = companions
    if position is not None:
        obj["position"] = _normalize_vector3(list(position), name="position")
    if rotation is not None:
        obj["rotation"] = _normalize_vector3(list(rotation), name="rotation")
    if scaling is not None:
        obj["scaling"] = _normalize_vector3(list(scaling), name="scaling")
    return obj


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

    def add_model(
        self,
        file: str | Path,
        *,
        name: Optional[str] = None,
        position: Optional[Sequence[float]] = None,
        rotation: Optional[Sequence[float]] = None,
        scaling: Optional[Sequence[float]] = None,
        preserve_materials: bool = True,
    ) -> "Scene":
        """Import a 3D model file and add it to the scene.

        See :func:`import_model3d` for supported formats and details.
        """
        return self.add(
            import_model3d(
                file,
                name=name,
                position=position,
                rotation=rotation,
                scaling=scaling,
                preserve_materials=preserve_materials,
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
        renderer: str | None = None,
    ) -> "BabylonWidget":
        if renderer is None:
            renderer = "anywidget" if anywidget is not None else "iframe"
        widget = render_scene3d(self, width=width, height=height, renderer=renderer)
        _display_in_notebook(widget)
        return widget

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
    err_id = f"{element_id}-err"
    return f"""
<div id="{escape(element_id)}" style="width:{width}px; height:{height}px; max-width:100%; position:relative;">
  <canvas id="{escape(div_id)}" width="{width}" height="{height}" style="width:100%; height:100%; display:block;"></canvas>
  <div id="{escape(element_id)}-scalebar" style="position:absolute; z-index:9; pointer-events:none; display:none;"></div>
  <div id="{escape(err_id)}" style="display:none; position:absolute; inset:0; background:#1e1e1e; color:#f87171;
       font-family:monospace; font-size:13px; padding:16px; white-space:pre-wrap; overflow:auto;"></div>
</div>
<script>
(function() {{
  var errEl = document.getElementById({json.dumps(err_id)});
  function showError(msg) {{
    if (errEl) {{ errEl.style.display = "block"; errEl.textContent = msg; }}
    console.error("[Babylonian]", msg);
  }}
  try {{ initScene(); }} catch(e) {{ showError("BabylonJS init error:\\n" + e); }}
  function initScene() {{
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
      if (view.camera.target) {{
        camera.setTarget(new BABYLON.Vector3(view.camera.target[0], view.camera.target[1], view.camera.target[2]));
      }}
      if (view.camera.alpha !== undefined) camera.alpha = view.camera.alpha;
      if (view.camera.beta !== undefined) camera.beta = view.camera.beta;
      if (view.camera.radius !== undefined) camera.radius = view.camera.radius;
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
  var scaleBarEl = document.getElementById({json.dumps(f"{element_id}-scalebar")});
  function renderScaleBar() {{
    var sb = payload.scene && payload.scene.scale_bar;
    if (!sb || !sb.enabled || !sb.length) {{ scaleBarEl.style.display = "none"; return; }}
    var V3 = BABYLON.Vector3;
    var center = (min.x !== Infinity) ? min.add(max).scale(0.5) : V3.Zero();
    var viewMat = camera.getViewMatrix();
    var projMat = camera.getProjectionMatrix();
    var vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    var right = V3.TransformNormal(V3.Right(), camera.getWorldMatrix());
    right.normalize();
    var hl = sb.length / 2;
    var p1 = center.add(right.scale(-hl));
    var p2 = center.add(right.scale(hl));
    var s1 = V3.Project(p1, BABYLON.Matrix.Identity(), viewMat.multiply(projMat), vp);
    var s2 = V3.Project(p2, BABYLON.Matrix.Identity(), viewMat.multiply(projMat), vp);
    var pxLen = Math.abs(s2.x - s1.x);
    if (pxLen < 2 || !isFinite(pxLen)) {{ scaleBarEl.style.display = "none"; return; }}
    var unitLabel = "";
    if (sb.units === "other" && sb.custom_units) unitLabel = sb.custom_units;
    else if (sb.units) unitLabel = sb.units;
    var text = sb.label || (sb.length + " " + unitLabel).trim();
    var svgW = Math.round(pxLen), tickH = 14;
    var svg = '<svg width="' + svgW + '" height="' + (tickH+2) + '" xmlns="http://www.w3.org/2000/svg">'
      + '<line x1="0" y1="' + tickH + '" x2="' + svgW + '" y2="' + tickH + '" stroke="#222" stroke-width="2"/>'
      + '<line x1="1" y1="' + (tickH-8) + '" x2="1" y2="' + tickH + '" stroke="#222" stroke-width="2"/>'
      + '<line x1="' + (svgW-1) + '" y1="' + (tickH-8) + '" x2="' + (svgW-1) + '" y2="' + tickH + '" stroke="#222" stroke-width="2"/>'
      + '</svg>';
    scaleBarEl.innerHTML = '<div style="display:inline-block;background:rgba(255,255,255,0.88);border-radius:4px;'
      + 'padding:4px 10px 6px;box-shadow:0 1px 3px rgba(0,0,0,0.25);font-family:Menlo,Monaco,Consolas,monospace;'
      + 'font-size:12px;color:#222;text-align:center;">' + svg + '<div style="margin-top:2px;">' + text + '</div></div>';
    scaleBarEl.style.display = "block";
    scaleBarEl.style.left = "auto"; scaleBarEl.style.right = "auto";
    scaleBarEl.style.top = "auto"; scaleBarEl.style.bottom = "auto";
    var pos = sb.position || "bottomright";
    if (Array.isArray(pos)) {{ scaleBarEl.style.left = pos[0]+"px"; scaleBarEl.style.top = pos[1]+"px"; }}
    else {{
      if (pos.indexOf("bottom") >= 0) scaleBarEl.style.bottom = "48px"; else scaleBarEl.style.top = "12px";
      if (pos.indexOf("left") >= 0) scaleBarEl.style.left = "12px"; else scaleBarEl.style.right = "12px";
    }}
  }}
  // --- asset loading helpers ---
  function b64ToBlob(b64, mime) {{
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], {{ type: mime || "application/octet-stream" }});
  }}
  function mimeForFormat(fmt) {{
    var m = {{ obj:"model/obj", gltf:"model/gltf+json", glb:"model/gltf-binary", stl:"model/stl", ply:"application/x-ply" }};
    return m[fmt] || "application/octet-stream";
  }}
  function loadAsset(object) {{
    return new Promise(function(resolve, reject) {{
      var mainBlob = b64ToBlob(object.data_b64, mimeForFormat(object.format));
      var mainUrl = URL.createObjectURL(mainBlob);
      var companionMap = {{}};
      if (object.companion_files) {{
        Object.keys(object.companion_files).forEach(function(fname) {{
          companionMap[fname] = URL.createObjectURL(b64ToBlob(object.companion_files[fname]));
        }});
      }}
      var origPreprocess = BABYLON.Tools.PreprocessUrl;
      BABYLON.Tools.PreprocessUrl = function(url) {{
        var parts = url.split("/"); var basename = parts[parts.length-1].split("?")[0];
        if (companionMap[basename]) return companionMap[basename];
        return origPreprocess ? origPreprocess(url) : url;
      }};
      BABYLON.SceneLoader.LoadAssetContainer("", mainUrl, scene, function(container) {{
        BABYLON.Tools.PreprocessUrl = origPreprocess;
        var root = new BABYLON.TransformNode(object.name || "asset", scene);
        container.meshes.forEach(function(m) {{ if (!m.parent) m.parent = root; }});
        if (object.position) root.position = new BABYLON.Vector3(object.position[0], object.position[1], object.position[2]);
        if (object.rotation) root.rotation = new BABYLON.Vector3(object.rotation[0], object.rotation[1], object.rotation[2]);
        if (object.scaling) root.scaling = new BABYLON.Vector3(object.scaling[0], object.scaling[1], object.scaling[2]);
        if (object.preserve_materials === false) {{
          container.meshes.forEach(function(m) {{ applyPrimitiveMaterial(m, object); }});
        }}
        container.addAllToScene();
        container.meshes.forEach(function(m) {{
          if (!m.getBoundingInfo) return;
          m.computeWorldMatrix(true);
          var box = m.getBoundingInfo().boundingBox;
          min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
          max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
        }});
        resolve();
      }}, null, function(_scene, msg) {{
        BABYLON.Tools.PreprocessUrl = origPreprocess;
        reject(new Error(msg || "Asset load failed"));
      }}, "." + (object.format || "glb"));
    }});
  }}
  // --- process objects ---
  var hasCustomLights = false;
  var min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  var max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  var assetPromises = [];
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
    if (object.type === "asset3d") {{
      assetPromises.push(loadAsset(object));
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
  function frameCameraAndDecorate() {{
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
    renderScaleBar();
  }}
  frameCameraAndDecorate();
  if (assetPromises.length > 0) {{
    Promise.all(assetPromises).then(function() {{ frameCameraAndDecorate(); }}).catch(function(err) {{
      showError("Asset load error: " + err);
    }});
  }}
  camera.onViewMatrixChangedObservable.add(function() {{
    scheduleHostStatePublish();
    renderScaleBar();
  }});
  engine.resize();
  engine.runRenderLoop(function() {{ scene.render(); }});
  window.addEventListener("resize", function() {{ engine.resize(); renderScaleBar(); }});
  scheduleHostStatePublish();
  }} // end initScene
}})();
</script>
"""


def _standalone_document(scene: Scene, width: int, height: int, element_id: str) -> str:
    # BabylonJS and its loaders are inlined from the local lib/ copies so the
    # widget works without any network access and is never blocked by CSP.
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>Babylonian</title>"
        "<style>html, body { margin: 0; padding: 0; background: #fafafa; } </style>"
        f"<script>{_BABYLON_JS}</script>"
        f"<script>{_BABYLON_LOADERS_JS}</script>"
        "</head>"
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
        # Use srcdoc instead of a data: URI.  The inlined babylon.js makes the
        # document ~4 MB; base64-encoding that into a data: URI pushes it to
        # ~6 MB which some browsers silently refuse to load.  srcdoc avoids the
        # base64 overhead entirely and just needs HTML-attribute escaping.
        # sandbox='allow-scripts' (no allow-same-origin): null origin, CSP-free.
        escaped = document.replace("&", "&amp;").replace('"', "&quot;")
        return (
            f"<iframe style='width:{self.width}px; max-width:100%; height:{self.height}px; "
            f'border:0; display:block;\' sandbox=\'allow-scripts\' '
            f'srcdoc="{escaped}"></iframe>'
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
        # Receives scene_state / par3d events emitted by the JS side.
        # Format: {"event": "scene_state" | "par3d", "value": {...}, "ts": <int>}
        scene_state = traitlets.Dict({}).tag(sync=True)
        # Local BabylonJS source code, passed to the browser once via traitlets.
        # widget.js evaluates them with new Function() to shadow RequireJS define.
        _babylon_js = traitlets.Unicode(_BABYLON_JS).tag(sync=True)
        _babylon_loaders_js = traitlets.Unicode(_BABYLON_LOADERS_JS).tag(sync=True)
        # Screenshot round-trip: bump _snapshot_request to trigger JS capture;
        # JS writes the data:image/png;base64,... result to _snapshot_data.
        _snapshot_request = traitlets.Int(0).tag(sync=True)
        _snapshot_data = traitlets.Unicode("").tag(sync=True)

        def __init__(self, scene: Scene, width: int = 900, height: int = 700) -> None:
            super().__init__()
            self.scene_payload = scene.to_payload()
            self.scene_state = {}
            self.width = int(width)
            self.height = int(height)
            self.element_id = f"babylonian-py-{uuid.uuid4().hex}"

        def get_scene(self) -> "Scene":
            """Return a Scene reflecting the current live state of the widget."""
            state = self.scene_state
            if not state:
                return Scene(
                    objects=deepcopy(self.scene_payload.get("objects", [])),
                    scene=deepcopy(self.scene_payload.get("scene", {})),
                    interaction=deepcopy(self.scene_payload.get("interaction")),
                )
            return Scene(
                objects=deepcopy(state.get("objects", [])),
                scene=deepcopy(state.get("scene", {})),
                interaction=deepcopy(state.get("interaction")),
            )

        def save_html(self, path: str | Path) -> Path:
            scene = self.get_scene()
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
    global _LAST_ANYWIDGET
    scene = scene.clone()
    if renderer == "anywidget":
        w = BabylonWidget(scene=scene, width=width, height=height)
        _LAST_ANYWIDGET = w
        return w
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
    widget = render_scene3d(scene, width=width, height=height, renderer=renderer)
    _display_in_notebook(widget)
    return widget


def snapshot3d(
    filename: str | Path = "snapshot3d.png",
    *,
    widget: Optional[Any] = None,
    timeout: float = 10.0,
) -> Path:
    """Capture a screenshot of a rendered scene and save to a file.

    This works with the anywidget renderer.  The JS side renders one frame,
    calls ``canvas.toDataURL("image/png")``, and sends the data back through
    the ``_snapshot_data`` traitlet.

    Parameters
    ----------
    filename:
        Output path (default ``"snapshot3d.png"``).
    widget:
        A :class:`BabylonWidget` instance.  Defaults to the last widget
        created by :func:`render_scene3d` with ``renderer="anywidget"``.
    timeout:
        Maximum seconds to wait for the screenshot data (default 10).

    Returns
    -------
    The resolved output :class:`~pathlib.Path`.
    """
    if widget is None:
        widget = _LAST_ANYWIDGET
    if widget is None or not hasattr(widget, "_snapshot_request"):
        raise RuntimeError(
            "No anywidget is available.  Render a scene with renderer='anywidget' first."
        )

    out = Path(filename)

    # Record current value so we can detect when JS sends a new one.
    old_data = widget._snapshot_data
    widget._snapshot_request = widget._snapshot_request + 1

    # Poll for the response.  We can't use threading.Event because Jupyter's
    # single-threaded kernel won't process incoming traitlet updates while the
    # main thread is blocked.  time.sleep() yields to the kernel IO loop.
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(0.1)
        if widget._snapshot_data and widget._snapshot_data != old_data:
            break
    else:
        raise TimeoutError(
            f"Snapshot not received within {timeout}s.  "
            "Is the widget displayed in a running Jupyter cell?"
        )

    data_url = widget._snapshot_data
    # Strip the data:image/png;base64, prefix.
    _, _, b64 = data_url.partition(",")
    out.write_bytes(base64.b64decode(b64))
    return out.resolve()

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
    widget = render_scene3d(scene, width=width, height=height, renderer=renderer)
    _display_in_notebook(widget)
    return widget
