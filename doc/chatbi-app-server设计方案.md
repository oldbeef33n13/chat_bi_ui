# Chat BI App Server 设计方案

## 1. 背景与目标

当前工程已经具备以下能力：

- 前端编辑器：`dashboard`、`report`、`ppt`
- 文档管理界面：列表、详情、编辑、预览
- Java App：`tools/chatbi-app-server`，承接模板、资产、导出、数据接口与调度
- Java 导出工具：`tools/poi-dsl-exporter`，支持 `report -> docx`、`ppt -> pptx`

下一阶段目标是补齐完整业务后台，新增一个独立 Java App 工程，承载：

- 模板管理 REST
- 动态数据获取与模板渲染
- 图片资产管理
- 预览与导出
- 定时任务
- 文件产物下载
- 本地联调能力

本阶段明确决策如下：

- `dashboard` 定时任务第一版产物为 `snapshot json`
- 模板 REST 正式使用 `templates` 命名，不再使用 `docs`
- 图片改为后台托管资产，不再长期存储为 DSL 内 base64


## 2. 总体设计

### 2.1 核心思路

系统区分两类文档：

1. `Template DSL`
   用于编辑器保存、版本管理、参数绑定、定时任务配置
2. `Snapshot VDoc`
   用于实际渲染、下载、导出、运行态预览

统一执行链路如下：

`Template DSL -> 变量解析 -> 调 DataEndpoint -> 生成 Snapshot VDoc -> 运行态预览 / 导出 / 定时任务产物`

### 2.2 为什么这样设计

- 前端当前渲染器和 Java 导出器已经能稳定消费静态 `VDoc`
- 动态能力如果直接侵入运行态和导出器，会导致两条链同时复杂化
- 先生成静态快照，再消费快照，能复用已有能力，风险最小

### 2.3 第一版边界

第一版纳入：

- `dashboard/report/ppt` 模板管理
- 动态数据接口管理
- report/ppt 导出
- dashboard snapshot 产物
- 图片资产托管
- 定时任务及历史

第一版暂不纳入：

- dashboard 图片/PDF 截图导出
- 多租户隔离
- 分布式调度
- 权限体系
- 真正的 NL2SQL 引擎实现


## 3. 工程结构

## 3.1 `tools` 聚合工程

建议将 `tools` 升级为 Maven 聚合工程：

```text
tools/
  pom.xml
  poi-dsl-exporter/
  chatbi-app-server/
```

根 `pom.xml` 只管理：

- Java 版本
- 依赖版本
- 模块列表

### 3.2 新工程结构

```text
tools/chatbi-app-server/
  pom.xml
  src/
    main/
      java/
        com/chatbi/app/
          AppMain.java
          api/
            template/
            asset/
            dataendpoint/
            schedule/
            run/
            health/
          application/
            template/
            render/
            export/
            asset/
            schedule/
            dataendpoint/
          domain/
            template/
            asset/
            dataendpoint/
            schedule/
            run/
          infra/
            db/
            file/
            exporter/
            endpoint/
            scheduler/
            json/
          common/
            error/
            web/
            time/
            ids/
      resources/
        application.yml
        db/migration/
    test/
      java/
```

### 3.3 技术选型

- Web：Spring Boot + Jetty
- REST：Spring MVC
- 校验：Spring Validation
- 数据库：SQLite
- ORM：不用 JPA，使用 `JdbcTemplate`
- 迁移：Flyway
- JSON：Jackson
- 调度：应用内 scheduler + SQLite 持久化
- 文件存储：本地文件系统

### 3.4 为什么不是“纯 Jetty”

本项目不是只做几个 servlet，而是需要：

- 统一异常处理
- DTO 校验
- JSON 序列化
- 多模块 REST
- 调度与事务边界
- 本地快速运行

因此建议使用“Spring Boot on Jetty”，而不是自己手写 Jetty 控制器。


## 4. 运行与存储

### 4.1 本地运行端口

- 前端 Vite：`5173`
- Java App：`18080`

### 4.2 本地存储目录

```text
tools/chatbi-app-server/storage/
  app.db
  assets/
  artifacts/
  tmp/
```

### 4.3 Vite 联调

前端代理建议：

```ts
server: {
  port: 5173,
  proxy: {
    "/api": "http://localhost:18080",
    "/files": "http://localhost:18080"
  }
}
```

当前 `localexample` 后续只保留为：

- 种子数据参考
- 离线样例参考

不再作为 Vite 主联调通道或默认 API 来源。


## 5. 业务对象模型

### 5.1 Template

模板主记录，替代当前 `doc` 概念。

