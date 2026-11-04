/** Rebuild the bundled catalog from a local ToolBox checkout. No network access. */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import_toolbox.mjs /absolute/path/to/ComfyUI-ToolBox');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function readCategories(file) {
  const text = readFileSync(join(source, 'web/js', file), 'utf8');
  const start = text.indexOf('const categories = {');
  const end = text.indexOf('// --- HELPER:', start);
  if (start < 0 || end < 0) throw new Error(`Cannot locate categories: ${file}`);
  return runInNewContext(`${text.slice(start, end)}; categories`, {}, { timeout: 1000 });
}
const english = readCategories('cinematic_prompt.js');
const chinese = readCategories('cinematic_prompt_cn.js');
// Order matches each upstream category. These translate prompt values, not UI labels.
const translations = {
  framing: '极特写|特写|中景|美式镜头|全身镜头|远景镜头|定场镜头|微距摄影|移轴摄影|分焦镜头',
  angle: '平视角度|低角度仰拍|高角度俯拍|虫眼视角|地面水平镜头|正上方鸟瞰视角|过肩镜头|荷兰式倾斜角度|第一人称视角',
  camera: '使用 Arri Alexa LF 拍摄|使用 IMAX 70 毫米胶片拍摄|使用 Panavision Millennium DXL2 拍摄|使用 Sony Venice 2 拍摄|使用 iPhone 15 Pro 拍摄|Polaroid SX-70 即时成像胶片|使用 GoPro Hero 拍摄',
  focal: '14 毫米镜头|24 毫米镜头|35 毫米镜头|50 毫米镜头|85 毫米镜头|135 毫米镜头|200 毫米镜头',
  dof: 'f/1.2 光圈|f/1.8 光圈|f/2.8 光圈|f/4.0 光圈|f/5.6 光圈|f/8.0 光圈|f/11 光圈|f/16 光圈|f/22 光圈',
  lighting: '体积光|生物荧光照明|黄金时刻光线|蓝调时刻光线|强烈的正午阳光|阴天柔光照明|影棚主光照明|伦勃朗光|烛光照明|月光|剪影照明|霓虹灯光|明暗对照法',
  palette: '青橙色调|富士 Velvia 50 胶片色彩|柯达 Ektachrome 胶片色彩|特艺彩色工艺|黑白摄影|柯达 Portra 400 胶片质感|鲜艳色彩，高饱和度|柔和色调，低饱和度|暖色调|冷色调|高对比度|单色色彩方案|霓虹色彩方案|棕褐色调',
  texture: '干净无噪点的数码画面|强烈胶片颗粒|胶片灼烧痕迹|VHS 录像伪影|辉光效果|色差|运动模糊|暗角',
  style: '照片级写实，8K|电影感构图|虚幻引擎 5 渲染，三维画面|阿德曼黏土动画风格|水彩画|赛博朋克美学|蒸汽朋克美学，黄铜与齿轮|20 世纪 50 年代美式餐厅美学，复古美式风格|原子朋克美学|蒸汽波美学|哥特美学|极简主义风格|20 世纪 80 年代复古风格|粗粝的纪录片影像|吉卜力工作室风格|油画肌理|黑色电影风格',
  artist: '韦斯·安德森导演风格|雷德利·斯科特导演风格|克里斯托弗·诺兰导演风格|爱德华·霍普艺术风格|格雷格·弗雷泽摄影风格|艾曼努尔·卢贝兹基摄影风格|霍伊特·范·霍伊特玛摄影风格|大卫·芬奇导演风格|蒂姆·伯顿导演风格|史蒂文·斯皮尔伯格导演风格|丹尼斯·维伦纽瓦导演风格|王家卫导演风格|席德·米德艺术风格|宫崎骏艺术风格|昆汀·塔伦蒂诺导演风格|H.R. 吉格尔艺术风格',
};
const categories = [], records = [], hashes = {};
mkdirSync(join(root, 'library/images'), { recursive: true });
for (const [key, values] of Object.entries(translations)) {
  const options = english[key].options;
  const zh = values.split('|');
  if (options.length !== zh.length) throw new Error(`Translation count mismatch: ${key}`);
  categories.push({ id: key, name_zh: chinese[key].title.replace(/（多选）|\(多选\)|\s*\/\s*多选/g, ''), name_en: english[key].title.replace(' (Multi)', '') });
  options.forEach((option, index) => {
    const counterpart = chinese[key].options.find(item => item.id === option.id);
    if (!counterpart) throw new Error(`Missing Chinese metadata: ${key}_${option.id}`);
    const id = `${key}_${option.id}`, filename = `${id}.jpg`;
    const bytes = readFileSync(join(source, 'web/assets/cinematic', filename));
    copyFileSync(join(source, 'web/assets/cinematic', filename), join(root, 'library/images', filename));
    hashes[filename] = createHash('sha256').update(bytes).digest('hex');
    records.push({ id, category: key, name_zh: counterpart.label, name_en: option.label,
      prompt_zh: zh[index], prompt_en: option.value ?? option.val,
      description_zh: counterpart.desc, description_en: option.desc, image: filename });
  });
}
if (records.length !== 110) throw new Error('Expected 110 reference images');
writeFileSync(join(root, 'library/catalog.json'), JSON.stringify({ version: 1, categories, records }, null, 2) + '\n');
writeFileSync(join(root, 'library/SOURCE.json'), JSON.stringify({
  source: 'https://github.com/wangweihong/ComfyUI-ToolBox',
  files: ['web/js/cinematic_prompt.js', 'web/js/cinematic_prompt_cn.js', 'web/assets/cinematic/*.jpg'],
  note: 'Local migration requested by the user. English prompts, bilingual labels and descriptions, and images retain their upstream provenance; Chinese prompt translations are added here.',
  images_sha256: hashes,
}, null, 2) + '\n');
console.log(`Imported ${records.length} references in ${categories.length} categories.`);
