"""Read-only local QA server using the production routes; not a ComfyUI substitute."""
import importlib
import sys
import types
from pathlib import Path
from aiohttp import web

root = Path(__file__).resolve().parents[1]
package = types.ModuleType('_cinematic_preview')
package.__path__ = [str(root)]
sys.modules[package.__name__] = package
server = types.ModuleType('server')
server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
sys.modules['server'] = server
routes = importlib.import_module(package.__name__ + '.routes')
app = web.Application()
app.add_routes(routes.routes)

async def host(request):
    return web.FileResponse(root / 'tests/preview_host.html')

async def mock_app(request):
    return web.Response(text='export const app = {registerExtension(ext) {window.fixtureExtension = ext;}, graph: {change() {}}};', content_type='application/javascript')

async def mock_api(request):
    return web.Response(text='export const api = {apiURL: path => path};', content_type='application/javascript')

async def extension(request):
    name = request.match_info['filename']
    if name not in {'cinematic_gallery.js', 'gallery_core.mjs'}:
        raise web.HTTPNotFound()
    return web.FileResponse(root / 'web' / name)

app.router.add_get('/test-host', host)
app.router.add_get('/scripts/app.js', mock_app)
app.router.add_get('/scripts/api.js', mock_api)
app.router.add_get('/extensions/cinematic_gallery/{filename}', extension)
web.run_app(app, host='127.0.0.1', port=8197)
