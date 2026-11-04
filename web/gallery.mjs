import { DEFAULT_ID, normalizeLanguage, local, t, filterRecords, randomReference, validMessage } from './gallery_core.mjs';
const $ = id => document.getElementById(id);
const embedded = window.parent !== window;
const params = new URLSearchParams(location.search);
const base = new URL('../', import.meta.url);
const endpoint = path => new URL(path, base).href;
let kind = params.get('kind') === 'motion' ? 'motion' : 'reference';
let targetKind = embedded ? (params.get('target') === 'motion' ? 'motion' : 'reference') : null;
let language = normalizeLanguage(params.get('lang'));
const states = { reference: { category: 'all', query: '', selectedId: DEFAULT_ID }, motion: { category: 'all', query: '', selectedId: 'pan_right' } };
const catalogs = new Map();
let payload = { categories: [], records: [] }, activeId = null, loading = true, failed = false, mediaReady = false, imageRequest = 0, loadRequest = 0;
const viewer = $('viewer'), video = $('viewer-video');
const state = () => states[kind];
const motion = () => kind === 'motion';
const currentRecords = () => filterRecords(payload.records, state().category, state().query);
const getRecord = id => payload.records.find(row => row.id === id);
const imageURL = id => endpoint(motion() ? `motion_assets/poster/${encodeURIComponent(id)}` : `assets/${encodeURIComponent(id)}`);
const videoURL = id => endpoint(`motion_assets/video/${encodeURIComponent(id)}`);
const post = data => { if (embedded) window.parent.postMessage({ ...data, kind }, location.origin); };
function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function renderLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t(motion() ? 'motionTitle' : 'title', language);
  document.querySelectorAll('[data-text]').forEach(item => { item.textContent = t(item.dataset.text, language); });
  const text = (selector, key) => document.querySelector(selector).textContent = t(key, language);
  text('h1', motion() ? 'motionTitle' : 'title'); text('.tagline', motion() ? 'motionSubtitle' : 'subtitle'); text('.intro', motion() ? 'motionIntro' : 'intro');
  text('.stats div:first-child span', motion() ? 'motionCount' : 'referenceCount');
  text('#results-text', motion() ? 'motionResults' : 'results'); text('.footer>span:first-child', motion() ? 'motionFooter' : 'footer');
  text('#copy-zh', 'copy'); text('#copy-en', 'copy');
  $('copy-zh').previousElementSibling.textContent = t(motion() ? 'prompt' : 'promptZh', language);
  $('copy-en').previousElementSibling.textContent = t('promptEn', language);
  $('copy-en').closest('.prompt-box').hidden = motion();
  $('copy-example-zh').previousElementSibling.textContent = t('example', language);
  document.querySelector('.brand strong').textContent = language === 'zh' ? motion() ? '电影参考' : '摄影参考' : motion() ? 'CINEMATIC' : 'PHOTOGRAPHY';
  document.querySelector('.brand small').textContent = language === 'zh' ? motion() ? '镜头与运镜' : '光线 · 构图 · 风格' : 'REFERENCE GALLERY';
  document.querySelector('.hero .eyebrow').textContent = language === 'zh' ? motion() ? '镜头语言' : '摄影语言' : motion() ? 'THE ART OF MOVEMENT' : 'THE ART OF SEEING';
  $('download').textContent = t(motion() ? 'downloadVideo' : 'download', language);
  $('use').textContent = t(targetKind && targetKind !== kind ? 'wrongNode' : motion() ? embedded ? 'useMotion' : 'chooseMotion' : embedded ? 'use' : 'choose', language);
  document.querySelectorAll('[data-placeholder]').forEach(item => { item.placeholder = t(item.dataset.placeholder, language); item.setAttribute('aria-label', item.placeholder); });
  document.querySelectorAll('[data-label]').forEach(item => item.setAttribute('aria-label', t(item.dataset.label, language)));
  for (const lang of ['zh', 'en']) $('lang-' + lang).setAttribute('aria-pressed', String(lang === language));
  for (const type of ['reference', 'motion']) $('domain-' + type).setAttribute('aria-pressed', String(type === kind));
}
function renderCategories() {
  const counts = new Map(payload.categories.map(row => [row.id, payload.records.filter(item => item.category === row.id).length]));
  $('categories').replaceChildren(...[{ id: 'all', name_zh: t(motion() ? 'allMotions' : 'all', 'zh'), name_en: t(motion() ? 'allMotions' : 'all', 'en') }, ...payload.categories].map(row => {
    const button = element('button', 'category-tab'); button.type = 'button'; button.dataset.category = row.id;
    button.setAttribute('aria-pressed', String(state().category === row.id));
    button.append(element('strong', '', local(row, 'name', language)), element('span', '', String(counts.get(row.id) ?? payload.records.length)));
    button.onclick = () => { state().category = row.id; renderCategories(); renderGrid(); };
    return button;
  }));
}
function renderSelection() {
  const row = getRecord(state().selectedId);
  $('selection-label').textContent = row ? `${t('current', language)} · ${local(row, 'name', language)}` : '';
}
function renderGrid() {
  const records = currentRecords();
  $('reference-count').textContent = String(payload.records.length); $('category-count').textContent = String(payload.categories.length);
  $('result-count').textContent = String(records.length);
  $('ready-count').textContent = motion() ? `· ${records.filter(row => row.available).length} ${t('readyCount', language)}` : '';
  $('random').disabled = !records.some(row => row.available !== false); renderSelection();
  $('status').hidden = !loading && !failed && records.length > 0; $('status').replaceChildren();
  if (loading || failed || !records.length) {
    $('status').append(element('h2', '', t(loading ? 'loading' : failed ? 'loadError' : 'empty', language)));
    if (failed) { const retry = element('button', 'button', t('retry', language)); retry.onclick = () => load(true); $('status').append(retry); }
    else if (!loading) $('status').append(element('p', '', t('emptyHint', language)));
  }
  $('grid').replaceChildren(...records.map(row => {
    const pending = motion() && row.status !== 'ready';
    const card = element('button', `card${row.id === state().selectedId ? ' is-selected' : ''}`); card.type = 'button'; card.dataset.id = row.id;
    card.setAttribute('aria-label', `${t(motion() ? 'viewMotion' : 'view', language)} · ${local(row, 'name', language)}`);
    const stage = element('div', 'card-stage' + (pending ? ' pending-stage' : ''));
    if (pending) { stage.append(element('span', 'pending-symbol', '▷'), element('span', 'pending-badge', t('pending', language))); }
    else {
      const image = element('img'); image.loading = 'lazy'; image.decoding = 'async'; image.alt = local(row, 'name', language); image.src = imageURL(row.id);
      const error = element('span', 'image-error', t('missing', language)); error.hidden = true;
      image.onerror = () => { image.hidden = true; error.hidden = false; }; stage.append(image, error);
      if (motion()) stage.append(element('span', 'pending-badge', `▶ ${row.duration?.toFixed(2) ?? '—'}s · ${row.width ?? 576}×${row.height ?? 320}`));
    }
    const group = payload.categories.find(item => item.id === row.category);
    stage.append(element('span', 'card-badge', local(group, 'name', language)));
    if (row.id === state().selectedId) stage.append(element('span', 'selected-badge', `✓ ${t('selected', language)}`));
    const info = element('div', 'card-info');
    info.append(element('h2', '', local(row, 'name', language)));
    if (motion() && language === 'zh') {
      const aliases = (row.aliases ?? []).filter(alias => alias.length <= 7 && !row.name_zh.includes(alias)).slice(0, 2);
      if (aliases.length) info.append(element('p', 'alias-tags', aliases.join(' · ')));
    }
    if (!motion()) info.append(element('p', 'other-name', local(row, 'name', language === 'zh' ? 'en' : 'zh')));
    info.append(element('p', 'card-description', local(row, 'description', language)));
    const bottom = element('div', 'card-bottom'); bottom.append(element('code', '', row.id), element('span', '', `${t(motion() ? 'viewMotion' : 'view', language)} ↗`));
    info.append(bottom); card.append(stage, info); card.onclick = () => openReference(row.id); return card;
  }));
}
function stopVideo() { video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; }
function renderViewer(loadMedia = true) {
  const row = getRecord(activeId); if (!row) return;
  const pending = motion() && row.status !== 'ready';
  const group = payload.categories.find(item => item.id === row.category);
  $('viewer-category').textContent = local(group, 'name', language); $('viewer-title').textContent = local(row, 'name', language);
  $('viewer-other-name').textContent = local(row, 'name', language === 'zh' ? 'en' : 'zh'); $('viewer-id').textContent = row.id; $('viewer-other-name').hidden = motion();
  $('prompt-zh').textContent = motion() ? local(row, 'prompt', language) : row.prompt_zh; $('prompt-zh').lang = motion() ? language === 'zh' ? 'zh-CN' : 'en' : 'zh-CN'; $('prompt-en').textContent = row.prompt_en; $('description').textContent = local(row, 'description', language);
  $('example-zh-box').hidden = !motion(); $('example-en-box').hidden = true;
  $('example-zh').textContent = motion() ? local(row, 'example_prompt', language) : ''; $('example-zh').lang = language === 'zh' ? 'zh-CN' : 'en';
  $('use-cases-box').hidden = !motion(); $('use-cases').textContent = motion() ? local(row, 'use_cases', language) : '';
  $('download').href = motion() ? videoURL(row.id) : imageURL(row.id); $('download').download = (motion() ? row.video : row.image) ?? '';
  $('viewer-image').alt = local(row, 'name', language); video.setAttribute('aria-label', local(row, 'name', language)); $('copy-status').textContent = '';
  const records = currentRecords(), index = records.findIndex(item => item.id === row.id);
  $('viewer-position').textContent = index < 0 ? row.id : `${index + 1} / ${records.length}`;
  $('previous').disabled = $('next').disabled = records.length < 2 || index < 0;
  if (loadMedia) {
    mediaReady = false;
    const request = ++imageRequest; stopVideo();
    $('use').disabled = true; $('download').hidden = true; $('viewer-image').hidden = motion();
    $('image-status').textContent = t(pending ? 'pendingHint' : 'loading', language);
    if (pending) return;
    const media = motion() ? video : $('viewer-image');
    media.hidden = false;
    const loaded = () => {
      if (request !== imageRequest) return;
      mediaReady = true;
      $('image-status').textContent = ''; $('download').hidden = false;
      $('use').disabled = row.available === false || Boolean(targetKind && targetKind !== kind);
      if (motion() && viewer.open) video.play().catch(() => {});
    };
    const error = () => {
      if (request !== imageRequest) return;
      mediaReady = false;
      media.hidden = true; $('image-status').textContent = t(motion() ? 'missingVideo' : 'missing', language);
      $('use').disabled = true; $('download').hidden = true;
    };
    media.onload = loaded; media.onloadeddata = loaded; media.onerror = error;
    if (motion()) video.poster = imageURL(row.id);
    media.src = motion() ? videoURL(row.id) : imageURL(row.id);
  } else {
    $('use').disabled = pending || row.available === false || !mediaReady || Boolean(targetKind && targetKind !== kind);
    if (pending) $('image-status').textContent = t('pendingHint', language);
  }
}
function openReference(id) {
  if (!getRecord(id)) return;
  activeId = id;
  if (!viewer.open) { viewer.showModal(); document.body.style.overflow = 'hidden'; }
  renderViewer();
}
function closeViewer() { viewer.close(); }
viewer.addEventListener('close', () => { ++imageRequest; stopVideo(); document.body.style.overflow = ''; });
function navigate(step) {
  const records = currentRecords(), index = records.findIndex(row => row.id === activeId);
  if (index < 0 || records.length < 2) return;
  activeId = records[(index + step + records.length) % records.length].id; renderViewer();
}
function setLanguage(value, notify = true) {
  language = normalizeLanguage(value); renderLanguage(); renderCategories(); renderGrid(); if (activeId) renderViewer(false);
  if (notify) post({ type: 'cinematic-gallery-language', language });
}
async function load(refresh = false) {
  const request = ++loadRequest, requestedKind = kind;
  loading = true; failed = false; payload = { categories: [], records: [] }; renderGrid();
  try {
    let data = refresh ? null : catalogs.get(requestedKind);
    if (!data) {
      const response = await fetch(endpoint(requestedKind === 'motion' ? 'motion_catalog' : 'catalog'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json(); if (!Array.isArray(data.records) || !Array.isArray(data.categories)) throw new Error('Invalid catalog');
      catalogs.set(requestedKind, data);
    }
    if (request !== loadRequest) return; payload = data;
  } catch { if (request !== loadRequest) return; failed = true; }
  loading = false; renderCategories(); renderGrid();
}
async function setKind(next) {
  if (next === kind) return;
  if (viewer.open) closeViewer(); activeId = null; kind = next; $('search').value = state().query; renderLanguage(); await load();
}
$('domain-reference').onclick = () => setKind('reference'); $('domain-motion').onclick = () => setKind('motion');
$('search').addEventListener('input', event => { state().query = event.target.value; renderGrid(); });
$('reset').onclick = () => { state().category = 'all'; state().query = ''; $('search').value = ''; renderCategories(); renderGrid(); };
$('random').onclick = () => { const row = randomReference(currentRecords(), activeId ?? state().selectedId); if (row) openReference(row.id); };
$('lang-zh').onclick = () => setLanguage('zh'); $('lang-en').onclick = () => setLanguage('en'); $('close').onclick = closeViewer;
viewer.addEventListener('click', event => { if (event.target === viewer) closeViewer(); });
$('previous').onclick = () => navigate(-1); $('next').onclick = () => navigate(1);
$('use').onclick = () => {
  const row = getRecord(activeId); if (!row || $('use').disabled || (targetKind && targetKind !== kind)) return;
  state().selectedId = row.id; renderGrid(); post({ type: 'cinematic-gallery-select', id: row.id, language }); closeViewer();
};
for (const lang of ['zh', 'en']) for (const example of [false, true]) $(example ? `copy-example-${lang}` : `copy-${lang}`).onclick = async () => {
  const row = getRecord(activeId); if (!row) return;
  try { await navigator.clipboard.writeText(row[`${example ? 'example_prompt' : 'prompt'}_${motion() ? language : lang}`]); $('copy-status').textContent = t('copied', language); }
  catch { $('copy-status').textContent = t('copyError', language); }
};
document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(document.activeElement?.tagName)) return;
  if (event.key === '/' && !viewer.open) { event.preventDefault(); $('search').focus(); }
  if (viewer.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1); }
});
window.addEventListener('message', event => {
  if (!embedded || !validMessage(event, window.parent, location.origin) || event.data.type !== 'cinematic-gallery-current') return;
  const nodeKind = event.data.kind === 'motion' ? 'motion' : 'reference'; targetKind = nodeKind;
  if (typeof event.data.id === 'string') states[nodeKind].selectedId = event.data.id;
  setLanguage(event.data.language, false);
});
renderLanguage(); await load(); post({ type: 'cinematic-gallery-ready' });