字段建议：

- `id`
- `templateType`
  - `dashboard`
  - `report`
  - `ppt`
- `name`
- `description`
- `currentRevision`
- `tags`
- `createdAt`
- `updatedAt`

### 5.2 TemplateRevision

模板版本记录，存储 DSL 内容。

字段建议：

- `templateId`
- `revisionNo`
- `dslJson`
- `createdAt`
- `createdBy`

### 5.3 Asset

图片等资源。

字段建议：

- `id`
- `assetType`
  - `image`
- `name`
- `mimeType`
- `filePath`
- `sizeBytes`
- `widthPx`
- `heightPx`
- `sha256`
- `createdAt`

### 5.4 DataEndpoint

统一托管的动态数据接口定义。

字段建议：

- `id`
- `name`
- `category`
- `providerType`
  - `mock_rest`
  - `manual_rest`
  - `nl2sql_rest`
- `origin`
  - `system`
  - `manual`
  - `ai_generated`
- `method`
  - `GET`
  - `POST`
- `path`
- `description`
- `paramSchemaJson`
- `resultSchemaJson`
- `sampleRequestJson`
- `sampleResponseJson`
- `enabled`
- `createdAt`
- `updatedAt`

### 5.5 ScheduleJob

定时任务配置。

字段建议：

- `id`
- `templateId`
- `name`
- `enabled`
- `cronExpr`
- `timezone`
- `outputType`
  - `report_docx`
  - `ppt_pptx`
  - `dashboard_snapshot_json`
- `variablesJson`
- `retentionDays`
- `createdAt`
- `updatedAt`

### 5.6 RenderRun

一次执行记录。

字段建议：

- `id`
- `triggerType`
  - `manual_preview`
  - `manual_export`
  - `schedule`
- `templateId`
- `templateRevisionNo`
- `scheduleJobId`
- `status`
  - `pending`
  - `running`
  - `success`
  - `failed`
- `variablesJson`
- `startedAt`
- `finishedAt`
- `errorMessage`

### 5.7 Artifact

产物记录。

字段建议：

- `id`
- `runId`
- `artifactType`
  - `report_docx`
  - `ppt_pptx`
  - `dashboard_snapshot_json`
- `fileName`
- `filePath`
- `contentType`
- `sizeBytes`
- `createdAt`


## 6. Template DSL 扩展

### 6.1 设计原则

- 编辑器保存模板时，不直接绑定裸 REST URL
- 模板只绑定后台托管的 `DataEndpoint`
- 渲染时将模板 DSL 转换为静态 `Snapshot VDoc`

### 6.2 新增全局变量

建议在模板 DSL 顶层增加：

```ts
interface TemplateVariableDef {
  key: string;
  label?: string;
  type: "string" | "number" | "boolean" | "date" | "datetime";
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
}
```

顶层结构增加：

```ts
templateVariables?: TemplateVariableDef[];
```

典型变量：

- `bizDate`
- `from`
- `to`
- `region`
- `team`
- `serviceGroup`

### 6.3 节点数据绑定扩展

建议在模板态支持：

```ts
interface TemplateParamBinding {
  from: "const" | "templateVar" | "systemVar" | "filter";
  value?: unknown;
  key?: string;
}

interface TemplateDataBinding {
  endpointId?: string;
  paramBindings?: Record<string, TemplateParamBinding>;
  filterRefs?: string[];
}
```

说明：

- `endpointId`：引用后台数据接口
- `paramBindings`：接口参数来源映射
- `filterRefs`：可选，沿用现有过滤器能力

### 6.4 Snapshot 生成结果

渲染完成后，生成 `Snapshot VDoc`：

- `dataSources` 中写入静态 `staticData`
- `queries` 中写入静态 query 记录
- 节点回填 `sourceId/queryId`

即：

- 模板 DSL 面向编辑与调度
- Snapshot DSL 面向运行态与导出


## 7. DataEndpoint 规格

### 7.1 Param Schema

建议结构：

```json
[
  {
    "name": "region",
    "type": "string",
    "required": false,
    "defaultValue": "all",
    "description": "区域编码",
    "enumValues": ["all", "north", "south", "east", "west"]
  }
]
```

### 7.2 Result Schema

建议结构：

```json
[
  {
    "name": "ts",
    "type": "time",
    "label": "时间",
    "description": "采样时间",
    "unit": null,
    "aggAble": false
  },
  {
    "name": "critical",
    "type": "number",
    "label": "严重告警数",
    "description": "critical 告警数量",
    "unit": "count",
    "aggAble": true
  }
]
```

