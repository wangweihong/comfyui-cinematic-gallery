import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { filterRecords, randomReference, validMessage, local, t, messages, migrateMotionOutputs } from '../web/gallery_core.mjs';
const payload = JSON.parse(readFileSync(new URL('../library/catalog.json', import.meta.url)));
const motionPayload = JSON.parse(readFileSync(new URL('../library/motions/catalog.json', import.meta.url)));
const stylePayload = JSON.parse(readFileSync(new URL('../library/styles/catalog.json', import.meta.url)));
const moviePayload = {categories: [...motionPayload.categories, ...stylePayload.categories], records: [...motionPayload.records, ...stylePayload.records]};
for (const row of moviePayload.records) row.available = row.status === 'ready';

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
  assert.equal(t('title', 'en'), 'Photography Reference Gallery');
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
  const listeners = {}, body = [], opened = [];
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
    constructor() { this.widgets = [{ name: isMotion ? 'motion_id' : 'reference_id', value: isMotion ? 'pan_right' : 'camera_arri' }, { name: 'language', value: 'zh' }]; this.outputs = Array.from({ length: 5 }, () => ({})); this.title = type; this.type = type; }
    addDOMWidget(name, type, element, options) { this.box = element; this.options = options; }
    setSize() {} setDirtyCanvas() {}
  }
  const context = vm.createContext({ normalizeLanguage: value => value === 'en' ? 'en' : 'zh', local, t, validMessage, migrateMotionOutputs,
    app: { registerExtension: value => { extension = value; }, graph: { change: () => { changes++; } } },
    api: { apiURL: path => '/prefix' + path }, fetch: async url => ({ ok: true, json: async () => url.includes('cinematic_catalog') ? moviePayload : payload }),
    document: { createElement: tag => new Element(tag), body: { append: element => body.push(element) } },
    window: { open: (...args) => { opened.push(args); }, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: name => { delete listeners[name]; } },
    location: { origin: 'http://localhost' },
  });
  const source = readFileSync(new URL('../web/cinematic_gallery.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  vm.runInContext(source, context);
  await extension.beforeRegisterNodeDef(Node, { name: type });
  const node = new Node(); node.onNodeCreated();
  await new Promise(resolve => setImmediate(resolve));
  return { node, extension, get changes() { return changes; }, body, listeners, opened, open: () => node.box.children[2].events.click(),
    send: async (data, origin = 'http://localhost', source) => listeners.message?.({ data, origin, source: source ?? body.at(-1).children[1].contentWindow }) };
}
test('top toolbar opens the prefixed movie gallery without changing workflow or node selection', async () => {
  const f = await fixture();
  assert.equal(f.extension.actionBarButtons.length, 1);
  const button = f.extension.actionBarButtons[0];
  assert.equal(button.label, '电影参考');
  button.onClick();
  assert.deepEqual(f.opened[0], ['/prefix/cinematic_gallery/gallery?kind=motion', '_blank', 'noopener,noreferrer']);
  assert.equal(f.node.widgets[0].value, 'camera_arri');
  assert.equal(f.changes, 0);
  assert.equal(f.body.length, 0);
});
test('preview, language and selection restore from serialized inputs without queueing or graph edits', async () => {
  const fixtureData = await fixture(), { node } = fixtureData;
  const image = node.box.children[1].children[0];
  assert.equal(image.src, '/prefix/cinematic_gallery/assets/camera_arri');
  node.onConfigure({ widgets_values: ['lighting_rembrandt', 'en'] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node.widgets[0].value, 'lighting_rembrandt'); assert.equal(node.widgets[1].value, 'en');
  assert.equal(image.src, '/prefix/cinematic_gallery/assets/lighting_rembrandt');
  assert.equal(node.title, 'Photography Reference'); assert.equal(fixtureData.changes, 0);
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
  assert.equal(usable.length, 40);
  for (let index = 0; index < 30; index++) assert.equal(randomReference(motionPayload.records).status, 'ready');
});
test('movie nodes restore five localized ports, use video previews and reject static selections', async () => {
  const f = await fixture('CinematicMotionGallery');
  assert.equal(f.node.outputs.length, 5);
  assert.equal(f.node.box.children[1].children[0].tagName, 'video');
  f.node.onConfigure({widgets_values:['truck_right','en']});
  assert.equal(f.node.widgets[0].value, 'truck_right');
  assert.equal(f.node.widgets[1].value, 'en');
  assert.equal(f.node.title, 'Cinematic Reference');
  assert.equal(f.node.box.children[1].children[0].src, '/prefix/cinematic_gallery/cinematic_assets/video/truck_right');
  f.open();
  await f.send({type:'cinematic-gallery-select',id:'camera_arri',kind:'reference'});
  assert.equal(f.node.widgets[0].value, 'truck_right');
  await f.send({type:'cinematic-gallery-select',id:'pan_right',kind:'motion'});
  assert.equal(f.node.widgets[0].value, 'pan_right');
  f.node.onRemoved();
});


test('all requested common shot names resolve to completed references', () => {
  const names = ['摇镜','移镜','横移','升降镜','环绕镜','变焦推拉','手持抖动','甩镜','主观镜头','无人机航拍','光学变焦','前跟镜','侧跟镜','过肩镜','低角度','高角度','虫眼视角','旋转镜','鸟瞰顶拍','遮挡揭示','穿越镜头','拉焦切换','子弹时间','贴地穿越','螺旋上升','环绕下降','低角揭示','跟随推进','低弧绕行'];
  for (const name of names) {
    const rows = filterRecords(motionPayload.records, 'all', name);
    assert.ok(rows.length > 0, name);
    assert.ok(rows.some(row => row.status === 'ready'), name);
  }
});
test('legacy bilingual output links migrate to five ports without disconnecting consumers', () => {
  for (const map of [false, true]) {
    const links = Array.from({length: 8}, (_,index) => ({id:index + 1,origin_slot:index,origin_id:12,target_id:20+index,target_slot:0}));
    const node = {outputs:links.map(link=>({links:[link.id]})), graph:{links:map ? new Map(links.map(link=>[link.id,link])) : Object.fromEntries(links.map(link=>[link.id,link]))}};
    assert.equal(migrateMotionOutputs(node),true);
    assert.deepEqual(node.outputs.map(output=>output.name), ['prompt','image','description','example_prompt','video']);
    assert.deepEqual(links.map(link=>link.origin_slot),[0,0,1,2,2,3,3,4]);
    assert.equal(node.outputs.flatMap(output=>output.links??[]).length,8);
    assert.equal(migrateMotionOutputs(node),false);
  }
});


test('loadedGraphNode upgrades old movie nodes and renders only the selected language', async () => {
  const f = await fixture('CinematicMotionGallery');
  f.node.widgets[1].callback('en');
  const links = Array.from({length:8},(_,index)=>({id:index+1,origin_slot:index}));
  f.node.outputs = links.map(link=>({links:[link.id]}));
  f.node.graph = {links:Object.fromEntries(links.map(link=>[link.id,link]))};
  f.extension.loadedGraphNode(f.node);
  assert.equal(f.node.outputs.length,5);
  assert.equal(f.node.title,'Cinematic Reference');
  assert.deepEqual(f.node.outputs.map(output=>output.label),['Prompt','Poster','Description','Complete example','Video']);
  assert.deepEqual(links.map(link=>link.origin_slot),[0,0,1,2,2,3,3,4]);
});


test('style references restore into the same five-port movie node and remain isolated', async () => {
  const f = await fixture('CinematicMotionGallery');
  const other = await fixture('CinematicMotionGallery');
  f.node.onConfigure({widgets_values:['style_risograph','en']});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.node.widgets[0].label,'Reference ID');
  assert.equal(f.node.box.children[0].textContent,'Risograph Animation');
  assert.match(f.node.box.children[1].children[0].src,/cinematic_assets\/video\/style_risograph$/);
  assert.deepEqual(f.node.outputs.map(output=>output.label),['Prompt','Poster','Description','Complete example','Video']);
  f.open();
  assert.match(f.body.at(-1).children[1].src,/group=style/);
  await f.send({type:'cinematic-gallery-select',id:'style_unknown',kind:'motion'});
  assert.equal(f.node.widgets[0].value,'style_risograph');
  await f.send({type:'cinematic-gallery-select',id:'style_halftone_pop',kind:'motion',language:'zh'});
  assert.equal(f.node.widgets[0].value,'style_halftone_pop');
  assert.equal(f.node.outputs[0].label,'提示词');
  assert.equal(other.node.widgets[0].value,'pan_right');
  assert.equal(other.changes,0);
});
test('style search includes distinctions and shared papercraft aliases without mixing motion records', () => {
  assert.equal(stylePayload.records.length,74);
  assert.equal(filterRecords(stylePayload.records,'all','荧光纸艺拼贴').length,2);
  assert.ok(filterRecords(stylePayload.records,'all','Risograph').some(row=>row.id==='style_risograph'));
  assert.ok(filterRecords(stylePayload.records,'all','Wood effect').some(row=>row.id==='style_bw_infrared'));
  assert.equal(filterRecords(stylePayload.records,'all','no-such-style').length,0);
  assert.equal(filterRecords(motionPayload.records,'all','style_risograph').length,0);
});
