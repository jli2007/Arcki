import trimesh

# Load the mesh
mesh = trimesh.load('building.obj')

# Print some info about the mesh
print(f"Mesh has {len(mesh.vertices)} vertices")
print(f"Mesh has {len(mesh.faces)} faces")
print(f"Mesh bounds: {mesh.bounds}")

# Export to PLY (often easier to view)
mesh.export('building.ply')
print("Exported to building.ply")

# Or export a screenshot (requires pyglet)
# mesh.show()  # This will open a window if pyglet is installed