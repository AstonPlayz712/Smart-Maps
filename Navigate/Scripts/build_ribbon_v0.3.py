import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

REPO_ROOT = os.environ.get("RIBBON_REPO_ROOT", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
EXPORT_DIR = os.path.join(REPO_ROOT, "Navigate", "Assets", "UI")
EXPORT_PATH = os.path.join(EXPORT_DIR, "Ribbon_v0.3.glb")
PREVIEW_PATH = os.path.join(EXPORT_DIR, "Ribbon_v0.3_preview.png")
os.makedirs(EXPORT_DIR, exist_ok=True)


def wipe_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in [bpy.data.meshes, bpy.data.materials, bpy.data.images]:
        for item in list(coll):
            if item.users == 0:
                coll.remove(item)


def make_base_cube():
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    ribbon = bpy.context.active_object
    ribbon.name = "Ribbon"
    ribbon.scale = (2.5, 0.25, 0.15)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ribbon


def add_modifiers(obj):
    subsurf = obj.modifiers.new(name="Subdivision", type="SUBSURF")
    subsurf.levels = 2
    subsurf.render_levels = 2

    bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = 0.03
    bevel.segments = 4
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(30.0)

    solidify = obj.modifiers.new(name="Solidify", type="SOLIDIFY")
    solidify.thickness = 0.02
    solidify.use_even_offset = True
    solidify.use_rim = True


def sculpt_forward_arc(obj, amplitude=0.18):
    mesh = obj.data
    half_span = max((v.co.x for v in mesh.vertices), default=1.0)
    if half_span == 0:
        return
    for v in mesh.vertices:
        falloff = math.cos((v.co.x / half_span) * (math.pi / 2.0))
        v.co.y -= amplitude * falloff
    mesh.update()


def build_glass_material():
    mat = bpy.data.materials.new(name="Ribbon_Glass")
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    mat.shadow_method = "HASHED"
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat

    def set_input(name, value):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value

    set_input("Base Color", (1.0, 1.0, 1.0, 1.0))
    set_input("Roughness", 0.05)
    set_input("IOR", 1.45)
    set_input("Alpha", 0.4)
    if "Transmission Weight" in bsdf.inputs:
        set_input("Transmission Weight", 1.0)
    elif "Transmission" in bsdf.inputs:
        set_input("Transmission", 1.0)
    if "Coat Weight" in bsdf.inputs:
        set_input("Coat Weight", 1.0)
        set_input("Coat Roughness", 0.02)
    elif "Clearcoat" in bsdf.inputs:
        set_input("Clearcoat", 1.0)
        set_input("Clearcoat Roughness", 0.02)
    return mat


def build_edgeglow_material():
    mat = bpy.data.materials.new(name="Ribbon_EdgeGlow")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (0.6, 0.9, 1.0, 1.0)
    elif "Emission" in bsdf.inputs:
        bsdf.inputs["Emission"].default_value = (0.6, 0.9, 1.0, 1.0)
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.2
    bsdf.inputs["Base Color"].default_value = (0.6, 0.9, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.2
    return mat


def assign_materials(obj, glass_mat, edge_mat):
    obj.data.materials.clear()
    obj.data.materials.append(glass_mat)
    obj.data.materials.append(edge_mat)

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    bm.faces.ensure_lookup_table()

    sharp_face_idx = set()
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            n1 = edge.link_faces[0].normal
            n2 = edge.link_faces[1].normal
            angle = n1.angle(n2, 0.0)
            if angle > math.radians(20.0):
                for f in edge.link_faces:
                    if f.calc_area() < 0.02:
                        sharp_face_idx.add(f.index)

    for f in bm.faces:
        f.material_index = 1 if f.index in sharp_face_idx else 0

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_modifiers(obj, keep_subsurf=False):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        if keep_subsurf and mod.type == "SUBSURF":
            continue
        bpy.ops.object.modifier_apply(modifier=mod.name)


def setup_view_and_lighting(target):
    bpy.ops.object.light_add(type="AREA", location=(0.6, -1.8, 2.4))
    key = bpy.context.active_object
    key.data.energy = 600.0
    key.data.size = 4.0
    key.rotation_euler = (math.radians(50.0), 0.0, math.radians(10.0))

    bpy.ops.object.light_add(type="AREA", location=(-2.0, 1.2, 1.8))
    rim = bpy.context.active_object
    rim.data.energy = 300.0
    rim.data.size = 3.0
    rim.data.color = (0.55, 0.85, 1.0)
    rim.rotation_euler = (math.radians(70.0), 0.0, math.radians(130.0))

    bpy.ops.object.light_add(type="AREA", location=(2.4, 1.6, 1.2))
    fill = bpy.context.active_object
    fill.data.energy = 180.0
    fill.data.size = 3.0
    fill.data.color = (1.0, 0.95, 0.9)
    fill.rotation_euler = (math.radians(70.0), 0.0, math.radians(-130.0))

    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 0.0, -0.35))
    floor = bpy.context.active_object
    floor_mat = bpy.data.materials.new(name="Ribbon_Floor")
    floor_mat.use_nodes = True
    fb = floor_mat.node_tree.nodes.get("Principled BSDF")
    if fb is not None:
        fb.inputs["Base Color"].default_value = (0.04, 0.05, 0.07, 1.0)
        fb.inputs["Roughness"].default_value = 0.35
    floor.data.materials.append(floor_mat)

    bpy.ops.object.camera_add(location=(1.4, -1.7, 0.95))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(68.0), 0.0, math.radians(38.0))
    cam.data.lens = 55.0
    bpy.context.scene.camera = cam
    constraint = cam.constraints.new(type="TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.03, 0.04, 0.06, 1.0)
        bg.inputs["Strength"].default_value = 1.2


def render_preview():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = False
    scene.cycles.caustics_reflective = True
    scene.cycles.caustics_refractive = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.render.filepath = PREVIEW_PATH
    bpy.ops.render.render(write_still=True)


def export_glb(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=EXPORT_PATH,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def main():
    wipe_scene()
    ribbon = make_base_cube()
    add_modifiers(ribbon)
    sculpt_forward_arc(ribbon, amplitude=0.18)

    glass_mat = build_glass_material()
    edge_mat = build_edgeglow_material()

    apply_modifiers(ribbon, keep_subsurf=False)
    assign_materials(ribbon, glass_mat, edge_mat)

    setup_view_and_lighting(ribbon)
    export_glb(ribbon)
    render_preview()

    print(f"[Ribbon] Exported: {EXPORT_PATH}")
    print(f"[Ribbon] Preview:  {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
