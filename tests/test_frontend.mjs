import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { filterRecords, randomReference, validMessage, local, t, messages } from '../web/gallery_core.mjs';
const payload = JSON.parse(readFileSync(new URL('../library/catalog.json', import.meta.url)));
const motionPayload = JSON.parse(readFileSync(new URL('../library/motions/catalog.json', import.meta.url)));
for (const row of motionPayload.records) row.available = row.status === 'ready';

test('filters search all bilingual fields and stable IDs, including empty results', () => {
  assert.equal(filterRecords(payload.records, 'all').length, 110);
  assert.equal(filterRecords(payload.records, 'camera').length, 7);
  assert.equal(filterRecords(payload.records, 'all', '伦勃朗')[0].id, 'lighting_rembrandt');
  assert.equal(filterRecords(payload.records, 'all', 'REMBrandt')[0].id, 'lighting_rembrandt');
  assert.equal(filterRecords(payload.records, 'all', 'camera_arri')[0].id, 'camera_arri');
  assert.equal(filterRecords(payload.records, 'camera', 'lighting_rembrandt').length, 0);
  assert.equal(filterRecords(payload.records, 'all', 'no-such-reference').length, 0);
});
test('random selection respects filters and unavailable images, avoiding the current entry', () => {
  const pool = filterRecords(payload.records, 'camera');
  for (let index = 0; index < 100; index++) {
    const row = randomReference(pool, 'camera_arri');
    assert.equal(row.category, 'camera'); assert.notEqual(row.id, 'camera_arri');
  }
  assert.equal(randomReference([], 'camera_arri'), null);
  assert.equal(randomReference([{ ...pool[0], available: false }]), null);
  assert.equal(randomReference([pool[0]], pool[0].id).id, pool[0].id);
});
test('translations cover every visible UI string, with a distinct namespace and no external media', () => {
  assert.equal(local(payload.records[0], 'name', 'en'), payload.records[0].name_en);
  assert.equal(t('title', 'en'), 'Cinematic Gallery');
  for (const path of ['gallery.html', 'gallery.mjs', 'cinematic_gallery.js', 'gallery.css']) {
    const source = readFileSync(new URL('../web/' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(source.replaceAll('http://www.w3.org/2000/svg', ''), /https?:\/\//);
    assert.doesNotMatch(source, /queuePrompt|\/prompt\b|pose_gallery\//);
    for (const match of source.matchAll(/data-(?:text|label|placeholder)="([^"]+)"/g)) {
      assert.equal(messages[match[1]]?.length, 2, match[1]);
    }
  }
});

async function fixture(type = 'CinematicGallery') {
  const isMotion = type === 'CinematicMotionGallery';
  let extension, changes = 0;
  const listeners = {}, body = [];
  class Element {
    constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.events = {}; this.contentWindow = { postMessage: (...data) => { this.sent = data; } }; }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    showModal() { this.open = true; }
    remove() { this.removed = true; }
    pause() {} load() {} removeAttribute(name) { delete this[name]; }
  }
  class Node {
    constructor() { this.widgets = [{ name: isMotion ? 'motion_id' : 'reference_id', value: isMotion ? 'pan_right' : 'camera_arri' }, { name: 'language', value: 'zh' }]; this.outputs = Array.from({ length: isMotion ? 8 : 5 }, () => ({})); this.title = type; }
    addDOMWidget(name, type, element, options) { this.box = element; this.options = options; }
    setSize() {} setDirtyCanvas() {}
  }
  const context = vm.createContext({ normalizeLanguage: value => value === 'en' ? 'en' : 'zh', local, t, validMessage,
    app: { registerExtension: value => { extension = value; }, graph: { change: () => { changes++; } } },
    api: { apiURL: path => '/prefix' + path }, fetch: async url => ({ ok: true, json: async () => url.includes('motion_catalog') ? motionPayload : payload }),
    document: { createElement: tag => new Element(tag), body: { append: element => body.push(element) } },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: name => { delete listeners[name]; } },
    location: { origin: 'http://localhost' },
  });
  const source = readFileSync(new URL('../web/cinematic_gallery.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  vm.runInContext(source, context);
  await extension.beforeRegisterNodeDef(Node, { name: type });
  const node = new Node(); node.onNodeCreated();
  await new Promise(resolve => setImmediate(resolve));
  return { node, extension, get changes() { return changes; }, body, listeners, open: () => node.box.children[2].events.click(),
    send: async (data, origin = 'http://localhost', source) => listeners.message?.({ data, origin, source: source ?? body.at(-1).children[1].contentWindow }) };
}
test('preview, language and selection restore from serialized inputs without queueing or graph edits', async () => {
  const fixtureData = await fixture(), { node } = fixtureData;
  const image = node.box.children[1].children[0];
  assert.equal(image.src, '/prefix/cinematic_gallery/assets/camera_arri');
  node.onConfigure({ widgets_values: ['lighting_rembrandt', 'en'] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node.widgets[0].value, 'lighting_rembrandt'); assert.equal(node.widgets[1].value, 'en');
  assert.equal(image.src, '/prefix/cinematic_gallery/assets/lighting_rembrandt');
  assert.equal(node.title, 'Cinematic Gallery'); assert.equal(fixtureData.changes, 0);
  assert.equal(node.options.serialize, false);
});
test('only an allowlisted selection from the same-origin active frame changes the node', async () => {
  const f = await fixture(); f.open();
  await f.send({ type: 'cinematic-gallery-select', id: 'lighting_rembrandt' }, 'http://evil.test');
  await f.send({ type: 'cinematic-gallery-select', id: 'lighting_rembrandt' }, undefined, {});
  await f.send({ type: 'cinematic-gallery-select', id: '../README' });
  await f.send({ type: 'cinematic-gallery-preview', id: 'lighting_rembrandt' });
  assert.equal(f.node.widgets[0].value, 'camera_arri'); assert.equal(f.changes, 0);
  await f.send({ type: 'cinematic-gallery-ready' });
  assert.equal(f.body.at(-1).children[1].sent[0].id, 'camera_arri');
  await f.send({ type: 'cinematic-gallery-select', id: 'lighting_rembrandt', language: 'en' });
  assert.equal(f.node.widgets[0].value, 'lighting_rembrandt'); assert.equal(f.node.widgets[1].value, 'en');
  assert.equal(f.body.at(-1).removed, true); assert.equal(f.listeners.message, undefined);
});
test('stale image requests cannot overwrite a newer choice and node removal cleans up the dialog', async () => {
  const f = await fixture(), image = f.node.box.children[1].children[0], stale = image.onerror;
  f.node.widgets[0].value = 'lighting_rembrandt'; f.node.widgets[0].callback();
  stale(); assert.equal(image.hidden, false);
  image.onerror(); assert.equal(image.hidden, true);
  assert.match(f.node.box.children[1].children[1].textContent, /lighting_rembrandt/);
  f.open(); f.node.onRemoved(); assert.equal(f.listeners.message, undefined); assert.equal(f.body.at(-1).removed, true);
});
test('unrelated ToolBox and Pose Gallery node types are not patched', async () => {
  const f = await fixture();
  for (const name of ['CinematicPromptNode', 'CinematicLoaderNode', 'CinematicPromptNodeCN', 'CinematicLoaderNodeCN', 'PoseGallery']) {
    class OtherNode { onNodeCreated() {} }
    const original = OtherNode.prototype.onNodeCreated;
    await f.extension.beforeRegisterNodeDef(OtherNode, {name});
    assert.equal(OtherNode.prototype.onNodeCreated, original, name);
  }
});

test('motion search includes aliases, example scenes and uses while random excludes pending videos', () => {
  assert.equal(motionPayload.records.length, 40);
  assert.equal(filterRecords(motionPayload.records, 'all', '希区柯克变焦')[0].id, 'dolly_zoom');
  assert.equal(filterRecords(motionPayload.records, 'all', 'German automotive')[0].id, 'key_handoff');
  assert.equal(filterRecords(motionPayload.records, 'all', 'plant a clue')[0].id, 'key_handoff');
  const usable = motionPayload.records.filter(row => row.available);
  assert.equal(usable.length, 12);
  for (let index = 0; index < 30; index++) assert.equal(randomReference(motionPayload.records).status, 'ready');
});
test('motion nodes restore eight ports, use video previews and reject static or pending selections', async () => {
  const f = await fixture('CinematicMotionGallery');
  assert.equal(f.node.outputs.length, 8);
  assert.equal(f.node.box.children[1].children[0].tagName, 'video');
  f.node.onConfigure({widgets_values:['truck_right','en']});
  assert.equal(f.node.widgets[0].value, 'truck_right');
  assert.equal(f.node.widgets[1].value, 'en');
  assert.equal(f.node.title, 'Cinematic Motion Gallery');
  assert.equal(f.node.box.children[1].children[0].src, '/prefix/cinematic_gallery/motion_assets/video/truck_right');
  f.open();
  await f.send({type:'cinematic-gallery-select',id:'camera_arri',kind:'reference'});
  await f.send({type:'cinematic-gallery-select',id:'handheld',kind:'motion'});
  assert.equal(f.node.widgets[0].value, 'truck_right');
  await f.send({type:'cinematic-gallery-select',id:'pan_right',kind:'motion'});
  assert.equal(f.node.widgets[0].value, 'pan_right');
  f.node.onRemoved();
});
