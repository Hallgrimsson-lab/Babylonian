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
    var managedPipelines = [];

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
    var widgetInstanceId = "babylon-" + Math.random().toString(36).slice(2);
    var currentSyncConfig = null;
    var applyingSyncedView = false;
    var pendingSyncedView = null;
    var pendingSyncedCameraState = null;
    var lastAppliedSyncSignature = null;
    var lastBroadcastSyncSignature = null;

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
      }

      if (primitive.rotation) {
        mesh.rotation = new BABYLON.Vector3(
          primitive.rotation[0] || 0,
          primitive.rotation[1] || 0,
          primitive.rotation[2] || 0
        );
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
      var spec = primitive.morph_target || primitive.morphTarget;
      if (!spec || !Array.isArray(spec.vertices) || !spec.vertices.length) {
        return;
      }

      var manager = new BABYLON.MorphTargetManager();
      var target = new BABYLON.MorphTarget(
        spec.name || (mesh.name + "-morph"),
        spec.influence === undefined ? 0 : Number(spec.influence),
        scene
      );
      target.setPositions(spec.vertices);
      manager.addTarget(target);
      mesh.morphTargetManager = manager;
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
        backface_culling: true
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
          material.needDepthPrePass = true;
          material.separateCullingPass = true;
          if (material instanceof BABYLON.ShaderMaterial) {
            material.needAlphaBlending = function() {
              return true;
            };
            material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
            material.forceDepthWrite = false;
          }
        }
        if (material instanceof BABYLON.ShaderMaterial && spec.alpha >= 1) {
          material.forceDepthWrite = true;
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
      return [
        [matrix.m[0], matrix.m[1], matrix.m[2]],
        [matrix.m[4], matrix.m[5], matrix.m[6]],
        [matrix.m[8], matrix.m[9], matrix.m[10]]
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
      uiLayer.style.display = "none";
      uiLayer.innerHTML = "";
    }

    function clearHeatmapLegend() {
      legendLayer.style.display = "none";
      legendLayer.innerHTML = "";
    }

    function clearManagedScene() {
      initializeInteraction(null, null);
      clearSceneDecorations();
      clearHeatmapLegend();
      disposeCollection(managedNodes);
      disposeCollection(managedLights);
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

    function syncEditorGizmoState(state) {
      if (!state || !state.gizmoManager) {
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

      if (state.gizmoManager.gizmos && state.gizmoManager.gizmos.positionGizmo && currentSceneBounds && currentSceneBounds.radius) {
        state.gizmoManager.gizmos.positionGizmo.scaleRatio = Math.max(currentSceneBounds.radius * 0.004, 0.005);
      }
      if (state.gizmoManager.gizmos && state.gizmoManager.gizmos.scaleGizmo) {
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

    function addEditorLight(state, lightType) {
      if (!state) {
        return;
      }

      var index = nextEditorTargetIndex(state);
      var position = defaultEditorLightPosition();
      var primitive = {
        type: "light3d",
        light_type: lightType || "point",
        name: uniqueEditorPrimitiveName(state, (lightType || "light") + "_light"),
        position: vectorToArray(position),
        direction: defaultEditorLightDirection(lightType || "point"),
        intensity: 1,
        diffuse: "#ffffff",
        specular: "#ffffff",
        enabled: true
      };

      if (primitive.light_type === "spot") {
        primitive.angle = Math.PI / 3;
        primitive.exponent = 1;
      }

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

      state.targets = state.targets.filter(function(target) {
        return target.id !== selected.id;
      });
      if (state.helpers) {
        state.helpers = state.helpers.filter(function(helper) {
          return helper && helper !== selected.helper;
        });
      }
      disposeEditorTarget(selected);
      var fallback = selectedEditorTarget(state) || (state.targets.length ? state.targets[0] : null);
      selectEditorTarget(state, fallback ? fallback.id : null);
      publishSceneEditorState(state);
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

    function buildSceneEditorPayload(state) {
      var targets = state && state.targets ? state.targets : [];
      return {
        view: currentPar3dState(),
        postprocess: cloneScenePostprocesses(state.postprocess),
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
          "<div style='font-weight:700; margin-bottom:6px;'>Scene Editor</div>" +
          "<div style='margin-bottom:8px; color:#475569;'>Click a mesh or light in the viewport, or select it below, then edit transforms and post-processing settings.</div>" +
          "<details data-role='section-meshes' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a;'>Meshes</summary>" +
            "<div style='margin-top:8px;'>" +
              "<label style='display:block; margin-bottom:4px; color:#334155;'>Mesh target</label>" +
              "<select data-role='mesh-target' style='width:100%; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#fff; font:inherit;'></select>" +
              "<div style='display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;'>" +
                "<button type='button' data-role='mesh-mode' data-mode='translate' style='border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Move</button>" +
                "<button type='button' data-role='mesh-mode' data-mode='rotate' style='border:0; border-radius:6px; background:#334155; color:white; padding:6px 10px; cursor:pointer;'>Rotate</button>" +
                "<button type='button' data-role='mesh-mode' data-mode='scale' style='border:0; border-radius:6px; background:#475569; color:white; padding:6px 10px; cursor:pointer;'>Scale</button>" +
              "</div>" +
              "<button type='button' data-role='mesh-toggle-gizmo' style='width:100%; border:0; border-radius:6px; background:#1d4ed8; color:white; padding:6px 10px; cursor:pointer;'>Hide Gizmo</button>" +
            "</div>" +
          "</details>" +
          "<details data-role='section-materials' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a;'>Materials</summary>" +
            "<div style='margin-top:8px;'>" +
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
              "<label style='display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#334155;'><input data-role='material-backface' type='checkbox' checked /> Backface culling</label>" +
            "</div>" +
          "</details>" +
          "<details data-role='section-lights' open style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a;'>Lights</summary>" +
            "<div style='margin-top:8px;'>" +
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
              "<button type='button' data-role='light-toggle-gizmo' style='width:100%; border:0; border-radius:6px; background:#1d4ed8; color:white; padding:6px 10px; cursor:pointer;'>Hide Gizmo</button>" +
            "</div>" +
          "</details>" +
          "<details data-role='section-effects' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a;'>Postprocessing</summary>" +
            "<div data-role='effects-panel' style='margin-top:8px;'>" +
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
          "<details data-role='section-snapshot' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a;'>Snapshot</summary>" +
            "<div style='margin-top:8px;'>" +
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
          "<details data-role='section-log' style='margin-bottom:8px;'>" +
            "<summary style='cursor:pointer; font-weight:700; color:#0f172a;'>Scene State Log</summary>" +
            "<div style='margin-top:8px;'>" +
              "<textarea readonly data-role='state-json' style='width:100%; min-height:160px; resize:vertical; font:inherit; border:1px solid #cbd5e1; border-radius:6px; padding:6px; background:#f8fafc;'></textarea>" +
              "<button type='button' data-role='copy-state' style='margin-top:8px; border:0; border-radius:6px; background:#0f172a; color:white; padding:6px 10px; cursor:pointer;'>Copy JSON</button>" +
            "</div>" +
          "</details>";

        state.ui = {
          meshSection: uiLayer.querySelector("[data-role='section-meshes']"),
          materialSection: uiLayer.querySelector("[data-role='section-materials']"),
          lightSection: uiLayer.querySelector("[data-role='section-lights']"),
          effectsSection: uiLayer.querySelector("[data-role='section-effects']"),
          snapshotSection: uiLayer.querySelector("[data-role='section-snapshot']"),
          logSection: uiLayer.querySelector("[data-role='section-log']"),
          meshSelect: uiLayer.querySelector("[data-role='mesh-target']"),
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
          materialBackfaceInput: uiLayer.querySelector("[data-role='material-backface']"),
          lightSelect: uiLayer.querySelector("[data-role='light-target']"),
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
          meshToggleButton: uiLayer.querySelector("[data-role='mesh-toggle-gizmo']"),
          lightToggleButton: uiLayer.querySelector("[data-role='light-toggle-gizmo']"),
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
          stateText: uiLayer.querySelector("[data-role='state-json']"),
          copyButton: uiLayer.querySelector("[data-role='copy-state']"),
          meshModeButtons: Array.prototype.slice.call(uiLayer.querySelectorAll("[data-role='mesh-mode']")),
          lightModeButtons: Array.prototype.slice.call(uiLayer.querySelectorAll("[data-role='light-mode']"))
        };

        state.ui.meshSelect.addEventListener("change", function(evt) {
          state.selectedId = evt.target.value;
          state.sectionOpen.meshes = true;
          state.sectionOpen.materials = true;
          syncEditorGizmoState(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
        });

        function updateSelectedMaterial(mutator) {
          var target = selectedEditorTarget(state);
          if (!target || target.kind !== "mesh") {
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
          state.sectionOpen.lights = true;
          syncEditorGizmoState(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
        });

        state.ui.lightAddButton.addEventListener("click", function() {
          state.sectionOpen.lights = true;
          addEditorLight(state, state.ui.newLightTypeSelect.value || "point");
        });

        state.ui.lightRemoveButton.addEventListener("click", function() {
          removeSelectedEditorLight(state);
        });

        state.ui.meshModeButtons.forEach(function(button) {
          button.addEventListener("click", function() {
            state.gizmoMode = button.getAttribute("data-mode");
            state.sectionOpen.meshes = true;
            syncEditorGizmoState(state);
            updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          });
        });

        state.ui.lightModeButtons.forEach(function(button) {
          button.addEventListener("click", function() {
            state.gizmoMode = button.getAttribute("data-mode");
            state.sectionOpen.lights = true;
            syncEditorGizmoState(state);
            updateSceneEditorPanel(state, buildSceneEditorPayload(state));
          });
        });

        state.ui.meshToggleButton.addEventListener("click", function() {
          state.gizmosVisible = !state.gizmosVisible;
          syncEditorGizmoState(state);
          updateSceneEditorPanel(state, buildSceneEditorPayload(state));
        });

        state.ui.lightToggleButton.addEventListener("click", function() {
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
          pushShinyInputValue(
            state.widgetId + "_snapshot_request",
            {
              filename: state.ui.snapshotFilenameInput.value || "scene.png",
              format: state.ui.snapshotFormatSelect.value || "png",
              vwidth: engine.getRenderWidth ? engine.getRenderWidth() : canvas.width,
              vheight: engine.getRenderHeight ? engine.getRenderHeight() : canvas.height
            }
          );
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

        [state.ui.meshSection, state.ui.materialSection, state.ui.lightSection, state.ui.effectsSection, state.ui.snapshotSection, state.ui.logSection].forEach(function(section) {
          if (!section) {
            return;
          }
          section.addEventListener("toggle", function() {
            state.sectionOpen.meshes = !!state.ui.meshSection.open;
            state.sectionOpen.materials = !!state.ui.materialSection.open;
            state.sectionOpen.lights = !!state.ui.lightSection.open;
            state.sectionOpen.effects = !!state.ui.effectsSection.open;
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
      state.ui.effectsSection.open = state.sectionOpen.effects !== false;
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
      }

      var showMaterial = !!selected && selected.kind === "mesh";
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
      state.ui.materialBackfaceInput.disabled = !showMaterial;
      state.ui.materialSection.style.display = meshTargets.length ? "block" : "none";
      if (showMaterial) {
        var materialSpec = editableMaterialSpec(selected);
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
        state.ui.materialBackfaceInput.checked = materialSpec.backface_culling !== false;
        if (!state.ui.materialSaveNameInput.value) {
          state.ui.materialSaveNameInput.value = (selected.name || "material").replace(/\s+/g, "_").toLowerCase();
        }
      } else {
        state.ui.materialPbrFields.style.display = "none";
      }

      var gizmoLabel = state.gizmosVisible === false ? "Show Gizmo" : "Hide Gizmo";
      state.ui.meshToggleButton.disabled = !meshTargets.length;
      state.ui.lightToggleButton.disabled = !lightTargets.length;
      state.ui.meshToggleButton.textContent = gizmoLabel;
      state.ui.lightToggleButton.textContent = gizmoLabel;

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

      if (state.widgetId) {
        if (payload.view) {
          pushShinyInputValue(
            state.widgetId + "_par3d",
            JSON.stringify(payload.view)
          );
        }
        pushShinyInputValue(
          state.widgetId + "_scene_state",
          text
        );
      }
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

      if (state.widgetId) {
        pushShinyInputValue(
          state.widgetId + "_par3d",
          JSON.stringify(payload)
        );
      }
    }

    function schedulePoseStatePublish() {
      if ((!activeInteractionState || activeInteractionState.mode !== "pose_3d") && !currentSyncConfig) {
        return;
      }

      if (publishViewStateHandle !== null) {
        return;
      }

      publishViewStateHandle = window.requestAnimationFrame(function() {
        publishViewStateHandle = null;
        if (activeInteractionState && activeInteractionState.mode === "pose_3d") {
          publishPoseState(activeInteractionState);
        }
        publishSyncedViewState();
      });
    }

    function publishLandmarks(state) {
      if (!state) {
        return;
      }

      updateDigitizePanel(state);

      if (state.widgetId) {
        pushShinyInputValue(
          state.widgetId + "_landmarks",
          JSON.stringify(state.points)
        );
      }
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
        legendDisplay: legendLayer.style.display
      };

      uiLayer.style.display = "none";
      legendLayer.style.display = "none";

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

      if (interaction && interaction.mode === "edit_scene3d") {
        var editableTargets = arguments.length > 2 ? arguments[2] : [];
        if (!BABYLON.GizmoManager) {
          activeInteractionState = {
            mode: interaction.mode,
            widgetId: el.id || null,
            targets: editableTargets || [],
            postprocess: cloneScenePostprocesses(currentSceneOptions && currentSceneOptions.postprocess ? currentSceneOptions.postprocess : []),
            gizmoManager: null,
            selectedId: editableTargets && editableTargets.length ? editableTargets[0].id : null,
            gizmoMode: "translate",
            gizmosVisible: false,
            sectionOpen: {
              meshes: false,
              materials: false,
              lights: true,
              effects: false,
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
          sectionOpen: {
            meshes: false,
            materials: false,
            lights: true,
            effects: false,
            snapshot: false,
            log: false
          },
          helpers: [],
          gizmoManager: gizmoManager,
          selectedId: editableTargets && editableTargets.length ? editableTargets[0].id : null,
          gizmoMode: "translate",
          gizmosVisible: false,
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

        editorState.targets.forEach(function(target) {
          if (target.kind === "light") {
            target.helper = createLightHelper(target.node, target.primitive, target.name || target.id);
            if (target.helper) {
              target.helper.isPickable = true;
              editorState.helpers.push(target.helper);
            }
          }
        });
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

          var selectedTarget = null;
          editorState.targets.forEach(function(target) {
            if (!selectedTarget && editorTargetMatchesPickedMesh(target, pickInfo.pickedMesh)) {
              selectedTarget = target;
            }
          });
          if (!selectedTarget) {
            return;
          }

          editorState.selectedId = selectedTarget.id;
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

      if (extras) {
        Object.keys(extras).forEach(function(key) {
          target[key] = extras[key];
        });
      }

      targets.push(target);
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
          backface_culling: true,
          unlit: false
        };
      }

      return {
        type: "standard",
        diffuse: "#d9d9d9",
        specular: "#000000",
        alpha: 1,
        wireframe: false,
        backface_culling: true
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
        existing.backface_culling = true;
      }

      return existing;
    }

    function assignLibraryMaterialToSelectedMesh(state, materialName) {
      var target = selectedEditorTarget(state);
      var materialSpec = sceneMaterialByName(materialName);
      if (!target || target.kind !== "mesh" || !materialSpec) {
        return;
      }

      target.primitive.material = materialSpec;
      applyMaterialToEditorTarget(target);
      updateSceneEditorPanel(state, buildSceneEditorPayload(state));
      publishSceneEditorState(state);
    }

    function saveSelectedMaterialToLibrary(state, materialName) {
      var target = selectedEditorTarget(state);
      if (!target || target.kind !== "mesh" || !materialName) {
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
        pushShinyInputValue(
          state.widgetId + "_material_library_save",
          {
            name: materialName,
            material: cloneMaterialSpec(materialSpec)
          }
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
        return;
      }

      if (target.node && target.node.material !== undefined) {
        applyMaterial(target.node, target.primitive);
      }
    }

    function disposeEditorTarget(target) {
      if (!target) {
        return;
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
      return {
        light: light,
        editorNode: editorNode
      };
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
      if (activeInteractionState && activeInteractionState.mode === "edit_scene3d") {
        updateLightHelpers(activeInteractionState);
        publishSceneEditorState(activeInteractionState);
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
