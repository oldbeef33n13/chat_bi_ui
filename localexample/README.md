# localexample 本地测试数据

该目录用于本地开发时模拟 `/api/v1` 后端接口，避免没有后端时出现 404。

## 文件说明

- `docs.seed.json`
  - 默认种子文档。
  - 首次启动开发服务时，会按该文件初始化文档库。
  - `version` 升级时会自动进行种子迁移，刷新默认演示文档（保留非种子文档）。
- `docs.db.json`
  - 运行时数据库文件（自动生成）。
  - 新建文档、保存草稿、发布、放弃草稿都会写回该文件。

## 如何使用

1. 执行 `npm run dev`。
2. 访问前端页面，文档请求会走本地拦截 API。
3. 在页面中新建/保存后，可直接查看 `localexample/docs.db.json`。

## 可用接口（拦截）

- `GET /api/v1/docs`
- `GET /api/v1/docs/:id`
- `GET /api/v1/docs/:id/published`
- `GET /api/v1/docs/:id/draft`
- `POST /api/v1/docs`
- `PUT /api/v1/docs/:id/draft`
- `POST /api/v1/docs/:id/publish`
- `POST /api/v1/docs/:id/discard-draft`

## 开关

- 默认开启本地 API 拦截。
- 如需关闭，启动时设置环境变量：
  - PowerShell: `$env:VITE_LOCAL_API='false'; npm run dev`

## 重置

删除 `docs.db.json` 后重启 `npm run dev`，会按 `docs.seed.json` 重新初始化。
