# CLS Market Flash Design

## Goal

接入财联社市场快讯，作为市场雷达的信息源输入，写入 `market_radar.source_item`，后续继续驱动标签抽取、热度聚合、关系图和候选赛道。

## Architecture

第一版不新增配置项，不新增独立新闻中心，也不新增一级导航。财联社通过现有 `market_radar.fetch_news` 任务接入，默认使用 AkShare 的 `stock_info_global_cls(symbol="全部")`。运行参数只保留任务参数 `limit`，后续接多源时再考虑 `system_config`。

快讯落库使用现有 `source_item`：

- `source_type = "news"`
- `source_name = "财联社"`
- `title` 来自财联社标题，缺失时取内容前 120 字
- `content` 来自财联社内容
- `publish_time` 来自发布日期和发布时间

去重规则不改表结构，按 `source_type + source_name + publish_time + title` 查询已有记录；重复快讯跳过。这样避免为了第一版给 spec 表结构增加额外字段。

## Web Entry

入口放在：

```text
市场雷达 / 市场快讯
```

它沿用当前 `market-radar` 的 `sources` 二级页，只把用户可见命名从“信息源”优化为“市场快讯”。控制台仍只负责任务运行和运维，不作为日常快讯浏览入口。

## Testing

- 后端单测覆盖财联社行标准化、重复抓取去重、任务返回插入/跳过数量。
- 前端执行 `npm.cmd run build` 验证 TypeScript 和构建。
