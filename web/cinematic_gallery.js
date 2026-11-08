import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { normalizeLanguage, local, t, validMessage, migrateMotionOutputs } from './gallery_core.mjs';

const catalogRequests = new Map();
function getCatalog(kind = 'reference') {
  if (!catalogRequests.has(kind)) catalogRequests.set(kind, fetch(api.apiURL(kind === 'motion' ? '/cinematic_gallery/cinematic_catalog' : '/cinematic_gallery/catalog')).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).catch(error => { catalogRequests.delete(kind); throw error; }));
  return catalogRequests.get(kind);
}
app.registerExtension({
  name: 'comfyui-cinematic-gallery.browser',
  actionBarButtons: [{
    icon: 'pi pi-video',
    label: '电影参考',
    tooltip: '浏览电影运镜与艺术风格参考图库',
    onClick() {
      window.open(api.apiURL('/cinematic_gallery/gallery?kind=motion'), '_blank', 'noopener,noreferrer');
    },
  }],
  loadedGraphNode(node) {
    if ((node.comfyClass ?? node.type) === 'CinematicMotionGallery') { migrateMotionOutputs(node); node.cinematicRenderLanguage?.(); }
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!['CinematicGallery', 'CinematicMotionGallery'].includes(nodeData.name)) return;
    const isMotion = nodeData.name === 'CinematicMotionGallery';
    const kind = isMotion ? 'motion' : 'reference';
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      const node = this;
      const idWidget = node.widgets.find(widget => widget.name === (isMotion ? 'motion_id' : 'reference_id'));
      const languageWidget = node.widgets.find(widget => widget.name === 'language');
      let language = normalizeLanguage(languageWidget.value), dialog, frame, heading, done, request = 0, removed = false;
      let selectedRow = null, imageError = false;
      const box = document.createElement('div');
      box.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;gap:10px;font:12px/1.5 sans-serif;color:#171a21;background:#f5f7fb;padding:12px;border-radius:10px;box-sizing:border-box;overflow:hidden;';
      const name = document.createElement('strong'); name.style.cssText = 'font-size:14px;flex-shrink:0;';
      const imageBox = document.createElement('div'); imageBox.style.cssText = 'position:relative;flex:1;min-height:100px;display:grid;place-items:center;background:#eceef4;border-radius:8px;overflow:hidden;';
      const image = document.createElement(isMotion ? 'video' : 'img'); image.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;object-fit:contain;';
      if (isMotion) { image.controls = true; image.muted = true; image.loop = true; image.playsInline = true; image.preload = 'metadata'; }
      const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      status.style.cssText = 'position:relative;margin:15px;color:#8b2e2e;text-align:center;overflow-wrap:anywhere;';
      const browse = document.createElement('button'); browse.type = 'button';
      browse.style.cssText = 'width:100%;min-height:38px;flex-shrink:0;background:#5b5bd6;border:0;border-radius:8px;color:white;cursor:pointer;font:600 12px sans-serif;';
      imageBox.append(image, status); box.append(name, imageBox, browse);
      function renderLanguage() {
        languageWidget.value = language; languageWidget.label = t('nodeLanguage', language); idWidget.label = t(isMotion ? 'motionId' : 'nodeId', language);
        browse.textContent = t(isMotion ? 'motionBrowse' : 'nodeBrowse', language);
        name.textContent = selectedRow ? local(selectedRow, 'name', language) : String(idWidget.value);
        image.alt = name.textContent;
        if (isMotion) image.setAttribute('aria-label', name.textContent);
        if (imageError) status.textContent = `${t(isMotion ? 'missingVideo' : 'missing', language)} (${idWidget.value})`;
        const labels = isMotion ? language === 'zh' ? ['提示词', '封面', '说明', '完整示例', '视频'] : ['Prompt', 'Poster', 'Description', 'Complete example', 'Video'] : language === 'zh' ? ['中文提示词', '英文提示词', '参考图', '中文说明', '英文说明'] : ['Chinese prompt', 'English prompt', 'Reference image', 'Chinese description', 'English description'];
        node.outputs?.forEach((output, index) => { output.label = labels[index] ?? output.name; });
        if (['CinematicGallery', 'Cinematic Gallery', 'Cinematic Gallery 电影参考图库', 'CinematicMotionGallery', 'Cinematic Motion Gallery', 'Cinematic Motion Gallery 电影运镜图库', '摄影参考', '电影参考', 'Photography Reference', 'Cinematic Reference'].includes(node.title)) node.title = isMotion ? language === 'zh' ? '电影参考' : 'Cinematic Reference' : language === 'zh' ? '摄影参考' : 'Photography Reference';
        if (heading) heading.textContent = t(isMotion ? 'motionTitle' : 'title', language);
        if (done) done.textContent = t('close', language);
        if (frame) frame.title = t(isMotion ? 'motionTitle' : 'title', language);
        node.setDirtyCanvas(true, true);
      }
      node.cinematicRenderLanguage = renderLanguage;
      async function update() {
        const revision = ++request, id = String(idWidget.value);
        selectedRow = null; imageError = false; image.hidden = false; status.textContent = '';
        renderLanguage();
        image.onload = image.onloadeddata = () => { if (!removed && revision === request) { status.textContent = ''; image.hidden = false; } };
        image.onerror = () => { if (!removed && revision === request) { image.hidden = true; imageError = true; renderLanguage(); } };
        if (isMotion) image.pause();
        image.src = api.apiURL(isMotion ? `/cinematic_gallery/cinematic_assets/video/${encodeURIComponent(id)}` : `/cinematic_gallery/assets/${encodeURIComponent(id)}`);
        try {
          const payload = await getCatalog(kind);
          if (removed || revision !== request) return;
          selectedRow = payload.records.find(row => row.id === id) ?? null; renderLanguage();
        } catch { /* Image errors remain visible; metadata can be retried by browsing. */ }
      }
      function close() {
        window.removeEventListener('message', receive); dialog?.remove(); dialog = frame = heading = done = null;
      }
      function setLanguage(next, notifyFrame = false) {
        const previous = language; language = normalizeLanguage(next); renderLanguage();
        if (notifyFrame) frame?.contentWindow.postMessage({ type: 'cinematic-gallery-current', id: idWidget.value, language, kind }, location.origin);
        if (language !== previous) app.graph.change();
      }
      async function receive(event) {
        if (!validMessage(event, frame?.contentWindow, location.origin)) return;
        const data = event.data;
        if (data.type === 'cinematic-gallery-ready') {
          frame.contentWindow.postMessage({ type: 'cinematic-gallery-current', id: idWidget.value, language, kind }, location.origin);
        } else if (data.type === 'cinematic-gallery-language' && ['zh', 'en'].includes(data.language)) {
          setLanguage(data.language);
        } else if (data.type === 'cinematic-gallery-select' && typeof data.id === 'string' && (data.kind ?? 'reference') === kind) {
          const source = frame.contentWindow;
          let row;
          try { row = (await getCatalog(kind)).records.find(item => item.id === data.id && item.available !== false); } catch { return; }
          if (!row || removed || source !== frame?.contentWindow) return;
          idWidget.value = row.id;
          if (['zh', 'en'].includes(data.language)) setLanguage(data.language);
          idWidget.callback?.(row.id); node.setDirtyCanvas(true, true); app.graph.change(); close();
        }
      }
      browse.addEventListener('click', () => {
        if (dialog) return;
        dialog = document.createElement('dialog');
        dialog.style.cssText = 'width:96vw;height:94vh;max-width:1800px;max-height:96vh;padding:0;border:1px solid #d6dbe5;border-radius:13px;background:#f5f7fb;overflow:hidden;';
        const header = document.createElement('div'); header.style.cssText = 'height:46px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 18px;background:white;border-bottom:1px solid #e5e8ef;color:#171a21;font:13px sans-serif;';
        heading = document.createElement('strong'); done = document.createElement('button');
        done.style.cssText = 'cursor:pointer;padding:5px 15px;border:1px solid #d6dbe5;border-radius:7px;background:white;color:#5d6472;';
        done.onclick = close; header.append(heading, done);
        frame = document.createElement('iframe'); frame.src = api.apiURL(`/cinematic_gallery/gallery?lang=${language}&kind=${kind}&target=${kind}&id=${encodeURIComponent(idWidget.value)}&group=${isMotion && String(idWidget.value).startsWith('style_') ? 'style' : 'motion'}`);
        frame.style.cssText = 'width:100%;height:calc(100% - 46px);border:0;';
        dialog.append(header, frame); renderLanguage();
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
        window.addEventListener('message', receive); document.body.append(dialog); dialog.showModal();
      });
      const idCallback = idWidget.callback;
      idWidget.callback = function () { idCallback?.apply(this, arguments); update(); };
      const languageCallback = languageWidget.callback;
      languageWidget.callback = function (next) { languageCallback?.apply(this, arguments); setLanguage(next, true); };
      node.addDOMWidget('cinematic_gallery_preview', 'html', box, { serialize: false, hideOnZoom: false, getMinHeight: () => 250, getMaxHeight: () => 450 });
      const configure = node.onConfigure;
      node.onConfigure = function (config) {
        configure?.apply(this, arguments);
        // Persist only the two standard inputs; the preview DOM never adds widget values.
        if (typeof config?.widgets_values?.[0] === 'string') idWidget.value = config.widgets_values[0];
        if (['zh', 'en'].includes(config?.widgets_values?.[1])) languageWidget.value = config.widgets_values[1];
        language = normalizeLanguage(languageWidget.value); update();
      };
      const remove = node.onRemoved;
      node.onRemoved = function () { removed = true; request++; if (isMotion) { image.pause(); image.removeAttribute('src'); image.load(); } close(); remove?.apply(this, arguments); };
      node.setSize([390, 470]); update(); return result;
    };
  },
});
