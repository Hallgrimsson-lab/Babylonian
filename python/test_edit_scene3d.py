"""test_edit_scene3d.py — Integration test for the Python edit_scene3d pipeline.

Loads the two OBJ files bundled with the R package (cube.obj and person1.obj),
exercises edit_scene3d / apply_scene_state / last_scene_state, verifies state
round-trips, and confirms the widget classes can be instantiated without errors.

Run with:  python python/test_edit_scene3d.py
(from the repo root, or adjust the path constants at the top of the file.)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Ensure the Python package is importable from the repo layout
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent  # …/Babylonian/
sys.path.insert(0, str(REPO_ROOT / "python" / "src"))

import babylonian as bab
from babylonian.core import (
    _apply_scene_state_entry,
    _apply_scene_state_to_objects,
    _editable_mesh_primitive_types,
    _locate_scene_state_object,
    _normalize_morph_influence,
    _normalize_scene_state,
    _normalize_transform_vector,
    _scene_state_from_scene,
    _seed_scene_state_entry,
    _set_last_scene_state,
)
from babylonian.interaction import EditSceneHTMLWidget

# ---------------------------------------------------------------------------
# Minimal OBJ parser (handles quads, v/vt/vn index notation, triangulates)
# ---------------------------------------------------------------------------

def _parse_obj(path: Path) -> tuple[list[list[float]], list[list[int]]]:
    """Return (vertices, faces) from an OBJ file.

    * Vertices are [x, y, z] floats.
    * Faces are triangulated (quads split into two triangles).
    * Only the vertex-position index is kept from ``v/vt/vn`` entries.
    * Uses 0-based indices.
    """
    vertices: list[list[float]] = []
    faces: list[list[int]] = []

    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split()
        tag = parts[0].lower()

        if tag == "v":
            vertices.append([float(parts[1]), float(parts[2]), float(parts[3])])

        elif tag == "f":
            # Each token may be "v", "v/vt", "v/vt/vn", or "v//vn".
            # Take only the first (vertex-position) index, converted to 0-based.
            indices = [int(tok.split("/")[0]) - 1 for tok in parts[1:]]
            # Fan-triangulate: (0,1,2), (0,2,3), (0,3,4), …
            for k in range(1, len(indices) - 1):
                faces.append([indices[0], indices[k], indices[k + 1]])

    return vertices, faces


# ---------------------------------------------------------------------------
# OBJ file locations
# ---------------------------------------------------------------------------

EXTDATA   = REPO_ROOT / "inst" / "extdata"
HTMLWIDGETS = REPO_ROOT / "inst" / "htmlwidgets"

CUBE_OBJ   = HTMLWIDGETS / "cube.obj"
PERSON_OBJ = EXTDATA / "person1.obj"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def ok(msg: str) -> None:
    print(f"  [OK]  {msg}")

def info(msg: str) -> None:
    print(f"  [--]  {msg}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_obj_parser():
    section("OBJ parser")

    for label, path in [("cube.obj", CUBE_OBJ), ("person1.obj", PERSON_OBJ)]:
        assert path.exists(), f"File not found: {path}"
        verts, faces = _parse_obj(path)
        assert len(verts) > 0, f"{label}: no vertices parsed"
        assert len(faces) > 0, f"{label}: no faces parsed"
        assert all(len(f) == 3 for f in faces), f"{label}: non-triangle face found"
        ok(f"{label}: {len(verts)} vertices, {len(faces)} triangles")

    # Cube geometry sanity
    v, f = _parse_obj(CUBE_OBJ)
    assert len(v) == 8, f"Cube should have 8 vertices, got {len(v)}"
    # 6 quads → 12 triangles
    assert len(f) == 12, f"Cube should triangulate to 12 faces, got {len(f)}"
    ok("Cube geometry correct (8 verts, 12 triangles)")

    # person1.obj
    v2, f2 = _parse_obj(PERSON_OBJ)
    assert len(v2) == 4939, f"person1 vertex count mismatch: {len(v2)}"
    assert len(f2) > 0
    ok(f"person1.obj geometry loaded ({len(v2)} verts, {len(f2)} triangles)")


def test_as_babylon_mesh(verts, faces, label: str):
    """Roundtrip vertex/face data through as_babylon_mesh."""
    mesh = bab.as_babylon_mesh(vertices=verts, faces=faces, name=label)
    assert mesh["type"] == "mesh3d"
    assert mesh["name"] == label
    # flat vertices: len == 3 * nv
    assert len(mesh["vertices"]) == 3 * len(verts)
    # flat indices: len == 3 * nf  (every face is already a triangle)
    assert len(mesh["indices"]) == 3 * len(faces)
    ok(f"as_babylon_mesh ({label}): flat verts={len(mesh['vertices'])}, "
       f"flat indices={len(mesh['indices'])}")
    return mesh


def test_scene_construction():
    section("Scene construction from OBJ meshes")

    cube_v, cube_f   = _parse_obj(CUBE_OBJ)
    person_v, person_f = _parse_obj(PERSON_OBJ)

    cube_mesh   = test_as_babylon_mesh(cube_v, cube_f, "cube")
    person_mesh = test_as_babylon_mesh(person_v, person_f, "person1")

    # scene3d with a single mesh
    s = bab.scene3d([cube_mesh])
    assert len(s.objects) == 1
    assert s.objects[0]["name"] == "cube"
    ok("scene3d (cube) constructed")

    # scene3d with both meshes + a light
    light = bab.light3d(type="point", position=[10, 20, 30], intensity=1.5, name="key")
    s2 = bab.scene3d([person_mesh, light])
    assert len(s2.objects) == 2
    assert s2.objects[0]["name"] == "person1"
    assert s2.objects[1]["type"] == "light3d"
    ok("scene3d (person1 + light) constructed")

    return cube_mesh, person_mesh, cube_v, cube_f, person_v, person_f


def test_seed_scene_state_entry(cube_mesh, person_mesh):
    section("_seed_scene_state_entry")

    e1 = _seed_scene_state_entry(cube_mesh, 1)
    assert e1 is not None
    assert e1["index"] == 1
    assert e1["node_type"] == "mesh"
    assert e1["name"] == "cube"
    assert e1["position"] == [0.0, 0.0, 0.0]
    assert e1["rotation"] == [0.0, 0.0, 0.0]
    assert e1["scaling"] == [1.0, 1.0, 1.0]
    ok("cube mesh entry seeded correctly")

    e2 = _seed_scene_state_entry(person_mesh, 2)
    assert e2 is not None and e2["index"] == 2
    ok("person mesh entry seeded at index 2")

    # Light
    light = bab.light3d(type="hemispheric", intensity=0.9, name="hemi")
    le = _seed_scene_state_entry(light, 3)
    assert le["node_type"] == "light"
    assert le["light_type"] == "hemispheric"
    assert le["intensity"] == 0.9
    ok("light entry seeded correctly")

    # Unknown/unregistered type → None
    unknown = {"type": "custom_primitive"}
    assert _seed_scene_state_entry(unknown, 4) is None
    ok("unknown primitive type correctly returns None")


def test_scene_state_from_scene(cube_mesh, person_mesh):
    section("_scene_state_from_scene")

    light = bab.light3d(type="point", position=[5, 10, 0], name="key")
    s = bab.scene3d([cube_mesh, person_mesh, light])
    state = _scene_state_from_scene(s)

    assert len(state["objects"]) == 3
    assert state["objects"][0]["index"] == 1   # 1-based
    assert state["objects"][1]["index"] == 2
    assert state["objects"][2]["index"] == 3
    assert state["removed_objects"] == []
    ok("state extracted from scene (3 objects, 1-based indices)")

    # mesh objects have position/rotation/scaling
    mesh_entry = state["objects"][0]
    assert "position" in mesh_entry and "rotation" in mesh_entry and "scaling" in mesh_entry
    ok("mesh state entry has transform fields")

    # light entry
    light_entry = state["objects"][2]
    assert light_entry["node_type"] == "light"
    assert light_entry["position"] == [5.0, 10.0, 0.0]
    ok("light state entry has position")

    return state


def test_normalize_scene_state():
    section("_normalize_scene_state")

    # Full round-trip with all supported fields
    raw = {
        "view": {
            "zoom": 0.08,
            "camera": {"alpha": -1.57, "beta": 1.2, "radius": 120.0, "target": [0, 0, 50]},
            "bg": "#ffffff",
        },
        "objects": [
            {
                "index": 1,
                "primitive_type": "mesh3d",
                "node_type": "mesh",
                "name": "cube",
                "position": [1.0, 2.0, 3.0],
                "rotation": [0.0, 0.0, 0.0],
                "scaling": [2.0, 2.0, 2.0],
                "show_bounding_box": True,
            },
            {
                "index": 2,
                "primitive_type": "light3d",
                "node_type": "light",
                "light_type": "point",
                "position": [10.0, 20.0, 0.0],
                "intensity": 1.5,
                "diffuse": "#ffccaa",
                "enabled": True,
            },
        ],
        "removed_objects": [],
        "gizmo_mode": "translate",
        "gizmos_visible": True,
    }

    ns = _normalize_scene_state(raw)
    assert ns is not None
    assert ns["view"]["zoom"] == 0.08
    assert ns["objects"][0]["name"] == "cube"
    assert ns["objects"][0]["position"] == [1.0, 2.0, 3.0]
    assert ns["objects"][0]["scaling"] == [2.0, 2.0, 2.0]
    assert ns["objects"][0]["show_bounding_box"] is True
    assert ns["objects"][1]["light_type"] == "point"
    assert ns["objects"][1]["intensity"] == 1.5
    assert ns["gizmo_mode"] == "translate"
    ok("Full state dict normalised correctly")

    # JSON string input (simulates what the JS editor sends back)
    json_str = json.dumps(raw)
    ns2 = _normalize_scene_state(json_str)
    assert ns2 is not None
    assert ns2["objects"][0]["position"] == [1.0, 2.0, 3.0]
    ok("JSON string input accepted")

    # None input
    assert _normalize_scene_state(None) is None
    ok("None → None")

    # Morph-target entries
    morph_raw = dict(raw)
    morph_raw["objects"] = [
        {
            "index": 1,
            "primitive_type": "mesh3d",
            "node_type": "mesh",
            "morph_target": [
                {"name": "expression_A", "influence": 0.75},
                {"name": "expression_B", "influence": 1.5},  # should be clamped to 1.0
            ],
        }
    ]
    ns3 = _normalize_scene_state(morph_raw)
    mt = ns3["objects"][0]["morph_target"]
    assert mt[0]["influence"] == 0.75
    assert mt[1]["influence"] == 1.0, f"Expected 1.0, got {mt[1]['influence']}"
    ok("Morph-target influences normalised (clamped to [0,1])")

    # Single morph-target dict (not in a list) — edge case
    morph_raw2 = dict(raw)
    morph_raw2["objects"] = [
        {
            "index": 1,
            "primitive_type": "mesh3d",
            "node_type": "mesh",
            "morph_target": {"name": "smile", "influence": 0.5},
        }
    ]
    ns4 = _normalize_scene_state(morph_raw2)
    assert isinstance(ns4["objects"][0]["morph_target"], list)
    assert len(ns4["objects"][0]["morph_target"]) == 1
    ok("Single morph-target dict auto-wrapped in list")

    # removed_objects
    removed_raw = {
        "view": None,
        "objects": [],
        "removed_objects": [{"index": 2, "name": "old_light", "primitive_type": "light3d"}],
    }
    ns5 = _normalize_scene_state(removed_raw)
    assert ns5["removed_objects"][0]["index"] == 2
    assert ns5["removed_objects"][0]["name"] == "old_light"
    ok("removed_objects normalised")


def test_locate_scene_state_object():
    section("_locate_scene_state_object")

    objects = [
        {"type": "mesh3d", "name": "alpha"},
        {"type": "mesh3d", "name": "beta"},
        {"type": "light3d"},
    ]

    # name match takes priority over index
    assert _locate_scene_state_object(objects, {"index": 99, "name": "beta"}) == 1
    ok("name match (index ignored when name matches)")

    # 1-based index fallback
    assert _locate_scene_state_object(objects, {"index": 1}) == 0
    assert _locate_scene_state_object(objects, {"index": 3}) == 2
    ok("1-based index fallback → 0-based result")

    # Out of range
    assert _locate_scene_state_object(objects, {"index": 99}) is None
    ok("out-of-range index → None")

    # Ambiguous name (two objects with same name) → falls through to index
    dup = [{"name": "dup"}, {"name": "dup"}]
    assert _locate_scene_state_object(dup, {"index": 1, "name": "dup"}) == 0
    ok("ambiguous name falls through to index")


def test_apply_scene_state_entry():
    section("_apply_scene_state_entry")

    obj = {
        "type": "mesh3d",
        "name": "cube",
        "position": [0.0, 0.0, 0.0],
        "rotation": [0.0, 0.0, 0.0],
        "scaling": [1.0, 1.0, 1.0],
    }

    entry = {
        "index": 1,
        "position": [10.0, 20.0, 30.0],
        "rotation": [0.0, 1.5707, 0.0],
        "scaling": [2.0, 2.0, 2.0],
        "show_bounding_box": True,
    }

    updated = _apply_scene_state_entry(obj, entry)
    assert updated["position"] == [10.0, 20.0, 30.0]
    assert updated["rotation"][1] == pytest_approx(1.5707)
    assert updated["scaling"] == [2.0, 2.0, 2.0]
    assert updated["show_bounding_box"] is True
    # Original must not be mutated
    assert obj["position"] == [0.0, 0.0, 0.0]
    ok("mesh transforms applied, original not mutated")

    # Light updates
    light_obj = {"type": "light3d", "light_type": "hemispheric", "intensity": 1.0}
    light_entry = {
        "index": 1,
        "intensity": 2.0,
        "light_type": "directional",
        "direction": [0.0, -1.0, 0.0],
        "diffuse": "#ff0000",
        "enabled": False,
    }
    updated_light = _apply_scene_state_entry(light_obj, light_entry)
    assert updated_light["intensity"] == 2.0
    assert updated_light["light_type"] == "directional"
    assert updated_light["direction"] == [0.0, -1.0, 0.0]
    assert updated_light["diffuse"] == "#ff0000"
    assert updated_light["enabled"] is False
    ok("light properties applied")

    # Material assignment
    obj_with_mat = {"type": "mesh3d", "position": [0,0,0], "rotation": [0,0,0], "scaling": [1,1,1]}
    mat_entry = {"index": 1, "material": {"type": "standard", "color": "#aabbcc"}}
    updated_mat = _apply_scene_state_entry(obj_with_mat, mat_entry)
    assert updated_mat["material"]["color"] == "#aabbcc"
    ok("material assignment applied")


def pytest_approx(value, rel=1e-5):
    """Tiny inline approximation checker (avoids pytest dependency)."""
    class Approx:
        def __eq__(self, other):
            return abs(other - value) <= rel * max(abs(value), abs(other), 1e-12)
        def __repr__(self):
            return f"≈{value}"
    return Approx()


def test_apply_scene_state_to_objects():
    section("_apply_scene_state_to_objects")

    objects = [
        {"type": "mesh3d", "name": "cube",   "position": [0,0,0], "rotation": [0,0,0], "scaling": [1,1,1]},
        {"type": "mesh3d", "name": "sphere", "position": [5,0,0], "rotation": [0,0,0], "scaling": [1,1,1]},
        {"type": "light3d", "name": "sun",   "intensity": 1.0},
    ]

    # Edit two existing objects
    edits = [
        {"index": 1, "name": "cube",   "primitive_type": "mesh3d", "position": [1,2,3]},
        {"index": 3, "name": "sun",    "primitive_type": "light3d", "intensity": 0.5},
    ]
    result = _apply_scene_state_to_objects(objects, edits)
    assert len(result) == 3
    assert result[0]["position"] == [1.0, 2.0, 3.0]
    assert result[2]["intensity"] == 0.5
    ok("Two objects edited in-place")

    # Remove one object
    removed = [{"index": 2, "name": "sphere"}]
    result2 = _apply_scene_state_to_objects(objects, [], removed)
    assert len(result2) == 2
    assert all(o.get("name") != "sphere" for o in result2)
    ok("Object removed by name")

    # Remove by index (no name)
    result3 = _apply_scene_state_to_objects(objects, [], [{"index": 1}])
    assert len(result3) == 2
    assert result3[0]["name"] == "sphere"
    ok("Object removed by index")

    # Editor-created light (index not found → append)
    new_light_edit = [{"index": 99, "primitive_type": "light3d", "light_type": "point",
                        "intensity": 0.8, "name": "rim"}]
    result4 = _apply_scene_state_to_objects(objects, new_light_edit)
    assert len(result4) == 4
    assert result4[-1]["type"] == "light3d"
    assert result4[-1]["name"] == "rim"
    ok("Editor-created light appended when index not found")

    # Removal in reverse order preserves indices of earlier elements
    many = [{"type": "mesh3d", "name": f"m{i}"} for i in range(5)]
    result5 = _apply_scene_state_to_objects(many, [], [{"index": 5}, {"index": 3}])
    assert len(result5) == 3
    assert [o["name"] for o in result5] == ["m0", "m1", "m3"]
    ok("Multiple removals in reverse-index order (m2 and m4 removed)")


def test_edit_scene3d_non_interactive(cube_mesh, person_mesh):
    section("edit_scene3d (non-interactive)")

    # From a Scene object
    s = bab.scene3d([cube_mesh])
    result = bab.edit_scene3d(s)
    assert isinstance(result, bab.Scene)
    assert result.interaction == {"mode": "edit_scene3d"}
    ok("Returns Scene with interaction mode set")

    # Original scene not mutated
    assert s.interaction is None or s.interaction.get("mode") != "edit_scene3d"
    ok("Original scene not mutated")

    # last_scene_state() reflects the seeded initial state
    st = bab.last_scene_state()
    assert st is not None
    assert len(st["objects"]) == 1
    assert st["objects"][0]["index"] == 1
    assert st["objects"][0]["node_type"] == "mesh"
    ok("last_scene_state() seeded from scene after edit_scene3d()")

    # From raw (vertices, faces) tuple — same path as plot3d()
    cube_v, cube_f = _parse_obj(CUBE_OBJ)
    result2 = bab.edit_scene3d((cube_v, cube_f))
    assert isinstance(result2, bab.Scene)
    assert result2.interaction == {"mode": "edit_scene3d"}
    ok("edit_scene3d from raw (verts, faces) tuple")

    # Multi-object scene (mesh + light)
    light = bab.light3d(type="point", position=[0, 50, 0], name="top")
    s2 = bab.scene3d([person_mesh, light])
    result3 = bab.edit_scene3d(s2)
    st3 = bab.last_scene_state()
    assert len(st3["objects"]) == 2
    mesh_entry  = next(e for e in st3["objects"] if e["node_type"] == "mesh")
    light_entry = next(e for e in st3["objects"] if e["node_type"] == "light")
    assert mesh_entry["name"] == "person1"
    assert light_entry["position"] == [0.0, 50.0, 0.0]
    ok("Multi-object scene (mesh + light) seeded correctly")

    # to_json round-trip — the scene must serialise cleanly
    j = result3.to_json()
    parsed = json.loads(j)
    assert parsed["interaction"]["mode"] == "edit_scene3d"
    assert parsed["schema"]["name"] == "babylonian.scene"
    ok("edit_scene3d scene round-trips through to_json()")

    return result3


def test_apply_scene_state(cube_mesh, person_mesh):
    section("apply_scene_state")

    # Build a scene and edit it
    s = bab.scene3d([cube_mesh, person_mesh])
    bab.edit_scene3d(s)  # seeds last_scene_state

    # Simulate state returned by the JS editor
    js_state = {
        "view": {
            "zoom": 0.05,
            "camera": {"alpha": -1.57, "beta": 1.30, "radius": 250.0, "target": [0, 0, 50]},
            "bg": "#f0f0f0",
        },
        "objects": [
            {
                "index": 1,
                "primitive_type": "mesh3d",
                "node_type": "mesh",
                "name": "cube",
                "position": [0.0, 10.0, 0.0],
                "rotation": [0.0, 3.14159, 0.0],
                "scaling": [1.0, 1.0, 1.0],
                "show_bounding_box": False,
            },
            {
                "index": 2,
                "primitive_type": "mesh3d",
                "node_type": "mesh",
                "name": "person1",
                "position": [0.0, 0.0, 0.0],
                "rotation": [0.0, 0.0, 0.0],
                "scaling": [2.0, 2.0, 2.0],  # scaled up
            },
        ],
        "removed_objects": [],
        "gizmo_mode": "translate",
    }

    applied = bab.apply_scene_state(s, state=js_state)

    assert isinstance(applied, bab.Scene)
    assert len(applied.objects) == 2
    assert applied.objects[0]["position"] == [0.0, 10.0, 0.0]
    assert applied.objects[1]["scaling"] == [2.0, 2.0, 2.0]
    assert applied.scene["view"]["zoom"] == 0.05
    assert applied.scene["view"]["bg"] == "#f0f0f0"
    ok("apply_scene_state: transforms and camera pose applied")

    # Original scene not mutated
    assert s.objects[0].get("position") != [0.0, 10.0, 0.0]
    ok("Original scene not mutated by apply_scene_state")

    # State stored in last_scene_state()
    assert bab.last_scene_state()["view"]["zoom"] == 0.05
    ok("apply_scene_state updates last_scene_state()")

    # Calling with x=None uses _CURRENT_SCENE (set by plot3d)
    # Manually seed the global accumulated scene
    import babylonian.core as _core
    _core._CURRENT_SCENE = s.clone()
    applied2 = bab.apply_scene_state(state=js_state)
    assert applied2.objects[0]["position"] == [0.0, 10.0, 0.0]
    ok("apply_scene_state(x=None) uses accumulated scene")

    # JSON string state (matches what JS postMessage sends)
    applied3 = bab.apply_scene_state(s, state=json.dumps(js_state))
    assert applied3.objects[1]["scaling"] == [2.0, 2.0, 2.0]
    ok("apply_scene_state accepts JSON string state")

    # apply_scene_state with removed_objects
    removal_state = {
        "view": None,
        "objects": [],
        "removed_objects": [{"index": 2, "name": "person1", "primitive_type": "mesh3d"}],
    }
    applied4 = bab.apply_scene_state(s, state=removal_state)
    assert len(applied4.objects) == 1
    assert applied4.objects[0]["name"] == "cube"
    ok("apply_scene_state removes objects from removed_objects list")

    # Editor-added light
    add_light_state = {
        "view": None,
        "objects": [
            {"index": 999, "primitive_type": "light3d", "light_type": "spot",
             "intensity": 1.2, "name": "editor_spot"},
        ],
        "removed_objects": [],
    }
    applied5 = bab.apply_scene_state(s, state=add_light_state)
    assert len(applied5.objects) == 3   # original 2 + new light
    assert applied5.objects[-1]["type"] == "light3d"
    assert applied5.objects[-1]["name"] == "editor_spot"
    ok("apply_scene_state appends editor-created lights")


def test_edit_scene_html_widget(cube_mesh):
    section("EditSceneHTMLWidget")

    s = bab.scene3d([cube_mesh])
    s.interaction = {"mode": "edit_scene3d"}

    widget = EditSceneHTMLWidget(scene=s, width=1100, height=800)

    # _repr_html_ must return non-empty string with an iframe tag
    html = widget._repr_html_()
    assert isinstance(html, str) and len(html) > 100
    assert "<iframe" in html.lower()
    ok("_repr_html_() returns iframe HTML")

    # The data-URL must contain base64 content
    assert "data:text/html;base64," in html
    ok("iframe uses base64 data URL")

    # Decode and inspect the embedded document
    import base64
    b64 = re.search(r'base64,([A-Za-z0-9+/=]+)', html).group(1)
    doc = base64.b64decode(b64).decode("utf-8")
    assert "babylonjs.com/babylon.js" in doc
    ok("Embedded document loads BabylonJS from CDN")

    # If babylon.js is present in the repo the full editor JS is inlined
    babylon_js_path = REPO_ROOT / "inst" / "htmlwidgets" / "babylon.js"
    if babylon_js_path.exists():
        assert "HTMLWidgets.widget" in doc or "edit_scene3d" in doc
        ok("Full babylon.js editor JS inlined in document")
    else:
        info("babylon.js not found on path — CDN-only fallback used")

    # The payload must contain the scene objects
    assert "mesh3d" in doc
    ok("Payload embedded correctly (mesh3d in document)")

    # get_scene_state returns last_scene_state() output
    _set_last_scene_state({"view": None, "objects": [], "removed_objects": []})
    st = widget.get_scene_state()
    assert st is not None
    ok("get_scene_state() returns last_scene_state()")

    # save_html round-trip
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        widget.save_html(tmp_path)
        assert tmp_path.exists()
        saved = tmp_path.read_text(encoding="utf-8")
        assert "babylonjs.com/babylon.js" in saved
        ok(f"save_html() wrote {tmp_path.stat().st_size} bytes")
    finally:
        os.unlink(tmp_path)


def test_edit_scene_widget_anywidget(cube_mesh):
    section("EditSceneWidget (anywidget)")

    try:
        import anywidget as _aw
        import traitlets as _tr
        has_anywidget = True
    except ImportError:
        has_anywidget = False

    if not has_anywidget:
        info("anywidget not installed — skipping anywidget-specific checks")
        info("EditSceneWidget is aliased to EditSceneHTMLWidget in this environment")
        from babylonian.interaction import EditSceneWidget
        s = bab.scene3d([cube_mesh])
        s.interaction = {"mode": "edit_scene3d"}
        w = EditSceneWidget(scene=s, width=900, height=700)
        assert w is not None
        ok("EditSceneWidget (HTML fallback) instantiated without errors")
        return

    from babylonian.interaction import EditSceneWidget
    s = bab.scene3d([cube_mesh])
    s.interaction = {"mode": "edit_scene3d"}

    w = EditSceneWidget(scene=s, width=1100, height=800)
    assert w.width == 1100
    assert w.height == 800
    assert w.scene_payload["objects"][0]["type"] == "mesh3d"
    assert w.scene_state == ""   # empty until JS sends a state
    ok("EditSceneWidget instantiated, traitlets initialised")

    # Simulate JS sending back a scene_state string
    fake_state = json.dumps({
        "view": {"zoom": 0.05},
        "objects": [{"index": 1, "primitive_type": "mesh3d", "node_type": "mesh",
                     "position": [0, 5, 0], "rotation": [0,0,0], "scaling": [1,1,1]}],
        "removed_objects": [],
    })
    w.scene_state = fake_state  # triggers _on_scene_state_change observe
    assert bab.last_scene_state()["objects"][0]["position"] == [0.0, 5.0, 0.0]
    ok("scene_state traitlet update propagates to last_scene_state()")

    # get_scene_state() parses the traitlet
    st = w.get_scene_state()
    assert st is not None
    assert st["objects"][0]["position"] == [0.0, 5.0, 0.0]
    ok("get_scene_state() returns parsed dict from traitlet")

    # apply_to
    result = w.apply_to(s)
    assert result.objects[0]["position"] == [0.0, 5.0, 0.0]
    ok("apply_to() applies current state to given scene")

    # babylon_js_content is populated from the filesystem
    if (REPO_ROOT / "inst" / "htmlwidgets" / "babylon.js").exists():
        assert len(w.babylon_js_content) > 1000
        ok(f"babylon_js_content loaded ({len(w.babylon_js_content)} chars)")
    else:
        assert w.babylon_js_content == ""
        info("babylon_js_content empty (babylon.js not found)")


def test_payload_serialisation(cube_mesh, person_mesh):
    section("Payload serialisation (to_json / to_payload)")

    light = bab.light3d(type="point", position=[0, 100, 0], name="sun")
    s = bab.scene3d([cube_mesh, person_mesh, light])
    s.interaction = {"mode": "edit_scene3d"}

    # to_payload
    p = s.to_payload()
    assert p["interaction"]["mode"] == "edit_scene3d"
    assert len(p["objects"]) == 3
    ok("to_payload() structure correct")

    # Full JSON round-trip
    j = s.to_json()
    parsed = json.loads(j)
    assert parsed["schema"]["name"] == "babylonian.scene"
    assert parsed["schema"]["version"] == "0.1.0"
    assert parsed["interaction"]["mode"] == "edit_scene3d"
    assert len(parsed["objects"]) == 3
    ok("to_json() → JSON.parse round-trip consistent")

    # Clone must carry interaction mode
    s2 = s.clone()
    assert s2.interaction == {"mode": "edit_scene3d"}
    ok("clone() preserves interaction mode")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Babylonian edit_scene3d — Python integration tests")
    print(f"  Package version: {bab.__file__}")
    print("=" * 60)

    test_obj_parser()
    cube_mesh, person_mesh, cube_v, cube_f, person_v, person_f = test_scene_construction()
    test_seed_scene_state_entry(cube_mesh, person_mesh)
    test_scene_state_from_scene(cube_mesh, person_mesh)
    test_normalize_scene_state()
    test_locate_scene_state_object()
    test_apply_scene_state_entry()
    test_apply_scene_state_to_objects()
    test_edit_scene3d_non_interactive(cube_mesh, person_mesh)
    test_apply_scene_state(cube_mesh, person_mesh)
    test_edit_scene_html_widget(cube_mesh)
    test_edit_scene_widget_anywidget(cube_mesh)
    test_payload_serialisation(cube_mesh, person_mesh)

    print("\n" + "=" * 60)
    print("  ALL TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
