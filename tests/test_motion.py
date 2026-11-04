import hashlib
import importlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import torch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from support import ROOT, load_plugin

plugin = load_plugin()
catalog = importlib.import_module(plugin.__name__ + '.motion_catalog')
routes = importlib.import_module(plugin.__name__ + '.routes')
Node = plugin.NODE_CLASS_MAPPINGS['CinematicMotionGallery']

class MotionTests(unittest.TestCase):
    def test_bilingual_catalog_pending_content_and_generic_prompts(self):
        payload = catalog.catalog()
        self.assertEqual(len(payload['categories']), 7)
        self.assertEqual(len(payload['records']), 40)
        self.assertEqual(len({row['id'] for row in payload['records']}), 40)
        self.assertEqual(sum(row['status'] == 'ready' for row in payload['records']), 40)
        for row in payload['records']:
            for field in catalog.FIELDS:
                self.assertTrue(row[field].strip(), (row['id'],field))
            self.assertGreater(len(row['example_prompt_en']), len(row['prompt_en']))
            self.assertNotIn('German automotive factory', row['prompt_en'])
            self.assertIn(row['use_cases_zh'], catalog.description(row, 'zh'))
            self.assertIn(row['use_cases_en'], catalog.description(row, 'en'))
            if row['status'] == 'pending':
                self.assertIn('pending', Node.VALIDATE_INPUTS(row['id']))
                self.assertIsNone(row['video'])

    def test_every_ready_video_and_workflow_matches_recorded_generation(self):
        videos = set()
        for row in catalog.catalog()['records']:
            if row['status'] != 'ready': continue
            poster, video = catalog.validate_assets(row['id'])
            videos.add(video.name)
            self.assertEqual(hashlib.sha256(video.read_bytes()).hexdigest(), row['generation']['video_sha256'])
            data = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
            self.assertEqual(len(data['streams']),1)
            stream=data['streams'][0]
            self.assertEqual((stream['codec_name'],stream['width'],stream['height'],stream['r_frame_rate']),('h264',576,320,'24/1'))
            self.assertEqual(int(stream['nb_frames']),row['planned_frames'])
            self.assertTrue(5<=float(data['format']['duration'])<=10)
            array = catalog.poster_array(row['id'])
            self.assertEqual(array.shape,(320,576,3))
            self.assertGreaterEqual(array.min(),0);self.assertLessEqual(array.max(),1)
            graph=json.loads((ROOT/row['generation']['workflow']).read_text())
            self.assertEqual(graph['4']['inputs']['prompt'],row['example_prompt_en'])
            self.assertEqual(graph['5']['inputs']['noise_seed'],row['generation']['seed'])
            self.assertTrue(all(' - ' in node['_meta']['title'] for node in graph.values()))
        self.assertEqual(videos,{p.name for p in (catalog.LIBRARY/'videos').iterdir()})

    def test_native_video_output_is_lazy_and_text_follows_selected_language(self):
        try: from comfy_api.latest import InputImpl
        except ImportError: self.skipTest('Native VIDEO requires the ComfyUI Python environment')
        self.assertEqual(Node.RETURN_TYPES,('STRING','IMAGE','STRING','STRING','VIDEO'))
        for row in catalog.catalog()['records']:
            if row['status'] != 'ready':continue
            for language in ('zh','en'):
                result=Node().load_motion(row['id'],language)
                self.assertEqual(result[0],row[f'prompt_{language}'])
                self.assertEqual(tuple(result[1].shape),(1,320,576,3))
                self.assertIsInstance(result[1],torch.Tensor)
                self.assertEqual(result[2:4],(catalog.description(row,language),row[f'example_prompt_{language}']))
                self.assertIsInstance(result[4],InputImpl.VideoFromFile)
            self.assertNotEqual(Node.IS_CHANGED(row['id'],'zh'),Node.IS_CHANGED(row['id'],'en'))

    def test_unknown_pending_missing_and_symlink_assets_fail_explicitly(self):
        for identifier in ['../pan_right','/etc/passwd','pan_right.mp4','unknown']:
            self.assertIsInstance(Node.VALIDATE_INPUTS(identifier),str)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);shutil.copy(catalog.LIBRARY/'catalog.json',root/'catalog.json')
            (root/'posters').mkdir();(root/'videos').mkdir()
            original=catalog.LIBRARY
            with patch.object(catalog,'LIBRARY',root):
                catalog.catalog.cache_clear()
                try:
                    self.assertIn('Missing',Node.VALIDATE_INPUTS('pan_right'))
                    path=root/'posters/pan_right.jpg';path.symlink_to(original/'posters/pan_right.jpg')
                    with self.assertRaisesRegex(ValueError,'Unsafe'):catalog.asset('pan_right','poster')
                    with self.assertRaises(ValueError):catalog.asset('pan_right','other')
                    payload=json.loads((root/'catalog.json').read_text())
                    payload['records'][0].update(status='pending',video=None,poster=None)
                    (root/'catalog.json').write_text(json.dumps(payload))
                    catalog.catalog.cache_clear()
                    self.assertIn('pending',Node.VALIDATE_INPUTS('pan_right'))
                finally:catalog.catalog.cache_clear()

class MotionRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app=web.Application();app.add_routes(routes.routes)
        self.client=TestClient(TestServer(app));await self.client.start_server()
    async def asyncTearDown(self):await self.client.close()
    async def test_range_requests_pending_assets_and_complete_catalog(self):
        response=await self.client.get('/cinematic_gallery/motion_catalog')
        data=await response.json()
        self.assertEqual(len(data['records']),40)
        self.assertEqual(sum(row['available'] for row in data['records']),40)
        response=await self.client.get('/cinematic_gallery/motion_assets/video/pan_right',headers={'Range':'bytes=0-127'})
        self.assertEqual(response.status,206)
        self.assertEqual(await response.read(),catalog.asset('pan_right','video').read_bytes()[:128])
        for path in ['video/not_a_motion','poster/not_a_motion','video/unknown','video/%2e%2e%2fREADME','invalid/pan_right']:
            response=await self.client.get('/cinematic_gallery/motion_assets/'+path)
            self.assertEqual(response.status,404,path)
