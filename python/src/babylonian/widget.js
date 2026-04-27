// widget.js — anywidget ESM for Babylonian (Python).
//
// This module bridges the R HTMLWidgets babylon.js factory into the anywidget
// lifecycle.  Instead of reimplementing BabylonJS scene rendering, we eval
// the full babylon.js widget source (delivered via the _babylon_widget_js
// traitlet) and call its factory directly on the anywidget DOM element.
//
// BabylonJS engine + loaders are loaded from traitlets (_babylon_js,
// _babylon_loaders_js) using the same UMD-bypass technique as before.

// ---------------------------------------------------------------------------
// BabylonJS engine loader
// ---------------------------------------------------------------------------

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
// HTMLWidgets shim + factory loader
// ---------------------------------------------------------------------------

var _widgetDef = null;
var _shimInstalled = false;

function ensureWidgetFactory(babylonWidgetSrc) {
  if (_widgetDef) return;

  if (!_shimInstalled) {
    if (typeof window.HTMLWidgets === "undefined") {
      window.HTMLWidgets = {
        shinyMode: false,
        widgets: {},
        widget: function (def) {
          this.widgets[def.name] = def;
        },
        find: function (sel) {
          return document.querySelector(sel);
        },
        findAll: function (sel) {
          return Array.from(document.querySelectorAll(sel));
        },
      };
    } else if (!window.HTMLWidgets.widget) {
      window.HTMLWidgets.widget = function (def) {
        window.HTMLWidgets.widgets = window.HTMLWidgets.widgets || {};
        window.HTMLWidgets.widgets[def.name] = def;
      };
    }
    _shimInstalled = true;
  }

  if (!babylonWidgetSrc || babylonWidgetSrc.length < 500) {
    throw new Error("babylon widget source is empty or too short");
  }

  new Function(babylonWidgetSrc)();

  _widgetDef =
    window.HTMLWidgets &&
    window.HTMLWidgets.widgets &&
    window.HTMLWidgets.widgets.babylon;

  if (!_widgetDef) {
    throw new Error("babylon.js did not register an HTMLWidgets widget named 'babylon'");
  }
}

// ---------------------------------------------------------------------------
// Factory wrapper
// ---------------------------------------------------------------------------

function createWidget(el, width, height) {
  if (!_widgetDef) {
    throw new Error("call ensureWidgetFactory() before createWidget()");
  }
  var instance = _widgetDef.factory(el, width, height);
  instance.el = el;
  return instance;
}

// ---------------------------------------------------------------------------
// Dispose helper
// ---------------------------------------------------------------------------

function disposeWidget(el) {
  if (!window.BABYLON || !BABYLON.Engine || !BABYLON.Engine.Instances) return;
  var canvas = el.querySelector("canvas");
  if (!canvas) return;

  var engines = BABYLON.Engine.Instances;
  for (var i = engines.length - 1; i >= 0; i--) {
    var eng = engines[i];
    if (eng.getRenderingCanvas && eng.getRenderingCanvas() === canvas) {
      eng.stopRenderLoop();
      if (eng.scenes) {
        eng.scenes.slice().forEach(function (s) {
          s.dispose();
        });
      }
      eng.dispose();
      break;
    }
  }
  el.replaceChildren();
}

// ---------------------------------------------------------------------------
// Par3d state helper
// ---------------------------------------------------------------------------
// babylon.js only emits par3d events for pose_3d mode or sync groups.
// For view-only and edit scenes we attach our own camera observer that
// publishes par3d state directly to the anywidget model.

function currentPar3dState(camera, payload) {
  var target = camera.getTarget();
  var bg =
    payload && payload.scene && payload.scene.view && payload.scene.view.bg
      ? payload.scene.view.bg
      : "#FAFAFA";
  return {
    zoom: camera.radius > 0 ? 8 / camera.radius : 0.05,
    bg: bg,
    camera: {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: [target.x, target.y, target.z],
    },
  };
}

// ---------------------------------------------------------------------------
// Anywidget lifecycle: bind babylon.js factory instance to model
// ---------------------------------------------------------------------------

