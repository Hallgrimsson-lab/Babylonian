# Shared Babylonian Schemas

These schema files now have distinct responsibilities:

- `babylonian_scene.schema.json`
  - renderable scene payloads shared by R and Python
- `babylonian_editor_state.schema.json`
  - scene editor output and round-tripped interactive state
- `babylonian_animation.schema.json`
  - camera/morph timelines and recording directives

The main architectural rule is:

- render scene schema describes what to draw
- editor state schema describes what the UI changed
- animation schema describes how the scene changes over time

Keeping these separate should make it much easier to share Babylonian across
languages without mixing rendering, editing, and export concerns into one large
contract.
