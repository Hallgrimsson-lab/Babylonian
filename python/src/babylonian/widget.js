// BabylonJS is loaded from traitlets (_babylon_js, _babylon_loaders_js) that
// carry the full source text of the local lib/ files.  We evaluate them with
// new Function("define","module","exports", src)(undefined,undefined,undefined)
// so that the UMD wrapper's checks for RequireJS (define.amd), CommonJS
// (module.exports), and Node (exports) all fail, forcing the fallback path
// that sets window.BABYLON directly.

function ensureBabylon(model) {
  if (window.BABYLON) return;

  const babylonSrc = model.get("_babylon_js");
  const loadersSrc = model.get("_babylon_loaders_js");

  if (!babylonSrc || babylonSrc.length < 1000) {
    throw new Error("_babylon_js traitlet is empty — local lib files missing?");
  }

  (new Function("define", "module", "exports", babylonSrc))(undefined, undefined, undefined);

  if (!window.BABYLON) {
    throw new Error("babylon.js executed but window.BABYLON is still undefined");
  }

  if (loadersSrc && loadersSrc.length > 100) {
    (new Function("define", "module", "exports", loadersSrc))(undefined, undefined, undefined);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function color3(value, fallback) {
  if (typeof value === "string" && value.length) {
    try {
      return window.BABYLON.Color3.FromHexString(value);
    } catch (err) {
      return fallback;
    }
  }
  return fallback;
}

function color3ToHex(c) {
  if (!c) return "#ffffff";
  return c.toHexString ? c.toHexString() : "#ffffff";
}

function vectorToArray(v) {
  if (!v) return [0, 0, 0];
  return [v.x || 0, v.y || 0, v.z || 0];
}

function coerceVector3(value, fallback) {
  if (!value) return fallback || new window.BABYLON.Vector3(0, 0, 0);
  if (value.x !== undefined) return new window.BABYLON.Vector3(value.x, value.y, value.z);
  if (Array.isArray(value) && value.length >= 3) {
    return new window.BABYLON.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
  }
  return fallback || new window.BABYLON.Vector3(0, 0, 0);
}

function clamp(value, lo, hi) {
  return Math.min(Math.max(value, lo), hi);
}

function applyPrimitiveMaterial(mesh, primitive, scene) {
  const material = new window.BABYLON.StandardMaterial(`${mesh.name}-material`, scene);
  material.backFaceCulling = true;
  material.diffuseColor = color3(primitive.color, new window.BABYLON.Color3(0.85, 0.85, 0.85));
  material.specularColor = color3(primitive.specularity, new window.BABYLON.Color3(0, 0, 0));
  if (primitive.alpha !== undefined) {
    material.alpha = Number(primitive.alpha);
    if (material.alpha < 1) {
      material.needDepthPrePass = true;
    }
  }
  if (primitive.wireframe) {
    material.wireframe = true;
  }
  mesh.material = material;
}

function applyView(camera, payload) {
  const view = payload && payload.scene ? payload.scene.view : null;
  if (!view) return;
  if (view.camera) {
    if (view.camera.target) {
      camera.setTarget(
        new window.BABYLON.Vector3(view.camera.target[0], view.camera.target[1], view.camera.target[2]),
      );
    }
    if (view.camera.alpha !== undefined) camera.alpha = view.camera.alpha;
    if (view.camera.beta !== undefined) camera.beta = view.camera.beta;
    if (view.camera.radius !== undefined) camera.radius = view.camera.radius;
    return;
  }
  if (view.zoom !== undefined && Number(view.zoom) > 0) {
    camera.radius = Math.max(8 / Number(view.zoom), 0.01);
  }
}

function emitHostEvent(elementId, eventName, value) {
  const payload = {
    source: "babylonian",
    widgetId: elementId || null,
    event: eventName,
    value,
  };
  try {
    window.dispatchEvent(new CustomEvent("babylonian-host-event", { detail: payload }));
  } catch (err) {}
  try {
    if (window.parent && window.parent !== window && typeof window.parent.postMessage === "function") {
      window.parent.postMessage(payload, "*");
    }
  } catch (err) {}
}

function currentPar3dState(camera, payload) {
  const target = camera.getTarget();
  const bg = payload && payload.scene && payload.scene.view && payload.scene.view.bg
    ? payload.scene.view.bg
    : "#FAFAFA";
  return {
    zoom: camera.radius > 0 ? 8 / camera.radius : 0.05,
    bg,
    camera: {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: [target.x, target.y, target.z],
    },
  };
}

function renderAxes(scene, payload, radius) {
  if (!payload.scene || payload.scene.axes === false) return;
  const size = Math.max(radius * 1.25, 1);
  window.BABYLON.MeshBuilder.CreateLineSystem(
    "axes",
    {
      lines: [
        [new window.BABYLON.Vector3(0, 0, 0), new window.BABYLON.Vector3(size, 0, 0)],
        [new window.BABYLON.Vector3(0, 0, 0), new window.BABYLON.Vector3(0, size, 0)],
        [new window.BABYLON.Vector3(0, 0, 0), new window.BABYLON.Vector3(0, 0, size)],
      ],
      colors: [
        [new window.BABYLON.Color4(0.73, 0.11, 0.11, 1), new window.BABYLON.Color4(0.73, 0.11, 0.11, 1)],
        [new window.BABYLON.Color4(0.02, 0.47, 0.34, 1), new window.BABYLON.Color4(0.02, 0.47, 0.34, 1)],
        [new window.BABYLON.Color4(0.11, 0.30, 0.85, 1), new window.BABYLON.Color4(0.11, 0.30, 0.85, 1)],
      ],
    },
    scene,
  );
}

function renderBoundingBox(scene, payload, min, max) {
  if (!payload.scene || payload.scene.axes === false) return;
  const boxColor = new window.BABYLON.Color4(0.58, 0.64, 0.72, 1);
  const corners = [
    new window.BABYLON.Vector3(min.x, min.y, min.z),
    new window.BABYLON.Vector3(max.x, min.y, min.z),
    new window.BABYLON.Vector3(max.x, max.y, min.z),
    new window.BABYLON.Vector3(min.x, max.y, min.z),
    new window.BABYLON.Vector3(min.x, min.y, max.z),
    new window.BABYLON.Vector3(max.x, min.y, max.z),
    new window.BABYLON.Vector3(max.x, max.y, max.z),
    new window.BABYLON.Vector3(min.x, max.y, max.z),
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  window.BABYLON.MeshBuilder.CreateLineSystem(
    "bbox",
    {
      lines: edges.map((edge) => [corners[edge[0]], corners[edge[1]]]),
      colors: edges.map(() => [boxColor, boxColor]),
    },
    scene,
  );
}

// ---------------------------------------------------------------------------
// Scale bar — HTML overlay that projects a world-space length to screen px.
// ---------------------------------------------------------------------------
function renderScaleBar(scaleBarEl, scaleBarSpec, camera, engine, sceneMin, sceneMax) {
  const sb = scaleBarSpec;
  if (!sb || !sb.enabled || !sb.length) {
    scaleBarEl.style.display = "none";
    return;
  }

  const V3 = window.BABYLON.Vector3;
  const center = (sceneMin.x !== Infinity)
    ? sceneMin.add(sceneMax).scale(0.5)
    : V3.Zero();
  const viewMatrix = camera.getViewMatrix();
  const projMatrix = camera.getProjectionMatrix();
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());

  const right = V3.TransformNormal(V3.Right(), camera.getWorldMatrix());
  right.normalize();

  const halfLen = sb.length / 2;
  const p1 = center.add(right.scale(-halfLen));
  const p2 = center.add(right.scale(halfLen));
  const s1 = V3.Project(p1, window.BABYLON.Matrix.Identity(), viewMatrix.multiply(projMatrix), viewport);
  const s2 = V3.Project(p2, window.BABYLON.Matrix.Identity(), viewMatrix.multiply(projMatrix), viewport);
  const pxLen = Math.abs(s2.x - s1.x);

  if (pxLen < 2 || !isFinite(pxLen)) {
    scaleBarEl.style.display = "none";
    return;
  }

  let unitLabel = "";
  if (sb.units === "other" && sb.custom_units) unitLabel = sb.custom_units;
  else if (sb.units) unitLabel = sb.units;
  const text = sb.label || `${sb.length} ${unitLabel}`.trim();

  const barH = 8, tickH = 14;
  const svgW = Math.round(pxLen), svgH = tickH + 2;
  const svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="0" y1="${tickH}" x2="${svgW}" y2="${tickH}" stroke="#222" stroke-width="2"/>` +
    `<line x1="1" y1="${tickH - barH}" x2="1" y2="${tickH}" stroke="#222" stroke-width="2"/>` +
    `<line x1="${svgW - 1}" y1="${tickH - barH}" x2="${svgW - 1}" y2="${tickH}" stroke="#222" stroke-width="2"/>` +
    `</svg>`;

  scaleBarEl.innerHTML = `<div style="display:inline-block;background:rgba(255,255,255,0.88);` +
    `border-radius:4px;padding:4px 10px 6px;box-shadow:0 1px 3px rgba(0,0,0,0.25);` +
    `font-family:Menlo,Monaco,Consolas,monospace;font-size:12px;color:#222;text-align:center;">` +
    `${svg}<div style="margin-top:2px;">${text}</div></div>`;

  scaleBarEl.style.display = "block";
  scaleBarEl.style.left = "auto"; scaleBarEl.style.right = "auto";
  scaleBarEl.style.top = "auto"; scaleBarEl.style.bottom = "auto";
  if (Array.isArray(sb.position)) {
    scaleBarEl.style.left = sb.position[0] + "px";
    scaleBarEl.style.top = sb.position[1] + "px";
  } else {
    const pos = sb.position || "bottomright";
    if (pos.includes("bottom")) scaleBarEl.style.bottom = "48px";
    else scaleBarEl.style.top = "12px";
    if (pos.includes("left")) scaleBarEl.style.left = "12px";
    else scaleBarEl.style.right = "12px";
  }
}

// ---------------------------------------------------------------------------
// Editor state management
// ---------------------------------------------------------------------------

function editorTargetId(index) {
  return "target-" + index;
}

function editorTargetsByKind(state, kind) {
  return (state.targets || []).filter(function(t) { return t.kind === kind; });
}

function selectedEditorTarget(state) {
  if (!state || !state.selectedId || !state.targets) return null;
  return state.targets.find(function(t) { return t.id === state.selectedId; }) || null;
}

function selectedMeshTarget(state) {
  var t = selectedEditorTarget(state);
  return (t && t.kind === "mesh") ? t : null;
}

function nextEditorTargetIndex(state) {
  if (!state || !state.targets || !state.targets.length) return 0;
  return state.targets.reduce(function(mx, t) { return Math.max(mx, Number(t.index) || 0); }, -1) + 1;
}

function uniqueEditorPrimitiveName(state, prefix) {
  var stem = prefix || "object";
  var taken = {};
  if (state && state.targets) {
    state.targets.forEach(function(t) {
      if (t && t.primitive && t.primitive.name) taken[t.primitive.name] = true;
    });
  }
  var idx = 1, candidate = stem;
  while (taken[candidate]) { candidate = stem + "_" + idx; idx += 1; }
  return candidate;
}

function availableEditorModes(target) {
  if (!target) return [];
  if (target.kind === "mesh") return ["translate", "rotate", "scale"];
  if (target.kind === "light") {
    var lt = target.primitive && target.primitive.light_type;
    if (lt === "point") return ["translate"];
    if (lt === "spot") return ["translate", "rotate"];
    if (lt === "directional" || lt === "hemispheric") return ["rotate"];
  }
  return ["translate"];
}

function ensureEditorMode(state) {
  if (!state) return;
  var target = selectedEditorTarget(state);
  var modes = availableEditorModes(target);
  if (!modes.length) { state.gizmoMode = "translate"; return; }
  if (modes.indexOf(state.gizmoMode) === -1) state.gizmoMode = modes[0];
}

function attachEditorTarget(state, target) {
  if (!state || !state.gizmoManager) return;

  if (state.gizmoManager.attachToNode) {
    state.gizmoManager.attachToNode(target ? target.node : null);
    return;
  }

  if (state.gizmoManager.attachToMesh) {
    state.gizmoManager.attachToMesh(target ? target.node : null);
  }
}

function editorTargetNodes(target) {
  if (!target) return [];
  if (target.importedMeshes && target.importedMeshes.length) return target.importedMeshes.filter(Boolean);
  return target.node ? [target.node] : [];
}

function computeNodesBounds(nodes) {
  if (!nodes || !nodes.length) return null;
  var min = new window.BABYLON.Vector3(Infinity, Infinity, Infinity);
  var max = new window.BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  var found = false;
  nodes.forEach(function(node) {
    if (!node || !node.getBoundingInfo) return;
    node.computeWorldMatrix(true);
    var box = node.getBoundingInfo().boundingBox;
    if (!box) return;
    min = window.BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = window.BABYLON.Vector3.Maximize(max, box.maximumWorld);
    found = true;
  });
  if (!found) return null;
  var center = min.add(max).scale(0.5);
  var extent = max.subtract(min);
  var radius = extent.length() / 2;
  if (!isFinite(radius) || radius <= 0) radius = 1;
  return { min, max, center, radius };
}

function editorTargetBounds(target, sceneBounds) {
  if (!target) return null;
  if (target.kind === "mesh") return computeNodesBounds(editorTargetNodes(target));
  if (target.kind === "light" && target.node && target.node.position) {
    return {
      center: target.node.position.clone(),
      radius: sceneBounds && sceneBounds.radius ? sceneBounds.radius * 0.08 : 1,
    };
  }
  return null;
}

function syncEditorGizmoState(state, camera, sceneBounds) {
  if (!state || !state.gizmoManager) return;

  var gm = state.gizmoManager;

  if (state.deferGizmoAttach === true) {
    // Detach and disable all gizmos
    gm.positionGizmoEnabled = false;
    gm.rotationGizmoEnabled = false;
    gm.scaleGizmoEnabled = false;
    return;
  }

  ensureEditorMode(state);
  var target = selectedEditorTarget(state);
  var visible = state.gizmosVisible !== false;
  var supportedModes = availableEditorModes(target);
  var canTranslate = !!target && supportedModes.indexOf("translate") !== -1;
  var canRotate = !!target && supportedModes.indexOf("rotate") !== -1;
  var canScale = !!target && supportedModes.indexOf("scale") !== -1;

  var wantPos   = visible && state.gizmoMode === "translate" && canTranslate;
  var wantRot   = visible && state.gizmoMode === "rotate"    && canRotate;
  var wantScale = visible && state.gizmoMode === "scale"     && canScale;

  // Disable all gizmo modes first — this disposes old gizmo objects and their
  // utility-layer meshes, ensuring a clean visual switch between modes.
  gm.positionGizmoEnabled = false;
  gm.rotationGizmoEnabled = false;
  gm.scaleGizmoEnabled    = false;

  // Enable only the requested gizmo mode (creates a fresh gizmo object)
  gm.positionGizmoEnabled = wantPos;
  gm.rotationGizmoEnabled = wantRot;
  gm.scaleGizmoEnabled    = wantScale;

  // Attach the newly created gizmo directly to the target node.
  // Use attachedMesh for Mesh nodes, attachedNode for TransformNodes (lights).
  var attachNode = (wantPos || wantRot || wantScale) && target ? target.node : null;
  if (attachNode && gm.gizmos) {
    var isMesh = !!attachNode.getTotalVertices;
    var g = gm.gizmos;
    if (isMesh) {
      if (g.positionGizmo) g.positionGizmo.attachedMesh = attachNode;
      if (g.rotationGizmo) g.rotationGizmo.attachedMesh = attachNode;
      if (g.scaleGizmo)    g.scaleGizmo.attachedMesh = attachNode;
    } else {
      if (g.positionGizmo) g.positionGizmo.attachedNode = attachNode;
      if (g.rotationGizmo) g.rotationGizmo.attachedNode = attachNode;
      if (g.scaleGizmo)    g.scaleGizmo.attachedNode = attachNode;
    }
  }

  // Scale gizmos relative to target/scene size
  var gizmoScaleRatio = null;
  var targetBounds = editorTargetBounds(target, sceneBounds);
  var sceneRadius = sceneBounds && sceneBounds.radius ? sceneBounds.radius : 1;

  if (targetBounds && camera) {
    var distance = window.BABYLON.Vector3.Distance(camera.position, targetBounds.center);
    var sizeFromTarget = targetBounds.radius * 0.01;
    var sizeFromDistance = distance * 0.08;
    gizmoScaleRatio = Math.min(sizeFromTarget, sizeFromDistance);
    gizmoScaleRatio = clamp(gizmoScaleRatio, sceneRadius * 0.003, sceneRadius * 0.12);
  } else if (camera && isFinite(camera.radius) && camera.radius > 0) {
    gizmoScaleRatio = Math.max(camera.radius * 0.006, 0.004);
  } else if (sceneBounds && sceneBounds.radius) {
    gizmoScaleRatio = Math.max(sceneBounds.radius * 0.006, 0.004);
  }

  if (gm.gizmos) {
    if (gm.gizmos.positionGizmo && gizmoScaleRatio !== null)
      gm.gizmos.positionGizmo.scaleRatio = gizmoScaleRatio;
    if (gm.gizmos.rotationGizmo && gizmoScaleRatio !== null)
      gm.gizmos.rotationGizmo.scaleRatio = gizmoScaleRatio;
    if (gm.gizmos.scaleGizmo) {
      if (gizmoScaleRatio !== null) gm.gizmos.scaleGizmo.scaleRatio = gizmoScaleRatio;
      gm.gizmos.scaleGizmo.uniformScaling = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Light creation helpers
// ---------------------------------------------------------------------------

function createEditorLight(primitive, name, bScene) {
  var lightType = primitive.light_type || "hemispheric";
  var lightName = primitive.name || name;
  var position = coerceVector3(primitive.position, new window.BABYLON.Vector3(0, 1, 0));
  var direction = coerceVector3(
    primitive.direction,
    lightType === "hemispheric" ? new window.BABYLON.Vector3(0, 1, 0) : new window.BABYLON.Vector3(0, -1, 0)
  );
  var light = null;
  var editorNode = new window.BABYLON.TransformNode(lightName + "-editor", bScene);
  editorNode.position = position.clone();

  if (lightType === "point") {
    light = new window.BABYLON.PointLight(lightName, position, bScene);
  } else if (lightType === "directional") {
    light = new window.BABYLON.DirectionalLight(lightName, direction, bScene);
    light.position = position.clone();
  } else if (lightType === "spot") {
    light = new window.BABYLON.SpotLight(
      lightName, position, direction,
      primitive.angle === undefined ? Math.PI / 3 : Number(primitive.angle),
      primitive.exponent === undefined ? 1 : Number(primitive.exponent),
      bScene
    );
  } else {
    light = new window.BABYLON.HemisphericLight(lightName, direction, bScene);
  }

  if (primitive.intensity !== undefined) light.intensity = Number(primitive.intensity);
  if (primitive.diffuse) light.diffuse = color3(primitive.diffuse, light.diffuse);
  if (primitive.specular) light.specular = color3(primitive.specular, light.specular);
  light.setEnabled(primitive.enabled !== false);

  return { light, editorNode };
}

function createLightHelper(node, primitive, name, bScene, sceneBounds) {
  if (!node || !node.position) return null;

  // Size proportional to scene, matching R: radius * 0.05, min 0.03
  var helperSize = sceneBounds && sceneBounds.radius
    ? Math.max(sceneBounds.radius * 0.05, 0.03)
    : 0.1;
  var sphere = window.BABYLON.MeshBuilder.CreateSphere(
    name + "-helper",
    { diameter: helperSize * 2 },
    bScene
  );
  var helperColor = (primitive && primitive.diffuse) ? primitive.diffuse : "#f59e0b";
  var mat = new window.BABYLON.StandardMaterial(name + "-helper-mat", bScene);
  var c = color3(helperColor, window.BABYLON.Color3.FromHexString("#f59e0b"));
  mat.diffuseColor = c;
  mat.emissiveColor = c.scale(0.3);
  mat.alpha = 0.85;
  sphere.material = mat;
  sphere.isPickable = true;
  sphere.metadata = { babylonianHelper: true };
  sphere.position.copyFrom(node.position);
  return sphere;
}

function updateLightHelpers(state) {
  if (!state || !state.targets || !state.targets.length) return;
  state.targets.forEach(function(target) {
    if (target.kind !== "light") return;
    // Sync light position from editor node
    if (target.light && target.node && target.node.position && target.light.position) {
      target.light.position.copyFrom(target.node.position);
      target.primitive.position = vectorToArray(target.node.position);
    }
    // Sync helper sphere to node position
    if (target.helper && target.node && target.node.position) {
      target.helper.position.copyFrom(target.node.position);
    }
  });
}

// ---------------------------------------------------------------------------
// Material helpers
// ---------------------------------------------------------------------------

function defaultMaterialSpec(type) {
  if (type === "pbr") {
    return {
      type: "pbr",
      base_color: "#ffffff",
      metallic: 0,
      roughness: 1,
      alpha: 1,
      wireframe: false,
      backface_culling: false,
    };
  }
  return {
    type: "standard",
    diffuse: "#d9d9d9",
    specular: "#000000",
    alpha: 1,
    wireframe: false,
    backface_culling: true,
  };
}

function editableMaterialSpec(target) {
  if (!target || target.kind !== "mesh") return null;

  // Try structured material first, fall back to legacy primitive fields
  var existing = null;
  if (target.primitive && target.primitive.material) {
    existing = JSON.parse(JSON.stringify(target.primitive.material));
  }
  if (!existing) {
    existing = {};
  }
  if (!existing.type) existing.type = "standard";

  if (existing.type === "pbr") {
    if (existing.base_color === undefined && existing.albedo !== undefined) existing.base_color = existing.albedo;
    if (existing.base_color === undefined) existing.base_color = "#ffffff";
    if (existing.metallic === undefined) existing.metallic = 0;
    if (existing.roughness === undefined) existing.roughness = 1;
  } else {
    existing.type = "standard";
    if (existing.diffuse === undefined) {
      existing.diffuse = target.primitive && target.primitive.color ? target.primitive.color : "#d9d9d9";
    }
    if (existing.specular === undefined) {
      existing.specular = target.primitive && target.primitive.specularity ? target.primitive.specularity : "#000000";
    }
  }

  if (existing.alpha === undefined) {
    existing.alpha = target.primitive && target.primitive.alpha !== undefined ? Number(target.primitive.alpha) : 1;
  }
  if (existing.wireframe === undefined) {
    existing.wireframe = !!(target.primitive && target.primitive.wireframe);
  }
  if (existing.backface_culling === undefined) {
    existing.backface_culling = true;
  }

  return existing;
}

function applyMaterialToEditorTarget(target, bScene) {
  if (!target || target.kind !== "mesh" || !target.node) return;
  var spec = target.primitive && target.primitive.material ? target.primitive.material : null;
  if (!spec) return;

  var B = window.BABYLON;
  var materialName = (target.name || "mesh") + "-editor-mat";
  var material;

  if (spec.type === "pbr") {
    material = new B.PBRMaterial(materialName, bScene);
    material.albedoColor = color3(spec.base_color || "#ffffff", new B.Color3(1, 1, 1));
    material.metallic = spec.metallic === undefined ? 0 : Number(spec.metallic);
    material.roughness = spec.roughness === undefined ? 1 : Number(spec.roughness);
    material.usePhysicalLightFalloff = false;
  } else {
    material = new B.StandardMaterial(materialName, bScene);
    material.diffuseColor = color3(spec.diffuse || "#d9d9d9", new B.Color3(0.85, 0.85, 0.85));
    material.specularColor = color3(spec.specular || "#000000", new B.Color3(0, 0, 0));
  }

  material.backFaceCulling = spec.backface_culling !== false;
  if (spec.alpha !== undefined) {
    material.alpha = Number(spec.alpha);
    if (material.alpha < 1) material.needDepthPrePass = true;
  }
  if (spec.wireframe) material.wireframe = true;

  // Dispose old material if it exists
  if (target.node.material && target.node.material.dispose) {
    target.node.material.dispose();
  }
  target.node.material = material;

  // Also apply bounding box visibility
  if (target.primitive && target.primitive.show_bounding_box !== undefined) {
    target.node.showBoundingBox = !!target.primitive.show_bounding_box;
  }
}

function defaultLightPosition(sceneBounds) {
  var radius = sceneBounds && sceneBounds.radius ? sceneBounds.radius : 1;
  var center = sceneBounds && sceneBounds.center ? sceneBounds.center : new window.BABYLON.Vector3(0, 0, 0);
  return center.add(new window.BABYLON.Vector3(radius * 0.8, radius * 0.8, radius * 0.8));
}

function directionTowardCenter(position, sceneBounds) {
  var center = sceneBounds && sceneBounds.center ? sceneBounds.center : window.BABYLON.Vector3.Zero();
  return vectorToArray(center.subtract(position));
}

function lightingPresetDefinitions(presetName, sceneBounds) {
  var radius = sceneBounds && sceneBounds.radius ? sceneBounds.radius : 1;
  var center = sceneBounds && sceneBounds.center ? sceneBounds.center : new window.BABYLON.Vector3(0, 0, 0);

  function at(x, y, z) {
    return center.add(new window.BABYLON.Vector3(x * radius, y * radius, z * radius));
  }

  var preset = (presetName || "three_point").toLowerCase();

  if (preset === "rembrandt") {
    var rk = at(0.9, 1.1, 1.0), rf = at(-0.9, 0.35, 0.9), rr = at(0.2, 0.9, -1.2);
    return [
      { type: "spot", name: "rembrandt_key", position: vectorToArray(rk), direction: directionTowardCenter(rk, sceneBounds), intensity: 1.2, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1 },
      { type: "point", name: "rembrandt_fill", position: vectorToArray(rf), intensity: 0.35, diffuse: "#DCEBFF", specular: "#FFFFFF" },
      { type: "point", name: "rembrandt_rim", position: vectorToArray(rr), intensity: 0.55, diffuse: "#FFFFFF", specular: "#FFFFFF" },
    ];
  }
  if (preset === "butterfly") {
    var bk = at(0, 1.35, 1.1), bf = at(0, -0.25, 1.0), br = at(0, 0.7, -1.1);
    return [
      { type: "spot", name: "butterfly_key", position: vectorToArray(bk), direction: directionTowardCenter(bk, sceneBounds), intensity: 1.25, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1 },
      { type: "point", name: "butterfly_fill", position: vectorToArray(bf), intensity: 0.3, diffuse: "#FFFFFF", specular: "#FFFFFF" },
      { type: "point", name: "butterfly_rim", position: vectorToArray(br), intensity: 0.4, diffuse: "#EEF2FF", specular: "#FFFFFF" },
    ];
  }
  if (preset === "split") {
    var sk = at(1.2, 0.4, 0.9), sr = at(-1.0, 0.8, -1.0);
    return [
      { type: "spot", name: "split_key", position: vectorToArray(sk), direction: directionTowardCenter(sk, sceneBounds), intensity: 1.15, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1 },
      { type: "point", name: "split_rim", position: vectorToArray(sr), intensity: 0.25, diffuse: "#DCEBFF", specular: "#FFFFFF" },
    ];
  }
  // three_point (default)
  var k = at(1.0, 1.0, 1.1), f = at(-1.1, 0.5, 0.9), r = at(0.1, 0.9, -1.3);
  return [
    { type: "spot", name: "three_point_key", position: vectorToArray(k), direction: directionTowardCenter(k, sceneBounds), intensity: 1.2, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1 },
    { type: "point", name: "three_point_fill", position: vectorToArray(f), intensity: 0.45, diffuse: "#DCEBFF", specular: "#FFFFFF" },
    { type: "point", name: "three_point_rim", position: vectorToArray(r), intensity: 0.65, diffuse: "#FFFFFF", specular: "#FFFFFF" },
  ];
}


// ---------------------------------------------------------------------------
// Main scene builder
// ---------------------------------------------------------------------------

function buildScene(el, payload, width, height, elementId, modelRef) {
  el.replaceChildren();

  var B = window.BABYLON;
  var isEditorMode = payload.interaction && payload.interaction.mode === "edit_scene3d";

  var container = document.createElement("div");
  container.id = elementId || `babylonian-widget-${Math.random().toString(16).slice(2)}`;
  container.style.width = `${width}px`;
  container.style.maxWidth = "100%";
  container.style.height = `${height}px`;
  container.style.position = "relative";

  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  // Scale bar overlay layer
  var scaleBarEl = document.createElement("div");
  scaleBarEl.style.cssText = "position:absolute; z-index:9; pointer-events:none; display:none;";
  container.appendChild(scaleBarEl);

  // Editor UI panel layer
  var uiLayer = document.createElement("div");
  uiLayer.style.cssText = "position:absolute; top:12px; right:12px; z-index:10; display:none; max-width:280px; " +
    "max-height:calc(100% - 24px); overflow-y:auto; overflow-x:hidden; padding:10px; " +
    "background:rgba(255,255,255,0.92); border:1px solid rgba(15,23,42,0.12); border-radius:8px; " +
    "box-shadow:0 10px 30px rgba(15,23,42,0.12); font-family:Menlo,Monaco,Consolas,monospace; " +
    "font-size:12px; line-height:1.4;";
  container.appendChild(uiLayer);

  el.appendChild(container);

  var engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  var bScene = new B.Scene(engine);
  bScene.useRightHandedSystem = true;
  var bg = (payload.scene && payload.scene.view && payload.scene.view.bg) || "#FAFAFA";
  bScene.clearColor = B.Color4.FromHexString(`${bg}${bg.length === 7 ? "FF" : ""}`);

  var camera = new B.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.4, 8, new B.Vector3(0, 0, 0), bScene);
  camera.fov = 0.6;
  camera.minZ = 0.01;
  camera.wheelPrecision = 12;
  camera.wheelDeltaPercentage = 0.08;
  camera.attachControl(canvas, true);

  var hemi = new B.HemisphericLight("default-hemi", new B.Vector3(0, 1, 0), bScene);
  hemi.intensity = 0.9;
  var keyLight = new B.DirectionalLight("default-key", new B.Vector3(-0.5, -1, 0.2), bScene);
  keyLight.intensity = 0.35;

  var defaultLights = [hemi, keyLight];
  function setDefaultLightsEnabled(enabled) {
    defaultLights.forEach(function(l) { l.setEnabled(!!enabled); });
  }

  var hasCustomLights = false;
  var sceneMin = new B.Vector3(Infinity, Infinity, Infinity);
  var sceneMax = new B.Vector3(-Infinity, -Infinity, -Infinity);
  var sceneBounds = null;

  // Scale bar state (may be mutated by editor)
  var scaleBarSpec = (payload.scene && payload.scene.scale_bar) ? JSON.parse(JSON.stringify(payload.scene.scale_bar)) : null;

  // ---------------------------------------------------------------------------
  // Editor state (only active when isEditorMode)
  // ---------------------------------------------------------------------------
  var editorState = null;

  function updateBoundsFromMeshes(meshes) {
    for (var m of meshes) {
      if (!m.getBoundingInfo) continue;
      m.computeWorldMatrix(true);
      var box = m.getBoundingInfo().boundingBox;
      sceneMin = B.Vector3.Minimize(sceneMin, box.minimumWorld);
      sceneMax = B.Vector3.Maximize(sceneMax, box.maximumWorld);
    }
  }

  function recomputeSceneBounds() {
    if (sceneMin.x !== Infinity) {
      var center = sceneMin.add(sceneMax).scale(0.5);
      var extent = sceneMax.subtract(sceneMin);
      var radius = Math.max(extent.length() / 2, 1);
      sceneBounds = { min: sceneMin.clone(), max: sceneMax.clone(), center, radius };
    }
  }

  function frameCameraAndDecorate() {
    if (sceneMin.x !== Infinity) {
      var center = sceneMin.add(sceneMax).scale(0.5);
      var extent = sceneMax.subtract(sceneMin);
      var radius = Math.max(extent.length() / 2, 1);
      camera.setTarget(center);
      camera.radius = radius * 2.5;
      sceneBounds = { min: sceneMin.clone(), max: sceneMax.clone(), center, radius };
      renderBoundingBox(bScene, payload, sceneMin, sceneMax);
      renderAxes(bScene, payload, radius);
    } else {
      renderAxes(bScene, payload, 1);
    }
    applyView(camera, payload);
    updateScaleBarDisplay();
  }

  function updateScaleBarDisplay() {
    renderScaleBar(scaleBarEl, scaleBarSpec, camera, engine, sceneMin, sceneMax);
  }

  // --- asset loading helpers -----------------------------------------------
  var blobUrls = [];
  function b64ToBlob(b64, mime) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || "application/octet-stream" });
  }

  function mimeForFormat(fmt) {
    var m = { obj: "model/obj", gltf: "model/gltf+json", glb: "model/gltf-binary",
              stl: "model/stl", ply: "application/x-ply", babylon: "application/json" };
    return m[fmt] || "application/octet-stream";
  }

  function loadAsset(object) {
    return new Promise(function(resolve, reject) {
      var data = object.data_b64;
      if (!data) { reject(new Error("asset3d missing data_b64")); return; }
      var mainBlob = b64ToBlob(data, mimeForFormat(object.format));
      var mainUrl = URL.createObjectURL(mainBlob);
      blobUrls.push(mainUrl);
      var companionMap = {};
      if (object.companion_files) {
        for (var [fname, fb64] of Object.entries(object.companion_files)) {
          var cBlob = b64ToBlob(fb64);
          var cUrl = URL.createObjectURL(cBlob);
          blobUrls.push(cUrl);
          companionMap[fname] = cUrl;
        }
      }
      var origPreprocess = B.Tools.PreprocessUrl;
      B.Tools.PreprocessUrl = function(url) {
        var parts = url.split("/");
        var basename = parts[parts.length - 1].split("?")[0];
        if (companionMap[basename]) return companionMap[basename];
        if (origPreprocess) return origPreprocess(url);
        return url;
      };
      var ext = "." + (object.format || "glb");
      function applyTransforms(meshes) {
        var root = new B.TransformNode(object.name || "asset", bScene);
        meshes.forEach(function(m) { if (!m.parent) m.parent = root; });
        if (object.position) root.position = new B.Vector3(object.position[0], object.position[1], object.position[2]);
        if (object.rotation) root.rotation = new B.Vector3(object.rotation[0], object.rotation[1], object.rotation[2]);
        if (object.scaling) root.scaling = new B.Vector3(object.scaling[0], object.scaling[1], object.scaling[2]);
        if (object.preserve_materials === false) {
          meshes.forEach(function(m) { applyPrimitiveMaterial(m, object, bScene); });
        }
        updateBoundsFromMeshes(meshes);
      }
      try {
        B.SceneLoader.LoadAssetContainer("", mainUrl, bScene, function(cont) {
          B.Tools.PreprocessUrl = origPreprocess;
          applyTransforms(cont.meshes);
          cont.addAllToScene();
          resolve();
        }, null, function(_scene, msg) {
          B.SceneLoader.ImportMesh("", "", mainUrl, bScene, function(meshes) {
            B.Tools.PreprocessUrl = origPreprocess;
            applyTransforms(meshes);
            resolve();
          }, null, function(_s2, msg2) {
            B.Tools.PreprocessUrl = origPreprocess;
            reject(new Error(msg2 || msg || "Asset load failed"));
          }, ext);
        }, ext);
      } catch (syncErr) {
        B.Tools.PreprocessUrl = origPreprocess;
        reject(syncErr);
      }
    });
  }

  // --- process objects synchronously + collect async loads ---
  var assetPromises = [];
  var editableTargets = []; // for editor mode

  (payload.objects || []).forEach(function(object, index) {
    if (object.type === "light3d") {
      hasCustomLights = true;
      var created = createEditorLight(object, object.name || ("light" + index), bScene);
      if (isEditorMode) {
        var editorNode = created.editorNode;
        editableTargets.push({
          id: editorTargetId(index),
          index: index,
          primitiveType: object.type,
          primitive: JSON.parse(JSON.stringify(object)),
          name: object.name || null,
          node: editorNode,
          kind: "light",
          light: created.light,
          label: (object.name || ("light " + (index + 1))) + " [light]",
          createdInEditor: false,
          originalPrimitive: JSON.parse(JSON.stringify(object)),
        });
      }
      return;
    }

    if (object.type === "asset3d") {
      assetPromises.push(loadAsset(object));
      return;
    }

    if (object.type !== "mesh3d") return;

    var mesh = new B.Mesh(object.name || `mesh${index}`, bScene);
    var vertexData = new B.VertexData();
    var normals = [];
    vertexData.positions = object.vertices;
    vertexData.indices = object.indices;
    B.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);
    applyPrimitiveMaterial(mesh, object, bScene);

    mesh.computeWorldMatrix(true);
    var box = mesh.getBoundingInfo().boundingBox;
    sceneMin = B.Vector3.Minimize(sceneMin, box.minimumWorld);
    sceneMax = B.Vector3.Maximize(sceneMax, box.maximumWorld);

    if (isEditorMode) {
      editableTargets.push({
        id: editorTargetId(index),
        index: index,
        primitiveType: object.type,
        primitive: JSON.parse(JSON.stringify(object)),
        name: object.name || null,
        node: mesh,
        kind: "mesh",
        light: null,
        label: (object.name || ("mesh " + (index + 1))) + " [mesh]",
        createdInEditor: false,
        originalPrimitive: JSON.parse(JSON.stringify(object)),
      });
    }
  });

  if (hasCustomLights) setDefaultLightsEnabled(false);

  frameCameraAndDecorate();

  if (assetPromises.length > 0) {
    Promise.all(assetPromises)
      .then(function() { frameCameraAndDecorate(); })
      .catch(function(err) {
        var errDiv = document.createElement("div");
        errDiv.style.cssText = "position:absolute;top:8px;left:8px;right:8px;z-index:20;background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:12px;pointer-events:none;";
        errDiv.textContent = "[Babylonian] Asset load error: " + err;
        container.appendChild(errDiv);
      });
  }

  // ---------------------------------------------------------------------------
  // Editor mode: build the full editor UI
  // ---------------------------------------------------------------------------

  if (isEditorMode) {
    recomputeSceneBounds();

    editorState = {
      mode: "edit_scene3d",
      widgetId: container.id,
      targets: editableTargets,
      removedObjects: [],
      helpers: [],
      gizmoManager: null,
      selectedId: editableTargets.length ? editableTargets[0].id : null,
      gizmoMode: "translate",
      gizmosVisible: true,
      deferGizmoAttach: true,
      scaleBar: scaleBarSpec ? JSON.parse(JSON.stringify(scaleBarSpec)) : { enabled: false },
      sectionOpen: { meshes: false, materials: false, lights: true, snapshot: false, log: false },
      ui: null,
    };

    // Create GizmoManager if available
    if (B.GizmoManager) {
      var gm = new B.GizmoManager(bScene);
      gm.usePointerToAttachGizmos = false;
      gm.clearGizmoOnEmptyPointerEvent = false;
      editorState.gizmoManager = gm;
    }

    // Create light helpers for existing light targets
    editorState.targets.forEach(function(target) {
      if (target.kind === "light") {
        target.helper = createLightHelper(target.node, target.primitive, target.name || target.id, bScene, sceneBounds);
        if (target.helper) editorState.helpers.push(target.helper);
      }
    });

    // Pointer picking for selecting targets via raycasting
    bScene.onPointerObservable.add(function(pointerInfo) {
      if (!pointerInfo || pointerInfo.type !== B.PointerEventTypes.POINTERPICK) return;
      var pickInfo = pointerInfo.pickInfo;
      if (!pickInfo || !pickInfo.hit || !pickInfo.pickedMesh) return;
      // Ignore gizmo meshes
      if (pickInfo.pickedMesh.name && /gizmo/i.test(pickInfo.pickedMesh.name)) return;

      var pickedMesh = pickInfo.pickedMesh;
      console.log("[Babylonian Editor] Picked mesh:", pickedMesh.name, "| Total targets:", editorState.targets.length);

      var selectedTarget = null;
      editorState.targets.forEach(function(target) {
        if (selectedTarget) return;
        // Direct match
        if (target.node === pickedMesh) { selectedTarget = target; return; }
        // Check if picked mesh is a child/descendant of the target node
        var p = pickedMesh.parent;
        while (p) { if (p === target.node) { selectedTarget = target; return; } p = p.parent; }
        // Check helper sphere (for lights)
        if (target.helper === pickedMesh) { selectedTarget = target; return; }
        // Check by name match (fallback for meshes that share name)
        if (target.node && target.node.name && target.node.name === pickedMesh.name) {
          selectedTarget = target; return;
        }
      });

      if (!selectedTarget) {
        console.log("[Babylonian Editor] No target matched for picked mesh:", pickedMesh.name);
        return;
      }

      console.log("[Babylonian Editor] Selected target:", selectedTarget.id, selectedTarget.kind, selectedTarget.name);
      editorState.selectedId = selectedTarget.id;
      editorState.deferGizmoAttach = false;
      if (selectedTarget.kind === "mesh") {
        editorState.sectionOpen.meshes = true;
        editorState.sectionOpen.materials = true;
      }
      if (selectedTarget.kind === "light") editorState.sectionOpen.lights = true;
      syncEditorGizmoState(editorState, camera, sceneBounds);
      updateEditorPanel();
      publishEditorState();
    });

    // --- Build UI panel HTML ---
    buildEditorUI();

    syncEditorGizmoState(editorState, camera, sceneBounds);
    publishEditorState();
  }

  // ---------------------------------------------------------------------------
  // Editor UI builder
  // ---------------------------------------------------------------------------

  function buildEditorUI() {
    uiLayer.style.display = "block";
    uiLayer.innerHTML =
      "<div data-role='panel-handle' style='font-weight:700; margin:-10px -10px 8px -10px; padding:10px; border-bottom:1px solid rgba(15,23,42,0.08); cursor:move; user-select:none; background:rgba(248,250,252,0.9); border-top-left-radius:8px; border-top-right-radius:8px;'>Scene Editor</div>" +
      "<div style='margin-bottom:8px; color:#475569;'>Click a mesh or light in the viewport, or select it below, then edit transforms and other settings.</div>" +
      "<button type='button' data-role='gizmo-toggle' style='width:100%; margin-bottom:8px; border:0; border-radius:6px; background:#1d4ed8; color:white; padding:6px 10px; cursor:pointer;'>Hide Gizmo</button>" +

      // --- Snapshot section ---
      "<details data-role='section-snapshot' style='margin-bottom:8px;'>" +
        "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Snapshot</summary>" +
        "<div style='margin-top:8px; margin-left:10px;'>" +
          "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='scale-bar-enabled' type='checkbox' /> Scale bar</label>" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Scale bar length</label>" +
          "<input data-role='scale-bar-length' type='number' min='0' step='any' value='1' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Scale bar unit</label>" +
          "<select data-role='scale-bar-unit' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
            "<option value='mm'>mm</option><option value='cm'>cm</option><option value='procrustes distance'>procrustes distance</option><option value='other'>other</option>" +
          "</select>" +
          "<input data-role='scale-bar-unit-other' type='text' placeholder='Enter custom unit' style='display:none; width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Filename</label>" +
          "<input data-role='snapshot-filename' type='text' value='scene.png' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Format</label>" +
          "<select data-role='snapshot-format' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
            "<option value='png'>png</option>" +
          "</select>" +
          "<button type='button' data-role='snapshot-save' style='width:100%; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Save Snapshot</button>" +
          "<div style='margin-top:6px; color:#64748b;'>Gizmos and helpers are hidden in exported images.</div>" +
        "</div>" +
      "</details>" +

      // --- Meshes section ---
      "<details data-role='section-meshes' style='margin-bottom:8px;'>" +
        "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Meshes</summary>" +
        "<div style='margin-top:8px; margin-left:10px;'>" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Mesh target</label>" +
          "<select data-role='mesh-target' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'></select>" +
          "<div style='display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;'>" +
            "<button type='button' data-role='mesh-mode' data-mode='translate' style='flex:1; min-width:0; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Move</button>" +
            "<button type='button' data-role='mesh-mode' data-mode='rotate' style='flex:1; min-width:0; border:0; border-radius:6px; background:#334155; color:white; padding:6px 10px; cursor:pointer;'>Rotate</button>" +
            "<button type='button' data-role='mesh-mode' data-mode='scale' style='flex:1; min-width:0; border:0; border-radius:6px; background:#475569; color:white; padding:6px 10px; cursor:pointer;'>Scale</button>" +
            "<button type='button' data-role='mesh-reset' style='flex:1; min-width:0; border:0; border-radius:6px; background:#991b1b; color:white; padding:6px 10px; cursor:pointer;'>Reset</button>" +
          "</div>" +
        "</div>" +
      "</details>" +

      // --- Materials section ---
      "<details data-role='section-materials' style='margin-bottom:8px;'>" +
        "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Materials</summary>" +
        "<div style='margin-top:8px; margin-left:10px;'>" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Material type</label>" +
          "<select data-role='material-type' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
            "<option value='standard'>standard</option>" +
            "<option value='pbr'>pbr</option>" +
          "</select>" +
          "<label data-role='material-color-label' style='display:block; margin-bottom:4px; color:#334155;'>Diffuse color</label>" +
          "<input data-role='material-color' type='color' value='#d9d9d9' style='width:100%; height:36px; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; padding:2px;' />" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Alpha <span data-role='material-alpha-value'>1</span></label>" +
          "<input data-role='material-alpha' type='range' min='0' max='1' step='0.01' value='1' style='width:100%; margin-bottom:8px;' />" +
          "<div data-role='material-pbr-fields' style='display:none;'>" +
            "<label style='display:block; margin-bottom:4px; color:#334155;'>Metallic <span data-role='material-metallic-value'>0</span></label>" +
            "<input data-role='material-metallic' type='range' min='0' max='1' step='0.01' value='0' style='width:100%; margin-bottom:8px;' />" +
            "<label style='display:block; margin-bottom:4px; color:#334155;'>Roughness <span data-role='material-roughness-value'>1</span></label>" +
            "<input data-role='material-roughness' type='range' min='0' max='1' step='0.01' value='1' style='width:100%; margin-bottom:8px;' />" +
          "</div>" +
          "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='material-wireframe' type='checkbox' /> Wireframe</label>" +
          "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='mesh-bounding-box' type='checkbox' /> Bounding box</label>" +
          "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='material-backface' type='checkbox' checked /> Backface culling</label>" +
        "</div>" +
      "</details>" +

      // --- Lights section ---
      "<details data-role='section-lights' open style='margin-bottom:8px;'>" +
        "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Lights</summary>" +
        "<div style='margin-top:8px; margin-left:10px;'>" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Lighting preset</label>" +
          "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
            "<select data-role='light-preset' style='flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
              "<option value='three_point'>three_point</option><option value='rembrandt'>rembrandt</option><option value='butterfly'>butterfly</option><option value='split'>split</option>" +
            "</select>" +
            "<button type='button' data-role='light-apply-preset' style='border:0; border-radius:6px; background:#0f766e; color:white; padding:6px 10px; cursor:pointer;'>Apply</button>" +
          "</div>" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>New light type</label>" +
          "<select data-role='new-light-type' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
            "<option value='point'>point</option><option value='spot'>spot</option><option value='directional'>directional</option><option value='hemispheric'>hemispheric</option>" +
          "</select>" +
          "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
            "<button type='button' data-role='light-add' style='flex:1; border:0; border-radius:6px; background:#0f766e; color:white; padding:6px 10px; cursor:pointer;'>Add Light</button>" +
            "<button type='button' data-role='light-remove' style='flex:1; border:0; border-radius:6px; background:#991b1b; color:white; padding:6px 10px; cursor:pointer;'>Remove</button>" +
          "</div>" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Light target</label>" +
          "<select data-role='light-target' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'></select>" +
          "<div style='display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;'>" +
            "<button type='button' data-role='light-mode' data-mode='translate' style='border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Move</button>" +
            "<button type='button' data-role='light-mode' data-mode='rotate' style='border:0; border-radius:6px; background:#334155; color:white; padding:6px 10px; cursor:pointer;'>Rotate</button>" +
          "</div>" +
          "<label data-role='intensity-label' style='display:block; margin-bottom:4px; color:#334155;'>Intensity <span data-role='intensity-value'>1</span></label>" +
          "<input data-role='intensity-slider' type='range' min='0' max='5' step='0.01' value='1' style='width:100%; margin-bottom:8px;' />" +
          "<label style='display:block; margin-bottom:4px; color:#334155;'>Diffuse color</label>" +
          "<input data-role='diffuse-color' type='color' value='#ffffff' style='width:100%; height:36px; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; padding:2px;' />" +
        "</div>" +
      "</details>" +

      // --- Scene State Log ---
      "<details data-role='section-log' style='margin-bottom:8px;'>" +
        "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Scene State Log</summary>" +
        "<div style='margin-top:8px; margin-left:10px;'>" +
          "<textarea readonly data-role='state-json' style='width:100%; min-height:160px; resize:vertical; font:inherit; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc;'></textarea>" +
          "<button type='button' data-role='copy-state' style='margin-top:8px; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Copy JSON</button>" +
        "</div>" +
      "</details>";

    // Collect UI refs
    var ui = {
      gizmoToggleButton: uiLayer.querySelector("[data-role='gizmo-toggle']"),
      meshSection: uiLayer.querySelector("[data-role='section-meshes']"),
      lightSection: uiLayer.querySelector("[data-role='section-lights']"),
      snapshotSection: uiLayer.querySelector("[data-role='section-snapshot']"),
      logSection: uiLayer.querySelector("[data-role='section-log']"),
      meshSelect: uiLayer.querySelector("[data-role='mesh-target']"),
      meshResetButton: uiLayer.querySelector("[data-role='mesh-reset']"),
      meshModeButtons: Array.from(uiLayer.querySelectorAll("[data-role='mesh-mode']")),
      lightSelect: uiLayer.querySelector("[data-role='light-target']"),
      lightPresetSelect: uiLayer.querySelector("[data-role='light-preset']"),
      lightPresetButton: uiLayer.querySelector("[data-role='light-apply-preset']"),
      newLightTypeSelect: uiLayer.querySelector("[data-role='new-light-type']"),
      lightAddButton: uiLayer.querySelector("[data-role='light-add']"),
      lightRemoveButton: uiLayer.querySelector("[data-role='light-remove']"),
      lightModeButtons: Array.from(uiLayer.querySelectorAll("[data-role='light-mode']")),
      intensityValue: uiLayer.querySelector("[data-role='intensity-value']"),
      intensitySlider: uiLayer.querySelector("[data-role='intensity-slider']"),
      diffuseColorInput: uiLayer.querySelector("[data-role='diffuse-color']"),
      scaleBarEnabledInput: uiLayer.querySelector("[data-role='scale-bar-enabled']"),
      scaleBarLengthInput: uiLayer.querySelector("[data-role='scale-bar-length']"),
      scaleBarUnitSelect: uiLayer.querySelector("[data-role='scale-bar-unit']"),
      scaleBarUnitOtherInput: uiLayer.querySelector("[data-role='scale-bar-unit-other']"),
      snapshotFilenameInput: uiLayer.querySelector("[data-role='snapshot-filename']"),
      snapshotFormatSelect: uiLayer.querySelector("[data-role='snapshot-format']"),
      snapshotSaveButton: uiLayer.querySelector("[data-role='snapshot-save']"),
      materialSection: uiLayer.querySelector("[data-role='section-materials']"),
      materialTypeSelect: uiLayer.querySelector("[data-role='material-type']"),
      materialColorLabel: uiLayer.querySelector("[data-role='material-color-label']"),
      materialColorInput: uiLayer.querySelector("[data-role='material-color']"),
      materialAlphaSlider: uiLayer.querySelector("[data-role='material-alpha']"),
      materialAlphaValue: uiLayer.querySelector("[data-role='material-alpha-value']"),
      materialPbrFields: uiLayer.querySelector("[data-role='material-pbr-fields']"),
      materialMetallicSlider: uiLayer.querySelector("[data-role='material-metallic']"),
      materialMetallicValue: uiLayer.querySelector("[data-role='material-metallic-value']"),
      materialRoughnessSlider: uiLayer.querySelector("[data-role='material-roughness']"),
      materialRoughnessValue: uiLayer.querySelector("[data-role='material-roughness-value']"),
      materialWireframeInput: uiLayer.querySelector("[data-role='material-wireframe']"),
      meshBoundingBoxInput: uiLayer.querySelector("[data-role='mesh-bounding-box']"),
      materialBackfaceInput: uiLayer.querySelector("[data-role='material-backface']"),
      stateText: uiLayer.querySelector("[data-role='state-json']"),
      copyButton: uiLayer.querySelector("[data-role='copy-state']"),
    };
    editorState.ui = ui;

    // --- Bind events ---

    // Material editing helper: always targets the mesh dropdown's value, not
    // the global selection (which could be a light).
    function updateSelectedMaterial(mutator) {
      var meshId = ui.meshSelect.value;
      if (!meshId) return;
      var target = editorState.targets.find(function(t) { return t.id === meshId; }) || null;
      if (!target || target.kind !== "mesh") return;
      var spec = editableMaterialSpec(target);
      if (!spec) return;
      mutator(spec, target);
      target.primitive.material = spec;
      applyMaterialToEditorTarget(target, bScene);
      updateEditorPanel();
      publishEditorState();
    }

    // Mesh selection
    ui.meshSelect.addEventListener("change", function(evt) {
      editorState.selectedId = evt.target.value;
      editorState.deferGizmoAttach = false;
      editorState.sectionOpen.meshes = true;
      syncEditorGizmoState(editorState, camera, sceneBounds);
      updateEditorPanel();
    });

    // Mesh mode buttons (move/rotate/scale) — always target the mesh dropdown's value
    ui.meshModeButtons.forEach(function(button) {
      button.addEventListener("click", function() {
        var meshId = ui.meshSelect.value;
        if (meshId) {
          editorState.selectedId = meshId;
          editorState.deferGizmoAttach = false;
        }
        editorState.gizmoMode = button.getAttribute("data-mode");
        editorState.sectionOpen.meshes = true;
        syncEditorGizmoState(editorState, camera, sceneBounds);
        updateEditorPanel();
      });
    });

    // Mesh reset — targets the mesh dropdown's value
    ui.meshResetButton.addEventListener("click", function() {
      var meshId = ui.meshSelect.value;
      var target = meshId ? editorState.targets.find(function(t) { return t.id === meshId && t.kind === "mesh"; }) : null;
      if (!target || !target.originalPrimitive) return;
      // Reset position/rotation/scaling from original
      if (target.node.position) target.node.position = new B.Vector3(0, 0, 0);
      if (target.node.rotation) target.node.rotation = new B.Vector3(0, 0, 0);
      if (target.node.scaling) target.node.scaling = new B.Vector3(1, 1, 1);
      syncEditorGizmoState(editorState, camera, sceneBounds);
      updateEditorPanel();
      publishEditorState();
    });

    // --- Material controls ---

    ui.materialTypeSelect.addEventListener("change", function(evt) {
      updateSelectedMaterial(function(spec) {
        var nextType = evt.target.value === "pbr" ? "pbr" : "standard";
        var alpha = spec.alpha;
        var wireframe = !!spec.wireframe;
        var backface = spec.backface_culling !== false;
        var prevColor = spec.type === "pbr" ? spec.base_color : spec.diffuse;
        var next = defaultMaterialSpec(nextType);
        next.alpha = alpha === undefined ? next.alpha : alpha;
        next.wireframe = wireframe;
        next.backface_culling = backface;
        if (nextType === "pbr") {
          next.base_color = prevColor || "#ffffff";
        } else {
          next.diffuse = prevColor || "#d9d9d9";
        }
        // Replace spec contents in-place
        Object.keys(spec).forEach(function(key) { delete spec[key]; });
        Object.keys(next).forEach(function(key) { spec[key] = next[key]; });
      });
    });

    ui.materialColorInput.addEventListener("input", function(evt) {
      updateSelectedMaterial(function(spec) {
        if (spec.type === "pbr") {
          spec.base_color = evt.target.value;
        } else {
          spec.diffuse = evt.target.value;
        }
      });
    });

    ui.materialAlphaSlider.addEventListener("input", function(evt) {
      updateSelectedMaterial(function(spec) {
        spec.alpha = Number(evt.target.value);
      });
    });

    ui.materialMetallicSlider.addEventListener("input", function(evt) {
      updateSelectedMaterial(function(spec) {
        spec.type = "pbr";
        spec.metallic = Number(evt.target.value);
      });
    });

    ui.materialRoughnessSlider.addEventListener("input", function(evt) {
      updateSelectedMaterial(function(spec) {
        spec.type = "pbr";
        spec.roughness = Number(evt.target.value);
      });
    });

    ui.materialWireframeInput.addEventListener("change", function(evt) {
      updateSelectedMaterial(function(spec) {
        spec.wireframe = !!evt.target.checked;
      });
    });

    ui.materialBackfaceInput.addEventListener("change", function(evt) {
      updateSelectedMaterial(function(spec) {
        spec.backface_culling = !!evt.target.checked;
      });
    });

    ui.meshBoundingBoxInput.addEventListener("change", function(evt) {
      var meshId = ui.meshSelect.value;
      var target = meshId ? editorState.targets.find(function(t) { return t.id === meshId && t.kind === "mesh"; }) : null;
      if (!target) return;
      target.primitive.show_bounding_box = !!evt.target.checked;
      if (target.node && target.node.showBoundingBox !== undefined) {
        target.node.showBoundingBox = !!evt.target.checked;
      }
      updateEditorPanel();
      publishEditorState();
    });

    // Light selection
    ui.lightSelect.addEventListener("change", function(evt) {
      editorState.selectedId = evt.target.value;
      editorState.deferGizmoAttach = false;
      editorState.sectionOpen.lights = true;
      syncEditorGizmoState(editorState, camera, sceneBounds);
      updateEditorPanel();
    });

    // Light mode buttons — always target the light dropdown's value
    ui.lightModeButtons.forEach(function(button) {
      button.addEventListener("click", function() {
        var lightId = ui.lightSelect.value;
        if (lightId) {
          editorState.selectedId = lightId;
          editorState.deferGizmoAttach = false;
        }
        editorState.gizmoMode = button.getAttribute("data-mode");
        editorState.sectionOpen.lights = true;
        syncEditorGizmoState(editorState, camera, sceneBounds);
        updateEditorPanel();
      });
    });

    // Add light
    ui.lightAddButton.addEventListener("click", function() {
      editorState.sectionOpen.lights = true;
      addEditorLightToState(editorState, ui.newLightTypeSelect.value || "point");
    });

    // Remove selected light
    ui.lightRemoveButton.addEventListener("click", function() {
      removeSelectedLight(editorState);
    });

    // Apply lighting preset
    ui.lightPresetButton.addEventListener("click", function() {
      editorState.sectionOpen.lights = true;
      applyLightingPresetToState(editorState, ui.lightPresetSelect.value || "three_point");
    });

    // Gizmo toggle
    ui.gizmoToggleButton.addEventListener("click", function() {
      editorState.gizmosVisible = !editorState.gizmosVisible;
      syncEditorGizmoState(editorState, camera, sceneBounds);
      updateEditorPanel();
    });

    // Intensity slider
    ui.intensitySlider.addEventListener("input", function(evt) {
      var target = selectedEditorTarget(editorState);
      var value = Number(evt.target.value);
      if (!target || target.kind !== "light" || !isFinite(value)) return;
      if (target.light) target.light.intensity = value;
      target.primitive.intensity = value;
      ui.intensityValue.textContent = value.toFixed(2).replace(/\.?0+$/, "");
      publishEditorState();
    });

    // Diffuse color
    ui.diffuseColorInput.addEventListener("input", function(evt) {
      var target = selectedEditorTarget(editorState);
      var value = evt.target.value;
      if (!target || target.kind !== "light" || !/^#[0-9a-fA-F]{6}$/.test(value)) return;
      if (target.light) target.light.diffuse = color3(value, target.light.diffuse);
      target.primitive.diffuse = value;
      if (target.helper && target.helper.material) {
        var c = color3(value, B.Color3.FromHexString("#f59e0b"));
        target.helper.material.diffuseColor = c;
        target.helper.material.emissiveColor = c.scale(0.3);
      }
      publishEditorState();
    });

    // Scale bar controls
    function updateScaleBarFromInputs() {
      var enabled = !!ui.scaleBarEnabledInput.checked;
      var length = Number(ui.scaleBarLengthInput.value);
      var unit = (ui.scaleBarUnitSelect.value || "mm").toLowerCase();
      var customUnit = ui.scaleBarUnitOtherInput.value ? String(ui.scaleBarUnitOtherInput.value).trim() : "";
      ui.scaleBarUnitOtherInput.style.display = unit === "other" ? "block" : "none";

      if (!enabled) {
        editorState.scaleBar = { enabled: false };
      } else if (isFinite(length) && length > 0) {
        editorState.scaleBar = { enabled: true, length: length, units: unit, custom_units: unit === "other" ? customUnit : null };
      } else {
        return;
      }
      scaleBarSpec = editorState.scaleBar;
      updateScaleBarDisplay();
      updateEditorPanel();
      publishEditorState();
    }

    ui.scaleBarEnabledInput.addEventListener("change", updateScaleBarFromInputs);
    ui.scaleBarLengthInput.addEventListener("input", updateScaleBarFromInputs);
    ui.scaleBarUnitSelect.addEventListener("change", updateScaleBarFromInputs);
    ui.scaleBarUnitOtherInput.addEventListener("input", updateScaleBarFromInputs);

    // Snapshot save
    ui.snapshotSaveButton.addEventListener("click", function() {
      // Hide UI, helpers, and gizmos for clean capture
      var prevUIDisplay = uiLayer.style.display;
      uiLayer.style.display = "none";

      // Hide helpers
      editorState.helpers.forEach(function(h) { if (h) h.setEnabled(false); });
      // Hide gizmos
      if (editorState.gizmoManager) {
        attachEditorTarget(editorState, null);
        editorState.gizmoManager.positionGizmoEnabled = false;
        editorState.gizmoManager.rotationGizmoEnabled = false;
        editorState.gizmoManager.scaleGizmoEnabled = false;
      }

      // Wait a frame for the scene to render without UI
      window.requestAnimationFrame(function() {
        window.requestAnimationFrame(function() {
          var filename = ui.snapshotFilenameInput.value || "scene.png";
          var dataUrl = canvas.toDataURL("image/png");

          // Trigger download
          var link = document.createElement("a");
          link.download = filename;
          link.href = dataUrl;
          link.click();

          // Also emit to Python so it can be captured
          emitHostEvent(container.id, "snapshot_request", {
            filename: filename,
            format: ui.snapshotFormatSelect.value || "png",
            data_url: dataUrl,
          });

          // Restore UI
          uiLayer.style.display = prevUIDisplay;
          editorState.helpers.forEach(function(h) { if (h) h.setEnabled(true); });
          syncEditorGizmoState(editorState, camera, sceneBounds);
        });
      });
    });

    // Snapshot format change -> update filename extension
    ui.snapshotFormatSelect.addEventListener("change", function(evt) {
      var format = evt.target.value || "png";
      var current = ui.snapshotFilenameInput.value || "scene.png";
      if (/\.[A-Za-z0-9]+$/.test(current)) {
        ui.snapshotFilenameInput.value = current.replace(/\.[A-Za-z0-9]+$/, "." + format);
      } else {
        ui.snapshotFilenameInput.value = current + "." + format;
      }
    });

    // Copy JSON
    ui.copyButton.addEventListener("click", function() {
      var text = ui.stateText.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
      ui.copyButton.textContent = "Copied!";
      setTimeout(function() { ui.copyButton.textContent = "Copy JSON"; }, 1500);
    });

    // Section toggle tracking
    [ui.meshSection, ui.materialSection, ui.lightSection, ui.snapshotSection, ui.logSection].forEach(function(section) {
      if (!section) return;
      section.addEventListener("toggle", function() {
        editorState.sectionOpen.meshes = !!ui.meshSection.open;
        if (ui.materialSection) editorState.sectionOpen.materials = !!ui.materialSection.open;
        editorState.sectionOpen.lights = !!ui.lightSection.open;
        editorState.sectionOpen.snapshot = !!ui.snapshotSection.open;
        editorState.sectionOpen.log = !!ui.logSection.open;
      });
    });

    // Panel drag
    enableUiPanelDrag(uiLayer.querySelector("[data-role='panel-handle']"), uiLayer);

    // Initial panel populate
    updateEditorPanel();
  }

  // ---------------------------------------------------------------------------
  // Editor: add/remove lights
  // ---------------------------------------------------------------------------

  function addEditorLightToState(state, lightType, definition) {
    if (!state) return;
    var index = nextEditorTargetIndex(state);
    var seed = definition || {};
    var position = coerceVector3(seed.position, defaultLightPosition(sceneBounds));
    var primitive = {
      type: "light3d",
      light_type: seed.type || lightType || "point",
      name: uniqueEditorPrimitiveName(state, seed.name || ((lightType || "light") + "_light")),
      position: vectorToArray(position),
      direction: seed.direction || (lightType === "hemispheric" ? [0, 1, 0] : [0, -1, 0]),
      intensity: seed.intensity === undefined ? 1 : Number(seed.intensity),
      diffuse: seed.diffuse || "#ffffff",
      specular: seed.specular || "#ffffff",
      enabled: seed.enabled === undefined ? true : seed.enabled !== false,
    };
    if (primitive.light_type === "spot") {
      primitive.angle = seed.angle === undefined ? Math.PI / 3 : Number(seed.angle);
      primitive.exponent = seed.exponent === undefined ? 1 : Number(seed.exponent);
    }

    setDefaultLightsEnabled(false);
    var created = createEditorLight(primitive, primitive.name, bScene);
    var target = {
      id: editorTargetId(index),
      index: index,
      primitiveType: primitive.type,
      primitive: primitive,
      name: primitive.name,
      node: created.editorNode,
      kind: "light",
      light: created.light,
      label: primitive.name + " [light]",
      createdInEditor: true,
      originalPrimitive: JSON.parse(JSON.stringify(primitive)),
    };
    state.targets.push(target);

    target.helper = createLightHelper(target.node, primitive, primitive.name, bScene, sceneBounds);
    if (target.helper) state.helpers.push(target.helper);

    // Update light helper positions
    state.targets.forEach(function(t) {
      if (t.kind === "light" && t.helper && t.node && t.node.position)
        t.helper.position.copyFrom(t.node.position);
    });

    state.selectedId = target.id;
    state.deferGizmoAttach = false;
    syncEditorGizmoState(state, camera, sceneBounds);
    updateEditorPanel();
    publishEditorState();
  }

  function removeSelectedLight(state) {
    if (!state || !state.targets.length) return;
    var selected = selectedEditorTarget(state);
    if (!selected || selected.kind !== "light") return;

    // Record removal if not created in editor
    if (!selected.createdInEditor) {
      state.removedObjects.push({
        index: (selected.index || 0) + 1,
        primitive_type: selected.primitiveType || (selected.primitive ? selected.primitive.type : null),
        node_type: selected.kind,
        name: selected.name || null,
      });
    }

    // Dispose light and helper
    if (selected.light && selected.light.dispose) selected.light.dispose();
    if (selected.helper && selected.helper.dispose) selected.helper.dispose();
    if (selected.node && selected.node.dispose) selected.node.dispose();

    state.targets = state.targets.filter(function(t) { return t.id !== selected.id; });
    state.helpers = state.helpers.filter(function(h) { return h && h !== selected.helper; });

    if (!editorTargetsByKind(state, "light").length) setDefaultLightsEnabled(true);

    var fallback = state.targets.length ? state.targets[0] : null;
    state.selectedId = fallback ? fallback.id : null;
    syncEditorGizmoState(state, camera, sceneBounds);
    updateEditorPanel();
    publishEditorState();
  }

  function applyLightingPresetToState(state, presetName) {
    if (!state) return;
    // Remove all existing lights
    var existingLights = editorTargetsByKind(state, "light").slice();
    existingLights.forEach(function(target) {
      if (!target.createdInEditor) {
        state.removedObjects.push({
          index: (target.index || 0) + 1,
          primitive_type: target.primitiveType,
          node_type: target.kind,
          name: target.name || null,
        });
      }
      if (target.light && target.light.dispose) target.light.dispose();
      if (target.helper && target.helper.dispose) target.helper.dispose();
      if (target.node && target.node.dispose) target.node.dispose();
    });
    state.targets = state.targets.filter(function(t) { return t.kind !== "light"; });
    state.helpers = [];

    var definitions = lightingPresetDefinitions(presetName, sceneBounds);
    setDefaultLightsEnabled(false);
    definitions.forEach(function(def) {
      addEditorLightToState(state, def.type, def);
    });
    var lights = editorTargetsByKind(state, "light");
    state.selectedId = lights.length ? lights[0].id : null;
    syncEditorGizmoState(state, camera, sceneBounds);
    updateEditorPanel();
    publishEditorState();
  }

  // ---------------------------------------------------------------------------
  // Editor: build payload and publish
  // ---------------------------------------------------------------------------

  function buildEditorPayload() {
    var targets = editorState ? editorState.targets : [];
    return {
      view: currentPar3dState(camera, payload),
      scale_bar: editorState && editorState.scaleBar ? JSON.parse(JSON.stringify(editorState.scaleBar)) : null,
      removed_objects: (editorState ? editorState.removedObjects : []).map(function(e) {
        return JSON.parse(JSON.stringify(e));
      }),
      objects: targets.map(function(target) {
        var entry = {
          index: target.index + 1,
          primitive_type: target.primitiveType,
          node_type: target.kind,
          name: target.name || null,
        };
        if (target.kind === "light") {
          entry.light_type = target.primitive.light_type || "hemispheric";
          if (target.node && target.node.position) entry.position = vectorToArray(target.node.position);
          if (target.light && target.light.direction) entry.direction = vectorToArray(target.light.direction);
          if (target.primitive.intensity !== undefined) entry.intensity = Number(target.primitive.intensity);
          if (target.primitive.diffuse !== undefined) entry.diffuse = target.primitive.diffuse;
          if (target.primitive.specular !== undefined) entry.specular = target.primitive.specular;
          if (target.createdInEditor) entry.created_in_editor = true;
          return entry;
        }
        // Mesh
        if (target.node) {
          entry.position = vectorToArray(target.node.position);
          entry.rotation = target.node.rotation ? vectorToArray(target.node.rotation) : [0, 0, 0];
          entry.scaling = target.node.scaling ? vectorToArray(target.node.scaling) : [1, 1, 1];
        }
        if (target.primitive && target.primitive.material) {
          try { entry.material = JSON.parse(JSON.stringify(target.primitive.material)); } catch(e) {}
        }
        if (target.primitive && target.primitive.show_bounding_box !== undefined) {
          entry.show_bounding_box = target.primitive.show_bounding_box === true;
        }
        if (target.createdInEditor) entry.created_in_editor = true;
        return entry;
      }),
      selected: editorState ? editorState.selectedId : null,
      gizmo_mode: editorState ? editorState.gizmoMode : "translate",
      gizmos_visible: editorState ? editorState.gizmosVisible !== false : true,
    };
  }

  function publishEditorState() {
    if (!editorState || editorState.mode !== "edit_scene3d") return;
    var editorPayload = buildEditorPayload();
    var text = JSON.stringify(editorPayload);

    if (editorState.ui && editorState.ui.stateText) {
      editorState.ui.stateText.value = text;
    }

    emitHostEvent(container.id, "scene_state", text);

    // Also push structured state to Python via the model traitlet
    if (modelRef) {
      modelRef.set("scene_state", { event: "scene_state", value: editorPayload, ts: Date.now() });
      modelRef.save_changes();
    }
  }

  // ---------------------------------------------------------------------------
  // Editor: update panel display
  // ---------------------------------------------------------------------------

  function updateEditorPanel() {
    if (!editorState || !editorState.ui) return;
    var ui = editorState.ui;
    var selected = selectedEditorTarget(editorState);
    var meshTargets = editorTargetsByKind(editorState, "mesh");
    var lightTargets = editorTargetsByKind(editorState, "light");

    // Update section open states
    ui.meshSection.open = editorState.sectionOpen.meshes !== false;
    if (ui.materialSection) ui.materialSection.open = editorState.sectionOpen.materials !== false;
    ui.lightSection.open = editorState.sectionOpen.lights !== false;
    ui.snapshotSection.open = editorState.sectionOpen.snapshot === true;
    ui.logSection.open = editorState.sectionOpen.log === true;

    // Populate mesh select
    ui.meshSelect.innerHTML = "";
    meshTargets.forEach(function(target) {
      var option = document.createElement("option");
      option.value = target.id;
      option.textContent = target.label;
      option.selected = !!selected && target.id === selected.id;
      ui.meshSelect.appendChild(option);
    });
    if (!meshTargets.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(no meshes)";
      ui.meshSelect.appendChild(opt);
    }

    // Highlight active mesh mode button
    ui.meshModeButtons.forEach(function(btn) {
      var isActive = btn.getAttribute("data-mode") === editorState.gizmoMode && selected && selected.kind === "mesh";
      btn.style.background = isActive ? "#0f172a" : "#475569";
    });

    // Populate light select
    ui.lightSelect.innerHTML = "";
    lightTargets.forEach(function(target) {
      var option = document.createElement("option");
      option.value = target.id;
      option.textContent = target.label;
      option.selected = !!selected && target.id === selected.id;
      ui.lightSelect.appendChild(option);
    });
    if (!lightTargets.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(no lights)";
      ui.lightSelect.appendChild(opt);
    }

    // Highlight active light mode button
    ui.lightModeButtons.forEach(function(btn) {
      var isActive = btn.getAttribute("data-mode") === editorState.gizmoMode && selected && selected.kind === "light";
      btn.style.background = isActive ? "#0f172a" : "#334155";
    });

    // Update light property inputs
    if (selected && selected.kind === "light") {
      var intensity = selected.primitive.intensity !== undefined ? selected.primitive.intensity : 1;
      ui.intensitySlider.value = intensity;
      ui.intensityValue.textContent = Number(intensity).toFixed(2).replace(/\.?0+$/, "");
      ui.diffuseColorInput.value = selected.primitive.diffuse || "#ffffff";
    }

    // Update material controls from mesh dropdown target (not global selection)
    var meshDropdownId = ui.meshSelect.value;
    var meshTarget = meshDropdownId
      ? editorState.targets.find(function(t) { return t.id === meshDropdownId && t.kind === "mesh"; }) || null
      : null;
    if (meshTarget && ui.materialTypeSelect) {
      var matSpec = editableMaterialSpec(meshTarget);
      if (matSpec) {
        ui.materialTypeSelect.value = matSpec.type || "standard";
        ui.materialColorLabel.textContent = matSpec.type === "pbr" ? "Base color" : "Diffuse color";
        ui.materialColorInput.value = matSpec.type === "pbr"
          ? (matSpec.base_color || "#ffffff")
          : (matSpec.diffuse || "#d9d9d9");
        ui.materialAlphaSlider.value = matSpec.alpha !== undefined ? matSpec.alpha : 1;
        ui.materialAlphaValue.textContent = Number(matSpec.alpha !== undefined ? matSpec.alpha : 1).toFixed(2).replace(/\.?0+$/, "");
        ui.materialPbrFields.style.display = matSpec.type === "pbr" ? "block" : "none";
        if (matSpec.type === "pbr") {
          ui.materialMetallicSlider.value = matSpec.metallic !== undefined ? matSpec.metallic : 0;
          ui.materialMetallicValue.textContent = Number(matSpec.metallic !== undefined ? matSpec.metallic : 0).toFixed(2).replace(/\.?0+$/, "");
          ui.materialRoughnessSlider.value = matSpec.roughness !== undefined ? matSpec.roughness : 1;
          ui.materialRoughnessValue.textContent = Number(matSpec.roughness !== undefined ? matSpec.roughness : 1).toFixed(2).replace(/\.?0+$/, "");
        }
        ui.materialWireframeInput.checked = !!matSpec.wireframe;
        ui.materialBackfaceInput.checked = matSpec.backface_culling !== false;
        ui.meshBoundingBoxInput.checked = !!(meshTarget.primitive && meshTarget.primitive.show_bounding_box);
      }
    }

    // Gizmo toggle button text
    ui.gizmoToggleButton.textContent = editorState.gizmosVisible ? "Hide Gizmo" : "Show Gizmo";

    // Scale bar inputs
    var sb = editorState.scaleBar || {};
    ui.scaleBarEnabledInput.checked = !!sb.enabled;
    if (sb.length) ui.scaleBarLengthInput.value = sb.length;
    if (sb.units) ui.scaleBarUnitSelect.value = sb.units;
    ui.scaleBarUnitOtherInput.style.display = sb.units === "other" ? "block" : "none";
    if (sb.custom_units) ui.scaleBarUnitOtherInput.value = sb.custom_units;

    // State JSON log
    var editorPayload = buildEditorPayload();
    ui.stateText.value = JSON.stringify(editorPayload, null, 2);
  }

  // ---------------------------------------------------------------------------
  // Panel drag helper
  // ---------------------------------------------------------------------------

  function enableUiPanelDrag(handle, panel) {
    if (!handle || !panel) return;
    var dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    handle.addEventListener("mousedown", function(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var rect = panel.getBoundingClientRect();
      var parentRect = panel.parentElement.getBoundingClientRect();
      origLeft = rect.left - parentRect.left;
      origTop = rect.top - parentRect.top;
      panel.style.right = "auto";
      panel.style.left = origLeft + "px";
      panel.style.top = origTop + "px";
      e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
      if (!dragging) return;
      panel.style.left = (origLeft + (e.clientX - startX)) + "px";
      panel.style.top = (origTop + (e.clientY - startY)) + "px";
    });

    document.addEventListener("mouseup", function() { dragging = false; });
  }

  // ---------------------------------------------------------------------------
  // View state publishing (non-editor and editor camera updates)
  // ---------------------------------------------------------------------------

  var publishViewStateHandle = null;
  var scheduleHostStatePublish = function() {
    if (publishViewStateHandle !== null) return;
    publishViewStateHandle = window.requestAnimationFrame(function() {
      publishViewStateHandle = null;
      var par3d = currentPar3dState(camera, payload);
      emitHostEvent(container.id, "par3d", par3d);

      if (isEditorMode && editorState) {
        publishEditorState();
      } else if (modelRef) {
        var nextPayload = JSON.parse(JSON.stringify(payload || {}));
        if (!nextPayload.scene) nextPayload.scene = {};
        nextPayload.scene.view = par3d;
        modelRef.set("scene_state", { event: "par3d", value: par3d, ts: Date.now() });
        modelRef.save_changes();
      }
    });
  };

  camera.onViewMatrixChangedObservable.add(function() {
    scheduleHostStatePublish();
    updateScaleBarDisplay();
  });
  engine.resize();
  // In editor mode, sync light helper positions every frame so they track gizmo drags
  if (isEditorMode && editorState) {
    bScene.registerBeforeRender(function() {
      updateLightHelpers(editorState);
    });
  }
  var _renderFrameCount = 0;
  engine.runRenderLoop(function() {
    bScene.render();
    _renderFrameCount++;
    // Explicitly render the GizmoManager's utility layer — in the anywidget
    // context the automatic UtilityLayerRenderer observer doesn't fire.
    // Skip the first frame to avoid clearing the canvas before the main scene
    // has fully rendered.
    if (_renderFrameCount > 1 && editorState && editorState.gizmoManager) {
      var ul = editorState.gizmoManager.utilityLayer || editorState.gizmoManager._defaultUtilityLayer;
      if (ul && ul.utilityLayerScene) {
        ul.render();
      }
    }
  });
  scheduleHostStatePublish();

  // "Save scene state" button (non-editor mode only)
  if (!isEditorMode) {
    var btn = document.createElement("button");
    btn.textContent = "Save scene state";
    btn.style.cssText =
      "position:absolute; bottom:12px; right:12px; z-index:10;" +
      "padding:6px 14px; border:none; border-radius:5px; cursor:pointer;" +
      "background:#2563eb; color:#fff; font-size:13px; font-family:sans-serif;" +
      "box-shadow:0 1px 4px rgba(0,0,0,.3); transition:background .15s;";
    btn.onmouseenter = function() { btn.style.background = "#1d4ed8"; };
    btn.onmouseleave = function() { btn.style.background = "#2563eb"; };
    btn.onclick = function() {
      var nextPayload = JSON.parse(JSON.stringify(payload || {}));
      if (!nextPayload.scene) nextPayload.scene = {};
      nextPayload.scene.view = currentPar3dState(camera, payload);
      emitHostEvent(container.id, "scene_state", nextPayload);
      btn.textContent = "\u2713 Saved";
      btn.style.background = "#16a34a";
      setTimeout(function() { btn.textContent = "Save scene state"; btn.style.background = "#2563eb"; }, 1800);
    };
    container.appendChild(btn);
  }

  var onResize = function() {
    engine.resize();
    updateScaleBarDisplay();
  };
  window.addEventListener("resize", onResize);
  el._babylonCanvas = canvas;

  return function() {
    blobUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch(e){} });
    window.removeEventListener("resize", onResize);
    if (editorState && editorState.gizmoManager) editorState.gizmoManager.dispose();
    if (editorState && editorState.helpers) {
      editorState.helpers.forEach(function(h) { if (h && h.dispose) h.dispose(); });
    }
    bScene.dispose();
    engine.dispose();
    el.replaceChildren();
  };
}

