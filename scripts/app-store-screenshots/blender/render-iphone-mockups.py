import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


JOBS = {
    "home": {"source": "01-home.png", "angle": "left"},
    "dining": {"source": "02-dining.png", "angle": "front"},
    "map": {"source": "03-map.png", "angle": "right"},
    "map-front": {"source": "03-map.png", "angle": "front"},
    "rooms": {"source": "04-rooms.png", "angle": "front"},
    "sharing": {"source": "05-point-sharing.png", "angle": "right"},
}
DEFAULT_JOBS = ("home", "dining", "rooms", "map-front", "sharing")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--only", choices=sorted(JOBS), action="append")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=2800)
    parser.add_argument("--samples", type=int, default=64)
    return parser.parse_args(argv)


def principled(material_name: str):
    material = bpy.data.materials.get(material_name)
    if not material or not material.use_nodes:
        return None
    return next(
        (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )


def set_material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
) -> None:
    shader = principled(name)
    if not shader:
        return
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.24
        shader.inputs["Coat Roughness"].default_value = 0.12


def configure_device_materials() -> None:
    deep_blue = (0.006, 0.02, 0.045, 1.0)
    blue = (0.014, 0.05, 0.095, 1.0)
    steel = (0.08, 0.14, 0.21, 1.0)
    set_material("Metal Body", deep_blue, 0.94, 0.2)
    set_material("Metal", blue, 0.9, 0.18)
    set_material("Metal Camera Frame", steel, 0.94, 0.16)
    set_material("Metal Lens Frame", deep_blue, 0.92, 0.14)
    body = bpy.data.objects.get("Body")
    if body and len(body.material_slots) > 1:
        body.material_slots[1].material = body.material_slots[0].material

    for object_name in (
        "Button Action",
        "Button Power On/Off",
        "Button Volume Down",
        "Button Volume Up",
        "Front Camera module",
        "Speaker mesh",
    ):
        artifact = bpy.data.objects.get(object_name)
        if artifact:
            artifact.hide_render = True

    for name in ("Glass", "Glass Lens", "Glass Tint", "Frosted Glass"):
        shader = principled(name)
        if not shader:
            continue
        shader.inputs["Roughness"].default_value = min(
            shader.inputs["Roughness"].default_value,
            0.12,
        )

    # The source asset's dithered cover-glass layers add grain and shift UI
    # colors. The black bezel remains modeled, but the color-critical display
    # texture itself should render without tint or glare.
    for name, alpha in (("Glass", 0.0), ("Glass Tint", 0.0)):
        material = bpy.data.materials.get(name)
        shader = principled(name)
        if not material or not shader:
            continue
        shader.inputs["Alpha"].default_value = alpha
        material.surface_render_method = "DITHERED"

    create_display_bezel()
    create_clean_display_surface()


