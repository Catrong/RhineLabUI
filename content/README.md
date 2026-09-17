# 博客内容维护

博客列表、分类查询、三维书架和原文下载共用 `posts.json` 与 `posts/<slug>.md`。旧四十份档案已移除。

1. 在 `posts.json` 添加文章元信息，在 `posts/<slug>.md` 写 Markdown 正文。
2. 分类来自文章的 `category`，分类数量和每类篇数不限；`slug` 唯一且发布后保持稳定。
3. 执行 `npm run export:archives`，更新 `public/archives/<slug>.md` 原文下载。
4. 执行 `npm run check:content`、`npm run build`，提交元信息、正文与生成的下载文件。

开发和构建前会自动校验、导出。开发过程中修改文章后，再执行导出命令同步下载文件。三维书架复用固定 288 个实例位置，不需要填满分类或补齐文章。

字段、排版和发布边界见 [博客维护指南](../docs/BLOG.md)。
