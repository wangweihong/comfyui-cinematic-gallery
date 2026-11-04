"""Read-only routes, isolated from Pose Gallery and ToolBox."""
import asyncio
from aiohttp import web
from server import PromptServer
from .catalog import ROOT, browser_catalog, image_path
from . import motion_catalog

routes = PromptServer.instance.routes
UI_FILES = {"gallery.css", "gallery.mjs", "gallery_core.mjs"}


@routes.get("/cinematic_gallery/catalog")
async def catalog_route(request):
    try:
        payload = await asyncio.to_thread(browser_catalog)
        return web.json_response(payload, headers={"Cache-Control": "no-cache"})
    except (ValueError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=503)


@routes.get("/cinematic_gallery/gallery")
async def gallery_route(request):
    return web.FileResponse(ROOT / "web/gallery.html", headers={"Cache-Control": "no-cache"})


@routes.get("/cinematic_gallery/assets/{reference_id}")
async def asset_route(request):
    try:
        path = image_path(request.match_info["reference_id"])
    except (ValueError, OSError):
        raise web.HTTPNotFound()
    return web.FileResponse(path, headers={"Cache-Control": "no-cache"})


@routes.get("/cinematic_gallery/ui/{filename}")
async def ui_route(request):
    filename = request.match_info["filename"]
    if filename not in UI_FILES:
        raise web.HTTPNotFound()
    return web.FileResponse(ROOT / "web" / filename, headers={"Cache-Control": "no-cache"})


@routes.get("/cinematic_gallery/motion_catalog")
async def motion_catalog_route(request):
    try:
        payload = await asyncio.to_thread(motion_catalog.browser_catalog)
        return web.json_response(payload, headers={"Cache-Control": "no-cache"})
    except (ValueError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=503)


@routes.get("/cinematic_gallery/motion_assets/{kind}/{motion_id}")
async def motion_asset_route(request):
    try:
        path = motion_catalog.asset(request.match_info["motion_id"], request.match_info["kind"])
    except (ValueError, OSError):
        raise web.HTTPNotFound()
    return web.FileResponse(path, headers={"Cache-Control": "no-cache"})
