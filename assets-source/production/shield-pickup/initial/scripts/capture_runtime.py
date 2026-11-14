import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
helper_source = (WORK / 'scripts' / 'render_evidence.py').read_text().split("if '--gameplay-only' not in sys.argv:")[0]
exec(compile(helper_source, str(WORK / 'scripts' / 'render_evidence.py'), 'exec'))
scene, camera = reset_scene()
subject = import_root(WORK / 'asset' / 'shield-pickup.glb', 'runtime_probe')
neutral_lights()
set_camera(camera, (-16, 24, -30), (0, 0, 0), span=14)
billboard(subject, camera)
scene.render.resolution_x, scene.render.resolution_y = 64, 64
bpy.ops.render.render()
import gpu
runtime = {'blender_version': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(),
           'engine': scene.render.engine, 'render_threads': scene.render.threads,
           'eevee_taa_render_samples': getattr(scene.eevee, 'taa_render_samples', None),
           'view_transform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
           'exposure': scene.view_settings.exposure, 'gamma': scene.view_settings.gamma,
           'png_bits': scene.render.image_settings.color_depth,
           'gpu_vendor': gpu.platform.vendor_get(), 'gpu_renderer': gpu.platform.renderer_get(),
           'gpu_version': gpu.platform.version_get(),
           'runtime_wrapper': 'Native existing Linux Blender/sysroot; LIBGL_ALWAYS_SOFTWARE=1; LP_NUM_THREADS=4; no installation',
           'capture': '64x64 in-memory native EEVEE runtime probe using identical evidence renderer setup and actual imported asset; no extra delivery image or image overwrite'}
(WORK / 'evidence' / 'runtime-settings.json').write_text(json.dumps(runtime, indent=2) + '\n')
print('SHIELD_RUNTIME', json.dumps(runtime))