### 7.3 providerType 约定

- `mock_rest`
  后台内置 mock 业务接口
- `manual_rest`
  配置型外部/内部 REST 代理
- `nl2sql_rest`
  未来由问数能力生成的 REST 接口

### 7.4 origin 约定

- `system`
- `manual`
- `ai_generated`

后续 NL2SQL 生成接口时，不单独造新模型，直接归到 `DataEndpoint`。


## 8. 第一批内置运维 Mock 接口

### 8.1 ops_alarm_trend

用途：

- dashboard 趋势图
- report 趋势章节
- ppt 趋势页

输入：

- `region`
- `from`
- `to`
- `granularity`

输出：

- `ts`
- `critical`
- `major`
- `minor`

### 8.2 ops_incident_list

输入：

- `region`
- `severity`
- `status`
- `from`
- `to`
- `pageNo`
- `pageSize`

输出：

- `incidentId`
- `title`
- `region`
- `severity`
- `status`
- `openedAt`
- `owner`
- `durationMin`

### 8.3 ops_capacity_topn

输入：

- `region`
- `metric`
- `topN`

输出：

- `linkName`
- `region`
- `utilizationPct`
- `peakBps`
- `capacityBps`

### 8.4 ops_ticket_summary

输入：

- `team`
- `statDate`

输出：

- `openCount`
- `closedCount`
- `mttrMin`
- `overdueCount`

### 8.5 ops_change_calendar

输入：

- `month`
- `region`

输出：

- `date`
- `changeCount`
- `rollbackCount`

### 8.6 ops_service_health

输入：

- `region`
- `serviceGroup`

输出：

- `service`
- `availabilityPct`
- `latencyMs`
- `errorRatePct`


## 9. SQLite DDL 草案

```sql
create table if not exists template (
  id text primary key,
  template_type text not null,
  name text not null,
  description text not null default '',
  tags_json text not null default '[]',
  current_revision integer not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists template_revision (
  id integer primary key autoincrement,
  template_id text not null,
  revision_no integer not null,
  dsl_json text not null,
  created_at text not null,
  created_by text,
  unique(template_id, revision_no),
  foreign key(template_id) references template(id)
);

create table if not exists asset (
  id text primary key,
  asset_type text not null,
  name text not null,
  mime_type text not null,
  file_path text not null,
  size_bytes integer not null,
  width_px integer,
  height_px integer,
  sha256 text not null,
  created_at text not null
);

create table if not exists data_endpoint (
  id text primary key,
  name text not null,
  category text not null default '',
  provider_type text not null,
  origin text not null,
  method text not null,
  path text not null,
  description text not null default '',
  param_schema_json text not null default '[]',
  result_schema_json text not null default '[]',
  sample_request_json text not null default '{}',
  sample_response_json text not null default '[]',
  enabled integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create table if not exists schedule_job (
  id text primary key,
  template_id text not null,
  name text not null,
  enabled integer not null default 1,
  cron_expr text not null,
  timezone text not null,
  output_type text not null,
  variables_json text not null default '{}',
  retention_days integer not null default 30,
  created_at text not null,
  updated_at text not null,
  foreign key(template_id) references template(id)
);

create table if not exists render_run (
  id text primary key,
  trigger_type text not null,
  template_id text not null,
  template_revision_no integer not null,
  schedule_job_id text,
  output_type text not null,
  status text not null,
  variables_json text not null default '{}',
  started_at text,
  finished_at text,
  error_message text,
  created_at text not null,
  foreign key(template_id) references template(id),
  foreign key(schedule_job_id) references schedule_job(id)
);

create table if not exists artifact (
  id text primary key,
  run_id text not null,
  artifact_type text not null,
  file_name text not null,
  file_path text not null,
  content_type text not null,
  size_bytes integer not null,
  created_at text not null,
  foreign key(run_id) references render_run(id)
);

create index if not exists idx_template_type_updated on template(template_type, updated_at);
create index if not exists idx_template_revision_template on template_revision(template_id, revision_no desc);
create index if not exists idx_schedule_job_template on schedule_job(template_id);
create index if not exists idx_render_run_template on render_run(template_id);
create index if not exists idx_render_run_schedule on render_run(schedule_job_id);
create index if not exists idx_artifact_run on artifact(run_id);
```


## 10. REST 契约草案

## 10.1 Templates

### `GET /api/v1/templates`

查询参数：

- `type=dashboard|report|ppt|all`
- `q`
- `page`
- `pageSize`

响应：

