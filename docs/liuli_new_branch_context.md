# 琉璃项目新对话分支上下文

> 用途：复制到新对话作为第一条消息，或作为后续规格更新的基准说明。  
> 当前目标：在新对话中继续讨论琉璃项目，并避免被旧上下文中的过时设计干扰。

---

## 1. 项目定位

`liuli / 琉璃` 是个人投研系统，不做 SaaS，不做多人协作，不做对外产品化。

核心目标不是直接给买卖建议，而是把：

```text
外部信息流
→ 市场信号
→ 赛道判断
→ 标的研究
→ 预警跟踪
→ 实盘组合
→ 知识沉淀
→ AI 反哺
```

沉淀成个人投资认知闭环。

---

## 2. 最新重要口径

以下内容已经取消，后续不要再默认引用：

```text
tag_candidate
候选标签表
候选词长期表
stock_alias
track_alias
hotword_alias
entity_alias
tag_alias
统一别名表
```

也就是说：

```text
没有 tag_candidate 表；
没有 alias / 别名表体系；
候选词不作为长期业务表沉淀；
别名暂不建模。
```

---

## 3. stock / stock_pool / track / tag

```text
stock
= 系统内部标准 A 股股票基础主数据
= 市场里有哪些股票

stock_pool
= 我的研究标的池
= 我决定研究、观察、重点跟踪哪些股票

track
= 赛道业务实体

tag
= 正式统计标签
```

`stock` 不改名为 `source_stock` 或 `external_stock`。

`stock` 可以是全量 A 股基础库，但不应批量生成全部 `tag(type=stock)`。

```text
stock = 全量或准全量基础库
tag(type=stock) = 按需激活的标的统计标签
```

触发创建 stock tag 的场景：

```text
加入 stock_pool
加入实盘组合
信息流明确命中
手动关注
```

创建 track 后，应生成或确保存在对应 `tag(type=track)`。

---

## 4. hotword 定义

```text
hotword
= 不属于标的、不属于赛道，
  但具备市场关注度、解释力、共现价值，
  值得进入标签体系统计的非标的/非赛道词。
```

普通市场词不是 hotword。只有被市场反复提及、有统计价值的词，才成为 `tag(type=hotword)`。

---

## 5. 市场雷达核心表

当前市场雷达相关核心表应围绕以下结构讨论：

```text
source_item
source_tag
tag
tag_heat_snapshot
tag_edge_snapshot
```

其中：

```text
source_item
= 系统统一外部信息流条目

source_tag
= 信息流与正式 tag 的关联表

tag
= 正式统计标签

tag_heat_snapshot
= 标签热度快照

tag_edge_snapshot
= 标签共现关系快照
```

不要再默认包含：

```text
tag_candidate
hotword_alias
```

---

## 6. 信息流打标流程

已有对象命中不需要 AI：

```text
source_item
  ↓
规则 / 词典 / 已有对象识别
  ↓
命中已有 stock / track / hotword 对应 tag
  ↓
写 source_tag
```

`source_tag` 必须保留，因为一条信息可以命中多个 tag：

```text
source_item
  ↓
source_tag
  ↓
tag
```

不要在 `source_item` 里直接放 `tag_id`。

AI 主要用于：

```text
从当天信息流中提取新词、热词、异动词、叙事词
```

但这些结果不写入长期候选表，只作为页面临时分析结果，人工判断后直接创建正式对象或忽略。

---

## 7. 老信息流与新 tag

老 `source_item` 可以通过回溯任务重新打标。

```text
新增 stock / track / hotword tag
  ↓
触发回溯任务
  ↓
重新匹配近期 source_item
  ↓
补写 source_tag
  ↓
重算 tag_heat_snapshot / tag_edge_snapshot
```

第一版不要做复杂的 tag merge / redirect / canonical term 体系。

如果误建标签或需要调整：

```text
停用 / 删除错误对象
重新创建正确对象
回溯 source_item 打标
重算统计
```

---

## 8. 标的、赛道、tag 的边界

```text
研究关系走业务表
市场统计走 tag 系统
```

标的和赛道的确认关系：

```text
stock_track_relation
```

市场里的共现关系：

```text
tag_edge_snapshot
```

不要混淆：

```text
stock_track_relation
= 我确认这个标的属于这个赛道

tag_edge_snapshot
= 市场信息流里这个标的和某个赛道 / 热点词一起出现
```

---

## 9. 标的池不做自定义分组

标的池不再额外做自定义分组。

原因：

```text
stock_pool.status 表达研究状态
stock_track_relation 表达赛道归属
tag / source_tag / tag_edge_snapshot 表达市场关联
portfolio_group 表达实盘组合分组
```

不再新增：

```text
stock_pool_group
```

`stock_pool.status` 第一版建议：

```text
candidate   候选标的
watching    观察标的
focused     重点跟踪
archived    归档
```

“放弃”可以先并入 `archived`，用原因字段或备注记录。

---

## 10. 赛道状态

赛道状态建议保持 4 个：

```text
candidate   候选赛道
active      跟踪中
paused      暂停观察
archived    归档
```

重点程度不要做成状态，可用：

```text
priority_level
```

---

## 11. 组合管理

组合管理只做实盘组合管理。

```text
portfolio
portfolio_group
portfolio_position
```

组合分组只用于实盘仓位角色，不用于非实盘观察池。

```text
标的分析 = 研究对象管理
组合管理 = 实盘资产管理
```

---

## 12. job_config 最新口径

`job_config` 保持轻量，不把调度细节摊平成字段。

```sql
CREATE TABLE job_config (
    id INTEGER NOT NULL,
    job_name VARCHAR(128) NOT NULL,
    module_name VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    config_json TEXT NOT NULL,
    ext_json TEXT NOT NULL,
    last_run_at DATETIME,
    last_status VARCHAR(32),
    next_run_at DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (job_name)
);
```

调度、启停、cron、超时、重试、参数 schema 等进入 `config_json`。

展示、分类、排序、标签等进入 `ext_json`。

---

## 13. 开发节奏建议

优先级：

```text
P0：市场雷达基础闭环
P1：赛道库 + 标的池 + 标的事件
P2：预警中心最小规则
P3：组合实盘持仓
P4：知识笔记关联
P5：报告 / Agent / RAG
```

不要平均开发六个模块，也不要把市场雷达做成无底洞。

核心路径：

```text
先把市场雷达做成信号发动机，
再让六个模块用最小功能串成闭环。
```

---

## 14. 当前文档状态提醒

旧文档中可能仍残留已经取消的设计，比如：

```text
tag_candidate
stock_alias
track_alias
hotword_alias
```

后续更新文档时，应先清理这些过时设计，再继续扩展。
