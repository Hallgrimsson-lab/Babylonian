# Python `edit_scene3d()` Parity TODO

## Implementation map

R `edit_scene3d()` lives primarily in [R/interaction.R](/Users/jovid/Documents/Hallgrimsson/Babylonian/R/interaction.R), with related scene/state helpers in [R/scene-core.R](/Users/jovid/Documents/Hallgrimsson/Babylonian/R/scene-core.R) and behavior covered in [tests/testthat/test-babylon-material-compat.R](/Users/jovid/Documents/Hallgrimsson/Babylonian/tests/testthat/test-babylon-material-compat.R).

The Python version is currently split across [python/src/babylonian/interaction.py](/Users/jovid/Documents/Hallgrimsson/Babylonian/python/src/babylonian/interaction.py) for the public editor/state API, [python/src/babylonian/core.py](/Users/jovid/Documents/Hallgrimsson/Babylonian/python/src/babylonian/core.py) for `BabylonWidget` and rendering support, and [python/src/babylonian/widget.js](/Users/jovid/Documents/Hallgrimsson/Babylonian/python/src/babylonian/widget.js) for the browser-side anywidget renderer and state syncing.

This is the remaining short list to bring Python `edit_scene3d()` closer to the R implementation.

## Core parity gaps

- ~~Port the full editor UI, not just view syncing.~~
  ~~The current Python anywidget path syncs camera/view state, but the R editor also captures object edits, removals, created lights, materials, morph targets, clipping, and other scene-level controls.~~
  **Done.** Editor UI panel ported with collapsible sections for Snapshot, Meshes, Lights, and Scene State Log.

- ~~Emit R-style scene state diffs from the browser editor.~~
  ~~Python currently leans on full payload or view-shaped updates; parity wants `{view, objects, removed_objects, postprocess, scale_bar, clipping, ...}` so `apply_scene_state()` can round-trip editor changes exactly like R.~~
  **Done.** `buildEditorPayload()` emits structured diffs with `view`, `objects`, `removed_objects`, `scale_bar`, `selected`, `gizmo_mode`, `gizmos_visible`.

- ~~Support mesh and light editing gizmos in the Python browser editor.~~
  ~~R exposes the full Babylon scene editor workflow for transforms and light placement; Python still needs the matching in-browser controls and state serialization.~~
  **Partially done.** GizmoManager created with translate/rotate/scale modes; mesh picking and dropdown selection wired up. Light helper spheres scale to scene and are pickable. **Still debugging**: gizmo visibility after selection needs live testing.

- Port scene-level editor controls.
  ~~Missing parity items likely include~~ postprocess editing, clipping-plane controls, ~~scale-bar editing, selection state, gizmo mode, and gizmo visibility persistence.~~
  **Partially done.** Scale bar editing, selection state, gizmo mode, and gizmo visibility are implemented. **Still needed**: postprocess (depth of field) controls and clipping-plane controls.

- ~~Preserve editor-created objects.~~
  ~~R can add lights in the editor and reapply them later; Python should support the same create-and-round-trip flow from widget state back into `Scene`.~~
  **Done.** `apply_scene_state()` reconstructs editor-created lights via `created_in_editor` flag.

## Python-side follow-up

- Tighten `apply_scene_state()` to handle the full R diff model.
  That includes named object matching, morph target influence updates, light shadow settings, exact view merges, and editor-created object reconstruction.
  **Partially done.** Editor-created object reconstruction is implemented. **Still needed**: named object matching, morph target influences, light shadow settings, exact view merges.

- Add explicit parity tests against the existing R behavior.
  The best next step is to mirror the `tests/testthat` coverage for `edit_scene3d()`, `create_pose_3d()`, `last_scene_state()`, and `apply_scene_state()` in Python.

- Update Python docs once parity lands.
  `python/README.md` still says the full editor has not been ported yet.

## Suggested next step

~~**Confirm gizmos work end-to-end**~~, then port the **material editing panel**. Gizmos confirmed working.

## Material editing panel — implementation plan

### What to build

Add a "Materials" `<details>` section to the editor panel (between Meshes and Lights) with controls matching R's `section-materials`:

- **Material type** select: `standard` / `pbr`
- **Diffuse color** picker (labeled "Base color" for PBR)
- **Alpha** slider (0–1)
- **PBR-only fields** (shown/hidden based on type): metallic slider (0–1), roughness slider (0–1)
- **Wireframe** checkbox
- **Backface culling** checkbox
- **Bounding box** checkbox (per-mesh, already in R)

### Implementation steps in `widget.js`

1. **Add HTML** for the Materials section inside `buildEditorUI()`, after the Meshes section. Copy the exact `data-role` attribute names from R: `material-type`, `material-color`, `material-alpha`, `material-metallic`, `material-roughness`, `material-wireframe`, `material-backface`, `mesh-bounding-box`, `material-pbr-fields`, plus value `<span>` elements.

2. **Add `editableMaterialSpec(target)` function** — extracts current material state from a mesh target. For mesh3d targets, read `target.primitive.color`, `target.primitive.alpha`, `target.primitive.wireframe` as fallbacks; normalize into `{type, diffuse, alpha, wireframe, backface_culling}` or `{type, base_color, metallic, roughness, alpha, ...}` for PBR.

3. **Add `applyMaterialToEditorTarget(target)` function** — creates a new `BABYLON.StandardMaterial` or `BABYLON.PBRMaterial` from `target.primitive.material` spec and assigns it to `target.node.material`. Key mapping:
   - Standard: `spec.diffuse` → `material.diffuseColor`, `spec.specular` → `material.specularColor`
   - PBR: `spec.base_color` → `material.albedoColor`, `spec.metallic`, `spec.roughness`
   - Both: `spec.alpha` → `material.alpha` (+ `needDepthPrePass` if < 1), `spec.wireframe`, `spec.backface_culling` → `material.backFaceCulling`

4. **Wire up event listeners** in `buildEditorUI()`:
   - `material-type` change → rebuild spec with new type, preserve color/alpha/wireframe, call `applyMaterialToEditorTarget` + `publishEditorState`
   - `material-color` input → update `spec.diffuse` or `spec.base_color`
   - `material-alpha` input → update `spec.alpha`
   - `material-metallic` / `material-roughness` input → update PBR fields
   - `material-wireframe` / `material-backface` / `mesh-bounding-box` change → toggle flags
   - All call: mutate spec → `target.primitive.material = spec` → `applyMaterialToEditorTarget(target)` → `updateEditorPanel()` → `publishEditorState()`

5. **Update `updateEditorPanel()`** to populate material controls from selected mesh target:
   - Read `editableMaterialSpec(target)` → set input values
   - Show/hide PBR fields div based on `spec.type`
   - Update color label text ("Diffuse color" vs "Base color")

6. **Update `buildEditorPayload()`** to include `material` in mesh object entries (already partially there — just add `entry.material = cloneMaterialSpec(target.primitive.material)` for mesh targets).

7. **Update `interaction.py` `apply_scene_state()`** — mesh object edits with a `material` key should be passed through to the reconstructed object (already works via the generic `obj.update(edit)` but should be tested).

### Key reference points

- R material HTML: `inst/htmlwidgets/babylon.js` lines 3135–3164
- R event handlers: lines 3305–3407 (`updateSelectedMaterial` pattern)
- R `editableMaterialSpec`: lines 4985–5033
- R `applyMaterialToEditorTarget`: lines 5083–5104
- R `createMaterialFromSpec`: lines 874–993 (standard + PBR branches)
- R `defaultMaterialSpec`: lines 4961–4983