def create_display_bezel() -> None:
    """Add an opaque rounded backplate behind the model's display surface."""
    # Extend beneath the body rail so no internal geometry or transparent seam
    # can appear between the visible display/bezel and the blue metal.
    half_width = 0.0385
    half_height = 0.0812
    radius = 0.0093
    segments_per_corner = 12
    points: list[tuple[float, float, float]] = []

    corners = (
        (half_width - radius, half_height - radius, 0.0),
        (-half_width + radius, half_height - radius, math.pi / 2),
        (-half_width + radius, -half_height + radius, math.pi),
        (half_width - radius, -half_height + radius, 3 * math.pi / 2),
    )
    for center_x, center_z, start_angle in corners:
        for step in range(segments_per_corner + 1):
            angle = start_angle + (math.pi / 2) * step / segments_per_corner
            points.append(
                (
                    center_x + radius * math.cos(angle),
                    -0.00335,
                    center_z + radius * math.sin(angle),
                )
            )

    vertices = [(0.0, -0.00335, 0.0), *points]
    point_count = len(points)
    faces = [
        (0, index + 1, ((index + 1) % point_count) + 1)
        for index in range(point_count)
    ]
    mesh = bpy.data.meshes.new("Screen Bezel Backplate Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bezel = bpy.data.objects.new("Screen Bezel Backplate", mesh)
    bpy.context.collection.objects.link(bezel)

    material = bpy.data.materials.new("Screen Bezel")
    material.use_nodes = True
    shader = next(
        node
        for node in material.node_tree.nodes
        if node.type == "BSDF_PRINCIPLED"
    )
    shader.inputs["Base Color"].default_value = (0.0002, 0.0006, 0.0012, 1.0)
    shader.inputs["Metallic"].default_value = 0.82
    shader.inputs["Roughness"].default_value = 0.2
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.24
        shader.inputs["Coat Roughness"].default_value = 0.1
    bezel.data.materials.append(material)


def create_clean_display_surface() -> None:
    """Replace the model's cutout display with one uninterrupted UI surface."""
    screen = bpy.data.objects.get("Screen")
    display_material = bpy.data.materials.get("Display")
    if not screen or not display_material:
        raise RuntimeError(
            "The model does not contain its Screen and Display assets."
        )

    # The downloaded model cuts camera/sensor shapes directly into its Screen
    # mesh. Since iOS simulator captures already contain the Dynamic Island,
    # that geometry creates a second island even when the camera objects are
    # hidden. Replace the complete Screen object with a clean surface while
    # retaining the modeled metal body and the bezel backplate above.
    screen.hide_render = True

    x_min = -0.03585218
    x_max = 0.03585218
    z_min = -0.07863781
    z_max = 0.07859614
    center_x = (x_min + x_max) / 2
    center_z = (z_min + z_max) / 2
    half_width = (x_max - x_min) / 2
    half_height = (z_max - z_min) / 2
    radius = 0.0077
    surface_y = -0.00462
    segments_per_corner = 16
    points: list[tuple[float, float, float]] = []

    corners = (
        (center_x + half_width - radius, center_z + half_height - radius, 0.0),
        (
            center_x - half_width + radius,
            center_z + half_height - radius,
            math.pi / 2,
        ),
        (center_x - half_width + radius, center_z - half_height + radius, math.pi),
        (
            center_x + half_width - radius,
            center_z - half_height + radius,
            3 * math.pi / 2,
        ),
    )
    for corner_x, corner_z, start_angle in corners:
        for step in range(segments_per_corner + 1):
            angle = start_angle + (math.pi / 2) * step / segments_per_corner
            points.append(
                (
                    corner_x + radius * math.cos(angle),
                    surface_y,
                    corner_z + radius * math.sin(angle),
                )
            )

    vertices = [(center_x, surface_y, center_z), *points]
    point_count = len(points)
    faces = [
        (0, index + 1, ((index + 1) % point_count) + 1)
        for index in range(point_count)
    ]
    mesh = bpy.data.meshes.new("Clean Display Surface Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="Clean Display UV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (
                (vertex.co.x - x_min) / (x_max - x_min),
                (vertex.co.z - z_min) / (z_max - z_min),
            )

    surface = bpy.data.objects.new("Clean Display Surface", mesh)
    bpy.context.collection.objects.link(surface)
    surface.data.materials.append(display_material)


def configure_display(image_path: Path) -> None:
    material = bpy.data.materials.get("Display")
    if not material:
        raise RuntimeError("The model does not contain the Display material.")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (430, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (120, 0)
    shader.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 0.16
    shader.inputs["IOR"].default_value = 1.48
    # Keep the UI texture ungraded. The scene uses Standard color management
    # so an emission strength of 1.0 preserves the screenshot's source colors.
    shader.inputs["Emission Strength"].default_value = 1.0
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.14
        shader.inputs["Coat Roughness"].default_value = 0.08

    texture = nodes.new("ShaderNodeTexImage")
    texture.location = (-430, 30)
    texture.interpolation = "Linear"
    texture.extension = "CLIP"
    image = bpy.data.images.load(str(image_path), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    texture.image = image

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.location = (-670, 30)
    links.new(coordinates.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], shader.inputs["Emission Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> None:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light, Vector((0.0, 0.0, 0.0)))


def configure_lighting() -> None:
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    add_area_light(
        "Key Softbox",
        (-0.34, -0.32, 0.36),
        150,
        0.32,
        (0.78, 0.9, 1.0),
    )
    add_area_light(
        "Fill Softbox",
        (0.34, -0.24, 0.06),
        90,
        0.28,
        (1.0, 0.83, 0.64),
    )
    add_area_light(
        "Rim Softbox",
        (0.25, 0.22, 0.28),
        210,
        0.24,
        (0.56, 0.78, 1.0),
    )
    add_area_light(
        "Top Strip",
        (-0.08, -0.02, 0.48),
        120,
        0.36,
        (1.0, 1.0, 1.0),
    )


def configure_camera(angle: str) -> None:
    camera_data = bpy.data.cameras.new("App Store Camera")
    camera = bpy.data.objects.new("App Store Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.type = "PERSP"
    camera_data.lens = 68
    camera_data.sensor_fit = "VERTICAL"
    camera_data.dof.use_dof = False

    positions = {
        "left": (-0.13, -0.53, 0.025),
        "front": (0.0, -0.56, 0.008),
        "right": (0.13, -0.53, 0.025),
    }
    camera.location = positions[angle]
    look_at(camera, Vector((0.0, 0.0, 0.0)))


def configure_render(width: int, height: int, samples: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 90
    scene.render.film_transparent = True
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = samples

    world = scene.world or bpy.data.worlds.new("Studio World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.018, 0.026, 0.04, 1.0)
        background.inputs["Strength"].default_value = 0.24

    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def render_job(
    name: str,
    source_dir: Path,
    output_dir: Path,
) -> None:
    job = JOBS[name]
    source_path = source_dir / job["source"]
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    configure_display(source_path)
    configure_camera(job["angle"])
    output_path = output_dir / f"iphone-17-pro-max-{name}.png"
    bpy.context.scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {name}: {output_path}")

    camera = bpy.context.scene.camera
    if camera:
        bpy.data.objects.remove(camera, do_unlink=True)


def main() -> None:
    args = parse_args()
    source_dir = Path(args.source_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    configure_device_materials()
    configure_lighting()
    configure_render(args.width, args.height, args.samples)

    selected = args.only or DEFAULT_JOBS
    for name in selected:
        render_job(name, source_dir, output_dir)


if __name__ == "__main__":
    main()
