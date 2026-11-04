"""Load the real plugin against a minimal ComfyUI route registry, without a GPU/server."""
import importlib.util
from pathlib import Path
import sys
import types
from aiohttp import web

ROOT = Path(__file__).resolve().parents[1]

def load_plugin():
    name = '_cinematic_gallery_test'
    if name in sys.modules:
        return sys.modules[name]
    server = types.ModuleType('server')
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
    previous = sys.modules.get('server')
    sys.modules['server'] = server
    spec = importlib.util.spec_from_file_location(name, ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        if previous is None:
            sys.modules.pop('server', None)
        else:
            sys.modules['server'] = previous
    return module
