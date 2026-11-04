# 来源与署名 / Attribution

- 图库的视觉设计参考本地 `comfyui-pose-gallery`，其中颜色、间距及卡片设计标记改编自其 `web/gallery.html`。上游界面署名为 Anhao，来源为 wangweihong/ai-pose-gallery-zh（基于 anhao/ai-pose-gallery-zh）。原始许可保留在 `licenses/pose-gallery-LICENSE.txt`。本项目没有复制姿势图库的人体姿势素材或数据。
- 110 张电影参考图、原始英文提示词、中英文名称与说明来自用户指定的 `wangweihong/ComfyUI-ToolBox`：`web/assets/cinematic/`、`web/js/cinematic_prompt.js`、`web/js/cinematic_prompt_cn.js`。本项目新增中文提示词翻译，并重写为独立单选图库节点。
- 迁移时的 ToolBox 本地提交：`7d44d03c1dcaf3115ce4641be21246a39d70788a`。详细路径和每张图片的 SHA-256 保存在 `library/SOURCE.json`。原仓库中的未提交改动没有被修改。
- ToolBox 本地副本未包含顶层 LICENSE；迁移不会改变其代码、数据、图片或第三方权利的归属，Pose Gallery 的 MIT 许可不扩展至这些电影素材。

## 运镜内容与生成素材

- 运镜目录依据用户提供的名称与场景整理，新增中英文说明、通用提示词和完整场景示例。概念区分参考 NSW Arts Unit 的 Camera movement 教材及 Adobe 的 Dolly zoom 说明；来源链接保存在 `library/motions/catalog.json`。
- `library/motions/videos/` 的 40 条视频由本地 ComfyUI H3 Ref2VA INT8 生成；封面取自对应视频。没有复制上述教学来源的图片或视频。
- 每项记录实际生成参数、种子、审看说明和 SHA-256，对应 API 工作流位于 `example_workflows/motions/`。

- 虫眼视角素材仅进行了固定 180° 方向归正，未改变向上视角或时间运动；处理命令记录在对应生成元数据中。

## 艺术风格对照素材

- 74 种风格来自用户提供的六类清单；将“荧光纸艺拼贴”拆分为平面剪纸与立体纸雕，保留共同搜索别名。中英文风格词、视觉特征、适用场景和辨析由本项目整理。
- 风格块结构参考 [OpenDirector: AI Video Styles](https://www.opendirector.co/learn/ai-video-styles/)，按介质、造型、色板、光影、纹理与避免项组织。本项目没有下载或复制该页面的图片、视频或长段文字。
- Riso 专色、叠印与错版特征依据用户提供的说明；用户提供的 explain.film 页面未能读取，不作为已核实制作资料。转绘概念另参考 [StudioBinder: Rotoscope Animation](https://www.studiobinder.com/blog/what-is-rotoscope-animation-definition/)。AI 示例模拟其视觉表现，并非对真人底片进行实际描摹。
- `library/styles/videos/` 的最终 74 条视频由本地 H3 Ref2VA INT8、现有文本编码器与 VAE 生成；封面来自对应视频。没有使用外部电影片段或特定系列角色。所有风格固定种子和基础场景，仅替换风格段；统一编码为 H.264 CRF 18、medium、yuv420p、24fps、无声。
- 共同提示词、SHA-256 和生成条件保存在 `library/styles/profile.json`；实际工作流保存在 `example_workflows/styles/`；每条风格目录包含实际风格段、种子、候选与最终视频校验值及审看说明。未采用的候选保留在被 Git 忽略的 `.generation/styles/` 中。
