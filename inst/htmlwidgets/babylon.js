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
    var engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });

    var defaultSceneBackground = new BABYLON.Color4(0.98, 0.98, 0.98, 1);

    // Create a scene
    var scene = new BABYLON.Scene(engine);
    scene.clearColor = defaultSceneBackground.clone();

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

    function createDefaultLights() {
      var keyLight = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
      keyLight.intensity = 0.9;
      var fillLight = new BABYLON.HemisphericLight("fill", new BABYLON.Vector3(0, -1, -0.5), scene);
      fillLight.intensity = 0.35;
      return [keyLight, fillLight];
    }

    var defaultLights = createDefaultLights();
    var digitizeObserver = null;
    var managedNodes = [];
    var managedMaterials = [];
    var managedTextures = [];
    var managedLights = [];
    var managedShadowGenerators = [];
    var managedPipelines = [];

    var uiLayer = document.createElement("div");
    uiLayer.style.position = "absolute";
    uiLayer.style.top = "12px";
    uiLayer.style.right = "12px";
    uiLayer.style.zIndex = "10";
    uiLayer.style.display = "none";
    uiLayer.style.maxWidth = "280px";
    uiLayer.style.maxHeight = "calc(100% - 24px)";
    uiLayer.style.overflowY = "auto";
    uiLayer.style.overflowX = "hidden";
    uiLayer.style.padding = "10px";
    uiLayer.style.background = "rgba(255,255,255,0.92)";
    uiLayer.style.border = "1px solid rgba(15,23,42,0.12)";
    uiLayer.style.borderRadius = "8px";
    uiLayer.style.boxShadow = "0 10px 30px rgba(15,23,42,0.12)";
    uiLayer.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
    uiLayer.style.fontSize = "12px";
    uiLayer.style.lineHeight = "1.4";
    el.appendChild(uiLayer);
    var legendLayer = document.createElement("div");
    legendLayer.style.position = "absolute";
    legendLayer.style.left = "12px";
    legendLayer.style.bottom = "12px";
    legendLayer.style.zIndex = "10";
    legendLayer.style.display = "none";
    legendLayer.style.minWidth = "220px";
    legendLayer.style.padding = "10px";
    legendLayer.style.background = "rgba(255,255,255,0.92)";
    legendLayer.style.border = "1px solid rgba(15,23,42,0.12)";
    legendLayer.style.borderRadius = "8px";
    legendLayer.style.boxShadow = "0 10px 30px rgba(15,23,42,0.12)";
    legendLayer.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
    legendLayer.style.fontSize = "12px";
    legendLayer.style.lineHeight = "1.4";
    legendLayer.style.pointerEvents = "none";
    el.appendChild(legendLayer);
    var scaleBarLayer = document.createElement("div");
    scaleBarLayer.style.position = "absolute";
    scaleBarLayer.style.right = "12px";
    scaleBarLayer.style.bottom = "12px";
    scaleBarLayer.style.zIndex = "9";
    scaleBarLayer.style.display = "none";
    scaleBarLayer.style.pointerEvents = "none";
    el.appendChild(scaleBarLayer);
    var labelLayer = document.createElement("div");
    labelLayer.style.position = "absolute";
    labelLayer.style.inset = "0";
    labelLayer.style.pointerEvents = "none";
    labelLayer.style.zIndex = "5";
    el.appendChild(labelLayer);
    var sceneDecorations = [];
    var axisLabelState = [];
    var sceneTitleState = [];
    var currentSceneOptions = null;
    var currentSceneBounds = null;
    var baseCameraState = null;
    var activeInteractionState = null;
    var publishViewStateHandle = null;
    var widgetInstanceId = "babylon-" + Math.random().toString(36).slice(2);
    var currentSyncConfig = null;
    var applyingSyncedView = false;
    var pendingSyncedView = null;
    var pendingSyncedCameraState = null;
    var lastAppliedSyncSignature = null;
    var lastBroadcastSyncSignature = null;
    var uiDragState = null;
    var activeClippedMeshes = [];
    var activeClippingHelper = null;
    var lastClippingSignature = null;

    function clamp01(x) {
      if (!isFinite(x)) {
        return 0;
      }
      return Math.min(1, Math.max(0, x));
    }

    function registerDisposable(collection, value) {
      if (value && collection.indexOf(value) === -1) {
        collection.push(value);
      }
      return value;
    }

    function registerNode(node) {
      return registerDisposable(managedNodes, node);
    }

    function registerMaterial(material) {
      return registerDisposable(managedMaterials, material);
    }

    function registerTexture(texture) {
      return registerDisposable(managedTextures, texture);
    }

    function registerLight(light) {
      return registerDisposable(managedLights, light);
    }

    function registerShadowGenerator(generator) {
      return registerDisposable(managedShadowGenerators, generator);
    }

    function registerPipeline(pipeline) {
      return registerDisposable(managedPipelines, pipeline);
    }

    function disposeCollection(collection) {
      while (collection.length) {
        var value = collection.pop();
        if (value && value.dispose) {
          value.dispose();
        }
      }
    }

    function setDefaultLightsEnabled(enabled) {
      defaultLights.forEach(function(light) {
        light.setEnabled(!!enabled);
      });
    }

    function globalObject() {
      if (typeof globalThis !== "undefined") {
        return globalThis;
      }
      if (typeof window !== "undefined") {
        return window;
      }
      return {};
    }

    function resolveAttachmentHref(path) {
      if (typeof path !== "string" || !path.length) {
        return path;
      }

      if (/^(?:[a-z]+:)?\/\//i.test(path) || path.charAt(0) === "/") {
        return path;
      }

      var links = document.querySelectorAll("link[rel='attachment']");
      for (var i = 0; i < links.length; i += 1) {
        var href = links[i].getAttribute("href");
        if (!href) {
          continue;
        }
        if (href === path || href.slice(-path.length) === path) {
          return href;
        }
      }

      return path;
    }

    function splitSceneLoaderUrl(path) {
      if (typeof path !== "string" || !path.length) {
        return {rootUrl: "", sceneFilename: path};
      }

      if (/^(?:data|blob):/i.test(path)) {
        return {rootUrl: "", sceneFilename: path};
      }

      var lastSlash = path.lastIndexOf("/");
      if (lastSlash < 0) {
        return {rootUrl: "", sceneFilename: path};
      }

      return {
        rootUrl: path.slice(0, lastSlash + 1),
        sceneFilename: path.slice(lastSlash + 1)
      };
    }

    function getSyncHub() {
      var root = globalObject();
      if (!root.__babylonianSyncHub) {
        root.__babylonianSyncHub = {groups: {}};
      }
      return root.__babylonianSyncHub;
    }

    function unregisterSyncGroup() {
      if (!currentSyncConfig || !currentSyncConfig.group) {
        currentSyncConfig = null;
        return;
      }

      var hub = getSyncHub();
      var group = hub.groups[currentSyncConfig.group];
      if (group && group.members) {
        delete group.members[widgetInstanceId];
        if (!Object.keys(group.members).length) {
          delete hub.groups[currentSyncConfig.group];
        }
      }
      currentSyncConfig = null;
    }

    function registerSyncGroup(syncConfig) {
      unregisterSyncGroup();

      if (!syncConfig || !syncConfig.group || syncConfig.camera === false) {
        return;
      }

      var hub = getSyncHub();
      if (!hub.groups[syncConfig.group]) {
        hub.groups[syncConfig.group] = {members: {}};
      }

      currentSyncConfig = {
        group: syncConfig.group,
        camera: syncConfig.camera !== false
      };

      hub.groups[syncConfig.group].members[widgetInstanceId] = {
        applyCameraState: function(state) {
          if (!state) {
            return;
          }

          var normalizedState = normalizeCameraSyncState(state);
          if (!normalizedState) {
            return;
          }

          if (!currentSceneBounds || !baseCameraState) {
            pendingSyncedCameraState = normalizedState;
            return;
          }

          applySyncedCameraState(normalizedState);
        }
      };
    }

    function pushShinyInputValue(id, value) {
      if (!id || typeof HTMLWidgets === "undefined" || !HTMLWidgets.shinyMode || typeof Shiny === "undefined" || !Shiny) {
        return false;
      }

      if (typeof Shiny.setInputValue === "function") {
        Shiny.setInputValue(id, value, {priority: "event"});
        return true;
      }

      if (typeof Shiny.onInputChange === "function") {
        Shiny.onInputChange(id, value);
        return true;
      }

      return false;
    }

    function emitHostEvent(eventName, value, widgetId) {
      var payload = {
        source: "babylonian",
        widgetId: widgetId || el.id || null,
        event: eventName,
        value: value
      };

      try {
        el.dispatchEvent(new CustomEvent("babylonian:" + eventName, {
          bubbles: true,
          detail: payload
        }));
      } catch (err) {}

      try {
        window.dispatchEvent(new CustomEvent("babylonian-host-event", {
          detail: payload
        }));
      } catch (err) {}

      try {
        if (window.parent && window.parent !== window && typeof window.parent.postMessage === "function") {
          window.parent.postMessage(payload, "*");
        }
      } catch (err) {}

      if (payload.widgetId) {
        pushShinyInputValue(
          payload.widgetId + "_" + eventName,
          value
        );
      }
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

    function coerceColor4(value, alpha, fallback) {
      var color3 = coerceColor3(value, fallback ? new BABYLON.Color3(fallback.r, fallback.g, fallback.b) : null);
      var a = alpha === undefined ? 1 : clamp01(Number(alpha));

      if (!color3) {
        if (fallback) {
          return fallback.clone ? fallback.clone() : fallback;
        }
        return null;
      }

      return new BABYLON.Color4(color3.r, color3.g, color3.b, a);
    }

    function color3ToHex(value, fallback) {
      if (value && typeof value.toHexString === "function") {
        return value.toHexString();
      }

      var color = coerceColor3(value, fallback ? coerceColor3(fallback, null) : null);
      if (color && typeof color.toHexString === "function") {
        return color.toHexString();
      }

      return fallback || "#ffffff";
    }

    function applySceneBackground(sceneOptions) {
      var view = sceneOptions && sceneOptions.view ? sceneOptions.view : null;
      var fallback = defaultSceneBackground.clone();
      scene.clearColor = coerceColor4(view && view.bg ? view.bg : null, 1, fallback);
    }

    function depthOfFieldBlurLevel(level) {
      var value = typeof level === "string" ? level.toLowerCase() : "low";
      if (value === "high") {
        return BABYLON.DepthOfFieldEffectBlurLevel.High;
      }
      if (value === "medium") {
        return BABYLON.DepthOfFieldEffectBlurLevel.Medium;
      }
      return BABYLON.DepthOfFieldEffectBlurLevel.Low;
    }

    function applyScenePostProcesses(sceneOptions) {
      var effects = sceneOptions && sceneOptions.postprocess ? sceneOptions.postprocess : null;
      if (!effects || !effects.length) {
        return;
      }

      effects.forEach(function(effect, index) {
        if (!effect || effect.type !== "depth_of_field") {
          return;
        }

        var pipeline = registerPipeline(new BABYLON.DefaultRenderingPipeline(
          "babylonian-postprocess-" + index,
          true,
          scene,
          [camera]
        ));
        pipeline.samples = 4;
        pipeline.depthOfFieldEnabled = true;
        pipeline.depthOfFieldBlurLevel = depthOfFieldBlurLevel(effect.blur_level);

        if (effect.focus_distance !== undefined && pipeline.depthOfField) {
          pipeline.depthOfField.focusDistance = Number(effect.focus_distance);
        }
        if (effect.f_stop !== undefined && pipeline.depthOfField) {
          pipeline.depthOfField.fStop = Number(effect.f_stop);
        }
        if (effect.focal_length !== undefined && pipeline.depthOfField) {
          pipeline.depthOfField.focalLength = Number(effect.focal_length);
        }
      });
    }

    function mergeViewOptions(nextView) {
      var merged = {};
      var currentView = currentSceneOptions && currentSceneOptions.view ? currentSceneOptions.view : null;
      if (currentView) {
        Object.keys(currentView).forEach(function(key) {
          merged[key] = currentView[key];
        });
      }
      if (nextView) {
        Object.keys(nextView).forEach(function(key) {
          merged[key] = nextView[key];
        });
      }
      return merged;
    }

    function coerceVector3(value, fallback) {
      if (value instanceof BABYLON.Vector3) {
        return value.clone();
      }

      if (Array.isArray(value) && value.length >= 3) {
        return new BABYLON.Vector3(
          Number(value[0]) || 0,
          Number(value[1]) || 0,
          Number(value[2]) || 0
        );
      }

      return fallback ? fallback.clone() : new BABYLON.Vector3(0, 0, 0);
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
      } else {
        mesh.scaling = new BABYLON.Vector3(1, 1, 1);
      }

      if (primitive.rotation) {
        mesh.rotation = new BABYLON.Vector3(
          primitive.rotation[0] || 0,
          primitive.rotation[1] || 0,
          primitive.rotation[2] || 0
        );
      } else {
        mesh.rotation = new BABYLON.Vector3(0, 0, 0);
      }

      if (mesh.showBoundingBox !== undefined) {
        mesh.showBoundingBox = primitive.show_bounding_box === true;
      }
    }

    function applyCustomVertexAttributes(mesh, primitive) {
      var attributes = primitive.vertex_attributes || primitive.vertexAttributes;
      if (!attributes) {
        return;
      }

      Object.keys(attributes).forEach(function(attributeName) {
        var attribute = attributes[attributeName] || {};
        var data = attribute.data || attribute.values || attribute;
        var size = attribute.size === undefined ? 3 : Number(attribute.size);

        if (!Array.isArray(data) || !data.length || !isFinite(size) || size < 1) {
          return;
        }

        mesh.setVerticesBuffer(new BABYLON.VertexBuffer(engine, data, attributeName, false, false, size));
      });
    }

    function applyMorphTarget(mesh, primitive) {
      var specs = primitive.morph_target || primitive.morphTarget;
      if (!specs) {
        return;
      }
      if (!Array.isArray(specs)) {
        specs = [specs];
      }
      specs = specs.filter(function(spec) {
        return spec && Array.isArray(spec.vertices) && spec.vertices.length;
      });
      if (!specs.length) {
        return;
      }

      var manager = new BABYLON.MorphTargetManager();
      specs.forEach(function(spec, index) {
        var target = new BABYLON.MorphTarget(
          spec.name || (mesh.name + "-morph-" + index),
          spec.influence === undefined ? 0 : Number(spec.influence),
          scene
        );
        target.setPositions(spec.vertices);
        manager.addTarget(target);
      });
      mesh.morphTargetManager = manager;
    }

    function normalizeMorphTargetSpecs(primitive) {
      var specs = primitive && (primitive.morph_target || primitive.morphTarget);
      if (!specs) {
        return [];
      }
      return Array.isArray(specs) ? specs : [specs];
    }

    function setMorphTargetInfluence(mesh, primitive, index, influence) {
      var value = Number(influence);
      if (!isFinite(value)) {
        return;
      }

      var specs = normalizeMorphTargetSpecs(primitive);
      if (specs[index]) {
        specs[index].influence = value;
      }
      if (primitive && primitive.morph_target) {
        primitive.morph_target = specs;
      }
      if (primitive && primitive.morphTarget) {
        primitive.morphTarget = specs;
      }

      if (mesh && mesh.morphTargetManager && typeof mesh.morphTargetManager.getTarget === "function") {
        var target = mesh.morphTargetManager.getTarget(index);
        if (target) {
          target.influence = value;
        }
      }
    }

    function legacyMaterialSpec(primitive) {
      if (!primitive.color && primitive.alpha === undefined && primitive.specularity === undefined && primitive.wireframe === undefined && primitive.vertex_colors === undefined) {
        return null;
      }

      var spec = {
        type: "standard",
        diffuse: primitive.color || null,
        specular: primitive.specularity,
        alpha: primitive.alpha,
        wireframe: primitive.wireframe,
        backface_culling: false
      };

      if (primitive.vertex_colors) {
        spec.use_vertex_colors = true;
      }

      return spec;
    }

    function configureCommonMaterial(material, spec, mesh) {
      if (!spec) {
        return;
      }

      if (spec.backface_culling !== undefined) {
        material.backFaceCulling = !!spec.backface_culling;
      }

      if (spec.wireframe !== undefined) {
        material.wireframe = !!spec.wireframe;
      }

      if (spec.alpha !== undefined) {
        material.alpha = spec.alpha;
        if (spec.alpha < 1) {
          material.needDepthPrePass = false;
          material.separateCullingPass = false;
          if (material.forceDepthWrite !== undefined) {
            material.forceDepthWrite = false;
          }
          if (material instanceof BABYLON.ShaderMaterial) {
            material.needAlphaBlending = function() {
              return true;
            };
            material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
          }
        }
        if (spec.alpha >= 1) {
          material.needDepthPrePass = false;
          material.separateCullingPass = false;
          if (material.forceDepthWrite !== undefined) {
            material.forceDepthWrite = true;
          }
        }
      }

      if (mesh && spec.use_vertex_colors) {
        mesh.useVertexColors = true;
        mesh.hasVertexAlpha = true;
      }
    }

    function coerceNodeMaterialValue(block, value) {
      if (!block) {
        return value;
      }

      var rawValue = value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value")
        ? value.value
        : value;
      var forcedType = value && typeof value === "object" && !Array.isArray(value) && value.type
        ? String(value.type).toLowerCase()
        : null;
      var type = forcedType || block.type;

      if (typeof rawValue === "string") {
        if (type === "color3" || type === "color4" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Color3 || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Color4) {
          var color = BABYLON.Color3.FromHexString(rawValue);
          if (type === "color4" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Color4) {
            return new BABYLON.Color4(color.r, color.g, color.b, 1);
          }
          return color;
        }
        return rawValue;
      }

      if (typeof rawValue === "number") {
        return rawValue;
      }

      if (!Array.isArray(rawValue)) {
        return rawValue;
      }

      if (type === "color3" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Color3) {
        return new BABYLON.Color3(rawValue[0], rawValue[1], rawValue[2]);
      }
      if (type === "color4" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Color4) {
        return new BABYLON.Color4(rawValue[0], rawValue[1], rawValue[2], rawValue[3] === undefined ? 1 : rawValue[3]);
      }
      if (type === "vector2" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Vector2 || rawValue.length === 2) {
        return new BABYLON.Vector2(rawValue[0], rawValue[1]);
      }
      if (type === "vector3" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Vector3 || rawValue.length === 3) {
        return new BABYLON.Vector3(rawValue[0], rawValue[1], rawValue[2]);
      }
      if (type === "vector4" || type === BABYLON.NodeMaterialBlockConnectionPointTypes.Vector4 || rawValue.length === 4) {
        return new BABYLON.Vector4(rawValue[0], rawValue[1], rawValue[2], rawValue[3]);
      }

      return rawValue;
    }

    function applyShaderUniforms(material, uniforms) {
      if (!uniforms) {
        return;
      }

      Object.keys(uniforms).forEach(function(name) {
        var value = uniforms[name];
        var rawValue = value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value")
          ? value.value
          : value;
        var forcedType = value && typeof value === "object" && !Array.isArray(value) && value.type
          ? String(value.type).toLowerCase()
          : null;

        if (typeof rawValue === "number") {
          material.setFloat(name, rawValue);
          return;
        }

        if (typeof rawValue === "string") {
          var color = BABYLON.Color3.FromHexString(rawValue);
          material.setColor3(name, color);
          return;
        }

        if (!Array.isArray(rawValue)) {
          return;
        }

        if (forcedType === "color3") {
          material.setColor3(name, new BABYLON.Color3(rawValue[0], rawValue[1], rawValue[2]));
          return;
        }

        if (forcedType === "color4") {
          material.setColor4(name, new BABYLON.Color4(rawValue[0], rawValue[1], rawValue[2], rawValue[3] === undefined ? 1 : rawValue[3]));
          return;
        }

        if (rawValue.length === 2) {
          material.setVector2(name, new BABYLON.Vector2(rawValue[0], rawValue[1]));
        } else if (rawValue.length === 3) {
          material.setVector3(name, new BABYLON.Vector3(rawValue[0], rawValue[1], rawValue[2]));
        } else if (rawValue.length === 4) {
          material.setVector4(name, new BABYLON.Vector4(rawValue[0], rawValue[1], rawValue[2], rawValue[3]));
        }
      });
    }

    function applyShaderTextures(material, textures) {
      if (!textures) {
        return;
      }

      Object.keys(textures).forEach(function(name) {
        var value = textures[name];
        var rawValue = value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value")
          ? value.value
          : value;

        if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
          if (rawValue.type === "gradient" || rawValue.type === "colorramp") {
            material.setTexture(name, createHeatmapRampTexture(name + "-gradient", rawValue.colors || rawValue.stops || []));
          }
          return;
        }

        if (typeof rawValue !== "string" || !rawValue.length) {
          return;
        }

        material.setTexture(name, registerTexture(new BABYLON.Texture(resolveAttachmentHref(rawValue), scene)));
      });
    }

    function createTextureFromSpec(spec, fallbackColorspace) {
      if (!spec) {
        return null;
      }

      var rawSpec = spec && typeof spec === "object" && !Array.isArray(spec) && Object.prototype.hasOwnProperty.call(spec, "value")
        ? spec.value
        : spec;
      if (typeof rawSpec === "string") {
        rawSpec = {file: rawSpec};
      }
      if (!rawSpec || typeof rawSpec !== "object" || Array.isArray(rawSpec) || !rawSpec.file) {
        return null;
      }

      var texture = registerTexture(new BABYLON.Texture(resolveAttachmentHref(rawSpec.file), scene, false, !!rawSpec.invert_y));
      var colorspace = rawSpec.colorspace || fallbackColorspace || "auto";
      if (colorspace === "srgb") {
        texture.gammaSpace = true;
      } else if (colorspace === "linear") {
        texture.gammaSpace = false;
      }
      if (rawSpec.level !== undefined) {
        texture.level = Number(rawSpec.level);
      }
      if (rawSpec.has_alpha !== undefined) {
        texture.hasAlpha = !!rawSpec.has_alpha;
      }
      if (rawSpec.u_scale !== undefined) {
        texture.uScale = Number(rawSpec.u_scale);
      }
      if (rawSpec.v_scale !== undefined) {
        texture.vScale = Number(rawSpec.v_scale);
      }
      if (rawSpec.u_offset !== undefined) {
        texture.uOffset = Number(rawSpec.u_offset);
      }
      if (rawSpec.v_offset !== undefined) {
        texture.vOffset = Number(rawSpec.v_offset);
      }
      return texture;
    }

    function sceneMaterialLibrary() {
      return currentSceneOptions && currentSceneOptions.materials && typeof currentSceneOptions.materials === "object"
        ? currentSceneOptions.materials
        : {};
    }

    function resolveMaterialSpec(spec, seenNames) {
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        return spec;
      }

      if (spec.type !== "material_ref") {
        return spec;
      }

      var name = spec.name;
      if (!name || typeof name !== "string") {
        return null;
      }

      var seen = seenNames ? seenNames.slice() : [];
      if (seen.indexOf(name) !== -1) {
        return null;
      }
      seen.push(name);

      var library = sceneMaterialLibrary();
      if (!Object.prototype.hasOwnProperty.call(library, name)) {
        return null;
      }

      return resolveMaterialSpec(library[name], seen);
    }

    function createMaterialFromSpec(mesh, primitive, spec) {
      var material;
      var resolvedSpec = resolveMaterialSpec(spec);
      var materialName = (resolvedSpec && resolvedSpec.name) || (spec && spec.name) || mesh.name + "-material";

      if (!resolvedSpec) {
        return null;
      }

      if (resolvedSpec.type === "pbr") {
        material = registerMaterial(new BABYLON.PBRMaterial(materialName, scene));
        material.albedoColor = coerceColor3(resolvedSpec.base_color || resolvedSpec.albedo || "#FFFFFF", new BABYLON.Color3(1, 1, 1));
        material.metallic = resolvedSpec.metallic === undefined ? 0 : Number(resolvedSpec.metallic);
        material.roughness = resolvedSpec.roughness === undefined ? 1 : Number(resolvedSpec.roughness);
        material.usePhysicalLightFalloff = false;
        if (resolvedSpec.base_color_texture) {
          material.albedoTexture = createTextureFromSpec(resolvedSpec.base_color_texture, "srgb");
        }
        if (resolvedSpec.metallic_roughness_texture) {
          material.metallicTexture = createTextureFromSpec(resolvedSpec.metallic_roughness_texture, "linear");
          if (material.metallicTexture) {
            material.useMetallnessFromMetallicTextureBlue = true;
            material.useRoughnessFromMetallicTextureGreen = true;
            material.useAmbientOcclusionFromMetallicTextureRed = true;
          }
        }
        if (resolvedSpec.normal_texture) {
          material.bumpTexture = createTextureFromSpec(resolvedSpec.normal_texture, "linear");
        }
        if (resolvedSpec.occlusion_texture) {
          material.ambientTexture = createTextureFromSpec(resolvedSpec.occlusion_texture, "linear");
        }
        if (resolvedSpec.emissive_texture) {
          material.emissiveTexture = createTextureFromSpec(resolvedSpec.emissive_texture, "srgb");
        }
        if (resolvedSpec.emissive !== undefined) {
          material.emissiveColor = coerceColor3(resolvedSpec.emissive, new BABYLON.Color3(0, 0, 0));
        }
        if (resolvedSpec.unlit !== undefined) {
          material.unlit = !!resolvedSpec.unlit;
        }
        configureCommonMaterial(material, resolvedSpec, mesh);
        return material;
      }

      if (resolvedSpec.type === "node") {
        material = registerMaterial(BABYLON.NodeMaterial.Parse(resolvedSpec.source, scene, ""));
        if (resolvedSpec.name) {
          material.name = resolvedSpec.name;
        }
        if (resolvedSpec.params) {
          Object.keys(resolvedSpec.params).forEach(function(paramName) {
            var block = material.getBlockByName(paramName);
            if (block) {
              block.value = coerceNodeMaterialValue(block, resolvedSpec.params[paramName]);
            }
          });
        }
        if (typeof material.build === "function") {
          material.build(false);
        }
        configureCommonMaterial(material, resolvedSpec, mesh);
        return material;
      }

      if (resolvedSpec.type === "shader") {
        var shaderName = resolvedSpec.name || materialName;
        var uniformNames = ["worldViewProjection"];
        var samplerNames = [];

        if (resolvedSpec.uniforms) {
          uniformNames = uniformNames.concat(Object.keys(resolvedSpec.uniforms));
        }
        if (resolvedSpec.textures) {
          samplerNames = Object.keys(resolvedSpec.textures);
        }

        uniformNames = Array.from(new Set(uniformNames));

        BABYLON.Effect.ShadersStore[shaderName + "VertexShader"] = resolvedSpec.vertex;
        BABYLON.Effect.ShadersStore[shaderName + "FragmentShader"] = resolvedSpec.fragment;
        material = registerMaterial(new BABYLON.ShaderMaterial(
          materialName,
          scene,
          {vertex: shaderName, fragment: shaderName},
          {
            attributes: spec.attributes && spec.attributes.length ? spec.attributes : ["position", "normal"],
            uniforms: uniformNames,
            samplers: samplerNames
          }
        ));
        applyShaderUniforms(material, resolvedSpec.uniforms);
        applyShaderTextures(material, resolvedSpec.textures);
        configureCommonMaterial(material, resolvedSpec, mesh);
        return material;
      }

      material = registerMaterial(new BABYLON.StandardMaterial(materialName, scene));
      material.backFaceCulling = resolvedSpec.backface_culling === undefined ? true : !!resolvedSpec.backface_culling;

      if (resolvedSpec.use_vertex_colors) {
        material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        material.useVertexColor = true;
        material.useVertexColors = true;
        mesh.useVertexColors = true;
        mesh.hasVertexAlpha = true;
      } else if (resolvedSpec.diffuse) {
        material.diffuseColor = coerceColor3(resolvedSpec.diffuse, material.diffuseColor);
      }

      if (resolvedSpec.specular !== undefined) {
        material.specularColor = coerceColor3(resolvedSpec.specular, new BABYLON.Color3(0, 0, 0));
      }

      if (resolvedSpec.emissive !== undefined) {
        material.emissiveColor = coerceColor3(resolvedSpec.emissive, new BABYLON.Color3(0, 0, 0));
      }

      configureCommonMaterial(material, resolvedSpec, mesh);
      return material;
    }

    function applyMaterial(mesh, primitive) {
      var spec = primitive.material || legacyMaterialSpec(primitive);
      var material = createMaterialFromSpec(mesh, primitive, spec);

      if (material) {
        mesh.material = material;
      }
    }

    function importedMeshMatchesTarget(mesh, target, meshIndex) {
      if (target === undefined || target === null) {
        return true;
      }

      if (typeof target === "number") {
        return target === meshIndex || target === (meshIndex + 1);
      }

      if (Array.isArray(target)) {
        return target.some(function(entry) {
          if (typeof entry === "number") {
            return entry === meshIndex || entry === (meshIndex + 1);
          }
          if (typeof entry === "string") {
            return entry === mesh.name || (mesh.material && entry === mesh.material.name);
          }
          return false;
        });
      }

      if (typeof target === "string") {
        return target === mesh.name || (mesh.material && target === mesh.material.name);
      }

      return false;
    }

    function importedMeshMatchesOverride(mesh, override, meshIndex) {
      if (!override) {
        return true;
      }
      return importedMeshMatchesTarget(mesh, override.target, meshIndex);
    }

    function applyImportedGeometryOverride(mesh, geometry) {
      if (!mesh || !geometry) {
        return;
      }

      if (Array.isArray(geometry.indices) && geometry.indices.length) {
        mesh.setIndices(geometry.indices);
      }
      if (Array.isArray(geometry.vertices) && geometry.vertices.length) {
        mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, geometry.vertices, true);
      }
      if (Array.isArray(geometry.normals) && geometry.normals.length) {
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, geometry.normals, true);
      }
      if (Array.isArray(geometry.uvs) && geometry.uvs.length) {
        mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, geometry.uvs, true);
      }
      if ((!geometry.normals || !geometry.normals.length) && mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) && mesh.getIndices()) {
        var computedNormals = [];
        BABYLON.VertexData.ComputeNormals(
          mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
          mesh.getIndices(),
          computedNormals
        );
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, computedNormals, true);
      }
      if (mesh.refreshBoundingInfo) {
        mesh.refreshBoundingInfo(true);
      }
      mesh.computeWorldMatrix(true);
    }

    function applyImportedGeometryOverrides(meshes, primitive) {
      if (!primitive.geometry_overrides || !primitive.geometry_overrides.length) {
        return;
      }

      primitive.geometry_overrides.forEach(function(override) {
        meshes.forEach(function(mesh, meshIndex) {
          if (!importedMeshMatchesTarget(mesh, override.target, meshIndex)) {
            return;
          }
          applyImportedGeometryOverride(mesh, override.geometry);
        });
      });
    }

    function applyImportedMaterialOverrides(meshes, primitive) {
      if (primitive.material) {
        meshes.forEach(function(mesh) {
          applyMaterial(mesh, {material: primitive.material});
        });
      }

      if (!primitive.material_overrides || !primitive.material_overrides.length) {
        return;
      }

      primitive.material_overrides.forEach(function(override) {
        meshes.forEach(function(mesh, meshIndex) {
          if (!importedMeshMatchesOverride(mesh, override, meshIndex)) {
            return;
          }
          applyMaterial(mesh, {material: override.material});
        });
      });
    }

    function applyImportedBoundingBoxes(meshes, primitive) {
      var visible = !!(primitive && primitive.show_bounding_box);
      (meshes || []).forEach(function(mesh) {
        if (mesh && mesh.showBoundingBox !== undefined) {
          mesh.showBoundingBox = visible;
        }
      });
    }

    function registerImportedAssetTarget(editableTargets, primitive, rootNode, importedMeshes) {
      if (!rootNode) {
        return;
      }

      registerEditableTarget(
        editableTargets,
        primitive,
        editableTargets.length,
        rootNode,
        "mesh",
        null,
        {importedMeshes: importedMeshes || []}
      );

      if (!importedMeshes || !importedMeshes.length) {
        return;
      }

      importedMeshes.forEach(function(mesh, meshIndex) {
        registerEditableTarget(editableTargets, {
          name: mesh.name || (primitive.name || "asset") + "-mesh-" + meshIndex
        }, meshIndex, mesh, "mesh");
      });
    }

    function loadImportedAsset(primitive, name, interaction, editableTargets, onLoaded, onError) {
      var rootName = (primitive.name || name || "asset") + "-root";
      var assetUrl = resolveAttachmentHref(primitive.file);
      var loaderSource = splitSceneLoaderUrl(assetUrl);
      var applyLoadedAsset = function(allMeshes, rootNodes, rootTransformNode) {
        var importedMeshes = allMeshes.filter(function(mesh) {
          return mesh && mesh.getTotalVertices && mesh.getTotalVertices() > 0;
        });

        applyImportedGeometryOverrides(importedMeshes, primitive);
        applyImportedMaterialOverrides(importedMeshes, primitive);
        applyImportedBoundingBoxes(importedMeshes, primitive);
        if (rootTransformNode) {
          applyTransform(rootTransformNode, primitive);
          registerNode(rootTransformNode);
        } else {
          importedMeshes.forEach(function(mesh) {
            applyTransform(mesh, primitive);
          });
        }
        registerImportedAssetTarget(editableTargets, primitive, rootTransformNode || importedMeshes[0], importedMeshes);
        onLoaded(importedMeshes);
      };

      if (BABYLON.SceneLoader.LoadAssetContainer) {
        BABYLON.SceneLoader.LoadAssetContainer(loaderSource.rootUrl, loaderSource.sceneFilename, scene, function(container) {
          if (container.addAllToScene) {
            container.addAllToScene();
          }

          (container.meshes || []).forEach(registerNode);
          (container.transformNodes || []).forEach(registerNode);
          (container.materials || []).forEach(registerMaterial);
          (container.textures || []).forEach(registerTexture);

          var rootTransformNode = registerNode(new BABYLON.TransformNode(rootName, scene));
          var rootCandidates = []
            .concat(container.meshes || [])
            .concat(container.transformNodes || [])
            .filter(function(node) {
              return node && !node.parent && node !== rootTransformNode;
            });
          rootCandidates.forEach(function(node) {
            node.parent = rootTransformNode;
          });

          applyLoadedAsset(container.meshes || [], rootCandidates, rootTransformNode);
        }, null, function(sceneRef, message, exception) {
          onError(sceneRef, message, exception);
        });
        return;
      }

      BABYLON.SceneLoader.ImportMesh("", loaderSource.rootUrl, loaderSource.sceneFilename, scene, function(newMeshes) {
        newMeshes.forEach(registerNode);
        applyLoadedAsset(newMeshes, newMeshes.filter(function(mesh) { return !mesh.parent; }), null);
      }, null, onError);
    }

    function createHeatmapRampTexture(name, colorramp) {
      var texture = registerTexture(new BABYLON.DynamicTexture(name, {width: 256, height: 1}, scene, false));
      var ctx = texture.getContext();
      var gradient = ctx.createLinearGradient(0, 0, 256, 0);
      var stops = colorramp && colorramp.length ? colorramp : ["#0000FF", "#FFFFFF", "#FF0000"];

      stops.forEach(function(color, index) {
        gradient.addColorStop(stops.length === 1 ? 0 : index / (stops.length - 1), color);
      });

      ctx.clearRect(0, 0, 256, 1);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 1);
      texture.update(false);
      texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      return texture;
    }

    function createMarker(position, color, size, name, isPickable) {
      var marker = registerNode(BABYLON.MeshBuilder.CreateSphere(name, {diameter: size}, scene));
      marker.position = position.clone();
      marker.isPickable = !!isPickable;

      var material = registerMaterial(new BABYLON.StandardMaterial(name + "-material", scene));
      material.diffuseColor = coerceColor3(color, BABYLON.Color3.FromHexString("#dc2626"));
      material.emissiveColor = material.diffuseColor.scale(0.3);
      material.backFaceCulling = true;
      marker.material = material;

      return marker;
    }

    function createPointOverlay(name, color, size) {
      var mesh = registerNode(new BABYLON.Mesh(name, scene));
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;

      var material = registerMaterial(new BABYLON.StandardMaterial(name + "-material", scene));
      material.pointsCloud = true;
      material.pointSize = size;
      material.diffuseColor = coerceColor3(color, BABYLON.Color3.FromHexString("#dc2626"));
      material.emissiveColor = material.diffuseColor.scale(0.35);
      material.disableLighting = true;
      material.backFaceCulling = false;
      mesh.material = material;
      return mesh;
    }

    function createLightHelper(node, primitive, name) {
      if (!node || !node.position) {
        return null;
      }

      var helperSize = currentSceneBounds && currentSceneBounds.radius ?
        Math.max(currentSceneBounds.radius * 0.05, 0.03) :
        0.1;
      var helperColor = primitive && primitive.diffuse ? primitive.diffuse : "#f59e0b";
      var helper = createMarker(node.position, helperColor, helperSize, name + "-helper", false);
      helper.isPickable = false;
      helper.metadata = helper.metadata || {};
      helper.metadata.babylonianHelper = true;
      return helper;
    }

    function shadowCapableLightType(lightType) {
      return lightType === "point" || lightType === "spot" || lightType === "directional";
    }

    function sceneShadowMeshes() {
      return scene.meshes.filter(function(mesh) {
        if (!mesh || !mesh.getTotalVertices || mesh.getTotalVertices() <= 0) {
          return false;
        }
        if (mesh.metadata && mesh.metadata.babylonianHelper) {
          return false;
        }
        if (mesh.name && /gizmo/i.test(mesh.name)) {
          return false;
        }
        return true;
      });
    }

    function refreshShadowReceivers() {
      var hasShadows = false;
      managedLights.forEach(function(light) {
        if (light && light._babylonianShadowGenerator && light._babylonianShadowEnabled) {
          hasShadows = true;
        }
      });

      sceneShadowMeshes().forEach(function(mesh) {
        mesh.receiveShadows = hasShadows;
      });
    }

    function configureLightShadows(target) {
      if (!target || target.kind !== "light" || !target.light || !target.primitive) {
        return;
      }

      var lightType = target.primitive.light_type || "hemispheric";
      var enabled = target.primitive.shadow_enabled === true;
      var darkness = target.primitive.shadow_darkness === undefined ? 0.5 : Number(target.primitive.shadow_darkness);
      if (!isFinite(darkness)) {
        darkness = 0.5;
      }
      darkness = Math.min(1, Math.max(0, darkness));
      target.primitive.shadow_darkness = darkness;

      if (!shadowCapableLightType(lightType)) {
        enabled = false;
        target.primitive.shadow_enabled = false;
      }

      if (!enabled) {
        if (target.light._babylonianShadowGenerator && target.light._babylonianShadowGenerator.dispose) {
          var generator = target.light._babylonianShadowGenerator;
          managedShadowGenerators = managedShadowGenerators.filter(function(entry) {
            return entry !== generator;
          });
          generator.dispose();
        }
        target.light._babylonianShadowGenerator = null;
        target.light._babylonianShadowEnabled = false;
        refreshShadowReceivers();
        return;
      }

      var generatorInstance = target.light._babylonianShadowGenerator;
      if (!generatorInstance) {
        try {
          generatorInstance = registerShadowGenerator(new BABYLON.ShadowGenerator(1024, target.light));
          generatorInstance.usePercentageCloserFiltering = true;
        } catch (err) {
          target.primitive.shadow_enabled = false;
          target.light._babylonianShadowGenerator = null;
          target.light._babylonianShadowEnabled = false;
          refreshShadowReceivers();
          return;
        }
        target.light._babylonianShadowGenerator = generatorInstance;
      }

      if (generatorInstance.setDarkness) {
        generatorInstance.setDarkness(darkness);
      } else {
        generatorInstance.darkness = darkness;
      }

      sceneShadowMeshes().forEach(function(mesh) {
        if (generatorInstance.addShadowCaster) {
          generatorInstance.addShadowCaster(mesh, true);
        }
        mesh.receiveShadows = true;
      });
      target.light._babylonianShadowEnabled = true;
    }

    function createPointBillboard(position, color, alpha, size, name) {
      var plane = registerNode(BABYLON.MeshBuilder.CreatePlane(name, {size: size}, scene));
      plane.position = position.clone();
      plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      plane.isPickable = false;

      var material = registerMaterial(new BABYLON.StandardMaterial(name + "-material", scene));
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

    function alignNodeForwardToDirection(node, direction) {
      if (!node) {
        return;
      }

      var from = new BABYLON.Vector3(0, 0, 1);
      var to = normalizeVector(direction);
      var dot = BABYLON.Vector3.Dot(from, to);

      if (dot > 0.999999) {
        node.rotationQuaternion = BABYLON.Quaternion.Identity();
        return;
      }

      if (dot < -0.999999) {
        node.rotationQuaternion = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), Math.PI);
        return;
      }

      var axis = BABYLON.Vector3.Cross(from, to);
      axis.normalize();
      var angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      node.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, angle);
    }

    function directionFromNode(node, fallback) {
      if (!node) {
        return normalizeVector(fallback || new BABYLON.Vector3(0, 0, 1));
      }

      if (typeof node.computeWorldMatrix === "function") {
        node.computeWorldMatrix(true);
      }

      if (typeof node.getDirection === "function") {
        return normalizeVector(node.getDirection(BABYLON.Axis.Z));
      }

      return normalizeVector(fallback || new BABYLON.Vector3(0, 0, 1));
    }

    function cross(a, b) {
      return new BABYLON.Vector3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
      );
    }

    function rotationMatrix3FromDirections(from, to) {
      var source = normalizeVector(from);
      var target = normalizeVector(to);
      var dot = BABYLON.Vector3.Dot(source, target);
      var quaternion = null;

      if (dot > 0.999999) {
        return [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ];
      }

      if (dot < -0.999999) {
        var fallbackAxis = BABYLON.Vector3.Cross(source, new BABYLON.Vector3(0, 1, 0));
        if (fallbackAxis.lengthSquared() <= 1e-12) {
          fallbackAxis = BABYLON.Vector3.Cross(source, new BABYLON.Vector3(1, 0, 0));
        }
        fallbackAxis.normalize();
        quaternion = BABYLON.Quaternion.RotationAxis(fallbackAxis, Math.PI);
      } else {
        var axis = BABYLON.Vector3.Cross(source, target);
        axis.normalize();
        quaternion = BABYLON.Quaternion.RotationAxis(
          axis,
          Math.acos(Math.max(-1, Math.min(1, dot)))
        );
      }

      var matrix = new BABYLON.Matrix();
      BABYLON.Matrix.FromQuaternionToRef(quaternion, matrix);
      // BABYLON.Matrix.m is column-major; read rows by striding columns.
      return [
        [matrix.m[0], matrix.m[4], matrix.m[8]],
        [matrix.m[1], matrix.m[5], matrix.m[9]],
        [matrix.m[2], matrix.m[6], matrix.m[10]]
      ];
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
      stopUiPanelDrag();
      uiLayer.style.display = "none";
      uiLayer.innerHTML = "";
    }

    function stopUiPanelDrag() {
      if (!uiDragState) {
        return;
      }

      document.removeEventListener("mousemove", uiDragState.onMove);
      document.removeEventListener("mouseup", uiDragState.onUp);
      uiDragState = null;
    }

    function enableUiPanelDrag(handle) {
      if (!handle) {
        return;
      }

      handle.addEventListener("mousedown", function(evt) {
        if (evt.button !== 0) {
          return;
        }
        evt.preventDefault();
        evt.stopPropagation();

        var panelRect = uiLayer.getBoundingClientRect();
        var hostRect = el.getBoundingClientRect();
        uiLayer.style.left = (panelRect.left - hostRect.left) + "px";
        uiLayer.style.top = (panelRect.top - hostRect.top) + "px";
        uiLayer.style.right = "auto";

        var offsetX = evt.clientX - panelRect.left;
        var offsetY = evt.clientY - panelRect.top;

        function onMove(moveEvt) {
          moveEvt.preventDefault();
          var nextLeft = moveEvt.clientX - hostRect.left - offsetX;
          var nextTop = moveEvt.clientY - hostRect.top - offsetY;
          var maxLeft = Math.max(0, hostRect.width - uiLayer.offsetWidth);
          var maxTop = Math.max(0, hostRect.height - uiLayer.offsetHeight);
          nextLeft = Math.max(0, Math.min(maxLeft, nextLeft));
          nextTop = Math.max(0, Math.min(maxTop, nextTop));
          uiLayer.style.left = nextLeft + "px";
          uiLayer.style.top = nextTop + "px";
        }

        function onUp() {
          stopUiPanelDrag();
        }

        uiDragState = {
          onMove: onMove,
          onUp: onUp
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    function clearHeatmapLegend() {
      legendLayer.style.display = "none";
      legendLayer.innerHTML = "";
    }

    function clearScaleBar() {
      scaleBarLayer.style.display = "none";
      scaleBarLayer.innerHTML = "";
      scaleBarLayer.style.left = "";
      scaleBarLayer.style.right = "";
      scaleBarLayer.style.top = "";
      scaleBarLayer.style.bottom = "";
    }

    function clearClipping() {
      if (activeClippingHelper && activeClippingHelper.dispose) {
        activeClippingHelper.dispose();
      }
      activeClippingHelper = null;
      activeClippedMeshes.forEach(function(entry) {
        if (!entry || !entry.mesh) {
          return;
        }
        if (entry.beforeRenderObserver && entry.mesh.onBeforeRenderObservable) {
          entry.mesh.onBeforeRenderObservable.remove(entry.beforeRenderObserver);
        }
        if (entry.afterRenderObserver && entry.mesh.onAfterRenderObservable) {
          entry.mesh.onAfterRenderObservable.remove(entry.afterRenderObserver);
        }
      });
      activeClippedMeshes = [];
      scene.clipPlane = null;
      scene.clipPlane2 = null;
      scene.clipPlane3 = null;
      scene.clipPlane4 = null;
      scene.clipPlane5 = null;
      scene.clipPlane6 = null;
      scene.materials.forEach(function(material) {
        if (material && Object.prototype.hasOwnProperty.call(material, "clipPlane")) {
          material.clipPlane = null;
        }
      });
      lastClippingSignature = null;
    }

    function clearManagedScene() {
      initializeInteraction(null, null);
      clearSceneDecorations();
      clearHeatmapLegend();
      clearScaleBar();
      clearClipping();
      disposeCollection(managedNodes);
      disposeCollection(managedLights);
      disposeCollection(managedShadowGenerators);
      disposeCollection(managedMaterials);
      disposeCollection(managedTextures);
      disposeCollection(managedPipelines);
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

    function vectorToArray(vector) {
      if (!vector) {
        return [0, 0, 0];
      }
      return [Number(vector.x) || 0, Number(vector.y) || 0, Number(vector.z) || 0];
    }

    function nodeRotationArray(node) {
      if (!node) {
        return [0, 0, 0];
      }

      if (node.rotationQuaternion && node.rotationQuaternion.toEulerAngles) {
        return vectorToArray(node.rotationQuaternion.toEulerAngles());
      }

      if (node.rotation) {
        return vectorToArray(node.rotation);
      }

      return [0, 0, 0];
    }

    function editorTargetId(index) {
      return "scene-target-" + index;
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
      var doneText = state.pendingPoint ?
        "Pending landmark selected. Accept it or retry." :
        (state.target && state.points.length >= state.target ? "Target reached" : "Click mesh to preview the next landmark");
      var pendingText = state.pendingPoint ?
        "<div style='margin-bottom:8px; color:#334155;'>Pending: (" +
          [state.pendingPoint.x, state.pendingPoint.y, state.pendingPoint.z].map(formatRNumber).join(", ") + ")" +
          (state.indexEnabled && state.pendingPoint.index !== undefined ? " [vertex " + state.pendingPoint.index + "]" : "") +
        "</div>" :
        "";
      var actionButtons = state.pendingPoint ?
        "<div style='display:flex; gap:6px; margin-top:8px;'>" +
          "<button type='button' data-role='accept-landmark' style='flex:1; border:0; border-radius:6px; background:#0f766e; color:white; padding:6px 10px; cursor:pointer;'>Accept</button>" +
          "<button type='button' data-role='retry-landmark' style='flex:1; border:0; border-radius:6px; background:#b45309; color:white; padding:6px 10px; cursor:pointer;'>Retry</button>" +
        "</div>" :
        "";
      uiLayer.innerHTML =
        "<div style='font-weight:700; margin-bottom:6px;'>Landmarks</div>" +
        "<div style='margin-bottom:6px; color:#334155;'>Collected: " + targetText + "</div>" +
        "<div style='margin-bottom:8px; color:#475569;'>" + doneText + "</div>" +
        pendingText +
        "<textarea readonly style='width:100%; min-height:96px; resize:vertical; font:inherit; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc;'>" + exportValue + "</textarea>" +
        actionButtons +
        "<button type='button' data-role='copy-landmarks' style='margin-top:8px; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Copy JSON</button>";

      var copyButton = uiLayer.querySelector("[data-role='copy-landmarks']");
      bindCopyButton(copyButton, exportValue);

      var acceptButton = uiLayer.querySelector("[data-role='accept-landmark']");
      if (acceptButton) {
        acceptButton.addEventListener("click", function() {
          acceptPendingLandmark(state);
        });
      }

      var retryButton = uiLayer.querySelector("[data-role='retry-landmark']");
      if (retryButton) {
        retryButton.addEventListener("click", function() {
          clearPendingLandmark(state);
          updateDigitizePanel(state);
        });
      }
    }

    function clearPendingLandmark(state) {
      if (!state) {
        return;
      }

      if (state.pendingMarker && state.pendingMarker.dispose) {
        state.pendingMarker.dispose();
      }
      state.pendingMarker = null;
      state.pendingPoint = null;
    }

    function acceptPendingLandmark(state) {
      if (!state || !state.pendingPoint) {
        return;
      }

      var point = state.pendingPoint;
      state.points.push({
        x: point.x,
        y: point.y,
        z: point.z,
        index: point.index
      });
      state.pointIndices.push(point.index);
      state.markers.push(
        createMarker(
          new BABYLON.Vector3(point.x, point.y, point.z),
          state.markerColor,
          state.markerSize,
          "digitized-landmark-" + state.points.length,
          false
        )
      );
      clearPendingLandmark(state);
      publishLandmarks(state);
    }

    function nearestVertexPick(mesh, pickedPoint) {
      if (!mesh || !pickedPoint || !mesh.getVerticesData) {
        return null;
      }

      var positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      if (!positions || !positions.length) {
        return null;
      }

      mesh.computeWorldMatrix(true);
      var worldMatrix = mesh.getWorldMatrix();
      var nearestDistance = Infinity;
      var nearestIndex = -1;
      var nearestPoint = null;

      for (var i = 0; i < positions.length; i += 3) {
        var localPoint = BABYLON.Vector3.FromArray(positions, i);
        var worldPoint = BABYLON.Vector3.TransformCoordinates(localPoint, worldMatrix);
        var distance = BABYLON.Vector3.DistanceSquared(worldPoint, pickedPoint);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = (i / 3) + 1;
          nearestPoint = worldPoint;
        }
      }

      if (nearestIndex < 1 || !nearestPoint) {
        return null;
      }

      return {
        x: nearestPoint.x,
        y: nearestPoint.y,
        z: nearestPoint.z,
        index: nearestIndex
      };
    }

    function heatmapLegendSpec(primitive) {
      if (!primitive) {
        return null;
      }

      if (primitive.heatmap_legend) {
        return primitive.heatmap_legend;
      }

      if (primitive.type === "meshdist3d") {
        return {
          colorramp: primitive.colorramp || primitive.palette || ["#0000FF", "#FFFFFF", "#FF0000"],
          diff_min: primitive.diff_min,
          diff_max: primitive.diff_max,
          title: "Difference Scale",
          subtitle: "Signed displacement"
        };
      }

      return null;
    }

    function updateHeatmapLegend(primitive) {
      var legend = heatmapLegendSpec(primitive);
      if (!legend) {
        clearHeatmapLegend();
        return;
      }

      var colorramp = legend.colorramp || legend.palette || ["#0000FF", "#FFFFFF", "#FF0000"];
      var minValue = legend.diff_min;
      var maxValue = legend.diff_max;
      var midValue = (minValue + maxValue) / 2;
      var gradient = "linear-gradient(90deg, " + colorramp.map(function(color, index) {
        var stop = colorramp.length === 1 ? 0 : (index / (colorramp.length - 1)) * 100;
        return color + " " + stop + "%";
      }).join(", ") + ")";

      legendLayer.style.display = "block";
      legendLayer.innerHTML =
        "<div style='font-weight:700; margin-bottom:6px;'>" + (legend.title || "Difference Scale") + "</div>" +
        "<div style='margin-bottom:8px; color:#475569;'>" + (legend.subtitle || "Signed displacement") + "</div>" +
        "<div style='height:18px; border-radius:999px; border:1px solid rgba(15,23,42,0.15); background:" + gradient + ";'></div>" +
        "<div style='display:flex; justify-content:space-between; gap:12px; margin-top:6px; color:#334155;'>" +
        "<span>" + formatRNumber(minValue) + "</span>" +
        "<span>" + formatRNumber(midValue) + "</span>" +
        "<span>" + formatRNumber(maxValue) + "</span>" +
        "</div>";
    }

    function currentPar3dState() {
      if (!baseCameraState || !currentSceneBounds) {
        return null;
      }

      var target = currentSceneBounds.center;
      var currentOffset = camera.position.subtract(target);
      var rotation = rotationMatrix3FromDirections(baseCameraState.offset, currentOffset);
      var zoom = baseCameraState.radius / Math.max(camera.radius, 1e-8);
      var cameraState = currentCameraSyncState();

      return {
        zoom: zoom,
        userMatrix: [
          [rotation[0][0], rotation[0][1], rotation[0][2], 0],
          [rotation[1][0], rotation[1][1], rotation[1][2], 0],
          [rotation[2][0], rotation[2][1], rotation[2][2], 0],
          [0, 0, 0, 1]
        ],
        camera: cameraState
      };
    }

    function normalizeCameraSyncState(state) {
      if (!state) {
        return null;
      }

      var alpha = Number(state.alpha);
      var beta = Number(state.beta);
      var radius = Number(state.radius);
      var target = state.target;
      if (!isFinite(alpha) || !isFinite(beta) || !isFinite(radius) || radius <= 0 || !Array.isArray(target) || target.length < 3) {
        return null;
      }

      return {
        alpha: alpha,
        beta: beta,
        radius: radius,
        target: [
          Number(target[0]) || 0,
          Number(target[1]) || 0,
          Number(target[2]) || 0
        ]
      };
    }

    function currentCameraSyncState() {
      if (!camera) {
        return null;
      }

      var target = camera.getTarget ? camera.getTarget() : camera.target;
      if (!target) {
        return null;
      }

      return normalizeCameraSyncState({
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: [target.x, target.y, target.z]
      });
    }

    function cameraSyncSignature(state) {
      var normalizedState = normalizeCameraSyncState(state);
      if (!normalizedState) {
        return null;
      }

      return [
        normalizedState.alpha.toFixed(6),
        normalizedState.beta.toFixed(6),
        normalizedState.radius.toFixed(6),
        normalizedState.target[0].toFixed(6),
        normalizedState.target[1].toFixed(6),
        normalizedState.target[2].toFixed(6)
      ].join("|");
    }

    function applySyncedCameraState(state) {
      var normalizedState = normalizeCameraSyncState(state);
      if (!normalizedState) {
        return;
      }

      var signature = cameraSyncSignature(normalizedState);
      if (signature && signature === cameraSyncSignature(currentCameraSyncState())) {
        return;
      }

      applyingSyncedView = true;
      lastAppliedSyncSignature = signature;
      if (camera.inertialAlphaOffset !== undefined) {
        camera.inertialAlphaOffset = 0;
      }
      if (camera.inertialBetaOffset !== undefined) {
        camera.inertialBetaOffset = 0;
      }
      if (camera.inertialRadiusOffset !== undefined) {
        camera.inertialRadiusOffset = 0;
      }
      camera.setTarget(new BABYLON.Vector3(
        normalizedState.target[0],
        normalizedState.target[1],
        normalizedState.target[2]
      ));
      camera.alpha = normalizedState.alpha;
      camera.beta = normalizedState.beta;
      camera.radius = normalizedState.radius;
      window.setTimeout(function() {
        applyingSyncedView = false;
      }, 0);
    }

    function applyViewOptions(bounds, sceneOptions) {
      applySceneBackground(sceneOptions);

      if (!bounds || !sceneOptions || !sceneOptions.view || !baseCameraState) {
        return;
      }

      var view = sceneOptions.view;
      if (view.camera) {
        var normalizedCamera = normalizeCameraSyncState(view.camera);
        if (normalizedCamera) {
          camera.setTarget(new BABYLON.Vector3(
            normalizedCamera.target[0],
            normalizedCamera.target[1],
            normalizedCamera.target[2]
          ));
          camera.alpha = normalizedCamera.alpha;
          camera.beta = normalizedCamera.beta;
          camera.radius = normalizedCamera.radius;
          return;
        }
      }

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

    function publishSyncedViewState() {
      if (!currentSyncConfig || !currentSyncConfig.group || applyingSyncedView) {
        return;
      }

      var payload = currentCameraSyncState();
      if (!payload) {
        return;
      }
      var signature = cameraSyncSignature(payload);
      if (signature && signature === lastAppliedSyncSignature) {
        return;
      }
      if (signature && signature === lastBroadcastSyncSignature) {
        return;
      }

      var hub = getSyncHub();
      var group = hub.groups[currentSyncConfig.group];
      if (!group || !group.members) {
        return;
      }

      Object.keys(group.members).forEach(function(memberId) {
        if (memberId === widgetInstanceId) {
          return;
        }
        var member = group.members[memberId];
        if (member && typeof member.applyCameraState === "function") {
          member.applyCameraState(payload);
        }
      });
      lastBroadcastSyncSignature = signature;
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

    function selectedEditorTarget(state) {
      if (!state || !state.targets || !state.targets.length) {
        return null;
      }

      var selected = null;
      state.targets.forEach(function(target) {
        if (target.id === state.selectedId) {
          selected = target;
        }
      });

      return selected || state.targets[0];
    }

    function selectedMeshTarget(state) {
      if (!state || !state.targets || !state.targets.length) {
        return null;
      }

      var meshTargets = editorTargetsByKind(state, "mesh");
      if (!meshTargets.length) {
        return null;
      }

      if (state.ui && state.ui.meshSelect && state.ui.meshSelect.value) {
        var selectedMesh = null;
        meshTargets.forEach(function(target) {
          if (target.id === state.ui.meshSelect.value) {
            selectedMesh = target;
          }
        });
        if (selectedMesh) {
          return selectedMesh;
        }
      }

      var active = selectedEditorTarget(state);
      if (active && active.kind === "mesh") {
        return active;
      }

      return meshTargets[0];
    }

    function selectedLightTarget(state) {
      if (!state || !state.targets || !state.targets.length) {
        return null;
      }

      var lightTargets = editorTargetsByKind(state, "light");
      if (!lightTargets.length) {
        return null;
      }

      if (state.ui && state.ui.lightSelect && state.ui.lightSelect.value) {
        var selectedLight = null;
        lightTargets.forEach(function(target) {
          if (target.id === state.ui.lightSelect.value) {
            selectedLight = target;
          }
        });
        if (selectedLight) {
          return selectedLight;
        }
      }

      var active = selectedEditorTarget(state);
      if (active && active.kind === "light") {
        return active;
      }

      return lightTargets[0];
    }

    function editorTargetsByKind(state, kind) {
      if (!state || !state.targets || !state.targets.length) {
        return [];
      }

      return state.targets.filter(function(target) {
        return target.kind === kind;
      });
    }

    function cloneScenePostprocesses(effects) {
      if (!effects) {
        return [];
      }

      try {
        return JSON.parse(JSON.stringify(effects));
      } catch (err) {
        return [];
      }
    }

    function applyEditorPostProcesses(state) {
      if (!state) {
        return;
      }

      if (!currentSceneOptions) {
        currentSceneOptions = {};
      }
      currentSceneOptions.postprocess = cloneScenePostprocesses(state.postprocess);
      disposeCollection(managedPipelines);
      applyScenePostProcesses(currentSceneOptions);
    }

    function cloneSceneScaleBar(spec) {
      if (!spec) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(spec));
      } catch (err) {
        return null;
      }
    }

    function applyEditorScaleBar(state) {
      if (!state) {
        return;
      }

      if (!currentSceneOptions) {
        currentSceneOptions = {};
      }
      currentSceneOptions.scale_bar = cloneSceneScaleBar(state.scaleBar);
    }

    function cloneSceneClipping(spec) {
      if (!spec) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(spec));
      } catch (err) {
        return null;
      }
    }

    function sceneRuntimeMaterialNames() {
      var names = {};
      scene.meshes.forEach(function(mesh) {
        if (mesh && mesh.material && mesh.material.name) {
          names[mesh.material.name] = true;
        }
      });
      return Object.keys(names).sort();
    }

    function selectedMeshRuntimeMaterialName(state) {
      var target = selectedMeshTarget(state);
      if (!target) {
        return null;
      }

      if (target.importedMeshes && target.importedMeshes.length) {
        for (var i = 0; i < target.importedMeshes.length; i += 1) {
          if (target.importedMeshes[i] && target.importedMeshes[i].material && target.importedMeshes[i].material.name) {
            return target.importedMeshes[i].material.name;
          }
        }
      }

      if (target.node && target.node.material && target.node.material.name) {
        return target.node.material.name;
      }

      return null;
    }

    function selectedMeshNodes(state) {
      var target = selectedMeshTarget(state);
      if (!target) {
        return [];
      }

      if (target.importedMeshes && target.importedMeshes.length) {
        return target.importedMeshes.filter(function(mesh) {
          return !!mesh;
        });
      }

      return target.node ? [target.node] : [];
    }

    function applySceneClipping(sceneOptions) {
      var clippingState = sceneOptions && sceneOptions.clipping ? sceneOptions.clipping : null;
      var activeTargetId = activeInteractionState && activeInteractionState.mode === "edit_scene3d" && selectedMeshTarget(activeInteractionState) ?
        selectedMeshTarget(activeInteractionState).id :
        null;
      var signature = JSON.stringify({
        clipping: clippingState,
        target: activeTargetId
      });
      if (signature === lastClippingSignature) {
        return;
      }
      clearClipping();
      lastClippingSignature = signature;

      if (!sceneOptions || !sceneOptions.clipping || sceneOptions.clipping.enabled !== true) {
        return;
      }

      if (!activeInteractionState || activeInteractionState.mode !== "edit_scene3d") {
        return;
      }

      var targetMeshes = selectedMeshNodes(activeInteractionState);
      if (!targetMeshes.length) {
        return;
      }

      var x = Number(sceneOptions.clipping.x);
      var y = Number(sceneOptions.clipping.y);
      var z = Number(sceneOptions.clipping.z);
      var center = currentSceneBounds && currentSceneBounds.center ? currentSceneBounds.center.clone() : BABYLON.Vector3.Zero();
      var clipPlaneX = new BABYLON.Plane(1, 0, 0, -(isFinite(x) ? x : center.x));
      var clipPlaneY = new BABYLON.Plane(0, 1, 0, -(isFinite(y) ? y : center.y));
      var clipPlaneZ = new BABYLON.Plane(0, 0, 1, -(isFinite(z) ? z : center.z));

      targetMeshes.forEach(function(mesh) {
        if (!mesh) {
          return;
        }
        var beforeRenderObserver = null;
        var afterRenderObserver = null;
        if (mesh.onBeforeRenderObservable) {
          beforeRenderObserver = mesh.onBeforeRenderObservable.add(function() {
            scene.clipPlane = clipPlaneX;
            scene.clipPlane2 = clipPlaneY;
            scene.clipPlane3 = clipPlaneZ;
          });
        }
        if (mesh.onAfterRenderObservable) {
          afterRenderObserver = mesh.onAfterRenderObservable.add(function() {
            scene.clipPlane = null;
            scene.clipPlane2 = null;
            scene.clipPlane3 = null;
          });
        }
        activeClippedMeshes.push({
          mesh: mesh,
          beforeRenderObserver: beforeRenderObserver,
          afterRenderObserver: afterRenderObserver
        });
      });
    }

    function applyEditorClipping(state) {
      if (!state) {
        return;
      }

      if (!currentSceneOptions) {
        currentSceneOptions = {};
      }
      currentSceneOptions.clipping = cloneSceneClipping(state.clipping);
    }

    function editorTargetMatchesPickedMesh(target, pickedMesh) {
      if (!target || !pickedMesh) {
        return false;
      }

      if (target.helper && pickedMesh === target.helper) {
        return true;
      }

      var current = pickedMesh;
      while (current) {
        if (current === target.node) {
          return true;
        }
        current = current.parent;
      }

      return false;
    }

    function pickedMeshIsHelper(mesh) {
      var current = mesh;
      while (current) {
        if (current.metadata && current.metadata.babylonianHelper) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function resolveEditorPickTarget(state, pickInfo) {
      if (!state || !state.targets || !state.targets.length || !pickInfo || !pickInfo.pickedMesh) {
        return null;
      }

      var pickInfos = [];
      if (scene.multiPick) {
        try {
          pickInfos = scene.multiPick(scene.pointerX, scene.pointerY) || [];
        } catch (err) {
          pickInfos = [];
        }
      }
      if (!pickInfos.length) {
        pickInfos = [pickInfo];
      }

      var helperTarget = null;
      for (var pickIndex = 0; pickIndex < pickInfos.length; pickIndex += 1) {
        var candidatePick = pickInfos[pickIndex];
        if (!candidatePick || !candidatePick.hit || !candidatePick.pickedMesh) {
          continue;
        }

        var candidateTarget = null;
        state.targets.forEach(function(target) {
          if (!candidateTarget && editorTargetMatchesPickedMesh(target, candidatePick.pickedMesh)) {
            candidateTarget = target;
          }
        });
        if (!candidateTarget) {
          continue;
        }

        if (!pickedMeshIsHelper(candidatePick.pickedMesh)) {
          return candidateTarget;
        }
        if (!helperTarget) {
          helperTarget = candidateTarget;
        }
      }

      return helperTarget;
    }

    function targetSelectionSection(target) {
      if (!target) {
        return null;
      }

      if (target.kind === "light") {
        return "lights";
      }

      if (target.kind === "mesh") {
        return "meshes";
      }

      return null;
    }

    function targetLightType(target) {
      if (!target || target.kind !== "light") {
        return null;
      }

      return target.primitive && target.primitive.light_type ? target.primitive.light_type : "hemispheric";
    }

    function availableEditorModes(target) {
      if (!target) {
        return [];
      }

      if (target.kind === "mesh") {
        return ["translate", "rotate", "scale"];
      }

      if (target.kind === "light") {
        var lightType = targetLightType(target);
        if (lightType === "point") {
          return ["translate"];
        }
        if (lightType === "spot") {
          return ["translate", "rotate"];
        }
        if (lightType === "directional" || lightType === "hemispheric") {
          return ["rotate"];
        }
      }

      return ["translate"];
    }

    function ensureEditorMode(state) {
      if (!state) {
        return;
      }

      var target = selectedEditorTarget(state);
      var modes = availableEditorModes(target);
      if (!modes.length) {
        state.gizmoMode = "translate";
        return;
      }

      if (modes.indexOf(state.gizmoMode) === -1) {
        state.gizmoMode = modes[0];
      }
    }

    function attachEditorTarget(state, target) {
      if (!state || !state.gizmoManager) {
        return;
      }

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
    
      if (target.importedMeshes && target.importedMeshes.length) {
        return target.importedMeshes.filter(Boolean);
      }
    
      return target.node ? [target.node] : [];
    } 

    function applyBoundingBoxToEditorTarget(target) {
      if (!target || target.kind !== "mesh") {
        return;
      }

      var visible = !!(target.primitive && target.primitive.show_bounding_box);
      editorTargetNodes(target).forEach(function(node) {
        if (node && node.showBoundingBox !== undefined) {
          node.showBoundingBox = visible;
        }
      });
    }

    function computeNodesBounds(nodes) {
      if (!nodes || !nodes.length) return null;
    
      var min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      var max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
      var found = false;
    
      nodes.forEach(function (node) {
        if (!node || !node.getBoundingInfo) return;
    
        node.computeWorldMatrix(true);
        var box = node.getBoundingInfo().boundingBox;
        if (!box) return;
    
        min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
        found = true;
      });
    
      if (!found) return null;
    
      var center = min.add(max).scale(0.5);
      var extent = max.subtract(min);
      var radius = extent.length() / 2;
    
      if (!isFinite(radius) || radius <= 0) radius = 1;
    
      return { min: min, max: max, center: center, radius: radius };
    }
    
    function editorTargetBounds(target) {
      if (!target) return null;
              
      if (target.kind === "mesh") {
        return computeNodesBounds(editorTargetNodes(target));
      }
    
      if (target.kind === "light" && target.node && target.node.position) {
        return {
          center: target.node.position.clone(),
          radius: currentSceneBounds && currentSceneBounds.radius
            ? currentSceneBounds.radius * 0.08
            : 1
        };
      }
    
      return null;
    } 

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function syncEditorGizmoState(state) {
      if (!state || !state.gizmoManager) {
        return;
      }

      if (state.deferGizmoAttach === true) {
        attachEditorTarget(state, null);
        state.gizmoManager.positionGizmoEnabled = false;
        state.gizmoManager.rotationGizmoEnabled = false;
        state.gizmoManager.scaleGizmoEnabled = false;
        return;
      }

      ensureEditorMode(state);
      var target = selectedEditorTarget(state);
      var visible = state.gizmosVisible !== false;
      var supportedModes = availableEditorModes(target);
      var canTranslate = !!target && supportedModes.indexOf("translate") !== -1;
      var canRotate = !!target && supportedModes.indexOf("rotate") !== -1;
      var canScale = !!target && supportedModes.indexOf("scale") !== -1;

      attachEditorTarget(state, visible ? target : null);
      state.gizmoManager.positionGizmoEnabled = visible && state.gizmoMode === "translate" && canTranslate;
      state.gizmoManager.rotationGizmoEnabled = visible && state.gizmoMode === "rotate" && canRotate;
      state.gizmoManager.scaleGizmoEnabled = visible && state.gizmoMode === "scale" && canScale;

      var gizmoScaleRatio = null;
      var targetBounds = editorTargetBounds(target);
      var sceneRadius = currentSceneBounds && currentSceneBounds.radius
        ? currentSceneBounds.radius
        : 1;
      
      if (targetBounds && camera) {
        var distance = BABYLON.Vector3.Distance(
          camera.position,
          targetBounds.center
        );
      
        // size relative to object
        var sizeFromTarget = targetBounds.radius * 0.01;
      
        // adjust for zoom distance
        var sizeFromDistance = distance * 0.08;
      
        gizmoScaleRatio = Math.min(sizeFromTarget, sizeFromDistance);
      
        // clamp globally
        gizmoScaleRatio = clamp(
          gizmoScaleRatio,
          sceneRadius * 0.003,
          sceneRadius * 0.12
        );
      
      } else if (camera && isFinite(camera.radius) && camera.radius > 0) {
        gizmoScaleRatio = Math.max(camera.radius * 0.006, 0.004);
      
      } else if (currentSceneBounds && currentSceneBounds.radius) {
        gizmoScaleRatio = Math.max(currentSceneBounds.radius * 0.006, 0.004);
      }

      if (state.gizmoManager.gizmos && state.gizmoManager.gizmos.positionGizmo && gizmoScaleRatio !== null) {
        state.gizmoManager.gizmos.positionGizmo.scaleRatio = gizmoScaleRatio;
      }
      if (state.gizmoManager.gizmos && state.gizmoManager.gizmos.rotationGizmo && gizmoScaleRatio !== null) {
        state.gizmoManager.gizmos.rotationGizmo.scaleRatio = gizmoScaleRatio;
      }
      if (state.gizmoManager.gizmos && state.gizmoManager.gizmos.scaleGizmo) {
        if (gizmoScaleRatio !== null) {
          state.gizmoManager.gizmos.scaleGizmo.scaleRatio = gizmoScaleRatio;
        }
        state.gizmoManager.gizmos.scaleGizmo.uniformScaling = true;
      }
    }

    function updateLightHelpers(state) {
      if (!state || !state.targets || !state.targets.length) {
        return;
      }

      state.targets.forEach(function(target) {
      if (target.kind === "light" && target.node) {
          var lightType = target.primitive && target.primitive.light_type ? target.primitive.light_type : null;
          if (target.light && target.node.position && target.light.position) {
            target.light.position.copyFrom(target.node.position);
            target.primitive.position = vectorToArray(target.node.position);
          }
          if (target.light && target.light.direction && lightType !== "point") {
            var nextDirection = directionFromNode(target.node, target.light.direction);
            target.light.direction.copyFrom(nextDirection);
            target.primitive.direction = vectorToArray(nextDirection);
          }
          configureLightShadows(target);
        }
        if (target.kind === "light" && target.helper && target.node && target.node.position) {
          target.helper.position.copyFrom(target.node.position);
        }
      });
    }

    function setLightHelperColor(target, value) {
      if (!target || !target.helper || !target.helper.material) {
        return;
      }

      var diffuse = coerceColor3(value, BABYLON.Color3.FromHexString("#f59e0b"));
      target.helper.material.diffuseColor = diffuse;
      target.helper.material.emissiveColor = diffuse.scale(0.3);
    }

    function addEditorLight(state, lightType, definition) {
      if (!state) {
        return;
      }

      var index = nextEditorTargetIndex(state);
      var seed = definition || {};
      var position = coerceVector3(seed.position, defaultEditorLightPosition());
      var primitive = {
        type: "light3d",
        light_type: seed.type || lightType || "point",
        name: uniqueEditorPrimitiveName(state, seed.name || ((lightType || "light") + "_light")),
        position: vectorToArray(position),
        direction: seed.direction || defaultEditorLightDirection(seed.type || lightType || "point"),
        intensity: seed.intensity === undefined ? 1 : Number(seed.intensity),
        diffuse: seed.diffuse || "#ffffff",
        specular: seed.specular || "#ffffff",
        enabled: seed.enabled === undefined ? true : seed.enabled !== false,
        shadow_enabled: seed.shadow_enabled === true,
        shadow_darkness: seed.shadow_darkness === undefined ? 0.5 : Number(seed.shadow_darkness)
      };

      if (primitive.light_type === "spot") {
        primitive.angle = seed.angle === undefined ? Math.PI / 3 : Number(seed.angle);
        primitive.exponent = seed.exponent === undefined ? 1 : Number(seed.exponent);
      }

      setDefaultLightsEnabled(false);
      var created = createLight(primitive, primitive.name);
      registerEditableTarget(
        state.targets,
        primitive,
        index,
        created.editorNode,
        "light",
        null,
        {light: created.light, createdInEditor: true}
      );
      var target = state.targets[state.targets.length - 1];
      target.helper = createLightHelper(target.node, target.primitive, target.name || target.id);
      if (target.helper) {
        target.helper.isPickable = true;
        state.helpers.push(target.helper);
      }
      bindEditorTargetTransformObserver(state, target);
      updateLightHelpers(state);
      selectEditorTarget(state, target.id);
      publishSceneEditorState(state);
    }

    function removeSelectedEditorLight(state) {
      if (!state || !state.targets || !state.targets.length) {
        return;
      }

      var selected = selectedEditorTarget(state);
      if (!selected || selected.kind !== "light") {
        return;
      }

      recordRemovedEditorTarget(state, selected);
      state.targets = state.targets.filter(function(target) {
        return target.id !== selected.id;
      });
      if (state.helpers) {
        state.helpers = state.helpers.filter(function(helper) {
          return helper && helper !== selected.helper;
        });
      }
      disposeEditorTarget(selected);
      if (!editorTargetsByKind(state, "light").length) {
        setDefaultLightsEnabled(true);
      }
      var fallback = selectedEditorTarget(state) || (state.targets.length ? state.targets[0] : null);
      selectEditorTarget(state, fallback ? fallback.id : null);
      publishSceneEditorState(state);
    }

    function recordRemovedEditorTarget(state, target) {
      if (!state || !target || target.createdInEditor) {
        return;
      }

      if (!state.removedObjects) {
        state.removedObjects = [];
      }

      var entry = {
        index: (target.index || 0) + 1,
        primitive_type: target.primitiveType || (target.primitive ? target.primitive.type : null),
        node_type: target.kind || null
      };

      if (target.name) {
        entry.name = target.name;
      }

      var alreadyPresent = state.removedObjects.some(function(item) {
        return (entry.name && item.name === entry.name) || item.index === entry.index;
      });
      if (!alreadyPresent) {
        state.removedObjects.push(entry);
      }
    }

    function addEditorPostprocess(state, type) {
      if (!state) {
        return;
      }

      if (!state.postprocess) {
        state.postprocess = [];
      }

      var radius = currentSceneBounds && currentSceneBounds.radius ? currentSceneBounds.radius : 100;
      if ((type || "depth_of_field") === "depth_of_field") {
        state.postprocess.push({
          type: "depth_of_field",
          focus_distance: radius,
          f_stop: 2,
          focal_length: 50,
          blur_level: "low"
        });
      }

      applyEditorPostProcesses(state);
      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function removeSelectedEditorPostprocess(state) {
      if (!state || !state.postprocess || !state.postprocess.length || !state.ui || !state.ui.effectSelect) {
        return;
      }

      var idx = Number(state.ui.effectSelect.value);
      if (!isFinite(idx) || !state.postprocess[idx]) {
        return;
      }

      state.postprocess.splice(idx, 1);
      applyEditorPostProcesses(state);
      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function directionTowardCenter(position) {
      var center = currentSceneBounds && currentSceneBounds.center ? currentSceneBounds.center : BABYLON.Vector3.Zero();
      return vectorToArray(center.subtract(position));
    }

    function lightingPresetDefinitions(presetName) {
      var radius = currentSceneBounds && currentSceneBounds.radius ? currentSceneBounds.radius : 1;
      var center = currentSceneBounds && currentSceneBounds.center ? currentSceneBounds.center : new BABYLON.Vector3(0, 0, 0);
      var preset = (presetName || "three_point").toLowerCase();

      function at(x, y, z) {
        return center.add(new BABYLON.Vector3(x * radius, y * radius, z * radius));
      }

      if (preset === "rembrandt") {
        var rembrandtKey = at(0.9, 1.1, 1.0);
        var rembrandtFill = at(-0.9, 0.35, 0.9);
        var rembrandtRim = at(0.2, 0.9, -1.2);
        return [
          {type: "spot", name: "rembrandt_key", position: vectorToArray(rembrandtKey), direction: directionTowardCenter(rembrandtKey), intensity: 1.2, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1},
          {type: "point", name: "rembrandt_fill", position: vectorToArray(rembrandtFill), intensity: 0.35, diffuse: "#DCEBFF", specular: "#FFFFFF"},
          {type: "point", name: "rembrandt_rim", position: vectorToArray(rembrandtRim), intensity: 0.55, diffuse: "#FFFFFF", specular: "#FFFFFF"}
        ];
      }

      if (preset === "butterfly") {
        var butterflyKey = at(0, 1.35, 1.1);
        var butterflyFill = at(0, -0.25, 1.0);
        var butterflyRim = at(0, 0.7, -1.1);
        return [
          {type: "spot", name: "butterfly_key", position: vectorToArray(butterflyKey), direction: directionTowardCenter(butterflyKey), intensity: 1.25, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1},
          {type: "point", name: "butterfly_fill", position: vectorToArray(butterflyFill), intensity: 0.3, diffuse: "#FFFFFF", specular: "#FFFFFF"},
          {type: "point", name: "butterfly_rim", position: vectorToArray(butterflyRim), intensity: 0.4, diffuse: "#EEF2FF", specular: "#FFFFFF"}
        ];
      }

      if (preset === "split") {
        var splitKey = at(1.2, 0.4, 0.9);
        var splitRim = at(-1.0, 0.8, -1.0);
        return [
          {type: "spot", name: "split_key", position: vectorToArray(splitKey), direction: directionTowardCenter(splitKey), intensity: 1.15, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1},
          {type: "point", name: "split_rim", position: vectorToArray(splitRim), intensity: 0.25, diffuse: "#DCEBFF", specular: "#FFFFFF"}
        ];
      }

      var key = at(1.0, 1.0, 1.1);
      var fill = at(-1.1, 0.5, 0.9);
      var rim = at(0.1, 0.9, -1.3);
      return [
        {type: "spot", name: "three_point_key", position: vectorToArray(key), direction: directionTowardCenter(key), intensity: 1.2, diffuse: "#FFF4DD", specular: "#FFFFFF", angle: Math.PI / 3, exponent: 1},
        {type: "point", name: "three_point_fill", position: vectorToArray(fill), intensity: 0.45, diffuse: "#DCEBFF", specular: "#FFFFFF"},
        {type: "point", name: "three_point_rim", position: vectorToArray(rim), intensity: 0.65, diffuse: "#FFFFFF", specular: "#FFFFFF"}
      ];
    }

    function applyLightingPreset(state, presetName) {
      if (!state) {
        return;
      }

      var existingLights = editorTargetsByKind(state, "light").slice();
      existingLights.forEach(function(target) {
        recordRemovedEditorTarget(state, target);
        disposeEditorTarget(target);
      });
      state.targets = (state.targets || []).filter(function(target) {
        return target.kind !== "light";
      });
      state.helpers = [];

      var definitions = lightingPresetDefinitions(presetName);
      setDefaultLightsEnabled(false);
      definitions.forEach(function(definition) {
        addEditorLight(state, definition.type, definition);
      });
      if (editorTargetsByKind(state, "light").length) {
        selectEditorTarget(state, editorTargetsByKind(state, "light")[0].id);
      } else {
        selectEditorTarget(state, null);
      }
      publishSceneEditorState(state);
    }

    function buildSceneEditorPayload(state) {
      var targets = state && state.targets ? state.targets : [];
      return {
        view: currentPar3dState(),
        postprocess: cloneScenePostprocesses(state.postprocess),
        scale_bar: cloneSceneScaleBar(state.scaleBar),
        clipping: cloneSceneClipping(state.clipping),
        removed_objects: (state.removedObjects || []).map(function(entry) {
          return JSON.parse(JSON.stringify(entry));
        }),
        objects: targets.map(function(target) {
          var entry = {
            index: target.index + 1,
            primitive_type: target.primitiveType,
            node_type: target.kind,
            name: target.name || null
          };

        if (target.kind === "light") {
          entry.light_type = target.primitive.light_type || "hemispheric";
            if (target.node.position) {
              entry.position = vectorToArray(target.node.position);
            }
            if (target.light && target.light.direction) {
              entry.direction = vectorToArray(target.light.direction);
            }
            if (target.primitive.intensity !== undefined) {
              entry.intensity = Number(target.primitive.intensity);
            }
            if (target.primitive.diffuse !== undefined) {
              entry.diffuse = target.primitive.diffuse;
            }
            if (target.primitive.specular !== undefined) {
              entry.specular = target.primitive.specular;
            }
            if (target.primitive.ground_color !== undefined) {
              entry.ground_color = target.primitive.ground_color;
            }
            if (target.primitive.angle !== undefined) {
              entry.angle = Number(target.primitive.angle);
            }
            if (target.primitive.exponent !== undefined) {
              entry.exponent = Number(target.primitive.exponent);
            }
            if (target.primitive.range !== undefined) {
              entry.range = Number(target.primitive.range);
            }
            if (target.primitive.shadow_enabled !== undefined) {
              entry.shadow_enabled = target.primitive.shadow_enabled === true;
            }
            if (target.primitive.shadow_darkness !== undefined) {
              entry.shadow_darkness = Number(target.primitive.shadow_darkness);
            }
            if (target.primitive.enabled !== undefined) {
              entry.enabled = target.primitive.enabled !== false;
            }
            if (target.createdInEditor) {
              entry.created_in_editor = true;
            }
            return entry;
          }

          entry.position = vectorToArray(target.node.position);
          entry.rotation = nodeRotationArray(target.node);
          entry.scaling = vectorToArray(target.node.scaling || new BABYLON.Vector3(1, 1, 1));
          if (target.primitive && target.primitive.material) {
            entry.material = cloneMaterialSpec(target.primitive.material);
          }
          if (target.primitive && target.primitive.show_bounding_box !== undefined) {
            entry.show_bounding_box = target.primitive.show_bounding_box === true;
          }
          if (target.primitive && target.primitive.morph_target) {
            entry.morph_target = normalizeMorphTargetSpecs(target.primitive).map(function(spec) {
              return {
                name: spec.name || null,
                influence: Number(spec.influence === undefined ? 0 : spec.influence)
              };
            });
          }
          if (target.createdInEditor) {
            entry.created_in_editor = true;
          }
          return entry;
        }),
        selected: state.selectedId || null,
        gizmo_mode: state.gizmoMode,
        gizmos_visible: state.gizmosVisible !== false
      };
    }

    function updateSceneEditorPanel(state, payload) {
      if (!state || state.mode !== "edit_scene3d") {
        clearUiPanel();
        return;
      }

      if (!state.ui) {
        uiLayer.style.display = "block";
        uiLayer.innerHTML =
          "<div data-role='panel-handle' style='font-weight:700; margin:-10px -10px 8px -10px; padding:10px; border-bottom:1px solid rgba(15,23,42,0.08); cursor:move; user-select:none; background:rgba(248,250,252,0.9); border-top-left-radius:8px; border-top-right-radius:8px;'>Scene Editor</div>" +
          "<div style='margin-bottom:8px; color:#475569;'>Click a mesh or light in the viewport, or select it below, then edit transforms and other settings.</div>" +
          "<button type='button' data-role='gizmo-toggle' style='width:100%; margin-bottom:8px; border:0; border-radius:6px; background:#1d4ed8; color:white; padding:6px 10px; cursor:pointer;'>Hide Gizmo</button>" +
          "<details data-role='section-snapshot' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Snapshot</summary>" +
            "<div style='margin-top:8px; margin-left:10px;'>" +
              "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='scale-bar-enabled' type='checkbox' /> Scale bar</label>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Scale bar length</label>" +
              "<input data-role='scale-bar-length' type='number' min='0' step='any' value='1' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Scale bar unit</label>" +
              "<select data-role='scale-bar-unit' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
                "<option value='mm'>mm</option>" +
                "<option value='cm'>cm</option>" +
                "<option value='procrustes distance'>procrustes distance</option>" +
                "<option value='other'>other</option>" +
              "</select>" +
              "<input data-role='scale-bar-unit-other' type='text' placeholder='Enter custom unit' style='display:none; width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Filename</label>" +
              "<input data-role='snapshot-filename' type='text' value='scene.png' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Format</label>" +
              "<select data-role='snapshot-format' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
                "<option value='png'>png</option>" +
                "<option value='tif'>tif</option>" +
                "<option value='svg'>svg</option>" +
              "</select>" +
              "<button type='button' data-role='snapshot-save' style='width:100%; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Save Snapshot</button>" +
              "<div style='margin-top:6px; color:#64748b;'>Helper spheres and gizmos are hidden in exported images.</div>" +
            "</div>" +
          "</details>" +
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
          "<details data-role='section-lights' open style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Lights</summary>" +
            "<div style='margin-top:8px; margin-left:10px;'>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Lighting preset</label>" +
              "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
                "<select data-role='light-preset' style='flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
                  "<option value='three_point'>three_point</option>" +
                  "<option value='rembrandt'>rembrandt</option>" +
                  "<option value='butterfly'>butterfly</option>" +
                  "<option value='split'>split</option>" +
                "</select>" +
                "<button type='button' data-role='light-apply-preset' style='border:0; border-radius:6px; background:#0f766e; color:white; padding:6px 10px; cursor:pointer;'>Apply</button>" +
              "</div>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>New light type</label>" +
              "<select data-role='new-light-type' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
                "<option value='point'>point</option>" +
                "<option value='spot'>spot</option>" +
                "<option value='directional'>directional</option>" +
                "<option value='hemispheric'>hemispheric</option>" +
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
              "<label data-role='diffuse-label' style='display:block; margin-bottom:4px; color:#334155;'>Diffuse color</label>" +
              "<input data-role='diffuse-color' type='color' value='#ffffff' style='width:100%; height:36px; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; padding:2px;' />" +
              "<details data-role='shadow-fields' style='margin-bottom:8px;'>" +
                "<summary style='cursor:pointer; font-weight:700; color:#334155; text-decoration:underline;'>Shadows</summary>" +
                "<div style='margin-top:8px; margin-left:10px;'>" +
                  "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='shadow-enabled' type='checkbox' /> Enable shadows</label>" +
                  "<label data-role='shadow-darkness-label' style='display:block; margin-bottom:4px; color:#334155;'>Shadow darkness <span data-role='shadow-darkness-value'>0.5</span></label>" +
                  "<input data-role='shadow-darkness-slider' type='range' min='0' max='1' step='0.01' value='0.5' style='width:100%; margin-bottom:8px;' />" +
                "</div>" +
              "</details>" +
            "</div>" +
          "</details>" +
          "<details data-role='section-morphs' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Morph Targets</summary>" +
            "<div data-role='morphs-panel' style='margin-top:8px; margin-left:10px; color:#334155;'></div>" +
          "</details>" +
          "<details data-role='section-materials' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Materials</summary>" +
            "<div style='margin-top:8px; margin-left:10px;'>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Library</label>" +
              "<select data-role='material-library' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'></select>" +
              "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
                "<button type='button' data-role='material-assign' style='flex:1; border:0; border-radius:6px; background:#0f766e; color:white; padding:6px 10px; cursor:pointer;'>Assign</button>" +
                "<button type='button' data-role='material-save' style='flex:1; border:0; border-radius:6px; background:#1d4ed8; color:white; padding:6px 10px; cursor:pointer;'>Save As</button>" +
              "</div>" +
              "<input data-role='material-save-name' type='text' placeholder='library name' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;' />" +
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
          "<details data-role='section-effects' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Postprocessing</summary>" +
            "<div data-role='effects-panel' style='margin-top:8px; margin-left:10px;'>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>New effect</label>" +
              "<select data-role='new-effect-type' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
                "<option value='depth_of_field'>depth_of_field</option>" +
              "</select>" +
              "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
                "<button type='button' data-role='effect-add' style='flex:1; border:0; border-radius:6px; background:#0f766e; color:white; padding:6px 10px; cursor:pointer;'>Add Effect</button>" +
                "<button type='button' data-role='effect-remove' style='flex:1; border:0; border-radius:6px; background:#991b1b; color:white; padding:6px 10px; cursor:pointer;'>Remove</button>" +
              "</div>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Effect</label>" +
              "<select data-role='effect-target' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'></select>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Focus distance <span data-role='focus-distance-value'></span></label>" +
              "<input data-role='focus-distance-slider' type='range' min='0' max='1000' step='1' value='0' style='width:100%; margin-bottom:8px;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>f-stop <span data-role='f-stop-value'></span></label>" +
              "<input data-role='f-stop-slider' type='range' min='0.1' max='22' step='0.1' value='2' style='width:100%; margin-bottom:8px;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Focal length <span data-role='focal-length-value'></span></label>" +
              "<input data-role='focal-length-slider' type='range' min='1' max='200' step='1' value='50' style='width:100%; margin-bottom:8px;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Blur level</label>" +
              "<select data-role='blur-level' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'>" +
                "<option value='low'>low</option>" +
                "<option value='medium'>medium</option>" +
                "<option value='high'>high</option>" +
              "</select>" +
            "</div>" +
          "</details>" +
          "<details data-role='section-clipping' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Clipping</summary>" +
            "<div style='margin-top:8px; margin-left:10px;'>" +
              "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='clipping-enabled' type='checkbox' /> Enable clipping</label>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Active mesh</label>" +
              "<select data-role='clipping-material' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc; font:inherit;' disabled></select>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Plane X</label>" +
              "<input data-role='clipping-x' type='range' min='-1' max='1' step='0.01' value='1' style='width:100%; margin-bottom:8px;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Plane Y</label>" +
              "<input data-role='clipping-y' type='range' min='-1' max='1' step='0.01' value='0' style='width:100%; margin-bottom:8px;' />" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Plane Z</label>" +
              "<input data-role='clipping-z' type='range' min='-1' max='1' step='0.01' value='0' style='width:100%; margin-bottom:8px;' />" +
            "</div>" +
          "</details>" +
          "<details data-role='section-log' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a; text-decoration:underline;'>Scene State Log</summary>" +
            "<div style='margin-top:8px; margin-left:10px;'>" +
              "<textarea readonly data-role='state-json' style='width:100%; min-height:160px; resize:vertical; font:inherit; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc;'></textarea>" +
              "<button type='button' data-role='copy-state' style='margin-top:8px; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Copy JSON</button>" +
            "</div>" +
          "</details>";

        state.ui = {
          panelHandle: uiLayer.querySelector("[data-role='panel-handle']"),
          gizmoToggleButton: uiLayer.querySelector("[data-role='gizmo-toggle']"),
          meshSection: uiLayer.querySelector("[data-role='section-meshes']"),
          materialSection: uiLayer.querySelector("[data-role='section-materials']"),
          lightSection: uiLayer.querySelector("[data-role='section-lights']"),
          morphsSection: uiLayer.querySelector("[data-role='section-morphs']"),
          morphsPanel: uiLayer.querySelector("[data-role='morphs-panel']"),
          effectsSection: uiLayer.querySelector("[data-role='section-effects']"),
          clippingSection: uiLayer.querySelector("[data-role='section-clipping']"),
          snapshotSection: uiLayer.querySelector("[data-role='section-snapshot']"),
          logSection: uiLayer.querySelector("[data-role='section-log']"),
          meshSelect: uiLayer.querySelector("[data-role='mesh-target']"),
          meshResetButton: uiLayer.querySelector("[data-role='mesh-reset']"),
          materialLibrarySelect: uiLayer.querySelector("[data-role='material-library']"),
          materialAssignButton: uiLayer.querySelector("[data-role='material-assign']"),
          materialSaveButton: uiLayer.querySelector("[data-role='material-save']"),
          materialSaveNameInput: uiLayer.querySelector("[data-role='material-save-name']"),
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
          lightSelect: uiLayer.querySelector("[data-role='light-target']"),
          lightPresetSelect: uiLayer.querySelector("[data-role='light-preset']"),
          lightPresetButton: uiLayer.querySelector("[data-role='light-apply-preset']"),
          newLightTypeSelect: uiLayer.querySelector("[data-role='new-light-type']"),
          lightAddButton: uiLayer.querySelector("[data-role='light-add']"),
          lightRemoveButton: uiLayer.querySelector("[data-role='light-remove']"),
          effectSelect: uiLayer.querySelector("[data-role='effect-target']"),
          newEffectTypeSelect: uiLayer.querySelector("[data-role='new-effect-type']"),
          effectAddButton: uiLayer.querySelector("[data-role='effect-add']"),
          effectRemoveButton: uiLayer.querySelector("[data-role='effect-remove']"),
          intensityLabel: uiLayer.querySelector("[data-role='intensity-label']"),
          intensityValue: uiLayer.querySelector("[data-role='intensity-value']"),
          intensitySlider: uiLayer.querySelector("[data-role='intensity-slider']"),
          diffuseLabel: uiLayer.querySelector("[data-role='diffuse-label']"),
          diffuseColorInput: uiLayer.querySelector("[data-role='diffuse-color']"),
          shadowFields: uiLayer.querySelector("[data-role='shadow-fields']"),
          shadowEnabledInput: uiLayer.querySelector("[data-role='shadow-enabled']"),
          shadowDarknessLabel: uiLayer.querySelector("[data-role='shadow-darkness-label']"),
          shadowDarknessValue: uiLayer.querySelector("[data-role='shadow-darkness-value']"),
          shadowDarknessSlider: uiLayer.querySelector("[data-role='shadow-darkness-slider']"),
          scaleBarEnabledInput: uiLayer.querySelector("[data-role='scale-bar-enabled']"),
          scaleBarLengthInput: uiLayer.querySelector("[data-role='scale-bar-length']"),
          scaleBarUnitSelect: uiLayer.querySelector("[data-role='scale-bar-unit']"),
          scaleBarUnitOtherInput: uiLayer.querySelector("[data-role='scale-bar-unit-other']"),
          snapshotFilenameInput: uiLayer.querySelector("[data-role='snapshot-filename']"),
          snapshotFormatSelect: uiLayer.querySelector("[data-role='snapshot-format']"),
          snapshotSaveButton: uiLayer.querySelector("[data-role='snapshot-save']"),
          focusDistanceSlider: uiLayer.querySelector("[data-role='focus-distance-slider']"),
          focusDistanceValue: uiLayer.querySelector("[data-role='focus-distance-value']"),
          fStopSlider: uiLayer.querySelector("[data-role='f-stop-slider']"),
          fStopValue: uiLayer.querySelector("[data-role='f-stop-value']"),
          focalLengthSlider: uiLayer.querySelector("[data-role='focal-length-slider']"),
          focalLengthValue: uiLayer.querySelector("[data-role='focal-length-value']"),
          blurLevelSelect: uiLayer.querySelector("[data-role='blur-level']"),
          clippingEnabledInput: uiLayer.querySelector("[data-role='clipping-enabled']"),
          clippingMaterialSelect: uiLayer.querySelector("[data-role='clipping-material']"),
          clippingXSlider: uiLayer.querySelector("[data-role='clipping-x']"),
          clippingYSlider: uiLayer.querySelector("[data-role='clipping-y']"),
          clippingZSlider: uiLayer.querySelector("[data-role='clipping-z']"),
          stateText: uiLayer.querySelector("[data-role='state-json']"),
          copyButton: uiLayer.querySelector("[data-role='copy-state']"),
          meshModeButtons: Array.prototype.slice.call(uiLayer.querySelectorAll("[data-role='mesh-mode']")),
          lightModeButtons: Array.prototype.slice.call(uiLayer.querySelectorAll("[data-role='light-mode']"))
        };

        enableUiPanelDrag(state.ui.panelHandle);

        state.ui.meshSelect.addEventListener("change", function(evt) {
          state.selectedId = evt.target.value;
          state.deferGizmoAttach = false;
          state.sectionOpen.meshes = true;
          state.sectionOpen.materials = true;
          syncEditorGizmoState(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.meshResetButton.addEventListener("click", function() {
          resetSelectedMeshTarget(state);
        });

        function updateSelectedMaterial(mutator) {
          var target = selectedMeshTarget(state);
          if (!target) {
            return;
          }
          var spec = editableMaterialSpec(target);
          mutator(spec, target);
          target.primitive.material = spec;
          applyMaterialToEditorTarget(target);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        }

        state.ui.materialTypeSelect.addEventListener("change", function(evt) {
          updateSelectedMaterial(function(spec) {
            var nextType = evt.target.value === "pbr" ? "pbr" : "standard";
            var alpha = spec.alpha;
            var wireframe = !!spec.wireframe;
            var backface = spec.backface_culling !== false;
            var color = spec.type === "pbr" ? spec.base_color : spec.diffuse;
            var next = defaultMaterialSpec(nextType);
            next.alpha = alpha === undefined ? next.alpha : alpha;
            next.wireframe = wireframe;
            next.backface_culling = backface;
            if (nextType === "pbr") {
              next.base_color = color || "#ffffff";
            } else {
              next.diffuse = color || "#d9d9d9";
            }
            Object.keys(spec).forEach(function(key) {
              delete spec[key];
            });
            Object.keys(next).forEach(function(key) {
              spec[key] = next[key];
            });
          });
        });

        state.ui.materialColorInput.addEventListener("input", function(evt) {
          updateSelectedMaterial(function(spec) {
            if (spec.type === "pbr") {
              spec.base_color = evt.target.value;
            } else {
              spec.diffuse = evt.target.value;
            }
          });
        });

        state.ui.materialAlphaSlider.addEventListener("input", function(evt) {
          updateSelectedMaterial(function(spec) {
            spec.alpha = Number(evt.target.value);
          });
        });

        state.ui.materialMetallicSlider.addEventListener("input", function(evt) {
          updateSelectedMaterial(function(spec) {
            spec.type = "pbr";
            spec.metallic = Number(evt.target.value);
          });
        });

        state.ui.materialRoughnessSlider.addEventListener("input", function(evt) {
          updateSelectedMaterial(function(spec) {
            spec.type = "pbr";
            spec.roughness = Number(evt.target.value);
          });
        });

        state.ui.materialWireframeInput.addEventListener("change", function(evt) {
          updateSelectedMaterial(function(spec) {
            spec.wireframe = !!evt.target.checked;
          });
        });

        state.ui.meshBoundingBoxInput.addEventListener("change", function(evt) {
          var target = selectedMeshTarget(state);
          if (!target) {
            return;
          }
          target.primitive.show_bounding_box = !!evt.target.checked;
          applyBoundingBoxToEditorTarget(target);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.materialBackfaceInput.addEventListener("change", function(evt) {
          updateSelectedMaterial(function(spec) {
            spec.backface_culling = !!evt.target.checked;
          });
        });

        state.ui.materialAssignButton.addEventListener("click", function() {
          assignLibraryMaterialToSelectedMesh(state, state.ui.materialLibrarySelect.value);
        });

        state.ui.materialSaveButton.addEventListener("click", function() {
          var name = (state.ui.materialSaveNameInput.value || "").trim();
          if (!name) {
            return;
          }
          saveSelectedMaterialToLibrary(state, name);
          state.ui.materialSaveNameInput.value = name;
        });

        state.ui.lightSelect.addEventListener("change", function(evt) {
          state.selectedId = evt.target.value;
          state.deferGizmoAttach = false;
          state.sectionOpen.lights = true;
          syncEditorGizmoState(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.lightAddButton.addEventListener("click", function() {
          state.sectionOpen.lights = true;
          addEditorLight(state, state.ui.newLightTypeSelect.value || "point");
        });

        state.ui.lightPresetButton.addEventListener("click", function() {
          state.sectionOpen.lights = true;
          applyLightingPreset(state, state.ui.lightPresetSelect.value || "three_point");
        });

        state.ui.lightRemoveButton.addEventListener("click", function() {
          removeSelectedEditorLight(state);
        });

        state.ui.meshModeButtons.forEach(function(button) {
          button.addEventListener("click", function() {
            var meshTarget = selectedMeshTarget(state);
            if (meshTarget) {
              state.selectedId = meshTarget.id;
            }
            state.deferGizmoAttach = false;
            state.gizmoMode = button.getAttribute("data-mode");
            state.sectionOpen.meshes = true;
            state.sectionOpen.materials = true;
            syncEditorGizmoState(state);
            updateSceneEditorPanel(state, buildSceneEditorPayload(state));
            publishSceneEditorState(state);
          });
        });

        state.ui.lightModeButtons.forEach(function(button) {
          button.addEventListener("click", function() {
            var lightTarget = selectedLightTarget(state);
            if (lightTarget) {
              state.selectedId = lightTarget.id;
            }
            state.deferGizmoAttach = false;
            state.gizmoMode = button.getAttribute("data-mode");
            state.sectionOpen.lights = true;
            syncEditorGizmoState(state);
            updateSceneEditorPanel(state, buildSceneEditorPayload(state));
            publishSceneEditorState(state);
          });
        });

        state.ui.gizmoToggleButton.addEventListener("click", function() {
          state.gizmosVisible = !state.gizmosVisible;
          syncEditorGizmoState(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
        });

        state.ui.intensitySlider.addEventListener("input", function(evt) {
          var target = selectedEditorTarget(state);
          var value = Number(evt.target.value);
          if (!target || target.kind !== "light" || !isFinite(value)) {
            return;
          }
          if (target.light) {
            target.light.intensity = value;
          }
          target.primitive.intensity = value;
          state.ui.intensityValue.textContent = value.toFixed(2).replace(/\.?0+$/, "");
          publishSceneEditorState(state);
        });

        state.ui.diffuseColorInput.addEventListener("input", function(evt) {
          var target = selectedEditorTarget(state);
          var value = evt.target.value;
          if (!target || target.kind !== "light" || typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
            return;
          }
          if (target.light) {
            target.light.diffuse = coerceColor3(value, target.light.diffuse);
          }
          target.primitive.diffuse = value;
          setLightHelperColor(target, value);
          publishSceneEditorState(state);
        });

        state.ui.shadowEnabledInput.addEventListener("change", function(evt) {
          var target = selectedEditorTarget(state);
          if (!target || target.kind !== "light") {
            return;
          }
          target.primitive.shadow_enabled = !!evt.target.checked;
          configureLightShadows(target);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.shadowDarknessSlider.addEventListener("input", function(evt) {
          var target = selectedEditorTarget(state);
          var value = Number(evt.target.value);
          if (!target || target.kind !== "light" || !isFinite(value)) {
            return;
          }
          target.primitive.shadow_darkness = value;
          configureLightShadows(target);
          state.ui.shadowDarknessValue.textContent = value.toFixed(2).replace(/\.?0+$/, "");
          publishSceneEditorState(state);
        });

        state.ui.effectSelect.addEventListener("change", function() {
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
        });

        state.ui.effectAddButton.addEventListener("click", function() {
          state.sectionOpen.effects = true;
          addEditorPostprocess(state, state.ui.newEffectTypeSelect.value || "depth_of_field");
        });

        state.ui.effectRemoveButton.addEventListener("click", function() {
          removeSelectedEditorPostprocess(state);
        });

        state.ui.focusDistanceSlider.addEventListener("input", function(evt) {
          var idx = Number(state.ui.effectSelect.value);
          if (!isFinite(idx) || !state.postprocess[idx]) {
            return;
          }
          state.postprocess[idx].focus_distance = Number(evt.target.value);
          applyEditorPostProcesses(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.fStopSlider.addEventListener("input", function(evt) {
          var idx = Number(state.ui.effectSelect.value);
          if (!isFinite(idx) || !state.postprocess[idx]) {
            return;
          }
          state.postprocess[idx].f_stop = Number(evt.target.value);
          applyEditorPostProcesses(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.focalLengthSlider.addEventListener("input", function(evt) {
          var idx = Number(state.ui.effectSelect.value);
          if (!isFinite(idx) || !state.postprocess[idx]) {
            return;
          }
          state.postprocess[idx].focal_length = Number(evt.target.value);
          applyEditorPostProcesses(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.blurLevelSelect.addEventListener("change", function(evt) {
          var idx = Number(state.ui.effectSelect.value);
          if (!isFinite(idx) || !state.postprocess[idx]) {
            return;
          }
          state.postprocess[idx].blur_level = evt.target.value;
          applyEditorPostProcesses(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        });

        state.ui.snapshotSaveButton.addEventListener("click", function() {
          if (!state.widgetId) {
            return;
          }
          setSnapshotPreviewVisible(state, false);
          window.requestAnimationFrame(function() {
            window.requestAnimationFrame(function() {
              emitHostEvent(
                "snapshot_request",
                {
                  filename: state.ui.snapshotFilenameInput.value || "scene.png",
                  format: state.ui.snapshotFormatSelect.value || "png",
                  vwidth: engine.getRenderWidth ? engine.getRenderWidth() : canvas.width,
                  vheight: engine.getRenderHeight ? engine.getRenderHeight() : canvas.height,
                  image_data: canvas.toDataURL("image/png")
                },
                state.widgetId
              );
            });
          });
        });

        state.ui.snapshotFormatSelect.addEventListener("change", function(evt) {
          var format = evt.target.value || "png";
          var current = state.ui.snapshotFilenameInput.value || "scene.png";
          if (/\.[A-Za-z0-9]+$/.test(current)) {
            state.ui.snapshotFilenameInput.value = current.replace(/\.[A-Za-z0-9]+$/, "." + format);
          } else {
            state.ui.snapshotFilenameInput.value = current + "." + format;
          }
        });

        function updateScaleBarFromInputs() {
          var enabled = !!state.ui.scaleBarEnabledInput.checked;
          var length = Number(state.ui.scaleBarLengthInput.value);
          var unit = (state.ui.scaleBarUnitSelect.value || "mm").toLowerCase();
          var customUnit = state.ui.scaleBarUnitOtherInput.value ? String(state.ui.scaleBarUnitOtherInput.value).trim() : "";
          state.ui.scaleBarUnitOtherInput.style.display = unit === "other" ? "block" : "none";
          if (!enabled) {
            state.scaleBar = {enabled: false};
          } else if (isFinite(length) && length > 0) {
            state.scaleBar = {
              enabled: true,
              length: length,
              units: unit,
              custom_units: unit === "other" ? customUnit : null
            };
          } else {
            return;
          }
          applyEditorScaleBar(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        }

        state.ui.scaleBarEnabledInput.addEventListener("change", updateScaleBarFromInputs);
        state.ui.scaleBarLengthInput.addEventListener("input", updateScaleBarFromInputs);
        state.ui.scaleBarUnitSelect.addEventListener("change", updateScaleBarFromInputs);
        state.ui.scaleBarUnitOtherInput.addEventListener("input", updateScaleBarFromInputs);

        function updateClippingFromInputs() {
          var enabled = !!state.ui.clippingEnabledInput.checked;
          var x = Number(state.ui.clippingXSlider.value);
          var y = Number(state.ui.clippingYSlider.value);
          var z = Number(state.ui.clippingZSlider.value);

          state.clipping = {
            enabled: enabled,
            x: isFinite(x) ? x : 1,
            y: isFinite(y) ? y : 0,
            z: isFinite(z) ? z : 0
          };
          applyEditorClipping(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          publishSceneEditorState(state);
        }

        state.ui.clippingEnabledInput.addEventListener("change", updateClippingFromInputs);
        state.ui.clippingXSlider.addEventListener("input", updateClippingFromInputs);
        state.ui.clippingYSlider.addEventListener("input", updateClippingFromInputs);
        state.ui.clippingZSlider.addEventListener("input", updateClippingFromInputs);

        [state.ui.meshSection, state.ui.materialSection, state.ui.lightSection, state.ui.morphsSection, state.ui.effectsSection, state.ui.clippingSection, state.ui.snapshotSection, state.ui.logSection].forEach(function(section) {
          if (!section) {
            return;
          }
          section.addEventListener("toggle", function() {
            state.sectionOpen.meshes = !!state.ui.meshSection.open;
            state.sectionOpen.materials = !!state.ui.materialSection.open;
            state.sectionOpen.lights = !!state.ui.lightSection.open;
            state.sectionOpen.morphs = !!state.ui.morphsSection.open;
            state.sectionOpen.effects = !!state.ui.effectsSection.open;
            state.sectionOpen.clipping = !!state.ui.clippingSection.open;
            state.sectionOpen.snapshot = !!state.ui.snapshotSection.open;
            state.sectionOpen.log = !!state.ui.logSection.open;
          });
        });

        bindCopyButton(state.ui.copyButton, function() {
          return state.ui.stateText.value;
        });
      }

      uiLayer.style.display = "block";

      var selected = selectedEditorTarget(state);
      var meshTargets = editorTargetsByKind(state, "mesh");
      var lightTargets = editorTargetsByKind(state, "light");
      state.ui.meshSection.open = state.sectionOpen.meshes !== false;
      state.ui.materialSection.open = state.sectionOpen.materials !== false;
      state.ui.lightSection.open = state.sectionOpen.lights !== false;
      state.ui.morphsSection.open = state.sectionOpen.morphs !== false;
      state.ui.effectsSection.open = state.sectionOpen.effects !== false;
      state.ui.clippingSection.open = state.sectionOpen.clipping === true;
      state.ui.snapshotSection.open = state.sectionOpen.snapshot === true;
      state.ui.logSection.open = state.sectionOpen.log === true;

      state.ui.meshSelect.innerHTML = "";
      meshTargets.forEach(function(target) {
        var option = document.createElement("option");
        option.value = target.id;
        option.textContent = target.label;
        option.selected = !!selected && target.id === selected.id;
        state.ui.meshSelect.appendChild(option);
      });
      if (!meshTargets.length) {
        var option = document.createElement("option");
        option.value = "";
        option.textContent = "No editable meshes";
        option.selected = true;
        state.ui.meshSelect.appendChild(option);
      }

      state.ui.lightSelect.innerHTML = "";
      lightTargets.forEach(function(target) {
        var option = document.createElement("option");
        option.value = target.id;
        option.textContent = target.label;
        option.selected = !!selected && target.id === selected.id;
        state.ui.lightSelect.appendChild(option);
      });
      if (!lightTargets.length) {
        var option = document.createElement("option");
        option.value = "";
        option.textContent = "No editable lights";
        option.selected = true;
        state.ui.lightSelect.appendChild(option);
      }

      state.ui.meshSelect.disabled = !meshTargets.length;
      state.ui.lightSelect.disabled = !lightTargets.length;
      state.ui.lightRemoveButton.disabled = !(selected && selected.kind === "light");
      state.ui.materialLibrarySelect.innerHTML = "";
      sceneMaterialNames().forEach(function(name) {
        var option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        state.ui.materialLibrarySelect.appendChild(option);
      });
      if (!state.ui.materialLibrarySelect.options.length) {
        var libraryOption = document.createElement("option");
        libraryOption.value = "";
        libraryOption.textContent = "No registered materials";
        state.ui.materialLibrarySelect.appendChild(libraryOption);
      }

      state.ui.meshModeButtons.forEach(function(button) {
        var mode = button.getAttribute("data-mode");
        var active = mode === state.gizmoMode;
        var disableScale = mode === "scale" && (!selected || selected.kind !== "mesh");
        button.disabled = disableScale || !meshTargets.length;
        button.style.display = "inline-block";
        button.style.opacity = button.disabled ? "0.5" : "1";
        button.style.background = active && selected && selected.kind === "mesh" ? "#0f172a" : "#475569";
      });

      var lightModes = availableEditorModes(selected && selected.kind === "light" ? selected : null);
      state.ui.lightModeButtons.forEach(function(button) {
        var mode = button.getAttribute("data-mode");
        var active = mode === state.gizmoMode;
        var supported = !selected || selected.kind !== "light" ? true : lightModes.indexOf(mode) !== -1;
        button.disabled = !lightTargets.length || !supported;
        button.style.display = supported ? "inline-block" : "none";
        button.style.opacity = button.disabled ? "0.5" : "1";
        button.style.background = active && selected && selected.kind === "light" ? "#0f172a" : "#475569";
      });

      var showIntensity = !!selected && selected.kind === "light";
      state.ui.intensityLabel.style.display = showIntensity ? "block" : "none";
      state.ui.intensitySlider.style.display = showIntensity ? "block" : "none";
      state.ui.diffuseLabel.style.display = showIntensity ? "block" : "none";
      state.ui.diffuseColorInput.style.display = showIntensity ? "block" : "none";
      state.ui.shadowFields.style.display = "none";
      if (showIntensity) {
        var intensity = selected.light && selected.light.intensity !== undefined ?
          Number(selected.light.intensity) :
          Number(selected.primitive.intensity || 1);
        if (!isFinite(intensity)) {
          intensity = 1;
        }
        state.ui.intensitySlider.value = String(intensity);
        state.ui.intensityValue.textContent = intensity.toFixed(2).replace(/\.?0+$/, "");
        state.ui.diffuseColorInput.value = color3ToHex(
          selected.primitive.diffuse || (selected.light ? selected.light.diffuse : null),
          "#ffffff"
        );

        var shadowSupported = shadowCapableLightType(targetLightType(selected));
        var shadowEnabled = shadowSupported && selected.primitive.shadow_enabled === true;
        var shadowDarkness = selected.primitive.shadow_darkness === undefined ? 0.5 : Number(selected.primitive.shadow_darkness);
        if (!isFinite(shadowDarkness)) {
          shadowDarkness = 0.5;
        }
        state.ui.shadowFields.style.display = shadowSupported ? "block" : "none";
        state.ui.shadowFields.open = shadowSupported && shadowEnabled;
        state.ui.shadowEnabledInput.checked = shadowEnabled;
        state.ui.shadowEnabledInput.disabled = !shadowSupported;
        state.ui.shadowDarknessSlider.value = String(shadowDarkness);
        state.ui.shadowDarknessValue.textContent = shadowDarkness.toFixed(2).replace(/\.?0+$/, "");
        state.ui.shadowDarknessSlider.disabled = !shadowSupported || !shadowEnabled;
      }

      var materialTarget = selectedMeshTarget(state);
      var showMaterial = !!materialTarget;
      state.ui.materialTypeSelect.disabled = !showMaterial;
      state.ui.materialLibrarySelect.disabled = !showMaterial || sceneMaterialNames().length === 0;
      state.ui.materialAssignButton.disabled = !showMaterial || sceneMaterialNames().length === 0;
      state.ui.materialSaveButton.disabled = !showMaterial;
      state.ui.materialSaveNameInput.disabled = !showMaterial;
      state.ui.materialColorInput.disabled = !showMaterial;
      state.ui.materialAlphaSlider.disabled = !showMaterial;
      state.ui.materialMetallicSlider.disabled = !showMaterial;
      state.ui.materialRoughnessSlider.disabled = !showMaterial;
      state.ui.materialWireframeInput.disabled = !showMaterial;
      state.ui.meshBoundingBoxInput.disabled = !showMaterial;
      state.ui.materialBackfaceInput.disabled = !showMaterial;
      state.ui.materialSection.style.display = meshTargets.length ? "block" : "none";
      if (showMaterial) {
        var materialSpec = editableMaterialSpec(materialTarget);
        var isPbr = materialSpec && materialSpec.type === "pbr";
        state.ui.materialTypeSelect.value = isPbr ? "pbr" : "standard";
        state.ui.materialColorLabel.textContent = isPbr ? "Base color" : "Diffuse color";
        state.ui.materialColorInput.value = color3ToHex(isPbr ? materialSpec.base_color : materialSpec.diffuse, "#d9d9d9");
        state.ui.materialAlphaSlider.value = String(Number(materialSpec.alpha === undefined ? 1 : materialSpec.alpha));
        state.ui.materialAlphaValue.textContent = formatRNumber(Number(materialSpec.alpha === undefined ? 1 : materialSpec.alpha));
        state.ui.materialPbrFields.style.display = isPbr ? "block" : "none";
        state.ui.materialMetallicSlider.value = String(Number(materialSpec.metallic === undefined ? 0 : materialSpec.metallic));
        state.ui.materialMetallicValue.textContent = formatRNumber(Number(materialSpec.metallic === undefined ? 0 : materialSpec.metallic));
        state.ui.materialRoughnessSlider.value = String(Number(materialSpec.roughness === undefined ? 1 : materialSpec.roughness));
        state.ui.materialRoughnessValue.textContent = formatRNumber(Number(materialSpec.roughness === undefined ? 1 : materialSpec.roughness));
        state.ui.materialWireframeInput.checked = !!materialSpec.wireframe;
        state.ui.meshBoundingBoxInput.checked = !!(materialTarget.primitive && materialTarget.primitive.show_bounding_box);
        state.ui.materialBackfaceInput.checked = materialSpec.backface_culling !== false;
        if (!state.ui.materialSaveNameInput.value) {
          state.ui.materialSaveNameInput.value = (materialTarget.name || "material").replace(/\s+/g, "_").toLowerCase();
        }
      } else {
        state.ui.materialPbrFields.style.display = "none";
      }

      var morphTargets = [];
      meshTargets.forEach(function(target) {
        normalizeMorphTargetSpecs(target.primitive).forEach(function(spec, index) {
          morphTargets.push({
            target: target,
            spec: spec,
            index: index
          });
        });
      });
      state.ui.morphsSection.style.display = morphTargets.length ? "block" : "none";
      state.ui.morphsPanel.innerHTML = "";
      if (morphTargets.length) {
        morphTargets.forEach(function(item) {
          var wrapper = document.createElement("div");
          wrapper.style.marginBottom = "10px";

          var label = document.createElement("label");
          label.style.display = "block";
          label.style.marginBottom = "4px";
          label.style.color = "#334155";
          var influence = Number(item.spec.influence === undefined ? 0 : item.spec.influence);
          if (!isFinite(influence)) {
            influence = 0;
          }
          var morphLabel = item.spec.name || ((item.target.name || item.target.label || "Morph target") + " " + (item.index + 1));
          label.textContent = morphLabel + " influence " + influence.toFixed(2).replace(/\.?0+$/, "");

          var slider = document.createElement("input");
          slider.type = "range";
          slider.min = "0";
          slider.max = "1";
          slider.step = "0.01";
          slider.value = String(influence);
          slider.style.width = "100%";
          function updateMorphSlider(evt, publish) {
            var nextValue = Number(evt.target.value);
            setMorphTargetInfluence(item.target.node, item.target.primitive, item.index, nextValue);
            label.textContent = morphLabel + " influence " + nextValue.toFixed(2).replace(/\.?0+$/, "");
            if (publish) {
              publishSceneEditorState(state);
            }
          }
          slider.addEventListener("input", function(evt) {
            updateMorphSlider(evt, false);
          });
          slider.addEventListener("change", function(evt) {
            updateMorphSlider(evt, true);
          });

          wrapper.appendChild(label);
          wrapper.appendChild(slider);
          state.ui.morphsPanel.appendChild(wrapper);
        });
      } else {
        state.ui.morphsPanel.textContent = "No morph targets detected.";
      }

      var gizmoLabel = state.gizmosVisible === false ? "Show Gizmo" : "Hide Gizmo";
      state.ui.gizmoToggleButton.disabled = !selected;
      state.ui.gizmoToggleButton.textContent = gizmoLabel;
      var scaleBarSpec = state.scaleBar || {enabled: false};
      state.ui.scaleBarEnabledInput.checked = scaleBarSpec.enabled === true;
      state.ui.scaleBarLengthInput.disabled = scaleBarSpec.enabled !== true;
      state.ui.scaleBarLengthInput.value = scaleBarSpec.length !== undefined ? String(Number(scaleBarSpec.length)) : "1";
      state.ui.scaleBarUnitSelect.disabled = scaleBarSpec.enabled !== true;
      state.ui.scaleBarUnitSelect.value = scaleBarSpec.units || "mm";
      state.ui.scaleBarUnitOtherInput.disabled = scaleBarSpec.enabled !== true || state.ui.scaleBarUnitSelect.value !== "other";
      state.ui.scaleBarUnitOtherInput.style.display = state.ui.scaleBarUnitSelect.value === "other" ? "block" : "none";
      state.ui.scaleBarUnitOtherInput.value = scaleBarSpec.custom_units || "";

      var activeMeshTarget = selectedMeshTarget(state);
      state.ui.clippingMaterialSelect.innerHTML = "";
      var clipOption = document.createElement("option");
      clipOption.value = activeMeshTarget ? activeMeshTarget.id : "";
      clipOption.textContent = activeMeshTarget ? activeMeshTarget.label : "No active mesh";
      clipOption.selected = true;
      state.ui.clippingMaterialSelect.appendChild(clipOption);
      var clippingCenter = currentSceneBounds && currentSceneBounds.center ? currentSceneBounds.center : {x: 0, y: 0, z: 0};
      var clippingRadius = currentSceneBounds && currentSceneBounds.radius ? currentSceneBounds.radius : 1;
      var clippingSpec = state.clipping || {
        enabled: false,
        x: clippingCenter.x + clippingRadius,
        y: clippingCenter.y + clippingRadius * 0.5,
        z: clippingCenter.z + clippingRadius
      };
      state.ui.clippingEnabledInput.checked = clippingSpec.enabled === true;
      state.ui.clippingMaterialSelect.disabled = true;
      state.ui.clippingXSlider.min = String(clippingCenter.x - clippingRadius);
      state.ui.clippingXSlider.max = String(clippingCenter.x + clippingRadius);
      state.ui.clippingYSlider.min = String(clippingCenter.y - clippingRadius);
      state.ui.clippingYSlider.max = String(clippingCenter.y + clippingRadius);
      state.ui.clippingZSlider.min = String(clippingCenter.z - clippingRadius);
      state.ui.clippingZSlider.max = String(clippingCenter.z + clippingRadius);
      state.ui.clippingXSlider.value = String(clippingSpec.x === undefined ? 1 : Number(clippingSpec.x));
      state.ui.clippingYSlider.value = String(clippingSpec.y === undefined ? 0 : Number(clippingSpec.y));
      state.ui.clippingZSlider.value = String(clippingSpec.z === undefined ? 0 : Number(clippingSpec.z));

      var effects = state.postprocess || [];
      state.ui.effectSelect.innerHTML = "";
      effects.forEach(function(effect, idx) {
        var option = document.createElement("option");
        option.value = String(idx);
        option.textContent = (effect.type || "effect") + " " + (idx + 1);
        state.ui.effectSelect.appendChild(option);
      });
      if (!effects.length) {
        var option = document.createElement("option");
        option.value = "";
        option.textContent = "No postprocess effects";
        state.ui.effectSelect.appendChild(option);
      }
      state.ui.effectSelect.disabled = !effects.length;
      state.ui.effectRemoveButton.disabled = !effects.length;
      if (effects.length) {
        var effectIndex = Number(state.ui.effectSelect.value);
        if (!isFinite(effectIndex) || !effects[effectIndex]) {
          effectIndex = 0;
          state.ui.effectSelect.value = "0";
        }
        var effect = effects[effectIndex];
        var radius = currentSceneBounds && currentSceneBounds.radius ? currentSceneBounds.radius : 100;
        var focusMax = Math.max(1000, radius * 10, Number(effect.focus_distance || 0) * 2);
        state.ui.focusDistanceSlider.max = String(focusMax);
        state.ui.focusDistanceSlider.value = String(Number(effect.focus_distance || radius));
        state.ui.focusDistanceValue.textContent = formatRNumber(Number(effect.focus_distance || radius));
        state.ui.fStopSlider.value = String(Number(effect.f_stop || 2));
        state.ui.fStopValue.textContent = formatRNumber(Number(effect.f_stop || 2));
        state.ui.focalLengthSlider.value = String(Number(effect.focal_length || 50));
        state.ui.focalLengthValue.textContent = formatRNumber(Number(effect.focal_length || 50));
        state.ui.blurLevelSelect.value = effect.blur_level || "low";
      } else {
        state.ui.focusDistanceSlider.value = "0";
        state.ui.focusDistanceValue.textContent = "";
        state.ui.fStopSlider.value = "2";
        state.ui.fStopValue.textContent = "";
        state.ui.focalLengthSlider.value = "50";
        state.ui.focalLengthValue.textContent = "";
      }

      state.ui.stateText.value = JSON.stringify(payload, null, 2);
    }

    function publishSceneEditorState(state) {
      if (!state || state.mode !== "edit_scene3d") {
        return;
      }

      var payload = buildSceneEditorPayload(state);
      var text = JSON.stringify(payload);

      if (!state.lastRenderedText || state.lastRenderedText !== text) {
        updateSceneEditorPanel(state, payload);
        state.lastRenderedText = text;
      }

      if (state.lastPublishedText === text) {
        return;
      }

      state.lastPublishedText = text;

      if (payload.view) {
        emitHostEvent(
          "par3d",
          JSON.stringify(payload.view),
          state.widgetId
        );
      }
      emitHostEvent(
        "scene_state",
        text,
        state.widgetId
      );
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

      emitHostEvent(
        "par3d",
        JSON.stringify(payload),
        state.widgetId
      );
    }

    function schedulePoseStatePublish() {
      var mode = activeInteractionState ? activeInteractionState.mode : null;
      if (mode !== "pose_3d" && mode !== "edit_scene3d" && !currentSyncConfig) {
        return;
      }

      if (publishViewStateHandle !== null) {
        return;
      }

      publishViewStateHandle = window.requestAnimationFrame(function() {
        publishViewStateHandle = null;
        if (activeInteractionState && activeInteractionState.mode === "pose_3d") {
          publishPoseState(activeInteractionState);
        } else if (activeInteractionState && activeInteractionState.mode === "edit_scene3d") {
          publishSceneEditorState(activeInteractionState);
        }
        publishSyncedViewState();
      });
    }

    function publishLandmarks(state) {
      if (!state) {
        return;
      }

      updateDigitizePanel(state);

      emitHostEvent(
        "landmarks",
        JSON.stringify(state.points),
        state.widgetId
      );
    }

    function publishVertexSelection(state) {
      if (!state) {
        return;
      }

      syncVertexPaintCameraControls(state);
      updateVertexPaintPanel(state);
      emitHostEvent(
        "vertex_selection",
        JSON.stringify({indices: state.selectedIndices.slice()}),
        state.widgetId
      );
    }

    function syncVertexPaintCameraControls(state) {
      if (!state || state.mode !== "paint_vertices" || !camera || !camera.inputs || !camera.inputs.attached) {
        return;
      }
      var pointers = camera.inputs.attached.pointers;
      if (!pointers || typeof pointers.attachControl !== "function" || typeof pointers.detachControl !== "function") {
        return;
      }

      if (state.paintingEnabled) {
        if (!state.pointerControlsDetached) {
          pointers.detachControl(canvas);
          state.pointerControlsDetached = true;
        }
      } else if (state.pointerControlsDetached) {
        pointers.attachControl(canvas);
        state.pointerControlsDetached = false;
      }
    }

    function updateVertexPaintPanel(state) {
      if (!state || state.mode !== "paint_vertices") {
        clearUiPanel();
        return;
      }

      uiLayer.style.display = "block";
      uiLayer.innerHTML =
        "<div data-role='panel-handle' style='font-weight:700; margin:-10px -10px 8px -10px; padding:10px; border-bottom:1px solid rgba(15,23,42,0.08); cursor:move; user-select:none; background:rgba(248,250,252,0.9); border-top-left-radius:8px; border-top-right-radius:8px;'>Vertex Paint</div>" +
        "<div style='padding-left:10px;'>" +
          "<div style='display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;'>" +
            "<div style='display:inline-block; padding:3px 8px; border-radius:999px; background:" + (state.paintingEnabled ? "rgba(15,118,110,0.15)" : "rgba(71,85,105,0.14)") + "; color:" + (state.paintingEnabled ? "#0f766e" : "#475569") + "; font-weight:700;'>" + (state.paintingEnabled ? "Painting Active" : "Camera Active") + "</div>" +
            "<div style='color:#334155;'><strong>Selected:</strong> " + state.selectedIndices.length + "</div>" +
            "<div style='display:flex; align-items:center; gap:6px; color:#334155;'><strong>Radius:</strong> <span data-role='brush-radius-legend-value'>" + formatRNumber(state.brushRadius) + "</span><span data-role='brush-radius-legend' style='display:inline-block; width:" + Math.max(10, Math.min(28, 10 + ((state.brushRadius - state.brushRadiusMin) / Math.max(state.brushRadiusMax - state.brushRadiusMin, 1e-8)) * 18)) + "px; height:" + Math.max(10, Math.min(28, 10 + ((state.brushRadius - state.brushRadiusMin) / Math.max(state.brushRadiusMax - state.brushRadiusMin, 1e-8)) * 18)) + "px; border:2px solid rgba(15,118,110,0.85); border-radius:999px; box-sizing:border-box; background:rgba(15,118,110,0.06);'></span></div>" +
          "</div>" +
          "<div style='margin-bottom:8px;'>" +
            "<label style='display:block; margin-bottom:4px; color:#334155;'>Selection radius <span data-role='brush-radius-value' style='float:right; color:#64748b;'>" + formatRNumber(state.brushRadius) + "</span></label>" +
            "<input type='range' min='" + formatRNumber(state.brushRadiusMin) + "' max='" + formatRNumber(state.brushRadiusMax) + "' step='" + formatRNumber(state.brushRadiusStep) + "' value='" + formatRNumber(state.brushRadius) + "' data-role='brush-radius' style='width:100%;'>" +
          "</div>" +
          "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
            "<button type='button' data-role='paint-toggle' style='flex:1; border:0; border-radius:6px; background:" + (state.paintingEnabled ? "#0f766e" : "#475569") + "; color:white; padding:6px 10px; cursor:pointer;'>" + (state.paintingEnabled ? "Painting On" : "Painting Off") + "</button>" +
            "<button type='button' data-role='undo-last' style='flex:1; border:0; border-radius:6px; background:#334155; color:white; padding:6px 10px; cursor:pointer;'>Undo Last</button>" +
            "<button type='button' data-role='reset-selection' style='flex:1; border:0; border-radius:6px; background:#991b1b; color:white; padding:6px 10px; cursor:pointer;'>Reset</button>" +
          "</div>" +
          "<div style='margin-bottom:6px; color:#475569;'>Press <strong>p</strong> to toggle painting/camera control.</div>" +
          "<div style='display:flex; gap:6px; margin-bottom:8px;'>" +
            "<button type='button' data-role='mirror-x' style='flex:1; border:0; border-radius:6px; background:" + (state.symmetry && state.symmetry.x ? "#1d4ed8" : "#93c5fd") + "; color:white; opacity:" + (state.symmetry && state.symmetry.x ? "1" : "0.78") + "; padding:6px 10px; cursor:pointer;'>Sym X</button>" +
            "<button type='button' data-role='mirror-y' style='flex:1; border:0; border-radius:6px; background:" + (state.symmetry && state.symmetry.y ? "#1d4ed8" : "#93c5fd") + "; color:white; opacity:" + (state.symmetry && state.symmetry.y ? "1" : "0.78") + "; padding:6px 10px; cursor:pointer;'>Sym Y</button>" +
            "<button type='button' data-role='mirror-z' style='flex:1; border:0; border-radius:6px; background:" + (state.symmetry && state.symmetry.z ? "#1d4ed8" : "#93c5fd") + "; color:white; opacity:" + (state.symmetry && state.symmetry.z ? "1" : "0.78") + "; padding:6px 10px; cursor:pointer;'>Sym Z</button>" +
          "</div>" +
        "</div>";

      enableUiPanelDrag(uiLayer.querySelector("[data-role='panel-handle']"));

      uiLayer.querySelector("[data-role='paint-toggle']").addEventListener("click", function() {
        state.paintingEnabled = !state.paintingEnabled;
        publishVertexSelection(state);
      });
      var brushRadiusValue = uiLayer.querySelector("[data-role='brush-radius-value']");
      var brushRadiusLegendValue = uiLayer.querySelector("[data-role='brush-radius-legend-value']");
      var brushRadiusLegend = uiLayer.querySelector("[data-role='brush-radius-legend']");
      uiLayer.querySelector("[data-role='brush-radius']").addEventListener("input", function(evt) {
        state.brushRadius = Math.max(state.brushRadiusMin, Math.min(state.brushRadiusMax, Number(evt.target.value)));
        var legendDiameter = Math.max(
          10,
          Math.min(
            28,
            10 + ((state.brushRadius - state.brushRadiusMin) / Math.max(state.brushRadiusMax - state.brushRadiusMin, 1e-8)) * 18
          )
        );
        if (brushRadiusValue) {
          brushRadiusValue.textContent = formatRNumber(state.brushRadius);
        }
        if (brushRadiusLegendValue) {
          brushRadiusLegendValue.textContent = formatRNumber(state.brushRadius);
        }
        if (brushRadiusLegend) {
          brushRadiusLegend.style.width = legendDiameter + "px";
          brushRadiusLegend.style.height = legendDiameter + "px";
        }
      });
      uiLayer.querySelector("[data-role='brush-radius']").addEventListener("change", function() {
        publishVertexSelection(state);
      });
      uiLayer.querySelector("[data-role='undo-last']").addEventListener("click", function() {
        undoVertexPaintStroke(state);
      });
      uiLayer.querySelector("[data-role='reset-selection']").addEventListener("click", function() {
        resetVertexPaintSelection(state);
      });
      uiLayer.querySelector("[data-role='mirror-x']").addEventListener("click", function() {
        toggleVertexPaintSymmetry(state, "x");
      });
      uiLayer.querySelector("[data-role='mirror-y']").addEventListener("click", function() {
        toggleVertexPaintSymmetry(state, "y");
      });
      uiLayer.querySelector("[data-role='mirror-z']").addEventListener("click", function() {
        toggleVertexPaintSymmetry(state, "z");
      });
    }

    function rebuildVertexPaintMarkers(state) {
      if (!state) {
        return;
      }
      if (!state.overlayMesh) {
        state.overlayMesh = createPointOverlay("painted-vertices-overlay", state.markerColor, state.markerSize * 0.85);
      }
      if (state.overlayMesh.material) {
        state.overlayMesh.material.pointSize = state.markerSize * 0.85;
      }
      var positions = state.localPositions;
      var overlayPositions = [];
      state.selectedIndices.forEach(function(index) {
        var offset = (index - 1) * 3;
        if (offset < 0 || offset + 2 >= positions.length) {
          return;
        }
        var localPoint = BABYLON.Vector3.FromArray(positions, offset);
        var worldPoint = BABYLON.Vector3.TransformCoordinates(localPoint, state.mesh.getWorldMatrix());
        overlayPositions.push(worldPoint.x, worldPoint.y, worldPoint.z);
      });
      state.overlayMesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, overlayPositions, true);
      state.overlayMesh.setIndices([]);
      state.overlayMesh.isVisible = overlayPositions.length > 0;
    }

    function addVertexPaintIndices(state, indices, commitStroke) {
      if (!state || !indices || !indices.length) {
        return;
      }
      var expandedIndices = indices.slice();
      ["x", "y", "z"].forEach(function(axis) {
        if (state.symmetry && state.symmetry[axis]) {
          expandedIndices.slice().forEach(function(index) {
            var mirroredIndex = nearestMirroredVertexIndex(state, index, axis);
            if (mirroredIndex !== null) {
              expandedIndices.push(mirroredIndex);
            }
          });
        }
      });
      var added = [];
      expandedIndices.forEach(function(index) {
        index = Number(index);
        if (!isFinite(index) || index < 1 || state.selectedIndexMap[index]) {
          return;
        }
        state.selectedIndexMap[index] = true;
        state.selectedIndices.push(index);
        added.push(index);
      });
      if (!added.length) {
        return;
      }
      if (commitStroke !== false) {
        state.undoStack.push(added);
      } else {
        state.currentStroke = state.currentStroke || [];
        added.forEach(function(index) {
          if (state.currentStroke.indexOf(index) === -1) {
            state.currentStroke.push(index);
          }
        });
      }
      state.selectedIndices.sort(function(a, b) { return a - b; });
      rebuildVertexPaintMarkers(state);
      publishVertexSelection(state);
    }

    function commitVertexPaintStroke(state) {
      if (!state || !state.currentStroke || !state.currentStroke.length) {
        return;
      }
      state.undoStack.push(state.currentStroke.slice());
      state.currentStroke = [];
      publishVertexSelection(state);
    }

    function undoVertexPaintStroke(state) {
      if (!state || !state.undoStack.length) {
        return;
      }
      var removed = state.undoStack.pop();
      removed.forEach(function(index) {
        delete state.selectedIndexMap[index];
      });
      state.selectedIndices = state.selectedIndices.filter(function(index) {
        return !!state.selectedIndexMap[index];
      });
      rebuildVertexPaintMarkers(state);
      publishVertexSelection(state);
    }

    function resetVertexPaintSelection(state) {
      if (!state) {
        return;
      }
      state.selectedIndexMap = {};
      state.selectedIndices = [];
      state.undoStack = [];
      state.currentStroke = [];
      rebuildVertexPaintMarkers(state);
      publishVertexSelection(state);
    }

    function nearestMirroredVertexIndex(state, index, axis) {
      if (!state || !state.localPositions) {
        return null;
      }
      var axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      var offset = (index - 1) * 3;
      if (offset < 0 || offset + 2 >= state.localPositions.length) {
        return null;
      }
      var target = [
        state.localPositions[offset],
        state.localPositions[offset + 1],
        state.localPositions[offset + 2]
      ];
      target[axisIndex] = -target[axisIndex];
      var bestIndex = null;
      var bestDistance = Infinity;
      for (var i = 0; i < state.localPositions.length; i += 3) {
        var dx = state.localPositions[i] - target[0];
        var dy = state.localPositions[i + 1] - target[1];
        var dz = state.localPositions[i + 2] - target[2];
        var distance = dx * dx + dy * dy + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = (i / 3) + 1;
        }
      }
      return bestIndex;
    }

    function toggleVertexPaintSymmetry(state, axis) {
      if (!state) {
        return;
      }
      state.symmetry = state.symmetry || {x: false, y: false, z: false};
      state.symmetry[axis] = !state.symmetry[axis];
      publishVertexSelection(state);
    }

    function brushedVertexIndices(state, pickedPoint) {
      if (!state || !pickedPoint || !state.localPositions) {
        return [];
      }
      var out = [];
      var radiusSq = state.brushRadius * state.brushRadius;
      state.mesh.computeWorldMatrix(true);
      var worldMatrix = state.mesh.getWorldMatrix();
      for (var i = 0; i < state.localPositions.length; i += 3) {
        var localPoint = BABYLON.Vector3.FromArray(state.localPositions, i);
        var worldPoint = BABYLON.Vector3.TransformCoordinates(localPoint, worldMatrix);
        if (BABYLON.Vector3.DistanceSquared(worldPoint, pickedPoint) <= radiusSq) {
          out.push((i / 3) + 1);
        }
      }
      return out;
    }

    function setSnapshotPreviewVisible(state, visible) {
      if (!state || state.mode !== "edit_scene3d") {
        return;
      }

      if (visible) {
        if (state.snapshotPreviewRestore) {
          if (state.snapshotPreviewRestore.uiDisplay !== undefined) {
            uiLayer.style.display = state.snapshotPreviewRestore.uiDisplay;
          }
          if (state.snapshotPreviewRestore.legendDisplay !== undefined) {
            legendLayer.style.display = state.snapshotPreviewRestore.legendDisplay;
          }
          if (state.snapshotPreviewRestore.scaleBarDisplay !== undefined) {
            scaleBarLayer.style.display = state.snapshotPreviewRestore.scaleBarDisplay;
          }
        }
        if (state.helpers && state.helpers.length) {
          state.helpers.forEach(function(helper) {
            if (helper) {
              helper.setEnabled(true);
            }
          });
        }
        syncEditorGizmoState(state);
        state.snapshotPreviewRestore = null;
        if (state.snapshotPreviewHandle) {
          window.clearTimeout(state.snapshotPreviewHandle);
          state.snapshotPreviewHandle = null;
        }
        return;
      }

      state.snapshotPreviewRestore = {
        uiDisplay: uiLayer.style.display,
        legendDisplay: legendLayer.style.display,
        scaleBarDisplay: scaleBarLayer.style.display
      };

      uiLayer.style.display = "none";
      legendLayer.style.display = "none";
      scaleBarLayer.style.display = "none";

      if (state.helpers && state.helpers.length) {
        state.helpers.forEach(function(helper) {
          if (helper) {
            helper.setEnabled(false);
          }
        });
      }

      if (state.gizmoManager) {
        attachEditorTarget(state, null);
        state.gizmoManager.positionGizmoEnabled = false;
        state.gizmoManager.rotationGizmoEnabled = false;
        state.gizmoManager.scaleGizmoEnabled = false;
      }

      if (state.snapshotPreviewHandle) {
        window.clearTimeout(state.snapshotPreviewHandle);
      }
      state.snapshotPreviewHandle = window.setTimeout(function() {
        setSnapshotPreviewVisible(state, true);
      }, 1800);
    }

    function initializeInteraction(interaction, primaryMesh) {
      if (activeInteractionState && activeInteractionState.dispose) {
        activeInteractionState.dispose();
      }
      activeInteractionState = null;

      if (digitizeObserver) {
        scene.onPointerObservable.remove(digitizeObserver);
        digitizeObserver = null;
      }

      if (publishViewStateHandle !== null) {
        window.cancelAnimationFrame(publishViewStateHandle);
        publishViewStateHandle = null;
      }

      if (window.__babylonianPaintKeyHandler) {
        window.removeEventListener("keydown", window.__babylonianPaintKeyHandler);
        window.__babylonianPaintKeyHandler = null;
      }

      if (interaction && interaction.mode === "edit_scene3d") {
        var editableTargets = arguments.length > 2 ? arguments[2] : [];
        if (!BABYLON.GizmoManager) {
          activeInteractionState = {
            mode: interaction.mode,
            widgetId: el.id || null,
            targets: editableTargets || [],
            postprocess: cloneScenePostprocesses(currentSceneOptions && currentSceneOptions.postprocess ? currentSceneOptions.postprocess : []),
            scaleBar: cloneSceneScaleBar(currentSceneOptions && currentSceneOptions.scale_bar ? currentSceneOptions.scale_bar : null),
            clipping: cloneSceneClipping(currentSceneOptions && currentSceneOptions.clipping ? currentSceneOptions.clipping : null),
            removedObjects: [],
            gizmoManager: null,
            selectedId: editableTargets && editableTargets.length ? editableTargets[0].id : null,
            gizmoMode: "translate",
            gizmosVisible: true,
            sectionOpen: {
              meshes: false,
              materials: false,
              lights: true,
              effects: false,
              clipping: false,
              snapshot: false,
              log: false
            }
          };
          publishSceneEditorState(activeInteractionState);
          return activeInteractionState;
        }
        var gizmoManager = new BABYLON.GizmoManager(scene);
        gizmoManager.usePointerToAttachGizmos = false;
        gizmoManager.clearGizmoOnEmptyPointerEvent = false;
        var editorState = {
          mode: interaction.mode,
          widgetId: el.id || null,
          targets: editableTargets || [],
          postprocess: cloneScenePostprocesses(currentSceneOptions && currentSceneOptions.postprocess ? currentSceneOptions.postprocess : []),
          scaleBar: cloneSceneScaleBar(currentSceneOptions && currentSceneOptions.scale_bar ? currentSceneOptions.scale_bar : null),
          clipping: cloneSceneClipping(currentSceneOptions && currentSceneOptions.clipping ? currentSceneOptions.clipping : null),
          removedObjects: [],
          sectionOpen: {
            meshes: false,
            materials: false,
            lights: true,
            effects: false,
            clipping: false,
            snapshot: false,
            log: false
          },
          helpers: [],
          gizmoManager: gizmoManager,
          selectedId: editableTargets && editableTargets.length ? editableTargets[0].id : null,
          gizmoMode: "translate",
          gizmosVisible: true,
          deferGizmoAttach: true,
          dispose: function() {
            clearUiPanel();
            attachEditorTarget(editorState, null);
            if (editorState.pointerObserver) {
              scene.onPointerObservable.remove(editorState.pointerObserver);
              editorState.pointerObserver = null;
            }
            if (editorState.helpers) {
              editorState.helpers.forEach(function(helper) {
                if (helper && helper.dispose) {
                  helper.dispose();
                }
              });
              editorState.helpers = [];
            }
            gizmoManager.dispose();
          }
        };
        activeInteractionState = editorState;
        bindEditorGizmoPublishers(editorState);

        editorState.targets.forEach(function(target) {
          if (target.kind === "light") {
            target.helper = createLightHelper(target.node, target.primitive, target.name || target.id);
            if (target.helper) {
              target.helper.isPickable = true;
              editorState.helpers.push(target.helper);
            }
            configureLightShadows(target);
          }
        });
        bindEditorTargetTransformObservers(editorState);
        editorState.pointerObserver = scene.onPointerObservable.add(function(pointerInfo) {
          if (!pointerInfo || pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK) {
            return;
          }
          var pickInfo = pointerInfo.pickInfo;
          if (!pickInfo || !pickInfo.hit || !pickInfo.pickedMesh) {
            return;
          }
          if (pickInfo.pickedMesh.name && /gizmo/i.test(pickInfo.pickedMesh.name)) {
            return;
          }

          var selectedTarget = resolveEditorPickTarget(editorState, pickInfo);
          if (!selectedTarget) {
            return;
          }

          editorState.selectedId = selectedTarget.id;
          editorState.deferGizmoAttach = false;
          var section = targetSelectionSection(selectedTarget);
          if (section) {
            editorState.sectionOpen[section] = true;
          }
          if (selectedTarget.kind === "mesh") {
            editorState.sectionOpen.materials = true;
          }
          syncEditorGizmoState(editorState);
          updateSceneEditorPanel(editorState, buildSceneEditorPayload(editorState));
        });
        updateLightHelpers(editorState);

        syncEditorGizmoState(editorState);
        publishSceneEditorState(editorState);
        return editorState;
      }

      if (interaction && interaction.mode === "pose_3d") {
        activeInteractionState = {
          mode: interaction.mode,
          widgetId: el.id || null
        };
        schedulePoseStatePublish();
        return activeInteractionState;
      }

      if (interaction && interaction.mode === "paint_vertices" && primaryMesh) {
        var paintState = {
          mode: interaction.mode,
          widgetId: el.id || null,
          mesh: primaryMesh,
          markerColor: interaction.marker && interaction.marker.color ? interaction.marker.color : "#dc2626",
          markerScale: interaction.marker && interaction.marker.scale ? interaction.marker.scale : 0.012,
          markerSize: meshRadius(primaryMesh) * (interaction.marker && interaction.marker.scale ? interaction.marker.scale : 0.012),
          brushRadius: Math.max(meshRadius(primaryMesh) * 0.03, 0.001),
          brushRadiusMin: Math.max(meshRadius(primaryMesh) * 0.005, 0.0002),
          brushRadiusMax: Math.max(meshRadius(primaryMesh) * 0.15, 0.004),
          brushRadiusStep: Math.max(meshRadius(primaryMesh) * 0.0025, 0.0001),
          localPositions: primaryMesh.getVerticesData ? (primaryMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) || []) : [],
          selectedIndices: [],
          selectedIndexMap: {},
          undoStack: [],
          currentStroke: [],
          markers: [],
          overlayMesh: null,
          symmetry: {x: false, y: false, z: false},
          paintingEnabled: true,
          pointerDown: false,
          pointerControlsDetached: false,
          dispose: function() {
            clearUiPanel();
            if (paintState.pointerControlsDetached && camera && camera.inputs && camera.inputs.attached && camera.inputs.attached.pointers && typeof camera.inputs.attached.pointers.attachControl === "function") {
              camera.inputs.attached.pointers.attachControl(canvas);
              paintState.pointerControlsDetached = false;
            }
            if (paintState.overlayMesh && paintState.overlayMesh.dispose) {
              paintState.overlayMesh.dispose();
              paintState.overlayMesh = null;
            }
            while (paintState.markers.length) {
              var marker = paintState.markers.pop();
              if (marker && marker.dispose) {
                marker.dispose();
              }
            }
            if (paintState.pointerObserver) {
              scene.onPointerObservable.remove(paintState.pointerObserver);
              paintState.pointerObserver = null;
            }
            if (window.__babylonianPaintKeyHandler) {
              window.removeEventListener("keydown", window.__babylonianPaintKeyHandler);
              window.__babylonianPaintKeyHandler = null;
            }
          }
        };
        activeInteractionState = paintState;
        paintState.pointerObserver = scene.onPointerObservable.add(function(pointerInfo) {
          if (!pointerInfo) {
            return;
          }
          if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
            paintState.pointerDown = true;
            paintState.currentStroke = [];
          } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
            paintState.pointerDown = false;
            commitVertexPaintStroke(paintState);
            return;
          }

          if (!paintState.paintingEnabled) {
            return;
          }
          if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN &&
              pointerInfo.type !== BABYLON.PointerEventTypes.POINTERMOVE) {
            return;
          }
          if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE && !paintState.pointerDown) {
            return;
          }

          var pickInfo = scene.pick(scene.pointerX, scene.pointerY, function(mesh) {
            return mesh === primaryMesh;
          });
          if (!pickInfo || !pickInfo.hit || pickInfo.pickedMesh !== primaryMesh || !pickInfo.pickedPoint) {
            return;
          }
          addVertexPaintIndices(
            paintState,
            brushedVertexIndices(paintState, pickInfo.pickedPoint.clone()),
            false
          );
        });
        window.__babylonianPaintKeyHandler = function(evt) {
          if (!activeInteractionState || activeInteractionState !== paintState) {
            return;
          }
          if ((evt.key || "").toLowerCase() !== "p") {
            return;
          }
          evt.preventDefault();
          paintState.paintingEnabled = !paintState.paintingEnabled;
          publishVertexSelection(paintState);
        };
        window.addEventListener("keydown", window.__babylonianPaintKeyHandler);
        publishVertexSelection(paintState);
        return paintState;
      }

      if (!interaction || interaction.mode !== "digitize_landmarks" || !primaryMesh) {
        clearUiPanel();
        return null;
      }

      var state = {
        mode: interaction.mode,
        widgetId: el.id || null,
        target: interaction.n || null,
        indexEnabled: interaction.index === true,
        markerColor: interaction.marker && interaction.marker.color ? interaction.marker.color : "#dc2626",
        markerScale: interaction.marker && interaction.marker.scale ? interaction.marker.scale : 0.015,
        points: [],
        pointIndices: [],
        pendingPoint: null,
        pendingMarker: null,
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

        var point = nearestVertexPick(primaryMesh, pickInfo.pickedPoint.clone());
        if (!point) {
          return;
        }

        clearPendingLandmark(state);
        state.pendingPoint = point;
        state.pendingMarker = createMarker(
          new BABYLON.Vector3(point.x, point.y, point.z),
          "#f59e0b",
          state.markerSize,
          "pending-landmark-" + (state.points.length + 1),
          false
        );
        updateDigitizePanel(state);
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

      if (pendingSyncedView) {
        if (!currentSceneOptions) {
          currentSceneOptions = {};
        }
        currentSceneOptions.view = mergeViewOptions(pendingSyncedView);
        applyingSyncedView = true;
        applyViewOptions(currentSceneBounds, currentSceneOptions);
        pendingSyncedView = null;
        window.setTimeout(function() {
          applyingSyncedView = false;
        }, 0);
      }

      if (pendingSyncedCameraState) {
        applySyncedCameraState(pendingSyncedCameraState);
        pendingSyncedCameraState = null;
      }
    }

    function clearSceneDecorations() {
      sceneDecorations.forEach(function(mesh) {
        if (mesh && mesh.dispose) {
          mesh.dispose();
        }
      });
      sceneDecorations = [];
      axisLabelState = [];
      sceneTitleState = [];
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
      var lines = [];
      var colors = [];
      var fallback = BABYLON.Color4.FromColor3(BABYLON.Color3.FromHexString("#111111"), primitive.alpha === undefined ? 1 : primitive.alpha);

      for (var i = 0; i < primitive.points.length; i += 2) {
        var segmentColor = coerceColor4(
          pointColorAt(primitive.color, i / 2, "#111111"),
          primitive.alpha,
          fallback
        );

        lines.push([
          new BABYLON.Vector3(primitive.points[i][0], primitive.points[i][1], primitive.points[i][2]),
          new BABYLON.Vector3(primitive.points[i + 1][0], primitive.points[i + 1][1], primitive.points[i + 1][2])
        ]);
        colors.push([segmentColor, segmentColor]);
      }

      var lineSystem = registerNode(BABYLON.MeshBuilder.CreateLineSystem(
        name,
        {
          lines: lines,
          colors: colors,
          updatable: false
        },
        scene
      ));
      lineSystem.isPickable = false;
      return lineSystem;
    }

    function createPolyline(primitive, name) {
      var points = primitive.points.map(function(coords) {
        return new BABYLON.Vector3(coords[0], coords[1], coords[2]);
      });
      var line = registerNode(BABYLON.MeshBuilder.CreateLines(
        name,
        {points: points, updatable: false},
        scene
      ));
      line.color = coerceColor3(primitive.color, BABYLON.Color3.FromHexString("#111111"));
      line.alpha = primitive.alpha === undefined ? 1 : Number(primitive.alpha);
      line.isPickable = false;
      return line;
    }

    function registerEditableTarget(targets, primitive, index, node, kind, label, extras) {
      if (!targets || !node) {
        return;
      }

      var target = {
        id: editorTargetId(index),
        index: index,
        primitiveType: primitive.type,
        primitive: primitive,
        name: primitive.name || null,
        node: node,
        kind: kind,
        label: label || ((primitive.name || (primitive.type + " " + (index + 1))) + " [" + kind + "]")
      };

      if (primitive) {
        target.originalPrimitive = JSON.parse(JSON.stringify(primitive));
      }

      if (extras) {
        Object.keys(extras).forEach(function(key) {
          target[key] = extras[key];
        });
      }

      targets.push(target);
      applyBoundingBoxToEditorTarget(target);
    }

    function editorTargetTransformSignature(target) {
      if (!target || !target.node) {
        return null;
      }

      return JSON.stringify({
        position: vectorToArray(target.node.position || new BABYLON.Vector3(0, 0, 0)),
        rotation: nodeRotationArray(target.node),
        scaling: vectorToArray(target.node.scaling || new BABYLON.Vector3(1, 1, 1))
      });
    }

    function bindEditorTargetTransformObserver(state, target) {
      if (!state || !target || !target.node || target.kind !== "mesh" || target.transformObserverBound) {
        return;
      }

      target.lastTransformSignature = editorTargetTransformSignature(target);

      var callback = function() {
        var nextSignature = editorTargetTransformSignature(target);
        if (!nextSignature || nextSignature === target.lastTransformSignature) {
          return;
        }
        target.lastTransformSignature = nextSignature;
        updateSceneEditorPanel(state, buildSceneEditorPayload(state));
        publishSceneEditorState(state);
      };

      if (target.node.onAfterWorldMatrixUpdateObservable && typeof target.node.onAfterWorldMatrixUpdateObservable.add === "function") {
        target.transformObserverType = "world";
        target.transformObserver = target.node.onAfterWorldMatrixUpdateObservable.add(callback);
      } else if (target.node.onAfterRenderObservable && typeof target.node.onAfterRenderObservable.add === "function") {
        target.transformObserverType = "render";
        target.transformObserver = target.node.onAfterRenderObservable.add(callback);
      }

      target.transformObserverBound = true;
    }

    function bindEditorTargetTransformObservers(state) {
      if (!state || !state.targets) {
        return;
      }

      state.targets.forEach(function(target) {
        bindEditorTargetTransformObserver(state, target);
      });
    }

    function publishEditorTransformChange(state) {
      if (!state || state.mode !== "edit_scene3d") {
        return;
      }

      updateLightHelpers(state);
      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function bindEditorGizmoAxisDrag(axisGizmo, state) {
      if (!axisGizmo || !state) {
        return;
      }

      if (axisGizmo.dragBehavior && axisGizmo.dragBehavior.onDragObservable && typeof axisGizmo.dragBehavior.onDragObservable.add === "function") {
        axisGizmo.dragBehavior.onDragObservable.add(function() {
          publishEditorTransformChange(state);
        });
      }

      if (axisGizmo.dragBehavior && axisGizmo.dragBehavior.onDragEndObservable && typeof axisGizmo.dragBehavior.onDragEndObservable.add === "function") {
        axisGizmo.dragBehavior.onDragEndObservable.add(function() {
          publishEditorTransformChange(state);
        });
      }
    }

    function bindEditorGizmoPublishers(state) {
      if (!state || !state.gizmoManager || state.gizmoPublishersBound) {
        return;
      }

      var gizmos = state.gizmoManager.gizmos || {};

      ["positionGizmo", "rotationGizmo", "scaleGizmo"].forEach(function(name) {
        var gizmo = gizmos[name];
        if (!gizmo) {
          return;
        }

        bindEditorGizmoAxisDrag(gizmo.xGizmo, state);
        bindEditorGizmoAxisDrag(gizmo.yGizmo, state);
        bindEditorGizmoAxisDrag(gizmo.zGizmo, state);

        if (gizmo.uniformScaleGizmo) {
          bindEditorGizmoAxisDrag(gizmo.uniformScaleGizmo, state);
        }

        if (gizmo.onDragObservable && typeof gizmo.onDragObservable.add === "function") {
          gizmo.onDragObservable.add(function() {
            publishEditorTransformChange(state);
          });
        }
      });

      state.gizmoPublishersBound = true;
    }

    function nextEditorTargetIndex(state) {
      if (!state || !state.targets || !state.targets.length) {
        return 0;
      }

      return state.targets.reduce(function(maxIndex, target) {
        return Math.max(maxIndex, Number(target.index) || 0);
      }, -1) + 1;
    }

    function uniqueEditorPrimitiveName(state, prefix) {
      var stem = prefix || "object";
      var taken = {};

      if (state && state.targets) {
        state.targets.forEach(function(target) {
          if (target && target.primitive && target.primitive.name) {
            taken[target.primitive.name] = true;
          }
        });
      }

      var index = 1;
      var candidate = stem;
      while (taken[candidate]) {
        candidate = stem + "_" + index;
        index += 1;
      }
      return candidate;
    }

    function defaultEditorLightPosition() {
      var radius = currentSceneBounds && currentSceneBounds.radius ? currentSceneBounds.radius : 1;
      var center = currentSceneBounds && currentSceneBounds.center ? currentSceneBounds.center : new BABYLON.Vector3(0, 0, 0);
      return center.add(new BABYLON.Vector3(radius * 0.8, radius * 0.8, radius * 0.8));
    }

    function defaultEditorLightDirection(lightType) {
      if (lightType === "hemispheric") {
        return [0, 1, 0];
      }
      return [0, -1, 0];
    }

    function cloneMaterialSpec(spec) {
      if (!spec) {
        return null;
      }

      try {
        return JSON.parse(JSON.stringify(spec));
      } catch (err) {
        return null;
      }
    }

    function sceneMaterialNames() {
      return Object.keys(sceneMaterialLibrary()).sort();
    }

    function sceneMaterialByName(name) {
      if (!name) {
        return null;
      }

      var library = sceneMaterialLibrary();
      if (!Object.prototype.hasOwnProperty.call(library, name)) {
        return null;
      }

      return cloneMaterialSpec(resolveMaterialSpec(library[name])) || cloneMaterialSpec(library[name]);
    }

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
          unlit: false
        };
      }

      return {
        type: "standard",
        diffuse: "#d9d9d9",
        specular: "#000000",
        alpha: 1,
        wireframe: false,
        backface_culling: false
      };
    }

    function editableMaterialSpec(target) {
      if (!target || target.kind !== "mesh") {
        return null;
      }

      var rawSpec = target.primitive && target.primitive.material ? target.primitive.material : legacyMaterialSpec(target.primitive);
      var existing = cloneMaterialSpec(resolveMaterialSpec(rawSpec)) || cloneMaterialSpec(rawSpec);
      if (!existing) {
        existing = defaultMaterialSpec("standard");
      }

      if (!existing.type) {
        existing.type = "standard";
      }

      if (existing.type === "pbr") {
        if (existing.base_color === undefined && existing.albedo !== undefined) {
          existing.base_color = existing.albedo;
        }
        if (existing.base_color === undefined) {
          existing.base_color = "#ffffff";
        }
        if (existing.metallic === undefined) {
          existing.metallic = 0;
        }
        if (existing.roughness === undefined) {
          existing.roughness = 1;
        }
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
        existing.backface_culling = false;
      }

      return existing;
    }

    function assignLibraryMaterialToSelectedMesh(state, materialName) {
      var target = selectedMeshTarget(state);
      var materialSpec = sceneMaterialByName(materialName);
      if (!target || !materialSpec) {
        return;
      }

      target.primitive.material = materialSpec;
      applyMaterialToEditorTarget(target);
      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function saveSelectedMaterialToLibrary(state, materialName) {
      var target = selectedMeshTarget(state);
      if (!target || !materialName) {
        return;
      }

      var materialSpec = editableMaterialSpec(target);
      if (!materialSpec) {
        return;
      }

      if (!currentSceneOptions) {
        currentSceneOptions = {};
      }
      if (!currentSceneOptions.materials || typeof currentSceneOptions.materials !== "object") {
        currentSceneOptions.materials = {};
      }
      currentSceneOptions.materials[materialName] = cloneMaterialSpec(materialSpec);

      if (state.widgetId) {
        emitHostEvent(
          "material_library_save",
          {
            name: materialName,
            material: cloneMaterialSpec(materialSpec)
          },
          state.widgetId
        );
      }

      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function applyMaterialToEditorTarget(target) {
      if (!target || target.kind !== "mesh") {
        return;
      }

      if (!target.primitive) {
        return;
      }

      if (target.importedMeshes && target.importedMeshes.length) {
        target.importedMeshes.forEach(function(mesh) {
          applyMaterial(mesh, {material: target.primitive.material});
        });
        applyBoundingBoxToEditorTarget(target);
        return;
      }

      if (target.node && target.node.material !== undefined) {
        applyMaterial(target.node, target.primitive);
      }
      applyBoundingBoxToEditorTarget(target);
    }

    function resetSelectedMeshTarget(state) {
      var target = selectedMeshTarget(state);
      if (!target || !target.originalPrimitive) {
        return;
      }

      target.primitive = JSON.parse(JSON.stringify(target.originalPrimitive));

      if (target.importedMeshes && target.importedMeshes.length) {
        if (target.node) {
          applyTransform(target.node, target.primitive);
        }
        applyMaterialToEditorTarget(target);
      } else if (target.node) {
        applyTransform(target.node, target.primitive);
        applyMaterialToEditorTarget(target);
      }
      applyBoundingBoxToEditorTarget(target);

      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function disposeEditorTarget(target) {
      if (!target) {
        return;
      }

      if (target.transformObserver && target.node) {
        if (target.transformObserverType === "world" && target.node.onAfterWorldMatrixUpdateObservable) {
          target.node.onAfterWorldMatrixUpdateObservable.remove(target.transformObserver);
        } else if (target.transformObserverType === "render" && target.node.onAfterRenderObservable) {
          target.node.onAfterRenderObservable.remove(target.transformObserver);
        }
      }

      if (target.helper && target.helper.dispose) {
        target.helper.dispose();
      }
      if (target.light && target.light.dispose) {
        target.light.dispose();
      }
      if (target.node && target.node.dispose) {
        target.node.dispose();
      }
    }

    function selectEditorTarget(state, targetId) {
      if (!state) {
        return;
      }

      state.selectedId = targetId || null;
      ensureEditorMode(state);
      syncEditorGizmoState(state);
      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
    }

    function createLight(primitive, name) {
      var lightType = primitive.light_type || primitive.kind || primitive.subtype || "hemispheric";
      var lightName = primitive.name || name;
      var position = coerceVector3(primitive.position, new BABYLON.Vector3(0, 1, 0));
      var direction = coerceVector3(
        primitive.direction,
        lightType === "hemispheric" ? new BABYLON.Vector3(0, 1, 0) : new BABYLON.Vector3(0, -1, 0)
      );
      var light = null;
      var editorNode = registerNode(new BABYLON.TransformNode(lightName + "-editor", scene));
      editorNode.position = position.clone();
      alignNodeForwardToDirection(editorNode, direction);

      if (lightType === "point") {
        light = new BABYLON.PointLight(lightName, position, scene);
      } else if (lightType === "directional") {
        light = new BABYLON.DirectionalLight(lightName, direction, scene);
        light.position = position.clone();
      } else if (lightType === "spot") {
        light = new BABYLON.SpotLight(
          lightName,
          position,
          direction,
          primitive.angle === undefined ? Math.PI / 3 : Number(primitive.angle),
          primitive.exponent === undefined ? 1 : Number(primitive.exponent),
          scene
        );
      } else {
        light = new BABYLON.HemisphericLight(lightName, direction, scene);
      }

      registerLight(light);

      if (primitive.intensity !== undefined) {
        light.intensity = Number(primitive.intensity);
      }
      if (primitive.diffuse !== undefined) {
        light.diffuse = coerceColor3(primitive.diffuse, light.diffuse);
      }
      if (primitive.specular !== undefined) {
        light.specular = coerceColor3(primitive.specular, light.specular);
      }
      if (primitive.range !== undefined && isFinite(Number(primitive.range))) {
        light.range = Number(primitive.range);
      }
      if (primitive.ground_color !== undefined && lightType === "hemispheric") {
        light.groundColor = coerceColor3(primitive.ground_color, light.groundColor);
      }
      if (primitive.position && light.position) {
        light.position = position;
      }
      if (primitive.direction && light.direction) {
        light.direction = direction;
      }
      if (primitive.angle !== undefined && lightType === "spot") {
        light.angle = Number(primitive.angle);
      }
      if (primitive.exponent !== undefined && lightType === "spot") {
        light.exponent = Number(primitive.exponent);
      }

      light.setEnabled(primitive.enabled !== false);
      var result = {
        light: light,
        editorNode: editorNode
      };
      if (shadowCapableLightType(lightType)) {
        result.shadowGenerator = null;
      }
      return result;
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

      var plane = registerNode(BABYLON.MeshBuilder.CreatePlane(name, {size: planeSize}, scene));
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

    function addProjectedTextLabel(text, point, color, fontSizePx) {
      var label = document.createElement("div");
      label.textContent = text;
      label.style.position = "absolute";
      label.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
      label.style.fontSize = (fontSizePx || 12) + "px";
      label.style.color = color;
      label.style.whiteSpace = "nowrap";
      label.style.textShadow = "0 1px 0 rgba(255,255,255,0.8)";
      label.style.transform = "translate(-50%, -50%)";
      labelLayer.appendChild(label);
      axisLabelState.push({
        element: label,
        point: point.clone()
      });
    }

    function renderTextPrimitives(objects) {
      (objects || []).forEach(function(primitive) {
        if (!primitive || primitive.type !== "text3d" || !primitive.points || !primitive.texts) {
          return;
        }

        var color = primitive.color || "#111111";
        var fontSize = Math.max(10, Math.round(12 * Number(primitive.cex || 1)));
        primitive.points.forEach(function(coords, pointIndex) {
          var text = primitive.texts[pointIndex];
          if (text === undefined || text === null) {
            return;
          }
          addProjectedTextLabel(
            String(text),
            new BABYLON.Vector3(coords[0], coords[1], coords[2]),
            color,
            fontSize
          );
        });
      });
    }

    function renderSceneTitle(sceneOptions) {
      sceneTitleState = [];

      if (!sceneOptions || !sceneOptions.title) {
        return;
      }

      var titleSpec = sceneOptions.title;
      var color = titleSpec.color || "#0f172a";
      var cex = Number(titleSpec.cex || 1);

      if (titleSpec.main) {
        var main = document.createElement("div");
        main.textContent = String(titleSpec.main);
        main.style.position = "absolute";
        main.style.top = "12px";
        main.style.left = "50%";
        main.style.transform = "translateX(-50%)";
        main.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
        main.style.fontWeight = "700";
        main.style.fontSize = Math.max(14, Math.round(18 * cex)) + "px";
        main.style.color = color;
        main.style.textShadow = "0 1px 0 rgba(255,255,255,0.8)";
        main.style.pointerEvents = "none";
        labelLayer.appendChild(main);
        sceneTitleState.push(main);
      }

      if (titleSpec.sub) {
        var sub = document.createElement("div");
        sub.textContent = String(titleSpec.sub);
        sub.style.position = "absolute";
        sub.style.top = titleSpec.main ? "34px" : "12px";
        sub.style.left = "50%";
        sub.style.transform = "translateX(-50%)";
        sub.style.fontFamily = "Menlo, Monaco, Consolas, monospace";
        sub.style.fontSize = Math.max(11, Math.round(12 * cex)) + "px";
        sub.style.color = color;
        sub.style.textShadow = "0 1px 0 rgba(255,255,255,0.8)";
        sub.style.pointerEvents = "none";
        labelLayer.appendChild(sub);
        sceneTitleState.push(sub);
      }
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

    function renderScaleBar(bounds, sceneOptions) {
      clearScaleBar();

      if (!bounds || !sceneOptions || !sceneOptions.scale_bar || sceneOptions.scale_bar.enabled !== true) {
        return;
      }

      var length = Number(sceneOptions.scale_bar.length);
      if (!isFinite(length) || length <= 0) {
        return;
      }

      var center = bounds.center.clone();
      var cameraTarget = camera.getTarget ? camera.getTarget() : center.clone();
      var forward = normalizeVector(cameraTarget.subtract(camera.position));
      var right = cross(forward, camera.upVector || new BABYLON.Vector3(0, 1, 0));
      if (right.lengthSquared && right.lengthSquared() <= 1e-12) {
        right = new BABYLON.Vector3(1, 0, 0);
      }
      right = normalizeVector(right);
      var halfOffset = right.scale(length / 2);
      var leftPoint = center.subtract(halfOffset);
      var rightPoint = center.add(halfOffset);

      var viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      var projectedLeft = BABYLON.Vector3.Project(leftPoint, BABYLON.Matrix.Identity(), scene.getTransformMatrix(), viewport);
      var projectedRight = BABYLON.Vector3.Project(rightPoint, BABYLON.Matrix.Identity(), scene.getTransformMatrix(), viewport);
      var pixelLength = Math.sqrt(
        Math.pow(projectedRight.x - projectedLeft.x, 2) +
        Math.pow(projectedRight.y - projectedLeft.y, 2)
      );

      if (!isFinite(pixelLength) || pixelLength <= 1) {
        return;
      }

      var units = sceneOptions.scale_bar.units || null;
      var unitLabel = units === "other" ? (sceneOptions.scale_bar.custom_units || "") : (units || "");
      var label = sceneOptions.scale_bar.label || (formatRNumber(length) + (unitLabel ? " " + unitLabel : ""));
      var width = Math.max(1, Math.round(pixelLength));
      var position = sceneOptions.scale_bar.position || "bottomright";

      if (Array.isArray(position) && position.length === 2) {
        scaleBarLayer.style.left = Number(position[0]) + "px";
        scaleBarLayer.style.top = Number(position[1]) + "px";
      } else if (position === "topleft") {
        scaleBarLayer.style.left = "12px";
        scaleBarLayer.style.top = "12px";
      } else if (position === "topright") {
        scaleBarLayer.style.right = "12px";
        scaleBarLayer.style.top = "12px";
      } else if (position === "bottomleft") {
        scaleBarLayer.style.left = "12px";
        scaleBarLayer.style.bottom = "12px";
      } else {
        scaleBarLayer.style.right = "12px";
        scaleBarLayer.style.bottom = "12px";
      }

      scaleBarLayer.style.display = "block";
      scaleBarLayer.innerHTML =
        "<div style='padding:8px 10px; background:rgba(255,255,255,0.92); border:1px solid rgba(15,23,42,0.12); border-radius:8px; box-shadow:0 10px 30px rgba(15,23,42,0.12); color:#0f172a; font-family:Menlo, Monaco, Consolas, monospace; font-size:12px; line-height:1.2;'>" +
          "<svg width='" + (width + 2) + "' height='18' viewBox='0 0 " + (width + 2) + " 18' aria-hidden='true'>" +
            "<line x1='1' y1='13' x2='" + (width + 1) + "' y2='13' stroke='#0f172a' stroke-width='2' />" +
            "<line x1='1' y1='7' x2='1' y2='16' stroke='#0f172a' stroke-width='2' />" +
            "<line x1='" + (width + 1) + "' y1='7' x2='" + (width + 1) + "' y2='16' stroke='#0f172a' stroke-width='2' />" +
          "</svg>" +
          "<div style='margin-top:4px; text-align:center;'>" + label + "</div>" +
        "</div>";
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

      addAxisLabel((sceneOptions.title && sceneOptions.title.xlab) || "x", new BABYLON.Vector3(max.x, min.y, min.z), "#b91c1c");
      addAxisLabel((sceneOptions.title && sceneOptions.title.ylab) || "y", new BABYLON.Vector3(min.x, max.y, min.z), "#047857");
      addAxisLabel((sceneOptions.title && sceneOptions.title.zlab) || "z", new BABYLON.Vector3(min.x, min.y, max.z), "#1d4ed8");

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
    var _renderFrameCount = 0;
    engine.runRenderLoop(function () {
      scene.render();
      _renderFrameCount++;
      if (axisLabelState.length) {
        updateAxisLabels();
      }
      renderScaleBar(currentSceneBounds, currentSceneOptions);
      applySceneClipping(currentSceneOptions);
      if (activeInteractionState && activeInteractionState.mode === "edit_scene3d") {
        updateLightHelpers(activeInteractionState);
      }
      // Explicitly render the GizmoManager's utility layer.  In some
      // contexts (e.g. anywidget) the automatic UtilityLayerRenderer
      // observer doesn't fire, so gizmos attach but aren't visible.
      // Skip the first frame so the main scene has fully rendered first.
      if (_renderFrameCount > 1 && activeInteractionState && activeInteractionState.gizmoManager) {
        var ul = activeInteractionState.gizmoManager.utilityLayer
              || activeInteractionState.gizmoManager._defaultUtilityLayer;
        if (ul && ul.utilityLayerScene) {
          ul.render();
        }
      }
    });

    // Resize the engine on window resize
    window.addEventListener("resize", function () {
      engine.resize();
      updateAxisLabels();
      renderScaleBar(currentSceneBounds, currentSceneOptions);
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
        applySceneBackground(currentSceneOptions);
        var heatmapLegendPrimitive = null;
        var hasCustomLights = false;
        var editableTargets = [];

        var pendingImports = 0;
        var sceneUpdated = false;
        var primaryMesh = null;

        clearManagedScene();
        registerSyncGroup(currentSceneOptions && currentSceneOptions.sync ? currentSceneOptions.sync : null);
        applyScenePostProcesses(currentSceneOptions);

        function scheduleFrame() {
          sceneUpdated = true;
          if (pendingImports === 0) {
            frameScene();
            applyViewOptions(currentSceneBounds, currentSceneOptions);
            renderAxes(currentSceneBounds, currentSceneOptions);
            renderTextPrimitives(objects);
            renderSceneTitle(currentSceneOptions);
            if (activeInteractionState && activeInteractionState.mode === "edit_scene3d") {
              syncEditorGizmoState(activeInteractionState);
              updateSceneEditorPanel(activeInteractionState, buildSceneEditorPayload(activeInteractionState));
              scheduleEditorGizmoRefresh(activeInteractionState);
            }
            schedulePoseStatePublish();
          }
        }

        objects.forEach(function(primitive) {
          if (primitive.type === "light3d") {
            hasCustomLights = true;
          }
          if (!heatmapLegendPrimitive && heatmapLegendSpec(primitive)) {
            heatmapLegendPrimitive = primitive;
          }
        });
        setDefaultLightsEnabled(!hasCustomLights);
        updateHeatmapLegend(heatmapLegendPrimitive);

        objects.forEach(function(primitive, i) {
          var name = primitive.type + i;
          if (primitive.type === "light3d") {
            var sceneLight = createLight(primitive, name);
            registerEditableTarget(
              editableTargets,
              primitive,
              i,
              sceneLight.editorNode,
              "light",
              null,
              {light: sceneLight.light}
            );
            if (editableTargets.length) {
              configureLightShadows(editableTargets[editableTargets.length - 1]);
            }
          } else if (primitive.type === "sphere") {
            var sphere = registerNode(BABYLON.MeshBuilder.CreateSphere(name, {diameter: primitive.diameter}, scene));
            applyTransform(sphere, primitive);
            applyMaterial(sphere, primitive);
            registerEditableTarget(editableTargets, primitive, i, sphere, "mesh");
            scheduleFrame();
          } else if (primitive.type === "box") {
            var box = registerNode(BABYLON.MeshBuilder.CreateBox(name, {size: primitive.size}, scene));
            applyTransform(box, primitive);
            applyMaterial(box, primitive);
            registerEditableTarget(editableTargets, primitive, i, box, "mesh");
            scheduleFrame();
          } else if (primitive.type === "plane") {
            var plane = registerNode(BABYLON.MeshBuilder.CreatePlane(name, {width: primitive.width, height: primitive.height}, scene));
            applyTransform(plane, primitive);
            applyMaterial(plane, primitive);
            registerEditableTarget(editableTargets, primitive, i, plane, "mesh");
            scheduleFrame();
          } else if (primitive.type === "cylinder") {
            var cylinder = registerNode(BABYLON.MeshBuilder.CreateCylinder(name, {diameter: primitive.diameter, height: primitive.height}, scene));
            applyTransform(cylinder, primitive);
            applyMaterial(cylinder, primitive);
            registerEditableTarget(editableTargets, primitive, i, cylinder, "mesh");
            scheduleFrame();
          } else if (primitive.type === "cone") {
            var cone = registerNode(BABYLON.MeshBuilder.CreateCylinder(name, {
              diameterTop: 0,
              diameterBottom: primitive.diameter,
              height: primitive.height
            }, scene));
            applyTransform(cone, primitive);
            applyMaterial(cone, primitive);
            registerEditableTarget(editableTargets, primitive, i, cone, "mesh");
            scheduleFrame();
          } else if (primitive.type === "mesh3d") {
            var babylonMesh = registerNode(new BABYLON.Mesh(primitive.name || name, scene));
            var vertexData = new BABYLON.VertexData();
            var normals = [];

            vertexData.positions = primitive.vertices;
            vertexData.indices = primitive.indices;
            if (primitive.vertex_colors) {
              vertexData.colors = primitive.vertex_colors;
            }
            BABYLON.VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
            vertexData.normals = normals;
            vertexData.applyToMesh(babylonMesh);

            applyCustomVertexAttributes(babylonMesh, primitive);
            applyMorphTarget(babylonMesh, primitive);
            applyTransform(babylonMesh, primitive);
            applyMaterial(babylonMesh, primitive);
            registerEditableTarget(editableTargets, primitive, i, babylonMesh, "mesh");
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
          } else if (primitive.type === "lines3d") {
            createPolyline(primitive, name);
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
                var template = registerNode(BABYLON.MeshBuilder.CreateSphere(name + "-template-" + Object.keys(templates).length, {diameter: scatterRadius * 2}, scene));
                template.isVisible = false;
                applyMaterial(template, templatePrimitive);
                templates[sphereColor] = template;
              }
              var instance = registerNode(templates[sphereColor].createInstance(name + "-sphere-" + idx));
              instance.position = new BABYLON.Vector3(coords[0], coords[1], coords[2]);
              instance.isPickable = false;
            });
            scheduleFrame();
          } else if (primitive.type === "planes3d") {
            primitive.coefficients.forEach(function(coeffs, idx) {
              createPlaneMesh(coeffs, primitive, name + "-plane-" + idx);
            });
            scheduleFrame();
          } else if (primitive.type === "text3d") {
            scheduleFrame();
          } else if (primitive.type === "mesh" || primitive.type === "asset3d") {
            pendingImports += 1;
            loadImportedAsset(primitive, name, interaction, editableTargets, function(importedMeshes) {
              importedMeshes.forEach(function(mesh) {
                if (!primaryMesh && mesh.getTotalVertices && mesh.getTotalVertices() > 0) {
                  primaryMesh = mesh;
                }
              });
              pendingImports -= 1;
              initializeInteraction(interaction, primaryMesh, editableTargets);
              scheduleFrame();
            }, function(scene, message, exception) {
              console.error("Error importing mesh:", message, exception);
              pendingImports -= 1;
              if (sceneUpdated && pendingImports === 0) {
                frameScene();
              }
            });
          }
        });

        initializeInteraction(interaction, primaryMesh, editableTargets);

        if ((sceneUpdated || objects.length === 0) && pendingImports === 0) {
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