```json
{
  "items": [
    {
      "id": "tpl_report_weekly_001",
      "templateType": "report",
      "name": "网络周报模板",
      "description": "适用于周运营分析",
      "tags": ["report", "weekly"],
      "updatedAt": "2026-03-07T10:00:00Z",
      "currentRevision": 5,
      "canEdit": true,
      "canPublish": true
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### `POST /api/v1/templates`

请求：

```json
{
  "templateType": "dashboard",
  "title": "网络运维总览",
  "seedTemplateId": "dashboard.noc",
  "dashboardPreset": "wallboard"
}
```

响应：

```json
{
  "meta": {
    "id": "tpl_dashboard_001",
    "templateType": "dashboard",
    "name": "网络运维总览",
    "description": "",
    "tags": [],
    "updatedAt": "2026-03-07T10:00:00Z",
    "currentRevision": 3,
    "canEdit": true,
    "canPublish": true
  },
  "content": {
    "revision": 3,
    "template": {}
  }
}
```

### `GET /api/v1/templates/{id}/content`

响应：

```json
{
  "revision": 3,
  "template": {}
}
```

### `GET /api/v1/templates/{id}/revisions`

响应：

```json
[
  {
    "revision": 3,
    "createdAt": "2026-03-07T10:00:00Z",
    "createdBy": "system",
    "current": true
  },
  {
    "revision": 2,
    "createdAt": "2026-03-06T10:00:00Z",
    "createdBy": "system",
    "current": false
  }
]
```

### `POST /api/v1/templates/{id}/publish`

请求：

```json
{
  "dsl": {},
  "baseRevision": 3
}
```

响应：

```json
{
  "meta": {},
  "content": {
    "revision": 4,
    "template": {}
  }
}
```

### `POST /api/v1/templates/{id}/restore/{revision}`

响应：

```json
{
  "meta": {},
  "content": {
    "revision": 2,
    "template": {}
  }
}
```

## 10.2 Preview / Export

### `POST /api/v1/templates/{id}/preview`

用途：

- 后端执行模板渲染
- 返回本次预览对应的静态快照

请求：

```json
{
  "revision": 6,
  "variables": {
    "region": "north",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

响应：

```json
{
  "runId": "run_preview_001",
  "snapshot": {},
  "resolvedVariables": {
    "region": "north",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

### `POST /api/v1/templates/{id}/exports`

请求：

```json
{
  "revision": 6,
  "outputType": "report_docx",
  "variables": {
    "region": "north",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

响应：

```json
{
  "runId": "run_export_001",
  "status": "success",
  "artifacts": [
    {
      "id": "artifact_001",
      "artifactType": "report_docx",
      "fileName": "network-weekly-report.docx",
      "downloadUrl": "/files/artifacts/artifact_001"
    }
  ]
}
```

### `GET /api/v1/runs/{runId}`

响应：

```json
{
  "id": "run_export_001",
  "triggerType": "manual_export",
  "templateId": "tpl_report_weekly_001",
  "templateRevisionNo": 6,
  "scheduleJobId": null,
  "status": "success",
  "variables": {
    "region": "north"
  },
  "startedAt": "2026-03-07T10:00:00Z",
  "finishedAt": "2026-03-07T10:00:04Z",
  "errorMessage": null
}
```

## 10.3 Data Endpoints

### `GET /api/v1/data-endpoints`

响应：

```json
{
  "items": [
    {
      "id": "ops_alarm_trend",
      "name": "告警趋势",
      "category": "ops",
      "providerType": "mock_rest",
      "origin": "system",
      "method": "GET",
      "path": "/mock/ops/alarm-trend",
      "description": "按时间维度返回告警趋势",
      "enabled": true,
      "updatedAt": "2026-03-07T10:00:00Z"
    }
  ]
}
```

### `POST /api/v1/data-endpoints/{id}/test`

请求：

```json
{
  "params": {
    "region": "north",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

响应：

```json
{
  "requestEcho": {
    "region": "north",
    "from": "2026-03-01",
    "to": "2026-03-07"
  },
  "resultSchema": [
    {
      "name": "ts",
      "type": "time",
      "label": "时间"
    },
    {
      "name": "critical",
      "type": "number",
      "label": "严重告警"
    }
  ],
  "rows": [
    {
      "ts": "2026-03-01 00:00:00",
      "critical": 3
    }
  ]
}
```

## 10.4 Assets

### `POST /api/v1/assets/images`

表单上传：

- `file`

响应：

```json
{
  "id": "asset_img_001",
  "assetType": "image",
  "name": "topology.png",
  "mimeType": "image/png",
  "sizeBytes": 183204,
  "widthPx": 1280,
  "heightPx": 720,
  "url": "/files/assets/asset_img_001"
}
```

## 10.5 Schedules

### `POST /api/v1/schedules`

请求：

```json
{
  "templateId": "tpl_dashboard_001",
  "name": "每小时生成快照",
  "enabled": true,
  "cronExpr": "0 0 * * * ?",
  "timezone": "Asia/Shanghai",
  "outputType": "dashboard_snapshot_json",
  "variables": {
    "region": "all"
  },
  "retentionDays": 7
}
```

响应：

```json
{
  "id": "sched_001",
  "templateId": "tpl_dashboard_001",
  "name": "每小时生成快照",
  "enabled": true,
  "cronExpr": "0 0 * * * ?",
  "timezone": "Asia/Shanghai",
  "outputType": "dashboard_snapshot_json",
  "variables": {
    "region": "all"
  },
  "retentionDays": 7
}
```

### `GET /api/v1/schedules/{id}/runs`

响应：

```json
{
  "items": [
    {
      "id": "run_sched_001",
      "status": "success",
      "startedAt": "2026-03-07T10:00:00Z",
      "finishedAt": "2026-03-07T10:00:02Z",
      "artifacts": [
        {
          "id": "artifact_001",
          "artifactType": "dashboard_snapshot_json",
          "fileName": "dashboard-snapshot-20260307100000.json",
          "downloadUrl": "/files/artifacts/artifact_001"
        }
      ]
    }
  ]
}
```


## 11. 图片托管策略

### 11.1 原则

- 编辑器不再长期持有 base64 作为正式存储
- 图片统一上传到后台
- DSL 节点只引用 `assetId`

### 11.2 编辑器交互

1. 用户选择图片
2. 前端调用 `/api/v1/assets/images`
3. 后端保存文件并返回 `assetId`
4. 前端写入 `node.props.assetId`
5. 运行态通过 `/files/assets/{id}` 加载图片

### 11.3 兼容策略

本次新方案不考虑旧兼容：

- 新逻辑默认只使用后台托管资产
- 不再保留前端长期 base64 方案


## 12. 前端改造清单

### 12.1 命名统一

当前：

- `docs`
- `DocRepository`

目标：

- `templates`
- `TemplateRepository`

### 12.2 页面级改造

新增或改造页面：

- 模板列表页
- 模板详情页
- 数据接口管理页
- 定时任务面板/页
- 文件产物页

### 12.3 编辑器侧改造

#### 图表/表格数据面板

当前：

- 选 `sourceId`
- 选 `queryId`
- 绑字段

目标：

- 选 `endpointId`
- 配置参数映射
- 测试取数
- 预览字段列表
- 字段绑定

#### 图片上传

当前：

- 前端读文件 -> 生成 dataURL -> 写入 DSL

目标：

- 前端上传 -> 返回 `assetId` -> 写入 DSL

#### report/ppt 下载

新增：

- 在详情页/预览页调用导出接口
- 完成后展示文件下载

#### dashboard 定时任务

新增：

- 模板卡片进入定时任务配置
- 历史执行查看
- 下载 snapshot json


## 13. 实施分期

### P0 规格阶段

- 落本设计文档
- 确认 SQLite DDL
- 确认 REST 契约
- 确认前端改造范围

### P1 后端底座

- 新建 `chatbi-app-server`
- 接入 Jetty、SQLite、Flyway、统一异常
- 实现 `/api/v1/templates` 基础 CRUD

### P2 图片与文件

- 资产上传
- 资产静态访问
- artifact 文件访问

### P3 report/ppt 导出

- 接入 `poi-dsl-exporter`
- 打通导出任务
- 前端支持下载产物

### P4 数据接口平台

- `data-endpoints` 管理 REST
- mock 运维接口
- 接口测试能力

### P5 模板动态渲染

- `templateVariables`
- `endpointId + paramBindings`
- `/preview`
- Snapshot 生成

### P6 定时任务

- `schedule_job`
- 运行历史
- dashboard snapshot json


## 14. 下一步编码建议

建议严格按以下顺序编码，不并行发散：

1. 建 `tools/pom.xml` 聚合工程
2. 建 `tools/chatbi-app-server` 空工程
3. 落 Flyway 初始表结构
4. 先实现 `templates` 基础 CRUD
5. 再实现 `assets`
6. 再接 `exports`
7. 最后做 `data-endpoints` 和 `schedules`

这样能最早打通：

- 前端列表/详情/编辑联调
- 图片上传
- report/ppt 下载

而动态数据和调度能力可以在第二批进入。
