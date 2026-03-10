# localexample 本地测试数据

该目录现在只用于保留历史离线样例和种子数据参考，不再作为前端开发环境的默认 API 来源。

## 文件说明

- `docs.seed.json`
  - 历史样例模板数据。
  - 可用于补测试、补种子或手工迁移到后端 `templates`。
- `docs.db.json`
  - 历史本地 mock 运行数据。
  - 当前主链已不再自动生成或写回该文件。

## 当前定位

- 默认开发链路：`vite -> /api,/files -> chatbi-app-server`
- `localexample/` 仅保留为：
  - 离线数据参考
  - 样例 DSL 来源
  - 迁移或补测试时的静态素材
