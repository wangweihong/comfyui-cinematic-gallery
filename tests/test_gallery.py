import hashlib
import importlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import torch
from PIL import Image
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from support import ROOT, load_plugin

plugin = load_plugin()
catalog = importlib.import_module(plugin.__name__ + '.catalog')
routes = importlib.import_module(plugin.__name__ + '.routes')
Node = plugin.NODE_CLASS_MAPPINGS['CinematicGallery']

class LibraryTests(unittest.TestCase):
    def test_complete_unique_catalog_matches_every_bundled_image_and_hash(self):
        payload = catalog.catalog()
        self.assertEqual(len(payload['categories']), 10)
        self.assertEqual(len(payload['records']), 110)
        self.assertEqual(len({row['id'] for row in payload['records']}), 110)
        source = json.loads((ROOT / 'library/SOURCE.json').read_text())
        self.assertEqual({row['image'] for row in payload['records']}, {path.name for path in (ROOT / 'library/images').iterdir()})
        for row in payload['records']:
            with self.subTest(id=row['id']):
                for key in catalog.TEXT_FIELDS:
                    self.assertTrue(row[key].strip())
                self.assertRegex(row['prompt_zh'], '[\u3400-\u9fff]')
                self.assertEqual(hashlib.sha256(catalog.image_path(row['id']).read_bytes()).hexdigest(), source['images_sha256'][row['image']])
                with Image.open(catalog.image_path(row['id'])) as image:
                    image.verify()

    def test_all_five_node_outputs_correspond_to_each_selected_reference(self):
        self.assertEqual(Node.RETURN_TYPES, ('STRING', 'STRING', 'IMAGE', 'STRING', 'STRING'))
        for row in catalog.catalog()['records']:
            with self.subTest(id=row['id']):
                output = Node().load_reference(row['id'])
                self.assertEqual(output[:2], (row['prompt_zh'], row['prompt_en']))
                self.assertEqual(output[3:], (row['description_zh'], row['description_en']))
                image = output[2]
                self.assertIsInstance(image, torch.Tensor)
                self.assertEqual(image.dtype, torch.float32)
                with Image.open(catalog.image_path(row['id'])) as source:
                    self.assertEqual(tuple(image.shape), (1, source.height, source.width, 3))
                    np.testing.assert_array_equal(image.numpy()[0], np.asarray(source.convert('RGB'), dtype=np.float32) / 255)
                self.assertGreaterEqual(float(image.min()), 0)
                self.assertLessEqual(float(image.max()), 1)

    def test_ui_language_never_changes_bilingual_outputs_or_fingerprint(self):
        zh = Node().load_reference('camera_arri', 'zh')
        en = Node().load_reference('camera_arri', 'en')
        self.assertEqual(zh[:2] + zh[3:], en[:2] + en[3:])
        self.assertTrue(torch.equal(zh[2], en[2]))
        self.assertEqual(Node.IS_CHANGED('camera_arri', 'zh'), Node.IS_CHANGED('camera_arri', 'en'))
        self.assertIs(Node.VALIDATE_INPUTS('camera_arri'), True)

    def test_invalid_ids_cannot_access_files_outside_the_catalog(self):
        for reference_id in ['../README', '/etc/passwd', 'camera_arri.jpg', '%2e%2e%2f', '', 'unknown']:
            with self.subTest(id=reference_id):
                self.assertIsInstance(Node.VALIDATE_INPUTS(reference_id), str)
                with self.assertRaises(ValueError): Node().load_reference(reference_id)

    def test_missing_corrupt_symlink_and_replaced_images_are_handled(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shutil.copy(ROOT / 'library/catalog.json', root / 'catalog.json')
            (root / 'images').mkdir()
            path = root / 'images/camera_arri.jpg'
            with patch.object(catalog, 'LIBRARY', root):
                catalog.catalog.cache_clear()
                try:
                    self.assertIn('Missing reference', Node.VALIDATE_INPUTS('camera_arri'))
                    self.assertFalse(next(row for row in catalog.browser_catalog()['records'] if row['id'] == 'camera_arri')['available'])
                    with self.assertRaises(FileNotFoundError): Node().load_reference('camera_arri')
                    path.write_bytes(b'not an image')
                    with self.assertRaisesRegex(ValueError, 'Cannot decode'): Node().load_reference('camera_arri')
                    path.unlink()
                    path.symlink_to(ROOT / 'library/images/camera_arri.jpg')
                    with self.assertRaisesRegex(ValueError, 'Unsafe image'): Node().load_reference('camera_arri')
                    path.unlink()
                    shutil.copy(ROOT / 'library/images/camera_arri.jpg', path)
                    before = Node.IS_CHANGED('camera_arri')
                    Image.new('RGB', (2, 3), 'red').save(path)
                    self.assertNotEqual(Node.IS_CHANGED('camera_arri'), before)
                    self.assertEqual(tuple(Node().load_reference('camera_arri')[2].shape), (1, 3, 2, 3))
                finally: catalog.catalog.cache_clear()

    def test_registration_is_isolated(self):
        self.assertEqual(set(plugin.NODE_CLASS_MAPPINGS), {'CinematicGallery', 'CinematicMotionGallery'})
        self.assertFalse({'CinematicPromptNode', 'CinematicLoaderNode', 'PoseGallery'} & set(plugin.NODE_CLASS_MAPPINGS))
        self.assertEqual(set(Node.INPUT_TYPES()['required']), {'reference_id', 'language'})
        self.assertEqual(Node.INPUT_TYPES()['required']['reference_id'][1]['default'], 'camera_arri')
        self.assertTrue(all(route.path.startswith('/cinematic_gallery/') for route in routes.routes))

class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app = web.Application()
        app.add_routes(routes.routes)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_catalog_page_and_assets(self):
        response = await self.client.get('/cinematic_gallery/catalog')
        self.assertEqual(response.status, 200)
        self.assertEqual(len((await response.json())['records']), 110)
        for path in ['gallery', 'ui/gallery.css', 'ui/gallery.mjs', 'ui/gallery_core.mjs', 'assets/camera_arri']:
            response = await self.client.get('/cinematic_gallery/' + path)
            self.assertEqual(response.status, 200, path)
        response = await self.client.get('/cinematic_gallery/assets/camera_arri')
        self.assertEqual(await response.read(), catalog.image_path('camera_arri').read_bytes())

    async def test_allowlists_and_read_only_routes(self):
        for path in ['ui/cinematic_gallery.js', 'ui/README.md', 'assets/unknown', 'assets/camera_arri.jpg', 'assets/%2e%2e%2fREADME.md']:
            response = await self.client.get('/cinematic_gallery/' + path)
            self.assertEqual(response.status, 404, path)
        response = await self.client.post('/cinematic_gallery/catalog', json={})
        self.assertEqual(response.status, 405)

if __name__ == '__main__': unittest.main()