function showWidgetError(el, msg) {
  el.style.cssText = "display:flex; align-items:flex-start; background:#1e1e1e; color:#f87171; " +
    "font-family:monospace; font-size:13px; padding:16px; white-space:pre-wrap; " +
    "overflow:auto; box-sizing:border-box;";
  el.textContent = "[Babylonian] " + msg;
  console.error("[Babylonian]", msg);
}

export default {
  render({ model, el }) {
    let cleanup = () => {};

    try {
      ensureBabylon(model);
    } catch (err) {
      showWidgetError(el, "Failed to load BabylonJS:\n" + err);
      return () => {};
    }

    const draw = () => {
      cleanup();
      try {
        cleanup = buildScene(
          el,
          model.get("scene_payload") || {},
          model.get("width") || 900,
          model.get("height") || 700,
          model.get("element_id") || "",
          model,
        );
      } catch (err) {
        showWidgetError(el, "Scene render error:\n" + err);
        cleanup = () => {};
      }
    };

    draw();
    model.on("change:scene_payload", draw);
    model.on("change:width", draw);
    model.on("change:height", draw);

    const onHostEvent = (event) => {
      const { event: eventName, value } = event.detail || {};
      if (eventName === "scene_state" || eventName === "par3d") {
        // Parse string values back to objects
        var parsed = value;
        if (typeof value === "string") {
          try { parsed = JSON.parse(value); } catch(e) { parsed = value; }
        }
        model.set("scene_state", { event: eventName, value: parsed, ts: Date.now() });
        model.save_changes();
      }
    };
    window.addEventListener("babylonian-host-event", onHostEvent);

    const onSnapshotRequest = () => {
      const canvas = el._babylonCanvas;
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        model.set("_snapshot_data", dataUrl);
        model.save_changes();
      }
    };
    model.on("change:_snapshot_request", onSnapshotRequest);

    return () => {
      window.removeEventListener("babylonian-host-event", onHostEvent);
      model.off("change:scene_payload");
      model.off("change:width");
      model.off("change:height");
      model.off("change:_snapshot_request");
      cleanup();
    };
  },
};
