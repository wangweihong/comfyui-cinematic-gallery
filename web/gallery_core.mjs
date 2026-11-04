export const DEFAULT_ID = 'camera_arri';
export const normalizeLanguage = value => value === 'en' ? 'en' : 'zh';
export const local = (row, field, language) => row[`${field}_${normalizeLanguage(language)}`];
export const messages = {
  title: ['电影参考图库', 'Cinematic Gallery'], subtitle: ['让每一个画面，都有自己的电影语言。', 'A visual language for every frame.'],
  intro: ['浏览镜头、光线与风格。选中一张参考，将原图及中英文提示词、说明带入 ComfyUI。', 'Explore framing, light and style. Send one reference image, bilingual prompts and descriptions to ComfyUI.'],
  referenceCount: ['张参考图', 'references'], categoryCount: ['个分类', 'categories'], offline: ['本地素材 · 离线可用', 'Local library · Works offline'],
  all: ['全部参考', 'All references'], search: ['搜索名称、提示词、说明或编号…', 'Search names, prompts, descriptions or IDs…'],
  reset: ['重置筛选', 'Reset filters'], random: ['随机参考', 'Random reference'], results: ['条参考', 'references'],
  empty: ['没有匹配的参考', 'No matching references'], emptyHint: ['换个关键词，或重置筛选再试试。', 'Try another keyword or reset your filters.'],
  loading: ['正在加载本地图库…', 'Loading local library…'], loadError: ['图库加载失败，请重试。', 'Could not load the library. Please retry.'], retry: ['重新加载', 'Retry'],
  view: ['查看参考', 'View reference'], current: ['当前选择', 'Current selection'], use: ['使用此参考 → ComfyUI', 'Use reference → ComfyUI'],
  choose: ['选择此参考', 'Select this reference'], selected: ['已选择', 'Selected'], close: ['关闭', 'Close'], previous: ['上一张', 'Previous'], next: ['下一张', 'Next'],
  promptZh: ['中文提示词', 'Chinese prompt'], promptEn: ['英文提示词', 'English prompt'], description: ['参考说明', 'About this reference'],
  copy: ['复制', 'Copy'], copied: ['已复制', 'Copied'], copyError: ['复制失败，请手动选择文字。', 'Could not copy. Select the text manually.'],
  download: ['下载原图', 'Download original'], missing: ['参考图缺失或损坏，请重新安装完整素材。', 'Image missing or damaged. Reinstall the complete library.'],
  footer: ['单选参考 · 双语文本 · 原尺寸图像', 'One reference · Bilingual text · Original image'],
  noQueue: ['仅写回选择，不会自动运行工作流。', 'Selection only. Workflows are never queued automatically.'],
  nodeBrowse: ['浏览电影参考图库', 'Browse cinematic references'], nodeId: ['参考编号', 'Reference ID'], nodeLanguage: ['界面语言', 'UI language'],
};
export function t(key, language) { return messages[key]?.[normalizeLanguage(language) === 'en' ? 1 : 0] ?? key; }
export function filterRecords(records, category = 'all', query = '') {
  const tokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter(row => (category === 'all' || row.category === category) && tokens.every(token =>
    [row.id, row.name_zh, row.name_en, row.prompt_zh, row.prompt_en, row.description_zh, row.description_en]
      .join(' ').toLocaleLowerCase().includes(token)));
}
export function randomReference(records, currentId, random = Math.random) {
  const usable = records.filter(row => row.available !== false);
  const alternatives = usable.filter(row => row.id !== currentId);
  const pool = alternatives.length ? alternatives : usable;
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}
export function validMessage(event, source, origin) {
  return Boolean(source && event.source === source && event.origin === origin && event.data && typeof event.data === 'object');
}
