# 琉璃项目：赛道发现模块小范围重构说明

> 目的：收敛赛道发现模块中过重的“假设 / 指标 / 证据”设计，改为更适合个人投研系统的“赛道 + 赛道动态 + 材料引用”结构。  
> 适用范围：`track_discovery` 模块。  

---

## 1. 重构核心结论

赛道发现仍然是 Web 一级模块，但它不是复杂论文式研究系统。

本次重构将赛道发现收敛为：

```text
track
= 赛道主体

track_tag_relation
= 赛道绑定多个 tag

track_related_stock
= 赛道绑定标的

track_status_history
= 赛道状态历史

track_material
= 某条材料被纳入某个赛道视角后的引用和判断
```

其中：

```text
source_item
= 外部市场信息流，归市场雷达

knowledge_note
= 个人笔记 / 心得 / 复盘 / 判断，归知识库

track_material
= 赛道模块对 source_item / knowledge_note 的引用和判断
```

一句话：

```text
原文不进赛道模块；
赛道模块只保存“这条材料和哪个赛道有关，以及我怎么看它”。
```

---

## 2. 页面命名调整

赛道发现作为一级模块保留，二级内容页调整为：

```text
赛道发现
├── 赛道看板
├── 赛道库
├── 赛道动态
└── 赛道对比
```

说明：

```text
赛道看板
= 发现入口 / 判断驾驶舱

赛道库
= 赛道主数据 / 状态 / 优先级 / 标签绑定/ 标的绑定 / 当前判断

赛道动态
= 跨赛道的材料流 / 动态流 / 判断入口
= 展示 source_item 和 knowledge_note 被引用到赛道后的记录

赛道对比
= 多赛道横向比较
```

动态详情页保留：

```text
/track-discovery/[track_id]
= 赛道详情
```

注意：

```text
“赛道动态”是二级内容页；
“赛道详情”是动态路由详情页；
二者不冲突。
```

---

## 3. 为什么不用“赛道事件”作为最终名称

之前讨论过：

```text
赛道事件
赛道证据
赛道材料
赛道线索
赛道观察
赛道动态
```

最终建议二级页使用：

```text
赛道动态
```

原因：

```text
1. “事件”偏窄，只适合新闻、公告、政策等客观事件。
2. “证据”偏重，容易回到复杂研究论证系统。
3. “材料”贴近底层表，但产品感弱。
4. “动态”既能覆盖外部信息流，也能覆盖个人笔记、复盘和判断。
```

底层表名不使用 `track_event`，而使用：

```text
track_material
```

原因：

```text
track_material 更准确表达“被纳入赛道判断的材料”；
它引用的不一定都是事件，也可能是个人心得、复盘、判断。
```

---

## 4. 删除的表

第一版不建设以下复杂表：

```text
track_thesis
track_validation_indicator
track_evidence

```

---

## 6. 新建表：track_material

### 6.1 表定位

`track_material` 表示：

```text
某条 source_item 或 knowledge_note 被纳入某个赛道视角后的引用和判断。
```

它不是原文表，不保存新闻全文，不保存笔记正文。

原文仍保存在：

```text
source_item.content
knowledge_note.content
```

`track_material` 只保存赛道视角下的判断字段。

---

## 7. track_material 推荐表结构

```sql
CREATE TABLE track_material (
    id INTEGER NOT NULL,

    track_id INTEGER NOT NULL,

    material_type VARCHAR(32) NOT NULL,
    material_id INTEGER NOT NULL,

    direction VARCHAR(32),
    importance_level VARCHAR(16),
    status VARCHAR(32) NOT NULL,

    note TEXT,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    PRIMARY KEY (id),
    UNIQUE (track_id, material_type, material_id)
);
```

### 7.1 字段说明

```text
track_id
= 关联哪个赛道

material_type
= source_item / knowledge_note

material_id
= source_item.id 或 knowledge_note.id

direction
= support / weaken / neutral / noise
= 这条材料对赛道判断的方向

importance_level
= high / medium / low
= 这条材料的重要性

status
= pending / confirmed / ignored
= 待确认 / 已确认 / 已忽略

note
= 赛道视角的一句话判断
```

---

## 8. track 表建议补充字段

为了替代复杂的 `track_thesis`，建议在 `track` 表中补充少量当前判断字段：

```sql
track
- id
- name
- description
- status              -- candidate / active / paused / archived
- priority_level      -- high / medium / low，可选
- current_view        -- 当前核心判断
- archive_reason
- created_at
- updated_at
```

说明：

```text
current_view
= 当前对这个赛道最核心的判断
```

---

## 9. source_item 与 track_material 的关系

外部信息流进入市场雷达：

```text
source_item
  ↓
source_tag
  ↓
tag
  ↓
track_tag_relation
  ↓
找到相关 track
  ↓
生成 track_material(status=pending)
  ↓
人工确认后 status=confirmed
```

说明：

```text
source_item 是外部市场信息流原文；
track_material 是这条信息被纳入某个赛道后的判断记录。
```

不要把所有命中赛道的 `source_item` 都直接变成 confirmed。

推荐规则：

```text
自动匹配 → pending
人工确认 → confirmed
人工排除 → ignored
```

---

