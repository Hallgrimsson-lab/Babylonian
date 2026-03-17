HTMLWidgets.widget({

  name: 'babylon',

  type: 'output',

  factory: function(el, width, height) {

    // Create a canvas element
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    el.appendChild(canvas);
    el.style.position = "relative";

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
    camera.wheelPrecision = 12;
    camera.wheelDeltaPercentage = 0.08;
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
    var baseCameraState = null;
    var activeInteractionState = null;
    var publishViewStateHandle = null;

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

    function createPointBillboard(position, color, alpha, size, name) {
      var plane = BABYLON.MeshBuilder.CreatePlane(name, {size: size}, scene);
      plane.position = position.clone();
      plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      plane.isPickable = false;

      var material = new BABYLON.StandardMaterial(name + "-material", scene);
      material.diffuseColor = coerceColor3(color, BABYLON.Color3.FromHexString("#111111"));
      material.emissiveColor = material.diffuseColor.scale(0.6);
      material.specularColor = new BABYLON.Color3(0, 0, 0);
      material.backFaceCulling = false;
      material.disableLighting = true;
      if (alpha !== undefined) {
        material.alpha = alpha;
      }
      plane.material = material;

      return plane;
    }

    function pointColorAt(color, index, fallback) {
      if (Array.isArray(color) && color.length && typeof color[0] === "string") {
        return color[index] || fallback;
      }
      if (color && typeof color === "object" && !Array.isArray(color)) {
        if (typeof color[index] === "string") {
          return color[index];
        }
        var values = Object.values(color);
        if (values.length && typeof values[0] === "string") {
          return values[index] || fallback;
        }
      }
      return color || fallback;
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

    function pointCloudRadius(points) {
      if (!points || !points.length) {
        return 1;
      }

      var min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      var max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
      points.forEach(function(coords) {
        min.x = Math.min(min.x, coords[0]);
        min.y = Math.min(min.y, coords[1]);
        min.z = Math.min(min.z, coords[2]);
        max.x = Math.max(max.x, coords[0]);
        max.y = Math.max(max.y, coords[1]);
        max.z = Math.max(max.z, coords[2]);
      });

      var radius = max.subtract(min).length() / 2;
      return !isFinite(radius) || radius <= 0 ? 1 : radius;
    }

    function normalizeVector(v) {
      var length = v.length();
      if (!isFinite(length) || length <= 0) {
        return new BABYLON.Vector3(0, 0, 0);
      }
      return v.scale(1 / length);
    }

    function cross(a, b) {
      return new BABYLON.Vector3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
      );
    }

    function transpose3(m) {
      return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]]
      ];
    }

    function multiply3(a, b) {
      var out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          out[i][j] = 0;
          for (var k = 0; k < 3; k++) {
            out[i][j] += a[i][k] * b[k][j];
          }
        }
      }
      return out;
    }

    function toCoordinateArray(vector) {
      return [vector.x, vector.y, vector.z];
    }

    function clearUiPanel() {
      uiLayer.style.display = "none";
      uiLayer.innerHTML = "";
    }

    function formatRNumber(x) {
      if (!isFinite(x)) {
        return "NA_real_";
      }
      var value = Number(x);
      if (value === 0) {
        return "0";
      }
      var rounded = Math.round(value * 10000) / 10000;
      var text = rounded.toFixed(4).replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
      if (text === "-0") {
        text = "0";
      }
      return text;
    }

    function formatRMatrix(matrix) {
      return "rbind(\n" + matrix.map(function(row) {
        return "  c(" + row.map(formatRNumber).join(", ") + ")";
      }).join(",\n") + "\n)";
    }

    function formatPoseRCommand(payload) {
      return [
        "parZoom <- " + formatRNumber(payload.zoom),
        "parUserMatrix <- " + formatRMatrix(payload.userMatrix)
      ].join("\n");
    }

    function fallbackCopyText(value) {
      var textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.left = "-1000px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (e) {
        copied = false;
      }
      document.body.removeChild(textarea);
      return copied;
    }

    function bindCopyButton(button, value) {
      button.addEventListener("click", function() {
        var text = typeof value === "function" ? value() : value;
        var originalLabel = button.textContent;

        function setLabel(label) {
          button.textContent = label;
          window.setTimeout(function() {
            button.textContent = originalLabel;
          }, 1200);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function() {
            setLabel("Copied");
          }).catch(function() {
            if (fallbackCopyText(text)) {
              setLabel("Copied");
            } else {
              setLabel("Copy failed");
            }
          });
          return;
        }

        if (fallbackCopyText(text)) {
          setLabel("Copied");
        } else {
          setLabel("Copy failed");
        }
      });
    }

    function updateDigitizePanel(state) {
      if (!state || state.mode !== "digitize_landmarks") {
        clearUiPanel();
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

      bindCopyButton(uiLayer.querySelector("button"), exportValue);
    }

    function currentPar3dState() {
      if (!baseCameraState || !currentSceneBounds) {
        return null;
      }

      var target = currentSceneBounds.center;
      var currentOffset = camera.position.subtract(target);
      var currentUp = camera.upVector.clone();

      var baseForward = normalizeVector(baseCameraState.offset);
      var baseUp = normalizeVector(baseCameraState.up);
      var baseRight = normalizeVector(cross(baseUp, baseForward));
      baseUp = normalizeVector(cross(baseForward, baseRight));

      var currentForward = normalizeVector(currentOffset);
      var currentUpNorm = normalizeVector(currentUp);
      var currentRight = normalizeVector(cross(currentUpNorm, currentForward));
      currentUpNorm = normalizeVector(cross(currentForward, currentRight));

      var baseBasis = [
        [baseRight.x, baseUp.x, baseForward.x],
        [baseRight.y, baseUp.y, baseForward.y],
        [baseRight.z, baseUp.z, baseForward.z]
      ];
      var currentBasis = [
        [currentRight.x, currentUpNorm.x, currentForward.x],
        [currentRight.y, currentUpNorm.y, currentForward.y],
        [currentRight.z, currentUpNorm.z, currentForward.z]
      ];
      var rotation = multiply3(currentBasis, transpose3(baseBasis));
      var zoom = baseCameraState.radius / Math.max(camera.radius, 1e-8);

      return {
        zoom: zoom,
        userMatrix: [
          [rotation[0][0], rotation[0][1], rotation[0][2], 0],
          [rotation[1][0], rotation[1][1], rotation[1][2], 0],
          [rotation[2][0], rotation[2][1], rotation[2][2], 0],
          [0, 0, 0, 1]
        ]
      };
    }

    function applyViewOptions(bounds, sceneOptions) {
      if (!bounds || !sceneOptions || !sceneOptions.view || !baseCameraState) {
        return;
      }

      var view = sceneOptions.view;
      var zoom = Number(view.zoom);
      if (!isFinite(zoom) || zoom <= 0) {
        zoom = 1;
      }

      var userMatrix = view.userMatrix;
      if (!Array.isArray(userMatrix) || userMatrix.length < 3) {
        camera.radius = baseCameraState.radius / zoom;
        return;
      }

      var target = bounds.center;
      var defaultOffset = baseCameraState.offset.clone();

      function rotateVector(v) {
        return new BABYLON.Vector3(
          userMatrix[0][0] * v.x + userMatrix[0][1] * v.y + userMatrix[0][2] * v.z,
          userMatrix[1][0] * v.x + userMatrix[1][1] * v.y + userMatrix[1][2] * v.z,
          userMatrix[2][0] * v.x + userMatrix[2][1] * v.y + userMatrix[2][2] * v.z
        );
      }

      var rotatedOffset = rotateVector(defaultOffset);
      var rotatedDirection = normalizeVector(rotatedOffset);
      if (!isFinite(rotatedDirection.x) || !isFinite(rotatedDirection.y) || !isFinite(rotatedDirection.z) ||
          (rotatedDirection.x === 0 && rotatedDirection.y === 0 && rotatedDirection.z === 0)) {
        rotatedDirection = normalizeVector(defaultOffset);
      }
      var radius = baseCameraState.radius / zoom;
      var safeOffset = rotatedDirection.scale(baseCameraState.radius);

      camera.setTarget(target);
      camera.alpha = Math.atan2(safeOffset.z, safeOffset.x);
      camera.beta = Math.acos(
        Math.max(-0.999999, Math.min(0.999999, safeOffset.y / Math.max(baseCameraState.radius, 1e-8)))
      );
      camera.radius = radius;
    }

    function updatePosePanel(state, payload) {
      if (!state || state.mode !== "pose_3d" || !payload) {
        clearUiPanel();
        return;
      }

      var exportValue = formatPoseRCommand(payload);
      uiLayer.style.display = "block";
      uiLayer.innerHTML =
        "<div style='font-weight:700; margin-bottom:6px;'>Scene View</div>" +
        "<div style='margin-bottom:6px; color:#334155;'>Rotate or zoom the scene to update the pose.</div>" +
        "<textarea readonly style='width:100%; min-height:128px; resize:vertical; font:inherit; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc;'>" + exportValue + "</textarea>" +
        "<button type='button' style='margin-top:8px; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Copy R Code</button>";

      bindCopyButton(uiLayer.querySelector("button"), exportValue);
    }

    function publishPoseState(state) {
      if (!state || state.mode !== "pose_3d") {
        return;
      }

      var payload = currentPar3dState();
      if (!payload) {
        return;
      }

      updatePosePanel(state, payload);

      if (HTMLWidgets.shinyMode && state.widgetId) {
        Shiny.setInputValue(
          state.widgetId + "_par3d",
          JSON.stringify(payload),
          {priority: "event"}
        );
      }
    }

    function schedulePoseStatePublish() {
      if (!activeInteractionState || activeInteractionState.mode !== "pose_3d") {
        return;
      }

      if (publishViewStateHandle !== null) {
        return;
      }

      publishViewStateHandle = window.requestAnimationFrame(function() {
        publishViewStateHandle = null;
        publishPoseState(activeInteractionState);
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
      activeInteractionState = null;

      if (digitizeObserver) {
        scene.onPointerObservable.remove(digitizeObserver);
        digitizeObserver = null;
      }

      if (publishViewStateHandle !== null) {
        window.cancelAnimationFrame(publishViewStateHandle);
        publishViewStateHandle = null;
      }

      if (interaction && interaction.mode === "pose_3d") {
        activeInteractionState = {
          mode: interaction.mode,
          widgetId: el.id || null
        };
        schedulePoseStatePublish();
        return activeInteractionState;
      }

      if (!interaction || interaction.mode !== "digitize_landmarks" || !primaryMesh) {
        clearUiPanel();
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
      baseCameraState = {
        target: center.clone(),
        radius: camera.radius,
        offset: camera.position.subtract(center),
        up: camera.upVector.clone()
      };
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

    function createSegmentLines(primitive, name) {
      var lineColor = coerceColor3(primitive.color, BABYLON.Color3.FromHexString("#111111"));
      for (var i = 0; i < primitive.points.length; i += 2) {
        var segment = BABYLON.MeshBuilder.CreateLines(
          name + "-segment-" + (i / 2),
          {
            points: [
              new BABYLON.Vector3(primitive.points[i][0], primitive.points[i][1], primitive.points[i][2]),
              new BABYLON.Vector3(primitive.points[i + 1][0], primitive.points[i + 1][1], primitive.points[i + 1][2])
            ],
            updatable: false
          },
          scene
        );
        segment.color = lineColor;
        segment.isPickable = false;
      }
    }

    function alignPlaneToNormal(mesh, normal) {
      var from = new BABYLON.Vector3(0, 0, 1);
      var to = normalizeVector(normal);
      var dot = BABYLON.Vector3.Dot(from, to);

      if (dot > 0.999999) {
        mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
        return;
      }

      if (dot < -0.999999) {
        mesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), Math.PI);
        return;
      }

      var axis = BABYLON.Vector3.Cross(from, to);
      axis.normalize();
      var angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      mesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, angle);
    }

    function createPlaneMesh(coeffs, primitive, name) {
      var a = Number(coeffs[0]);
      var b = Number(coeffs[1]);
      var c = Number(coeffs[2]);
      var d = Number(coeffs[3]);
      var normal = new BABYLON.Vector3(a, b, c);
      var normalLengthSq = BABYLON.Vector3.Dot(normal, normal);

      if (!isFinite(normalLengthSq) || normalLengthSq <= 1e-12) {
        return null;
      }

      var planeSize = primitive.size;
      if (!isFinite(planeSize) || planeSize <= 0) {
        planeSize = currentSceneBounds && currentSceneBounds.radius ? currentSceneBounds.radius * 4 : 2;
      }

      var plane = BABYLON.MeshBuilder.CreatePlane(name, {size: planeSize}, scene);
      var center = normal.scale(-d / normalLengthSq);
      plane.position = center;
      alignPlaneToNormal(plane, normal);
      applyMaterial(plane, primitive);
      plane.isPickable = false;
      return plane;
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
      schedulePoseStatePublish();
    });
    camera.onViewMatrixChangedObservable.add(function() {
      schedulePoseStatePublish();
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
            applyViewOptions(currentSceneBounds, currentSceneOptions);
            renderAxes(currentSceneBounds, currentSceneOptions);
            schedulePoseStatePublish();
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
          } else if (primitive.type === "points3d") {
            var pointSize = primitive.size || 0.02;
            var boundsRadius = pointCloudRadius(primitive.points);
            var billboardSize = Math.max(boundsRadius * pointSize, 0.001);
            primitive.points.forEach(function(coords, idx) {
              var pointColor = pointColorAt(primitive.color, idx, "#111111");
              createPointBillboard(
                new BABYLON.Vector3(coords[0], coords[1], coords[2]),
                pointColor,
                primitive.alpha,
                billboardSize,
                name + "-point-" + idx
              );
            });
            scheduleFrame();
          } else if (primitive.type === "segments3d") {
            createSegmentLines(primitive, name);
            scheduleFrame();
          } else if (primitive.type === "spheres3d") {
            var sphereRadius = primitive.radius || 0.03;
            var sphereBoundsRadius = pointCloudRadius(primitive.points);
            var scatterRadius = Math.max(sphereBoundsRadius * sphereRadius, 0.001);
            var templates = {};
            primitive.points.forEach(function(coords, idx) {
              var sphereColor = pointColorAt(primitive.color, idx, "#666666");
              if (!templates[sphereColor]) {
                var templatePrimitive = Object.assign({}, primitive, {color: sphereColor});
                var template = BABYLON.MeshBuilder.CreateSphere(name + "-template-" + Object.keys(templates).length, {diameter: scatterRadius * 2}, scene);
                template.isVisible = false;
                applyMaterial(template, templatePrimitive);
                templates[sphereColor] = template;
              }
              var instance = templates[sphereColor].createInstance(name + "-sphere-" + idx);
              instance.position = new BABYLON.Vector3(coords[0], coords[1], coords[2]);
              instance.isPickable = false;
            });
            scheduleFrame();
          } else if (primitive.type === "planes3d") {
            primitive.coefficients.forEach(function(coeffs, idx) {
              createPlaneMesh(coeffs, primitive, name + "-plane-" + idx);
            });
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
          applyViewOptions(currentSceneBounds, currentSceneOptions);
          renderAxes(currentSceneBounds, currentSceneOptions);
          schedulePoseStatePublish();
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
