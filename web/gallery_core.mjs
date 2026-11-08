export const DEFAULT_ID = 'camera_arri';
export const normalizeLanguage = value => value === 'en' ? 'en' : 'zh';
export const local = (row, field, language) => row[`${field}_${normalizeLanguage(language)}`];
export const messages = {
  title: ['摄影参考图库', 'Photography Reference Gallery'], motionTitle: ['电影参考图库', 'Cinematic Reference Gallery'],
  subtitle: ['用光线、构图与风格，建立画面表达。', 'Build images with light, composition and style.'], motionSubtitle: ['让每一次镜头运动，都服务于叙事。', 'Make every camera move serve the story.'],
  intro: ['浏览镜头、光线与风格。选中一张参考，将原图及中英文提示词、说明带入 ComfyUI。', 'Explore framing, light and style. Send one reference image, bilingual prompts and descriptions to ComfyUI.'],
  motionIntro: ['浏览镜头运动、景别、灯光与艺术风格，观看视频并获取提示词和完整场景示例。', 'Explore camera movement, shot sizes, lighting and visual styles through videos, reusable prompts and complete scene examples.'],
  referenceCount: ['张参考图', 'references'], motionCount: ['个镜头条目', 'shot entries'], categoryCount: ['个分类', 'categories'], offline: ['本地素材 · 离线可用', 'Local library · Works offline'],
  all: ['全部参考', 'All references'], allMotions: ['全部镜头', 'All shots'], search: ['搜索名称、提示词、说明或编号…', 'Search names, prompts, descriptions or IDs…'],
  reset: ['重置筛选', 'Reset filters'], random: ['随机参考', 'Random reference'], results: ['条参考', 'references'], motionResults: ['个镜头', 'shots'], readyCount: ['条视频可播放', 'videos ready'],
  empty: ['没有匹配的参考', 'No matching references'], emptyHint: ['换个关键词，或重置筛选再试试。', 'Try another keyword or reset your filters.'],
  loading: ['正在加载本地图库…', 'Loading local library…'], loadError: ['图库加载失败，请重试。', 'Could not load the library. Please retry.'], retry: ['重新加载', 'Retry'],
  view: ['查看参考', 'View reference'], viewMotion: ['观看示例', 'Watch example'], current: ['当前选择', 'Current selection'], use: ['使用此参考 → ComfyUI', 'Use reference → ComfyUI'], useMotion: ['使用此运镜 → ComfyUI', 'Use motion → ComfyUI'],
  choose: ['选择此参考', 'Select this reference'], chooseMotion: ['选择此运镜', 'Select this motion'], selected: ['已选择', 'Selected'], close: ['关闭', 'Close'], previous: ['上一张', 'Previous'], next: ['下一张', 'Next'],
  promptZh: ['中文提示词', 'Chinese prompt'], promptEn: ['英文提示词', 'English prompt'], motionPromptZh: ['通用运镜 · 中文', 'Reusable motion · Chinese'], motionPromptEn: ['通用运镜 · 英文', 'Reusable motion · English'],
  exampleZh: ['完整示例 · 中文', 'Complete example · Chinese'], exampleEn: ['完整示例 · 英文', 'Complete example · English'],
  styleFooter: ['艺术风格 · 完整示例 · 原生视频', 'Visual style · Complete example · Native video'], styleCount: ['种艺术风格', 'visual styles'], styleResults: ['种风格', 'styles'], styleSubtitle: ['同一场景，看见不同的视觉语言。', 'One scene, different visual languages.'], styleIntro: ['相同人物、场景、侧跟镜头与种子，仅改变风格提示词。', 'Matched subject, scene, tracking shot and seed. Only the style prompt changes.'], visualFeatures: ['视觉特征', 'Visual features'],
  motionGroup: ['镜头', 'Shots'], styleGroup: ['风格', 'Visual styles'], allStyles: ['全部风格', 'All styles'], stylePrompt: ['风格提示词', 'Style prompt'], distinctions: ['易混淆风格', 'Distinctions'], styleUse: ['使用此风格 → ComfyUI', 'Use style → ComfyUI'], styleChoose: ['选择此风格', 'Select this style'],
  prompt: ['提示词', 'Prompt'], example: ['完整示例', 'Complete example'],
  description: ['参考说明', 'About this reference'], useCases: ['常用场景', 'Use cases'], staticTab: ['摄影参考', 'Photography'], motionTab: ['电影参考', 'Cinematic'],
  pending: ['视频待制作', 'Video in production'], pendingHint: ['此条目已整理提示词，示例视频将在后续补齐。', 'Prompts are available; the example video will be added later.'],
  wrongNode: ['请从对应类型的节点使用', 'Use the matching node type'],
  copy: ['复制', 'Copy'], copied: ['已复制', 'Copied'], copyError: ['复制失败，请手动选择文字。', 'Could not copy. Select the text manually.'],
  download: ['下载原图', 'Download original'], downloadVideo: ['下载视频', 'Download video'], missing: ['参考图缺失或损坏，请重新安装完整素材。', 'Image missing or damaged. Reinstall the complete library.'],
  missingVideo: ['视频加载失败，请检查完整素材。', 'Video could not load. Check the complete library.'],
  footer: ['单选参考 · 双语文本 · 原尺寸图像', 'One reference · Bilingual text · Original image'], motionFooter: ['通用镜头 · 完整示例 · 原生视频', 'Reusable shot · Complete example · Native video'],
  noQueue: ['仅写回选择，不会自动运行工作流。', 'Selection only. Workflows are never queued automatically.'],
  nodeBrowse: ['浏览摄影参考图库', 'Browse photography references'], motionBrowse: ['浏览电影参考图库', 'Browse cinematic references'], nodeId: ['参考编号', 'Reference ID'], motionId: ['参考编号', 'Reference ID'], nodeLanguage: ['界面语言', 'UI language'],
};
export function t(key, language) { return messages[key]?.[normalizeLanguage(language) === 'en' ? 1 : 0] ?? key; }
export function filterRecords(records, category = 'all', query = '') {
  const tokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter(row => (category === 'all' || row.category === category) && tokens.every(token =>
    [row.id, row.name_zh, row.name_en, row.prompt_zh, row.prompt_en, row.description_zh, row.description_en,
      row.example_prompt_zh, row.example_prompt_en, row.use_cases_zh, row.use_cases_en, row.distinctions_zh, row.distinctions_en, ...(row.aliases ?? [])]
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

// Upgrade the previous eight bilingual output ports without dropping their links.
export function migrateMotionOutputs(node) {
  if (node.outputs?.length !== 8) return false;
  const slots = [0, 0, 1, 2, 2, 3, 3, 4];
  const names = ['prompt', 'image', 'description', 'example_prompt', 'video'];
  const types = ['STRING', 'IMAGE', 'STRING', 'STRING', 'VIDEO'];
  const previous = node.outputs.map(output => ({ output, links: [...(output.links ?? [])] }));
  const outputs = [0, 2, 3, 5, 7].map((oldSlot, index) => {
    const output = previous[oldSlot].output;
    output.name = names[index]; output.type = types[index]; output.links = [];
    return output;
  });
  previous.forEach((saved, oldSlot) => {
    for (const id of saved.links) {
      const link = node.graph?.links?.get?.(id) ?? node.graph?.links?.[id];
      if (link) link.origin_slot = slots[oldSlot];
      outputs[slots[oldSlot]].links.push(id);
    }
  });
  for (const output of outputs) if (!output.links.length) output.links = null;
  node.outputs = outputs;
  node.setDirtyCanvas?.(true, true);
  return true;
}
