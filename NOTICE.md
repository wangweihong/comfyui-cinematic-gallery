# 来源与署名 / Attribution

- 图库的视觉设计参考本地 `comfyui-pose-gallery`，其中颜色、间距及卡片设计标记改编自其 `web/gallery.html`。上游界面署名为 Anhao，来源为 wangweihong/ai-pose-gallery-zh（基于 anhao/ai-pose-gallery-zh）。原始许可保留在 `licenses/pose-gallery-LICENSE.txt`。本项目没有复制姿势图库的人体姿势素材或数据。
- 110 张电影参考图、原始英文提示词、中英文名称与说明来自用户指定的 `wangweihong/ComfyUI-ToolBox`：`web/assets/cinematic/`、`web/js/cinematic_prompt.js`、`web/js/cinematic_prompt_cn.js`。本项目新增中文提示词翻译，并重写为独立单选图库节点。
- 迁移时的 ToolBox 本地提交：`7d44d03c1dcaf3115ce4641be21246a39d70788a`。详细路径和每张图片的 SHA-256 保存在 `library/SOURCE.json`。原仓库中的未提交改动没有被修改。
- ToolBox 本地副本未包含顶层 LICENSE；迁移不会改变其代码、数据、图片或第三方权利的归属，Pose Gallery 的 MIT 许可不扩展至这些电影素材。

## 运镜内容与生成素材

- 运镜目录依据用户提供的名称与场景整理，新增中英文说明、通用提示词和完整场景示例。概念区分参考 NSW Arts Unit 的 Camera movement 教材及 Adobe 的 Dolly zoom 说明；来源链接保存在 `library/motions/catalog.json`。
- `library/motions/videos/` 的 12 条视频由本地 ComfyUI H3 Ref2VA INT8 生成；封面取自对应视频。没有复制上述教学来源的图片或视频。
- 每项记录实际生成参数、种子、审看说明和 SHA-256，对应 API 工作流位于 `example_workflows/motions/`。