function bindToModel(model, el) {
  var instance = null;
  var cameraObserver = null;
  var cameraObserverCamera = null;
  var viewPublishHandle = null;

  function scheduleViewStatePublish(camera, payload) {
    if (viewPublishHandle !== null) return;
    viewPublishHandle = window.requestAnimationFrame(function () {
      viewPublishHandle = null;
      var par3d = currentPar3dState(camera, payload);
      model.set("par3d_state", {
        event: "par3d",
        value: par3d,
        ts: Date.now(),
      });
      model.save_changes();
    });
  }

  function attachCameraObserver(payload) {
    var elementId = model.get("element_id");
    if (elementId && el.id !== elementId) {
      el.id = elementId;
    }

    var canvas = el.querySelector("canvas");
    if (!canvas || !window.BABYLON || !BABYLON.Engine) return;

    var engines = BABYLON.Engine.Instances;
    for (var i = engines.length - 1; i >= 0; i--) {
      var eng = engines[i];
      if (eng.getRenderingCanvas && eng.getRenderingCanvas() === canvas) {
        if (eng.scenes && eng.scenes.length > 0) {
          var scene = eng.scenes[0];
          var camera = scene.activeCamera;
          if (camera && camera.onViewMatrixChangedObservable) {
            cameraObserverCamera = camera;
            cameraObserver = camera.onViewMatrixChangedObservable.add(
              function () {
                scheduleViewStatePublish(camera, payload);
              }
            );
            // Publish initial state
            scheduleViewStatePublish(camera, payload);
          }
        }
        break;
      }
    }
  }

  function detachCameraObserver() {
    if (
      cameraObserverCamera &&
      cameraObserver &&
      cameraObserverCamera.onViewMatrixChangedObservable
    ) {
      cameraObserverCamera.onViewMatrixChangedObservable.remove(cameraObserver);
    }
    cameraObserverCamera = null;
    cameraObserver = null;
    if (viewPublishHandle !== null) {
      window.cancelAnimationFrame(viewPublishHandle);
      viewPublishHandle = null;
    }
  }

  // -- draw / redraw -------------------------------------------------------
  function draw() {
    var elementId = model.get("element_id");
    if (elementId && el.id !== elementId) {
      el.id = elementId;
    }

    detachCameraObserver();
    if (instance) {
      disposeWidget(el);
      instance = null;
    }

    var w = model.get("width") || 900;
    var h = model.get("height") || 700;
    var payload = model.get("scene_payload") || {};

    instance = createWidget(el, w, h);
    instance.renderValue(payload);
    attachCameraObserver(payload);
  }

  draw();

  // -- state sync: babylon.js → anywidget traitlets -----------------------
  function onHostEvent(event) {
    var detail = event.detail || {};
    var expectedWidgetId = model.get("element_id") || el.id || null;
    var eventName = detail.event;
    var value = detail.value;

    if (
      detail.widgetId &&
      expectedWidgetId &&
      detail.widgetId !== expectedWidgetId
    ) {
      return;
    }

    if (
      eventName === "scene_state" ||
      eventName === "par3d" ||
      eventName === "snapshot_request"
    ) {
      var parsed = value;
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value);
        } catch (e) {
          parsed = value;
        }
      }
      var payload = {
        event: eventName,
        value: parsed,
        ts: Date.now(),
      };
      if (eventName === "snapshot_request") {
        model.set("snapshot_request", payload);
      } else if (eventName === "par3d") {
        model.set("par3d_state", payload);
      } else {
        model.set("scene_state", payload);
      }
      model.save_changes();
    }
  }
  window.addEventListener("babylonian-host-event", onHostEvent);

  // -- snapshot round-trip -------------------------------------------------
  function onSnapshotRequest() {
    var canvas = el.querySelector("canvas");
    if (canvas) {
      model.set("_snapshot_data", canvas.toDataURL("image/png"));
      model.save_changes();
    }
  }
  model.on("change:_snapshot_request", onSnapshotRequest);

  // -- redraw on model changes ---------------------------------------------
  model.on("change:scene_payload", draw);

  function onResize() {
    if (instance && instance.resize) {
      instance.resize(model.get("width") || 900, model.get("height") || 700);
    }
  }
  model.on("change:width", onResize);
  model.on("change:height", onResize);

  // -- cleanup -------------------------------------------------------------
  return function cleanup() {
    window.removeEventListener("babylonian-host-event", onHostEvent);
    model.off("change:scene_payload", draw);
    model.off("change:width", onResize);
    model.off("change:height", onResize);
    model.off("change:_snapshot_request", onSnapshotRequest);
    detachCameraObserver();
    disposeWidget(el);
    instance = null;
  };
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------

function showWidgetError(el, msg) {
  el.style.cssText =
    "display:flex; align-items:flex-start; background:#1e1e1e; color:#f87171; " +
    "font-family:monospace; font-size:13px; padding:16px; white-space:pre-wrap; " +
    "overflow:auto; box-sizing:border-box;";
  el.textContent = "[Babylonian] " + msg;
  console.error("[Babylonian]", msg);
}

// ---------------------------------------------------------------------------
// anywidget entry point
// ---------------------------------------------------------------------------

export default {
  render({ model, el }) {
    try {
      ensureBabylon(model);
      ensureWidgetFactory(model.get("_babylon_widget_js"));
    } catch (err) {
      showWidgetError(el, "Failed to initialize:\n" + err);
      return () => {};
    }

    try {
      return bindToModel(model, el);
    } catch (err) {
      showWidgetError(el, "Scene render error:\n" + err);
      return () => {};
    }
  },
};