## 10. knowledge_note 与 track_material 的关系

个人笔记仍然归知识库：

```text
knowledge_note
= 个人心得 / 复盘 / 原始判断 / 投资原则
```

如果某条笔记与赛道有关：

```text
knowledge_note
  ↓
track_material(material_type=knowledge_note)
```

说明：

```text
知识库保存笔记原文；
赛道发现只引用这条笔记，并添加赛道视角判断。
```

---

## 11. 写入 track_material 的触发方式

建议采用半自动机制。

### 11.1 外部信息流 source_item

```text
source_item 入库
  ↓
系统根据 tag 命中和 track_tag_relation 找到相关赛道
  ↓
自动生成 track_material(status=pending)
  ↓
用户确认后改为 confirmed
```

不要直接自动写入 confirmed。

原因：

```text
source_item 命中某个赛道 tag，只能说明“相关”，
不能说明这条信息值得进入赛道动态。
```

### 11.2 个人笔记 knowledge_note

如果用户在知识库里主动关联某个赛道：

```text
knowledge_note 入库
  ↓
用户选择关联 track
  ↓
可生成 track_material(status=pending 或 confirmed)
```

建议：

```text
从知识库新增并选择赛道
→ 默认 pending

从赛道详情页新增笔记
→ 可直接 confirmed
```

### 11.3 赛道页面手动引用

如果用户在赛道详情或赛道动态页主动添加材料：

```text
选择 source_item / knowledge_note
  ↓
写入 track_material(status=confirmed)
```

原因：

```text
用户在赛道页主动引用，本身已经表达了确认意图。
```

---

## 12. 页面展示逻辑

### 12.1 赛道动态页

路径：

```text
/track-discovery/materials
```

或前端页面名称：

```text
赛道动态
```

展示内容：

```text
时间
赛道
材料标题
材料类型
方向
重要性
状态
赛道视角备注
来源
```

材料标题从原表读取：

```text
material_type = source_item
→ source_item.title

material_type = knowledge_note
→ knowledge_note.title
```

材料正文从原表读取：

```text
material_type = source_item
→ source_item.content

material_type = knowledge_note
→ knowledge_note.content
```

`track_material` 不重复保存标题和正文。

### 12.2 状态筛选

默认展示：

```text
confirmed
```

可切换：

```text
pending
ignored
all
```

### 12.3 方向筛选

```text
support
weaken
neutral
noise
```

含义：

```text
support
= 强化赛道判断

weaken
= 削弱赛道判断

neutral
= 中性观察

noise
= 噪音，不作为有效判断依据
```

---

## 13. 赛道详情页中的展示

路径：

```text
/track-discovery/[track_id]
```

赛道详情页展示：

```text
基础信息
当前判断 current_view
状态 status
优先级 priority_level
阶段 stage
置信度 confidence_level
绑定 tag
相关标的
赛道动态
关联笔记
关联信息流
```

其中：

```text
赛道动态
= 查询 track_material where track_id = 当前赛道
```

---

## 14. 与市场雷达的边界

市场雷达继续负责：

```text
source_item
source_tag
tag
tag_heat_snapshot
tag_edge_snapshot
```

市场雷达回答：

```text
市场正在关注什么？
哪些 tag 升温？
哪些 tag 共现？
```

赛道发现负责：

```text
哪些材料被纳入某个赛道判断？
这条材料对赛道是支持、削弱、中性还是噪音？
这个赛道是否值得继续跟踪？
```

不要让个人笔记污染市场热度。

规则：

```text
knowledge_note 不进入 source_item；
knowledge_note 不参与 tag_heat_snapshot；
knowledge_note 只通过 track_material 影响赛道判断。
```

---

## 15. 与知识库的边界

知识库继续负责：

```text
knowledge_note
knowledge_skill
knowledge_agent
knowledge_feedback_log
```

知识库回答：

```text
我沉淀了什么经验？
哪些经验可以提炼成 Skills？
哪些 Skills 可以反哺 Agent？
```

赛道发现只引用知识库笔记：

```text
track_material.material_type = knowledge_note
track_material.material_id = knowledge_note.id
```

不要在赛道模块里保存笔记正文。

---

## 16. 与 stock_track_relation 的边界

不要混淆：

```text
track_material
= 某条材料和某个赛道有关

stock_track_relation
= 我确认某只股票属于某个赛道
```

例如：

```text
某条新闻同时提到机器人和拓普集团
→ 可以生成 track_material

但不代表拓普集团自动加入机器人赛道
→ 是否写 stock_track_relation 仍需人工确认
```

---

## 17. 第一版最小实现建议

第一版只实现：

```text
1. 建 track_material 表
2. 赛道动态页展示 confirmed / pending 材料
3. 赛道详情页展示当前赛道的 track_material
4. 支持从 source_item 手动加入 track_material
5. 支持从 knowledge_note 手动加入 track_material
6. 支持 direction / importance_level / status / note
```


---

## 19. 最终一句话

本次重构把赛道发现从“复杂假设 / 指标 / 证据系统”收敛为“赛道主体 + 赛道动态材料引用”。

```text
source_item 保存外部材料；
knowledge_note 保存个人笔记；
track_material 保存赛道视角下的引用、方向、重要性、状态和备注。
```
