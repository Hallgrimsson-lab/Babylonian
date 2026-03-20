const BABYLON_JS_URL = "https://cdn.babylonjs.com/babylon.js";
const BABYLON_LOADERS_URL = "https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js";

let babylonReadyPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script")).find((node) => node.src === src);
    if (existing) {
      if (window.BABYLON) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", (event) => reject(event), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (event) => reject(event);
    document.head.appendChild(script);
  });
}

function ensureBabylon() {
  if (window.BABYLON) {
    return Promise.resolve(window.BABYLON);
  }
  if (!babylonReadyPromise) {
    babylonReadyPromise = loadScript(BABYLON_JS_URL)
      .then(() => loadScript(BABYLON_LOADERS_URL))
      .then(() => window.BABYLON);
  }
  return babylonReadyPromise;
}

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
  if (!view) {
    return;
  }
  if (view.camera) {
    camera.setTarget(
      new window.BABYLON.Vector3(view.camera.target[0], view.camera.target[1], view.camera.target[2]),
    );
    camera.alpha = view.camera.alpha;
    camera.beta = view.camera.beta;
    camera.radius = view.camera.radius;
    return;
  }
  if (view.zoom !== undefined && Number(view.zoom) > 0) {
    camera.radius = Math.max(8 / Number(view.zoom), 0.01);
  }
}

function renderAxes(scene, payload, radius) {
  if (!payload.scene || payload.scene.axes === false) {
    return;
  }

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
  if (!payload.scene || payload.scene.axes === false) {
    return;
  }

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

function buildScene(el, payload, width, height, elementId) {
  el.replaceChildren();

  const container = document.createElement("div");
  container.id = elementId || `babylonian-widget-${Math.random().toString(16).slice(2)}`;
  container.style.width = "100%";
  container.style.maxWidth = `${width}px`;
  container.style.aspectRatio = `${width} / ${height}`;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);
  el.appendChild(container);

  const engine = new window.BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new window.BABYLON.Scene(engine);
  scene.useRightHandedSystem = true;
  const bg = (payload.scene && payload.scene.view && payload.scene.view.bg) || "#FAFAFA";
  scene.clearColor = window.BABYLON.Color4.FromHexString(`${bg}${bg.length === 7 ? "FF" : ""}`);

  const camera = new window.BABYLON.ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    Math.PI / 2.4,
    8,
    new window.BABYLON.Vector3(0, 0, 0),
    scene,
  );
  camera.fov = 0.6;
  camera.minZ = 0.01;
  camera.wheelPrecision = 12;
  camera.wheelDeltaPercentage = 0.08;
  camera.attachControl(canvas, true);

  const hemi = new window.BABYLON.HemisphericLight("default-hemi", new window.BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  const key = new window.BABYLON.DirectionalLight(
    "default-key",
    new window.BABYLON.Vector3(-0.5, -1, 0.2),
    scene,
  );
  key.intensity = 0.35;

  let hasCustomLights = false;
  let min = new window.BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new window.BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

  (payload.objects || []).forEach((object, index) => {
    if (object.type === "light3d") {
      hasCustomLights = true;
      const lightType = object.light_type || "hemispheric";
      const direction = object.direction || [0, lightType === "hemispheric" ? 1 : -1, 0];
      const position = object.position || [0, 1, 0];
      let light = null;

      if (lightType === "point") {
        light = new window.BABYLON.PointLight(
          object.name || `light${index}`,
          new window.BABYLON.Vector3(position[0], position[1], position[2]),
          scene,
        );
      } else if (lightType === "directional") {
        light = new window.BABYLON.DirectionalLight(
          object.name || `light${index}`,
          new window.BABYLON.Vector3(direction[0], direction[1], direction[2]),
          scene,
        );
        light.position = new window.BABYLON.Vector3(position[0], position[1], position[2]);
      } else if (lightType === "spot") {
        light = new window.BABYLON.SpotLight(
          object.name || `light${index}`,
          new window.BABYLON.Vector3(position[0], position[1], position[2]),
          new window.BABYLON.Vector3(direction[0], direction[1], direction[2]),
          object.angle === undefined ? Math.PI / 3 : Number(object.angle),
          object.exponent === undefined ? 1 : Number(object.exponent),
          scene,
        );
      } else {
        light = new window.BABYLON.HemisphericLight(
          object.name || `light${index}`,
          new window.BABYLON.Vector3(direction[0], direction[1], direction[2]),
          scene,
        );
      }

      if (object.intensity !== undefined) {
        light.intensity = Number(object.intensity);
      }
      if (object.diffuse) {
        light.diffuse = color3(object.diffuse, light.diffuse);
      }
      if (object.specular) {
        light.specular = color3(object.specular, light.specular);
      }
      return;
    }

    if (object.type !== "mesh3d") {
      return;
    }

    const mesh = new window.BABYLON.Mesh(object.name || `mesh${index}`, scene);
    const vertexData = new window.BABYLON.VertexData();
    const normals = [];
    vertexData.positions = object.vertices;
    vertexData.indices = object.indices;
    window.BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);
    applyPrimitiveMaterial(mesh, object, scene);

    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min = window.BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = window.BABYLON.Vector3.Maximize(max, box.maximumWorld);
  });

  if (hasCustomLights) {
    hemi.setEnabled(false);
    key.setEnabled(false);
  }

  if (min.x !== Infinity) {
    const center = min.add(max).scale(0.5);
    const extent = max.subtract(min);
    const radius = Math.max(extent.length() / 2, 1);
    camera.setTarget(center);
    camera.radius = radius * 2.5;
    renderBoundingBox(scene, payload, min, max);
    renderAxes(scene, payload, radius);
  } else {
    renderAxes(scene, payload, 1);
  }

  applyView(camera, payload);
  engine.resize();
  engine.runRenderLoop(() => {
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return () => {
    window.removeEventListener("resize", onResize);
    scene.dispose();
    engine.dispose();
    el.replaceChildren();
  };
}

export default async function () {
  await ensureBabylon();

  return {
    render({ model, el }) {
      let cleanup = () => {};

      const draw = () => {
        cleanup();
        cleanup = buildScene(
          el,
          model.get("scene_payload") || {},
          model.get("width") || 900,
          model.get("height") || 700,
          model.get("element_id") || "",
        );
      };

      const redraw = () => draw();
      draw();

      model.on("change:scene_payload", redraw);
      model.on("change:width", redraw);
      model.on("change:height", redraw);

      return () => {
        model.off("change:scene_payload", redraw);
        model.off("change:width", redraw);
        model.off("change:height", redraw);
        cleanup();
      };
    },
  };
}
