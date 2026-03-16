HTMLWidgets.widget({

  name: 'babylon',

  type: 'output',

  factory: function(el, width, height) {

    // Create a canvas element
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    el.appendChild(canvas);

    // Create a Babylon.js engine
    var engine = new BABYLON.Engine(canvas, true);

    // Create a scene
    var scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.98, 0.98, 0.98, 1);

    // Create a camera
    var camera = new BABYLON.ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      Math.PI / 2.2,
      10,
      new BABYLON.Vector3(0, 0, 0),
      scene
    );
    camera.fov = 0.6;
    camera.minZ = 0.01;
    camera.wheelPrecision = 40;
    camera.attachControl(canvas, true);

    // Create a light
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.9;
    var fillLight = new BABYLON.HemisphericLight("fill", new BABYLON.Vector3(0, -1, -0.5), scene);
    fillLight.intensity = 0.35;
    var digitizeObserver = null;

    var uiLayer = document.createElement("div");
    uiLayer.style.position = "absolute";
    uiLayer.style.top = "12px";
    uiLayer.style.right = "12px";
    uiLayer.style.zIndex = "10";
    uiLayer.style.display = "none";
    uiLayer.style.maxWidth = "280px";
    uiLayer.style.padding = "10px";
    uiLayer.style.background = "rgba(255,255,255,0.92)";
    uiLayer.style.border = "1px solid rgba(15,23,42,0.12)";
    uiLayer.style.borderRadius = "8px";
    uiLayer.style.boxShadow = "0 10px 30px rgba(15,23,42,0.12)";
    uiLayer.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
    uiLayer.style.fontSize = "12px";
    uiLayer.style.lineHeight = "1.4";
    el.style.position = "relative";
    el.appendChild(uiLayer);
    var labelLayer = document.createElement("div");
    labelLayer.style.position = "absolute";
    labelLayer.style.inset = "0";
    labelLayer.style.pointerEvents = "none";
    labelLayer.style.zIndex = "5";
    el.appendChild(labelLayer);
    var sceneDecorations = [];
    var axisLabelState = [];
    var currentSceneOptions = null;
    var currentSceneBounds = null;

    function clamp01(x) {
      if (!isFinite(x)) {
        return 0;
      }
      return Math.min(1, Math.max(0, x));
    }

    function isHexColor(value) {
      return typeof value === "string" && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
    }

    function coerceColor3(value, fallback) {
      if (value instanceof BABYLON.Color3) {
        return value;
      }

      if (Array.isArray(value) && value.length >= 3) {
        return new BABYLON.Color3(
          clamp01(Number(value[0])),
          clamp01(Number(value[1])),
          clamp01(Number(value[2]))
        );
      }

      if (typeof value === "number") {
        var scalar = clamp01(value);
        return new BABYLON.Color3(scalar, scalar, scalar);
      }

      if (isHexColor(value)) {
        return BABYLON.Color3.FromHexString(value.slice(0, 7));
      }

      if (fallback) {
        return fallback.clone ? fallback.clone() : fallback;
      }

      return null;
    }

    function applyTransform(mesh, primitive) {
      if (primitive.position) {
        mesh.position = new BABYLON.Vector3(
          primitive.position[0] || 0,
          primitive.position[1] || 0,
          primitive.position[2] || 0
        );
      } else {
        mesh.position = new BABYLON.Vector3(0, 0, 0);
      }

      if (primitive.scaling) {
        mesh.scaling = new BABYLON.Vector3(
          primitive.scaling[0] || 1,
          primitive.scaling[1] || 1,
          primitive.scaling[2] || 1
        );
      }

      if (primitive.rotation) {
        mesh.rotation = new BABYLON.Vector3(
          primitive.rotation[0] || 0,
          primitive.rotation[1] || 0,
          primitive.rotation[2] || 0
        );
      }
    }

    function applyMaterial(mesh, primitive) {
      if (!primitive.color && primitive.alpha === undefined && primitive.specularity === undefined) {
        return;
      }

      var material = new BABYLON.StandardMaterial(mesh.name + "-material", scene);
      material.backFaceCulling = true;

      if (primitive.color) {
        material.diffuseColor = coerceColor3(primitive.color, material.diffuseColor);
      }

      if (primitive.specularity !== undefined) {
        material.specularColor = coerceColor3(
          primitive.specularity,
          new BABYLON.Color3(0, 0, 0)
        );
      }

      if (primitive.alpha !== undefined) {
        material.alpha = primitive.alpha;
        if (primitive.alpha < 1) {
          material.needDepthPrePass = true;
          material.separateCullingPass = true;
        }
      }

      mesh.material = material;
    }

    function createMarker(position, color, size, name, isPickable) {
      var marker = BABYLON.MeshBuilder.CreateSphere(name, {diameter: size}, scene);
      marker.position = position.clone();
      marker.isPickable = !!isPickable;

      var material = new BABYLON.StandardMaterial(name + "-material", scene);
      material.diffuseColor = coerceColor3(color, BABYLON.Color3.FromHexString("#dc2626"));
      material.emissiveColor = material.diffuseColor.scale(0.3);
      material.backFaceCulling = true;
      marker.material = material;

      return marker;
    }

    function meshRadius(mesh) {
      if (!mesh || !mesh.getBoundingInfo) {
        return 1;
      }

      mesh.computeWorldMatrix(true);
      var box = mesh.getBoundingInfo().boundingBox;
      var extent = box.maximumWorld.subtract(box.minimumWorld);
      var radius = extent.length() / 2;
      if (!isFinite(radius) || radius <= 0) {
        return 1;
      }

      return radius;
    }

    function toCoordinateArray(vector) {
      return [vector.x, vector.y, vector.z];
    }

    function updateDigitizePanel(state) {
      if (!state || state.mode !== "digitize_landmarks") {
        uiLayer.style.display = "none";
        uiLayer.innerHTML = "";
        return;
      }

      uiLayer.style.display = "block";
      var targetText = state.target ? state.points.length + " / " + state.target : String(state.points.length);
      var exportValue = JSON.stringify(state.points, null, 2);
      var doneText = state.target && state.points.length >= state.target ? "Target reached" : "Click mesh to add landmarks";
      uiLayer.innerHTML =
        "<div style='font-weight:700; margin-bottom:6px;'>Landmarks</div>" +
        "<div style='margin-bottom:6px; color:#334155;'>Collected: " + targetText + "</div>" +
        "<div style='margin-bottom:8px; color:#475569;'>" + doneText + "</div>" +
        "<textarea readonly style='width:100%; min-height:96px; resize:vertical; font:inherit; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc;'>" + exportValue + "</textarea>" +
        "<button type='button' style='margin-top:8px; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Copy JSON</button>";

      var button = uiLayer.querySelector("button");
      button.addEventListener("click", function() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(exportValue);
        }
      });
    }

    function publishLandmarks(state) {
      if (!state) {
        return;
      }

      updateDigitizePanel(state);

      if (HTMLWidgets.shinyMode && state.widgetId) {
        Shiny.setInputValue(
          state.widgetId + "_landmarks",
          JSON.stringify(state.points),
          {priority: "event"}
        );
      }
    }

    function initializeInteraction(interaction, primaryMesh) {
      if (!interaction || interaction.mode !== "digitize_landmarks" || !primaryMesh) {
        updateDigitizePanel(null);
        return null;
      }

      var state = {
        mode: interaction.mode,
        widgetId: el.id || null,
        target: interaction.n || null,
        markerColor: interaction.marker && interaction.marker.color ? interaction.marker.color : "#dc2626",
        markerScale: interaction.marker && interaction.marker.scale ? interaction.marker.scale : 0.015,
        points: [],
        markers: []
      };
      state.markerSize = meshRadius(primaryMesh) * state.markerScale;

      var fixedColor = "#2563eb";
      if (interaction.fixed) {
        interaction.fixed.forEach(function(coords, index) {
          var fixedMarker = createMarker(
            new BABYLON.Vector3(coords[0], coords[1], coords[2]),
            fixedColor,
            state.markerSize,
            "fixed-landmark-" + index,
            false
          );
          state.markers.push(fixedMarker);
        });
      }

      if (digitizeObserver) {
        scene.onPointerObservable.remove(digitizeObserver);
      }

      digitizeObserver = scene.onPointerObservable.add(function(pointerInfo) {
        if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK) {
          return;
        }

        if (state.target && state.points.length >= state.target) {
          return;
        }

        var pickInfo = pointerInfo.pickInfo;
        if (!pickInfo || !pickInfo.hit || pickInfo.pickedMesh !== primaryMesh) {
          return;
        }

        var point = pickInfo.pickedPoint.clone();
        state.points.push(toCoordinateArray(point));
        state.markers.push(
          createMarker(
            point,
            state.markerColor,
            state.markerSize,
            "digitized-landmark-" + state.points.length,
            false
          )
        );
        publishLandmarks(state);
      });

      publishLandmarks(state);
      return state;
    }

    function frameScene() {
      var meshes = scene.meshes.filter(function(mesh) {
        return mesh && mesh.isVisible && mesh.getTotalVertices && mesh.getTotalVertices() > 0;
      });

      if (!meshes.length) {
        return;
      }

      var min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      var max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

      meshes.forEach(function(mesh) {
        mesh.computeWorldMatrix(true);
        var info = mesh.getBoundingInfo().boundingBox;
        min = BABYLON.Vector3.Minimize(min, info.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, info.maximumWorld);
      });

      var center = min.add(max).scale(0.5);
      var extent = max.subtract(min);
      var radius = extent.length() / 2;

      if (!isFinite(radius) || radius <= 0) {
        radius = 1;
      }

      camera.setTarget(center);
      camera.radius = radius * 2.5;
      camera.lowerRadiusLimit = radius * 0.2;
      camera.upperRadiusLimit = radius * 20;
      camera.minZ = Math.max(radius / 1000, 0.01);
      camera.maxZ = Math.max(radius * 100, 1000);
      currentSceneBounds = {min: min.clone(), max: max.clone(), center: center.clone(), radius: radius};
    }

    function clearSceneDecorations() {
      sceneDecorations.forEach(function(mesh) {
        if (mesh && mesh.dispose) {
          mesh.dispose();
        }
      });
      sceneDecorations = [];
      axisLabelState = [];
      labelLayer.innerHTML = "";
    }

    function niceStep(span, ticks) {
      var rough = span / Math.max(ticks, 1);
      var exponent = Math.floor(Math.log10(Math.max(rough, 1e-8)));
      var fraction = rough / Math.pow(10, exponent);
      var niceFraction = 1;

      if (fraction > 5) {
        niceFraction = 10;
      } else if (fraction > 2) {
        niceFraction = 5;
      } else if (fraction > 1) {
        niceFraction = 2;
      }

      return niceFraction * Math.pow(10, exponent);
    }

    function makeLine(points, color, name) {
      var line = BABYLON.MeshBuilder.CreateLines(name, {points: points, updatable: false}, scene);
      line.color = color;
      line.isPickable = false;
      sceneDecorations.push(line);
      return line;
    }

    function addAxisLabel(text, point, color) {
      var label = document.createElement("div");
      label.textContent = text;
      label.style.position = "absolute";
      label.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
      label.style.fontSize = "11px";
      label.style.color = color;
      label.style.whiteSpace = "nowrap";
      label.style.textShadow = "0 1px 0 rgba(255,255,255,0.8)";
      labelLayer.appendChild(label);
      axisLabelState.push({
        element: label,
        point: point.clone()
      });
    }

    function updateAxisLabels() {
      axisLabelState.forEach(function(item) {
        var projected = BABYLON.Vector3.Project(
          item.point,
          BABYLON.Matrix.Identity(),
          scene.getTransformMatrix(),
          camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
        );
        item.element.style.left = projected.x + "px";
        item.element.style.top = projected.y + "px";
      });
    }

    function renderAxes(bounds, sceneOptions) {
      clearSceneDecorations();

      if (!sceneOptions || !sceneOptions.axes || !bounds) {
        return;
      }

      var min = bounds.min;
      var max = bounds.max;
      var span = max.subtract(min);
      var tickTarget = Math.max(2, sceneOptions.nticks || 5);
      var tickLength = bounds.radius * 0.03;
      var xColor = BABYLON.Color3.FromHexString("#b91c1c");
      var yColor = BABYLON.Color3.FromHexString("#047857");
      var zColor = BABYLON.Color3.FromHexString("#1d4ed8");
      var boxColor = BABYLON.Color3.FromHexString("#94a3b8");

      makeLine([
        new BABYLON.Vector3(min.x, min.y, min.z),
        new BABYLON.Vector3(max.x, min.y, min.z)
      ], xColor, "axis-x");
      makeLine([
        new BABYLON.Vector3(min.x, min.y, min.z),
        new BABYLON.Vector3(min.x, max.y, min.z)
      ], yColor, "axis-y");
      makeLine([
        new BABYLON.Vector3(min.x, min.y, min.z),
        new BABYLON.Vector3(min.x, min.y, max.z)
      ], zColor, "axis-z");

      addAxisLabel("x", new BABYLON.Vector3(max.x, min.y, min.z), "#b91c1c");
      addAxisLabel("y", new BABYLON.Vector3(min.x, max.y, min.z), "#047857");
      addAxisLabel("z", new BABYLON.Vector3(min.x, min.y, max.z), "#1d4ed8");

      var boxCorners = [
        new BABYLON.Vector3(min.x, min.y, min.z),
        new BABYLON.Vector3(max.x, min.y, min.z),
        new BABYLON.Vector3(max.x, max.y, min.z),
        new BABYLON.Vector3(min.x, max.y, min.z),
        new BABYLON.Vector3(min.x, min.y, max.z),
        new BABYLON.Vector3(max.x, min.y, max.z),
        new BABYLON.Vector3(max.x, max.y, max.z),
        new BABYLON.Vector3(min.x, max.y, max.z)
      ];
      [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ].forEach(function(edge, index) {
        makeLine([boxCorners[edge[0]], boxCorners[edge[1]]], boxColor, "box-edge-" + index);
      });

      [
        {axis: "x", color: xColor, htmlColor: "#b91c1c", fixed: [min.y, min.z], span: span.x, min: min.x},
        {axis: "y", color: yColor, htmlColor: "#047857", fixed: [min.x, min.z], span: span.y, min: min.y},
        {axis: "z", color: zColor, htmlColor: "#1d4ed8", fixed: [min.x, min.y], span: span.z, min: min.z}
      ].forEach(function(axisInfo) {
        var step = niceStep(axisInfo.span || 1, tickTarget);
        var start = Math.ceil(axisInfo.min / step) * step;
        for (var value = start; value <= axisInfo.min + axisInfo.span + step * 0.5; value += step) {
          var tickStart;
          var tickEnd;
          var labelPoint;

          if (axisInfo.axis === "x") {
            tickStart = new BABYLON.Vector3(value, axisInfo.fixed[0], axisInfo.fixed[1]);
            tickEnd = new BABYLON.Vector3(value, axisInfo.fixed[0] - tickLength, axisInfo.fixed[1]);
            labelPoint = new BABYLON.Vector3(value, axisInfo.fixed[0] - tickLength * 1.6, axisInfo.fixed[1]);
          } else if (axisInfo.axis === "y") {
            tickStart = new BABYLON.Vector3(axisInfo.fixed[0], value, axisInfo.fixed[1]);
            tickEnd = new BABYLON.Vector3(axisInfo.fixed[0] - tickLength, value, axisInfo.fixed[1]);
            labelPoint = new BABYLON.Vector3(axisInfo.fixed[0] - tickLength * 1.8, value, axisInfo.fixed[1]);
          } else {
            tickStart = new BABYLON.Vector3(axisInfo.fixed[0], axisInfo.fixed[1], value);
            tickEnd = new BABYLON.Vector3(axisInfo.fixed[0] - tickLength, axisInfo.fixed[1], value);
            labelPoint = new BABYLON.Vector3(axisInfo.fixed[0] - tickLength * 1.8, axisInfo.fixed[1], value);
          }

          makeLine([tickStart, tickEnd], axisInfo.color, "tick-" + axisInfo.axis + "-" + value.toFixed(4));
          addAxisLabel(Number(value.toPrecision(4)).toString(), labelPoint, axisInfo.htmlColor);
        }
      });

      updateAxisLabels();
    }

    // Render the scene
    engine.runRenderLoop(function () {
      scene.render();
      if (axisLabelState.length) {
        updateAxisLabels();
      }
    });

    // Resize the engine on window resize
    window.addEventListener("resize", function () {
      engine.resize();
      updateAxisLabels();
    });

    return {

      renderValue: function(x) {
        var payload = Array.isArray(x) ? {objects: x, interaction: null} : x;
        var objects = payload.objects || [];
        var interaction = payload.interaction || null;
        currentSceneOptions = payload.scene || null;

        var pendingImports = 0;
        var sceneUpdated = false;
        var primaryMesh = null;

        function scheduleFrame() {
          sceneUpdated = true;
          if (pendingImports === 0) {
            frameScene();
            renderAxes(currentSceneBounds, currentSceneOptions);
          }
        }

        objects.forEach(function(primitive, i) {
          var name = primitive.type + i;
          if (primitive.type === "sphere") {
            var sphere = BABYLON.MeshBuilder.CreateSphere(name, {diameter: primitive.diameter}, scene);
            applyTransform(sphere, primitive);
            applyMaterial(sphere, primitive);
            scheduleFrame();
          } else if (primitive.type === "box") {
            var box = BABYLON.MeshBuilder.CreateBox(name, {size: primitive.size}, scene);
            applyTransform(box, primitive);
            applyMaterial(box, primitive);
            scheduleFrame();
          } else if (primitive.type === "plane") {
            var plane = BABYLON.MeshBuilder.CreatePlane(name, {width: primitive.width, height: primitive.height}, scene);
            applyTransform(plane, primitive);
            applyMaterial(plane, primitive);
            scheduleFrame();
          } else if (primitive.type === "cylinder") {
            var cylinder = BABYLON.MeshBuilder.CreateCylinder(name, {diameter: primitive.diameter, height: primitive.height}, scene);
            applyTransform(cylinder, primitive);
            applyMaterial(cylinder, primitive);
            scheduleFrame();
          } else if (primitive.type === "cone") {
            var cone = BABYLON.MeshBuilder.CreateCylinder(name, {
              diameterTop: 0,
              diameterBottom: primitive.diameter,
              height: primitive.height
            }, scene);
            applyTransform(cone, primitive);
            applyMaterial(cone, primitive);
            scheduleFrame();
          } else if (primitive.type === "mesh3d") {
            var babylonMesh = new BABYLON.Mesh(primitive.name || name, scene);
            var vertexData = new BABYLON.VertexData();
            var normals = [];

            vertexData.positions = primitive.vertices;
            vertexData.indices = primitive.indices;
            BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
            vertexData.normals = normals;
            vertexData.applyToMesh(babylonMesh);

            applyTransform(babylonMesh, primitive);
            applyMaterial(babylonMesh, primitive);
            if (!primaryMesh) {
              primaryMesh = babylonMesh;
            }
            scheduleFrame();
          } else if (primitive.type === "mesh") {
            pendingImports += 1;
            BABYLON.SceneLoader.ImportMesh("", "", primitive.file, scene, function (newMeshes) {
              newMeshes.forEach(function(mesh) {
                applyTransform(mesh, primitive);
                applyMaterial(mesh, primitive);
                if (!primaryMesh && mesh.getTotalVertices && mesh.getTotalVertices() > 0) {
                  primaryMesh = mesh;
                }
              });
              pendingImports -= 1;
              initializeInteraction(interaction, primaryMesh);
              scheduleFrame();
            }, null, function(scene, message, exception) {
              console.error("Error importing mesh:", message, exception);
              pendingImports -= 1;
              if (sceneUpdated && pendingImports === 0) {
                frameScene();
              }
            });
          }
        });

        initializeInteraction(interaction, primaryMesh);

        if (sceneUpdated && pendingImports === 0) {
          frameScene();
          renderAxes(currentSceneBounds, currentSceneOptions);
        }

      },

      resize: function(width, height) {

        // Resize the canvas
        canvas.width = width;
        canvas.height = height;
        engine.resize();

      }

    };
  }
});
