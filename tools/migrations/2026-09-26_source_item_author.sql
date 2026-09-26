-- 舆情作者：MCP 批量导入的雪球、微博、知乎舆情带作者，信息流按作者展示和筛选。
--
-- 只有舆情（source_type = 'sentiment'）有作者，其他来源为空；老数据不回填。
-- 索引覆盖舆情导入去重（类型 + 作者 + 时间下限）和按作者筛选。
--
-- 必须在重启服务前执行：模型已带这一列，不执行会导致 source_item 相关查询报错。
-- 幂等，可重复执行。

ALTER TABLE source_item
    ADD COLUMN IF NOT EXISTS author VARCHAR(128);

CREATE INDEX IF NOT EXISTS ix_source_item_author_lookup
    ON source_item (source_type, author, publish_time);
