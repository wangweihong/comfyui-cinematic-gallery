import { DEFAULT_ID, normalizeLanguage, local, t, filterRecords, randomReference, validMessage } from './gallery_core.mjs';
const $ = id => document.getElementById(id);
const embedded = window.parent !== window;
const base = new URL('../', import.meta.url);
const endpoint = path => new URL(path, base).href;
const imageURL = id => endpoint(`assets/${encodeURIComponent(id)}`);
let language = normalizeLanguage(new URLSearchParams(location.search).get('lang'));
let payload = { categories: [], records: [] }, category = 'all', query = '', selectedId = DEFAULT_ID, activeId = null;
let loading = true, failed = false, imageRequest = 0;
const viewer = $('viewer');
const currentRecords = () => filterRecords(payload.records, category, query);
const getRecord = id => payload.records.find(row => row.id === id);
const post = data => { if (embedded) window.parent.postMessage(data, location.origin); };
function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function renderLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = `${t('title', language)} · Cinematic Gallery`;
  document.querySelectorAll('[data-text]').forEach(item => { item.textContent = t(item.dataset.text, language); });
  document.querySelectorAll('[data-placeholder]').forEach(item => {
    item.placeholder = t(item.dataset.placeholder, language); item.setAttribute('aria-label', item.placeholder);
  });
  document.querySelectorAll('[data-label]').forEach(item => item.setAttribute('aria-label', t(item.dataset.label, language)));
  for (const lang of ['zh', 'en']) $('lang-' + lang).setAttribute('aria-pressed', String(lang === language));
  if (!embedded) $('use').textContent = t('choose', language);
}
function renderCategories() {
  const counts = new Map(payload.categories.map(row => [row.id, payload.records.filter(item => item.category === row.id).length]));
  $('categories').replaceChildren(...[{ id: 'all', name_zh: t('all', 'zh'), name_en: t('all', 'en') }, ...payload.categories].map(row => {
    const button = element('button', 'category-tab');
    button.type = 'button';
    button.dataset.category = row.id;
    button.setAttribute('aria-pressed', String(category === row.id));
    button.append(element('strong', '', local(row, 'name', language)), element('span', '', String(counts.get(row.id) ?? payload.records.length)));
    button.onclick = () => { category = row.id; renderCategories(); renderGrid(); };
    return button;
  }));
}
function renderSelection() {
  const row = getRecord(selectedId);
  $('selection-label').textContent = row ? `${t('current', language)} · ${local(row, 'name', language)}` : '';
}
function renderGrid() {
  const records = currentRecords();
  $('reference-count').textContent = String(payload.records.length);
  $('category-count').textContent = String(payload.categories.length);
  $('result-count').textContent = String(records.length);
  $('random').disabled = !records.some(row => row.available !== false);
  renderSelection();
  $('status').hidden = !loading && !failed && records.length > 0;
  $('status').replaceChildren();
  if (loading || failed || !records.length) {
    $('status').append(element('h2', '', t(loading ? 'loading' : failed ? 'loadError' : 'empty', language)));
    if (failed) {
      const retry = element('button', 'button', t('retry', language)); retry.onclick = load; $('status').append(retry);
    } else if (!loading) $('status').append(element('p', '', t('emptyHint', language)));
  }
  $('grid').replaceChildren(...records.map(row => {
    const card = element('button', `card${row.id === selectedId ? ' is-selected' : ''}`);
    card.type = 'button'; card.dataset.id = row.id;
    card.setAttribute('aria-label', `${t('view', language)} · ${local(row, 'name', language)}`);
    const stage = element('div', 'card-stage');
    const image = element('img'); image.loading = 'lazy'; image.decoding = 'async'; image.alt = local(row, 'name', language); image.src = imageURL(row.id);
    const error = element('span', 'image-error', t('missing', language)); error.hidden = true;
    image.onerror = () => { image.hidden = true; error.hidden = false; };
    const group = payload.categories.find(item => item.id === row.category);
    stage.append(image, error, element('span', 'card-badge', local(group, 'name', language)));
    if (row.id === selectedId) stage.append(element('span', 'selected-badge', `✓ ${t('selected', language)}`));
    const info = element('div', 'card-info');
    info.append(element('h2', '', local(row, 'name', language)), element('p', 'other-name', local(row, 'name', language === 'zh' ? 'en' : 'zh')),
      element('p', 'card-description', local(row, 'description', language)));
    const bottom = element('div', 'card-bottom'); bottom.append(element('code', '', row.id), element('span', '', `${t('view', language)} ↗`));
    info.append(bottom); card.append(stage, info); card.onclick = () => openReference(row.id); return card;
  }));
}
function renderViewer(loadImage = true) {
  const row = getRecord(activeId); if (!row) return;
  const group = payload.categories.find(item => item.id === row.category);
  $('viewer-category').textContent = local(group, 'name', language);
  $('viewer-title').textContent = local(row, 'name', language);
  $('viewer-other-name').textContent = local(row, 'name', language === 'zh' ? 'en' : 'zh');
  $('viewer-id').textContent = row.id;
  $('prompt-zh').textContent = row.prompt_zh; $('prompt-en').textContent = row.prompt_en;
  $('description').textContent = local(row, 'description', language);
  $('download').href = imageURL(row.id); $('download').download = row.image;
  $('viewer-image').alt = local(row, 'name', language);
  $('copy-status').textContent = '';
  const records = currentRecords(), index = records.findIndex(item => item.id === row.id);
  $('viewer-position').textContent = index < 0 ? row.id : `${index + 1} / ${records.length}`;
  $('previous').disabled = $('next').disabled = records.length < 2 || index < 0;
  if (loadImage) {
    const request = ++imageRequest, image = $('viewer-image');
    $('use').disabled = true; $('download').hidden = true; image.hidden = false;
    image.classList.add('loading'); $('image-status').textContent = t('loading', language);
    image.onload = () => {
      if (request !== imageRequest) return;
      image.classList.remove('loading'); $('image-status').textContent = ''; $('use').disabled = false; $('download').hidden = false;
    };
    image.onerror = () => {
      if (request !== imageRequest) return;
      image.hidden = true; image.classList.remove('loading'); $('image-status').textContent = t('missing', language);
    };
    image.src = imageURL(row.id);
  } else if ($('viewer-image').hidden) $('image-status').textContent = t('missing', language);
}
function openReference(id) {
  if (!getRecord(id)) return;
  activeId = id; renderViewer();
  if (!viewer.open) { viewer.showModal(); document.body.style.overflow = 'hidden'; }
}
function closeViewer() { viewer.close(); document.body.style.overflow = ''; }
function navigate(step) {
  const records = currentRecords(), index = records.findIndex(row => row.id === activeId);
  if (index < 0 || records.length < 2) return;
  activeId = records[(index + step + records.length) % records.length].id; renderViewer();
}
function setLanguage(value, notify = true) {
  language = normalizeLanguage(value);
  renderLanguage(); renderCategories(); renderGrid(); if (activeId) renderViewer(false);
  if (notify) post({ type: 'cinematic-gallery-language', language });
}
async function load() {
  loading = true; failed = false; renderGrid();
  try {
    const response = await fetch(endpoint('catalog'));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.records) || !Array.isArray(data.categories)) throw new Error('Invalid catalog');
    payload = data;
  } catch { failed = true; }
  loading = false; renderCategories(); renderGrid();
}
$('search').addEventListener('input', event => { query = event.target.value; renderGrid(); });
$('reset').onclick = () => { category = 'all'; query = ''; $('search').value = ''; renderCategories(); renderGrid(); };
$('random').onclick = () => { const row = randomReference(currentRecords(), activeId ?? selectedId); if (row) openReference(row.id); };
$('lang-zh').onclick = () => setLanguage('zh'); $('lang-en').onclick = () => setLanguage('en');
$('close').onclick = closeViewer;
viewer.addEventListener('close', () => { document.body.style.overflow = ''; });
viewer.addEventListener('click', event => { if (event.target === viewer) closeViewer(); });
$('previous').onclick = () => navigate(-1); $('next').onclick = () => navigate(1);
$('use').onclick = () => {
  const row = getRecord(activeId); if (!row || $('use').disabled) return;
  selectedId = row.id; renderGrid();
  post({ type: 'cinematic-gallery-select', id: row.id, language }); closeViewer();
};
for (const lang of ['zh', 'en']) $(`copy-${lang}`).onclick = async () => {
  const row = getRecord(activeId); if (!row) return;
  try { await navigator.clipboard.writeText(row[`prompt_${lang}`]); $('copy-status').textContent = t('copied', language); }
  catch { $('copy-status').textContent = t('copyError', language); }
};
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (typing) return;
  if (event.key === '/' && !viewer.open) { event.preventDefault(); $('search').focus(); }
  if (viewer.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1); }
});
window.addEventListener('message', event => {
  if (!embedded || !validMessage(event, window.parent, location.origin) || event.data.type !== 'cinematic-gallery-current') return;
  if (typeof event.data.id === 'string') selectedId = event.data.id;
  setLanguage(event.data.language, false);
});
renderLanguage();
await load();
post({ type: 'cinematic-gallery-ready' });
