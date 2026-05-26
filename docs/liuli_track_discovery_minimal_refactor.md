# 琉璃项目：赛道发现模块最小重构说明

> 目标：在不扩大改造范围的前提下，收敛赛道发现模块的表结构和页面语义。  
> 原则：不重建复杂“假设 / 指标 / 证据”体系，不重复存储信息流和笔记正文。

---

## 1. 本次重构结论

赛道发现保留为一级模块，二级内容页调整为：

```text
赛道发现
├── 赛道总览
├── 赛道库
├── 赛道动态
└── 赛道对比
```

其中：

```text
赛道总览 = 看哪些赛道值得注意
赛道库   = 管理赛道主体
赛道动态 = 展示赛道引用的信息流和笔记材料
赛道对比 = 横向比较多个赛道
```

---

## 2. 删除 / 不再使用

删除历史遗留表：

```text
track_related_stock
```

原因：

```text
赛道绑定标的统一使用 stock_track_relation。
从赛道视角看，它就是“赛道绑定标的”；
从标的视角看，它就是“标的所属赛道”。
```

第一版暂不建设：

```text
track_thesis
track_validation_indicator
track_evidence
```

原因：

```text
这三张表偏复杂研究论证系统，第一版先收敛为 track_material。
```

---

## 3. 保留

继续保留：

```text
track
track_tag_relation
stock_track_relation
track_status_history
```

含义：

```text
track = 赛道主体
track_tag_relation = 赛道绑定多个 tag
stock_track_relation = 标的与赛道的人工确认关系
track_status_history = 赛道状态变化历史
```

---

## 4. 新增：track_material

新增一张表：

```text
track_material
```

定位：

```text
某条材料被纳入某个赛道视角后的引用和判断。
```

材料来源只允许两类：

```text
source_item = 外部信息流，归市场雷达
knowledge_note = 个人笔记 / 心得 / 复盘，归知识库
```

`track_material` 不保存原文标题和正文，只保存引用关系和赛道视角判断。

---

## 5. track_material 表结构

```sql
CREATE TABLE track_material (
    id INTEGER NOT NULL,

    track_id INTEGER NOT NULL,

    material_type VARCHAR(32) NOT NULL,   -- source_item / knowledge_note
    material_id INTEGER NOT NULL,

    direction VARCHAR(32),                -- support / weaken / neutral / noise
    importance_level VARCHAR(16),         -- high / medium / low
    status VARCHAR(32) NOT NULL,          -- pending / confirmed / ignored

    note TEXT,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),
    UNIQUE (track_id, material_type, material_id)
);
```

字段说明：

```text
track_id = 关联哪个赛道
material_type / material_id = 引用 source_item 或 knowledge_note
direction = 这条材料对赛道判断的方向
importance_level = 重要性
status = 待确认 / 已确认 / 已忽略
note = 赛道视角的一句话判断
```

---

## 6. track 表最小补充

`track` 表建议补充少量当前判断字段：

```text
track_score
current_view
stage
confidence_level
```

含义：

```text
track_score = 赛道评分，0-100，第一版人工维护
current_view = 当前核心判断
stage = concept / validate / growth / overheat / decline
confidence_level = low / medium / high
```

不再使用：

```text
priority_level
```

---

## 7. track_status_history 调整

`track_status_history` 保留，但直接绑定 `track_id`，不要再绑定 thesis。

建议结构：

```sql
track_status_history
- id
- track_id
- old_status
- new_status
- old_stage
- new_stage
- reason
- changed_by        -- manual / system / ai
- changed_at
```

---

## 8. 赛道热度不单独建表

不新增：

```text
track_heat_snapshot
```

原因：

```text
赛道热度可以通过 track_tag_relation + tag_heat_snapshot 聚合得到。
```

即：

```text
track
  ↓
track_tag_relation
  ↓
tag_heat_snapshot
  ↓
聚合出赛道热度
```

---

## 9. 新增：track_analysis_snapshot

新增一张低频分析快照表，用于记录 AI / 人工对赛道的阶段性分析。

```sql
track_analysis_snapshot
- id
- track_id
- analysis_date

- market_space
- market_size
- growth_rate
- heat_summary

- ai_summary
- opportunity_points
- risk_points
- watch_signals

- score
- confidence_level

- created_at
```

用途：

```text
赛道对比页读取该表，用于展示市场空间、当前规模、增长速度、机会、风险和 AI 分析。
```

---

## 10. 数据边界

```text
source_item = 外部市场材料原文，归市场雷达
knowledge_note = 个人笔记原文，归知识库
track_material = 赛道引用材料 + 赛道视角判断，归赛道发现
stock_track_relation = 标的与赛道的人工确认关系
tag_edge_snapshot = 市场信息流里的标签共现关系
```

不要混淆：

```text
track_material 不是原文表；
stock_track_relation 不是市场共现；
tag_edge_snapshot 不是人工绑定关系。
```

---

## 11. 写入规则

信息流命中赛道：

```text
source_item
  ↓
source_tag / tag
  ↓
track_tag_relation
  ↓
生成 track_material(status=pending)
```

人工确认后：

```text
pending → confirmed
```

人工排除后：

```text
pending → ignored
```

用户在赛道页主动引用信息流或笔记：

```text
直接生成 track_material(status=confirmed)
```

用户在知识库写笔记并关联赛道：

```text
可生成 track_material(status=pending)
```

---

## 12. 最终表结构范围

赛道发现模块第一版核心表收敛为：

```text
track
track_tag_relation
stock_track_relation
track_material
track_status_history
track_analysis_snapshot
```

删除 / 不使用：

```text
track_related_stock
track_thesis
track_validation_indicator
track_evidence
track_heat_snapshot
```

---

## 13. 一句话总结

```text
source_item 保存外部材料；
knowledge_note 保存个人笔记；
track_material 保存赛道引用和判断；
stock_track_relation 保存赛道绑定标的；
track_analysis_snapshot 保存 AI / 人工赛道分析；
赛道热度从 tag_heat_snapshot 聚合，不单独建表。
```
