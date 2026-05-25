# 2026-05-25 小范围业务模型对齐（开发阶段）

## 范围与目标
- 本次为开发阶段的小范围业务模型对齐，不做平台级重构，不做全量重写。
- 影响模块：
  - Market Radar
  - Stock Analysis
  - Track Discovery（少量）

## 数据结构变更

### 新增 5 张表
1. `stock_tag_relation`
2. `track_tag_relation`
3. `hotword`
4. `hotword_tag_relation`
5. `ai_tag_suggestion`

### 删除/停用 4 张表
1. `stock_alias`
2. `track_alias`
3. `hotword_alias`
4. `tag_candidate`

### 修改 1 张核心表
1. `tag`

### 保留但调整业务口径 3 张表
1. `source_tag`
2. `tag_heat_snapshot`
3. `tag_edge_snapshot`

## 核心模型
- `tag` = 标签词 / 语言入口
- `stock` = 标的实体
- `track` = 赛道实体
- `hotword` = 市场热词实体

不再使用“别名表”。
“别名”统一解释为同一业务实体绑定多个 `tag`。

- `stock` 通过 `stock_tag_relation` 绑定 `tag`
- `track` 通过 `track_tag_relation` 绑定 `tag`
- `hotword` 通过 `hotword_tag_relation` 绑定 `tag`

## AI 推荐流程约束
- `tag_candidate` 改为 `ai_tag_suggestion`。
- AI 只推荐词，不判断词属于 `stock` / `track` / `hotword`。
- 需人工审核后：
  1) 创建或绑定 `tag`
  2) 再绑定到对应 `stock` / `track` / `hotword` 实体

## 绑定 vs 关联

### 绑定（人工确认 / 主数据关系 / 稳定归属）
- `stock_tag_relation`
- `track_tag_relation`
- `hotword_tag_relation`
- `stock_track_relation`

### 关联（信息流自动发现 / 统计共现）
- `source_tag`
- `tag_edge_snapshot`

## 热度口径
- `source_item` 为原始信息流。
- `source_tag` 表示 `source_item` 命中了哪些 `tag`。
- `tag_heat_snapshot` 是标签词热度。
- `stock` / `track` / `hotword` 的实体热度通过绑定关系聚合得到。

## 明确不做项
不做复杂合并体系，不引入以下结构：
- `tag.merged_into_tag_id`
- `track.merged_into_track_id`
- `tag_merge_history`
- `track_merge_history`
- `term` 表
- `entity_alias`
- `is_primary`

## 冲突裁决
- 若旧代码与本文冲突，以本文说明为准。
