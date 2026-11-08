"""Fixed comparison invariants, complete assets and legacy movie compatibility."""
import copy
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import shutil
import tempfile
from unittest.mock import patch
import unittest
import torch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from support import ROOT, load_plugin

plugin = load_plugin()
styles = importlib.import_module(plugin.__name__+'.style_catalog')
movies = importlib.import_module(plugin.__name__+'.cinematic_catalog')
routes = importlib.import_module(plugin.__name__+'.routes')
Node = plugin.NODE_CLASS_MAPPINGS['CinematicMotionGallery']
PROFILE = json.loads((ROOT/'library/styles/profile.json').read_text())

def comparison(graph):
    graph=copy.deepcopy(graph)
    graph['4']['inputs']['prompt']=graph['4']['inputs']['prompt'].split('\n\nVisual style: ')[0]
    graph['12']['inputs']['filename_prefix']='OUTPUT'
    for node in graph.values(): node.pop('_meta',None)
    return graph

class StyleTests(unittest.TestCase):
    def test_complete_curated_bilingual_catalog_and_split_papercraft(self):
        payload=styles.catalog();rows=payload['records']
        self.assertEqual(len(rows),74)
        self.assertEqual([sum(r['category']==c['id'] for r in rows) for c in payload['categories']],[12,12,14,14,12,10])
        self.assertEqual(len({r['id'] for r in rows}),74)
        self.assertEqual(sum('荧光纸艺拼贴' in r['aliases'] for r in rows),2)
        self.assertEqual(sum(r['first_batch'] for r in rows),6)
        self.assertEqual(hashlib.sha256(PROFILE['base_prompt_en'].encode()).hexdigest(),PROFILE['base_prompt_sha256'])
        self.assertEqual(PROFILE['seed'],202611040001)
        for row in rows:
            for field in styles.FIELDS:self.assertTrue(row[field].strip(),(row['id'],field))
            self.assertEqual(row['example_prompt_en'],PROFILE['base_prompt_en']+'\n\n'+row['prompt_en'])
            self.assertEqual(row['example_prompt_zh'],PROFILE['base_prompt_zh']+'\n\n'+row['prompt_zh'])
            self.assertTrue(row['id'].startswith('style_'))
            self.assertEqual(row['status'],'ready',row['id'])
            self.assertIn(row['distinctions_zh'],styles.description(row,'zh'))

    def test_every_final_video_and_workflow_uses_the_same_comparison_conditions(self):
        expected=comparison(PROFILE['workflow_template'])
        files=set()
        for row in styles.catalog()['records']:
            poster,video=styles.validate_assets(row['id']); files.add(video.name)
            gen=row['generation'];graph=json.loads((ROOT/gen['workflow']).read_text())
            self.assertEqual(comparison(graph),expected,row['id'])
            self.assertEqual(graph['4']['inputs']['prompt'],row['example_prompt_en'])
            self.assertEqual(gen['style_prompt_en'],row['prompt_en'])
            self.assertEqual(gen['base_prompt_sha256'],PROFILE['base_prompt_sha256'])
            self.assertEqual(gen['encoding'],PROFILE['encoding'])
            self.assertTrue(gen['review_notes_zh'])
            self.assertTrue(all(' - ' in n['_meta']['title'] for n in graph.values()))
            self.assertEqual(hashlib.sha256(video.read_bytes()).hexdigest(),gen['video_sha256'])
            data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
            self.assertEqual(len(data['streams']),1)
            s=data['streams'][0]
            self.assertEqual((s['codec_name'],s['pix_fmt'],s['width'],s['height'],s['r_frame_rate'],int(s['nb_frames'])),('h264','yuv420p',576,320,'24/1',124))
            self.assertAlmostEqual(float(data['format']['duration']),124/24,places=5)
            array=styles.poster_array(row['id']);self.assertEqual(array.shape,(320,576,3))
            self.assertTrue(0<=array.min()<=array.max()<=1)
        self.assertEqual(files,{p.name for p in (styles.LIBRARY/'videos').iterdir()})

    def test_style_missing_corrupt_and_symlink_assets_fail_explicitly(self):
        original=styles.LIBRARY
        with tempfile.TemporaryDirectory() as directory:
            library=Path(directory);shutil.copy(original/'catalog.json',library/'catalog.json')
            (library/'posters').mkdir();(library/'videos').mkdir()
            with patch.object(styles,'LIBRARY',library):
                styles.catalog.cache_clear()
                try:
                    self.assertIn('Missing',Node.VALIDATE_INPUTS('style_risograph'))
                    poster=library/'posters/style_risograph.jpg'
                    poster.symlink_to(original/'posters/style_risograph.jpg')
                    with self.assertRaisesRegex(ValueError,'Unsafe'):styles.asset('style_risograph','poster')
                    poster.unlink();poster.write_bytes(b'corrupt JPEG')
                    with self.assertRaisesRegex(ValueError,'Cannot decode'):styles.poster_array('style_risograph')
                    with self.assertRaises(ValueError):styles.asset('style_risograph','other')
                    try:from comfy_api.latest import InputImpl
                    except ImportError:return
                    shutil.copy(original/'posters/style_risograph.jpg',poster)
                    (library/'videos/style_risograph.mp4').write_bytes(b'corrupt MP4')
                    with self.assertRaisesRegex(ValueError,'Cannot read cinematic video'):Node().load_motion('style_risograph')
                finally:styles.catalog.cache_clear()

    def test_unified_lookup_and_native_single_language_outputs(self):
        data=movies.browser_catalog()
        self.assertEqual(len(data['records']),173)
        self.assertEqual(sum(r['available'] for r in data['records']),173)
        self.assertEqual(sum(r['kind']=='motion' for r in data['records']),99)
        self.assertEqual(sum(r['kind']=='style' for r in data['records']),74)
        for identifier in ('style_unknown','../style_risograph','style_risograph.mp4'):
            self.assertIsInstance(Node.VALIDATE_INPUTS(identifier),str)
        try: from comfy_api.latest import InputImpl
        except ImportError:self.skipTest('Native VIDEO requires ComfyUI Python')
        for row in styles.catalog()['records']:
            for language in ('zh','en'):
                result=Node().load_motion(row['id'],language)
                self.assertEqual(len(result),5)
                self.assertEqual(result[0],row[f'prompt_{language}'])
                self.assertEqual(tuple(result[1].shape),(1,320,576,3))
                self.assertIsInstance(result[1],torch.Tensor)
                self.assertEqual(result[2],styles.description(row,language))
                self.assertEqual(result[3],row[f'example_prompt_{language}'])
                self.assertIsInstance(result[4],InputImpl.VideoFromFile)
                self.assertEqual(Node.VALIDATE_INPUTS(row['id'],language),True)
            self.assertNotEqual(Node.IS_CHANGED(row['id'],'zh'),Node.IS_CHANGED(row['id'],'en'))

class StyleRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app=web.Application();app.add_routes(routes.routes)
        self.client=TestClient(TestServer(app));await self.client.start_server()
    async def asyncTearDown(self):await self.client.close()
    async def test_unified_and_legacy_catalogs_and_safe_range_assets(self):
        for endpoint,count in [('catalog',110),('motion_catalog',99),('style_catalog',74),('cinematic_catalog',173)]:
            response=await self.client.get('/cinematic_gallery/'+endpoint)
            self.assertEqual(response.status,200)
            data=await response.json();self.assertEqual(len(data['records']),count)
        for identifier in ('pan_right','style_risograph'):
            response=await self.client.get('/cinematic_gallery/cinematic_assets/video/'+identifier,headers={'Range':'bytes=128-255'})
            self.assertEqual(response.status,206)
            self.assertEqual(await response.read(),movies.asset(identifier,'video').read_bytes()[128:256])
            self.assertIn('128-255',response.headers['Content-Range'])
        for suffix in ['video/style_unknown','poster/style_unknown','video/%2e%2e%2fREADME','other/style_risograph']:
            self.assertEqual((await self.client.get('/cinematic_gallery/cinematic_assets/'+suffix)).status,404)
        self.assertEqual((await self.client.get('/cinematic_gallery/motion_assets/video/style_risograph')).status,404)
