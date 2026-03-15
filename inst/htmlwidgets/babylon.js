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

    // Create a camera
    var camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2, 10, new BABYLON.Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);

    // Create a light
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

    // Render the scene
    engine.runRenderLoop(function () {
      scene.render();
    });

    // Resize the engine on window resize
    window.addEventListener("resize", function () {
      engine.resize();
    });

    return {

      renderValue: function(x) {

        console.log("Received data:", x);

        x.forEach(function(primitive, i) {
          console.log("Processing primitive:", primitive);
          var name = primitive.type + i;
          if (primitive.type === "sphere") {
            var sphere = BABYLON.MeshBuilder.CreateSphere(name, {diameter: primitive.diameter}, scene);
            sphere.position = new BABYLON.Vector3(0, 0, 0);
          } else if (primitive.type === "box") {
            var box = BABYLON.MeshBuilder.CreateBox(name, {size: primitive.size}, scene);
            box.position = new BABYLON.Vector3(0, 0, 0);
          } else if (primitive.type === "plane") {
            var plane = BABYLON.MeshBuilder.CreatePlane(name, {width: primitive.width, height: primitive.height}, scene);
            plane.position = new BABYLON.Vector3(0, 0, 0);
          } else if (primitive.type === "cylinder") {
            var cylinder = BABYLON.MeshBuilder.CreateCylinder(name, {diameter: primitive.diameter, height: primitive.height}, scene);
            cylinder.position = new BABYLON.Vector3(0, 0, 0);
          } else if (primitive.type === "cone") {
            var cone = BABYLON.MeshBuilder.CreateCone(name, {diameter: primitive.diameter, height: primitive.height}, scene);
            cone.position = new BABYLON.Vector3(0, 0, 0);
          } else if (primitive.type === "mesh") {
            console.log("Importing mesh:", primitive.file);
            BABYLON.SceneLoader.ImportMesh("", "", primitive.file, scene, function (newMeshes) {
              console.log("Successfully imported meshes:", newMeshes);
              // Position the new meshes
              newMeshes.forEach(function(mesh) {
                mesh.position = new BABYLON.Vector3(0, 0, 0);
              });
            }, null, function(scene, message, exception) {
              console.error("Error importing mesh:", message, exception);
            });
          }
        });

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
