-- 资讯重要标记：来源自带的「重要」，目前只有富途快讯的 level（0 普通，1 重要）。
--
-- 之前「重要」是查询时拿 16 个关键词去标题和正文里 ILIKE，每次都全表扫两遍（列表 + 总数），
-- 而且「AI」「芯片」这类词让大量普通快讯被算成重要。改为入库时由来源给出，查询按字段筛。
--
-- 老数据一律 FALSE：富途接口只返回最新的快讯，已入库的拿不回 level；
-- 不用关键词回填，避免新旧两批「重要」口径不一致。
--
-- 必须在重启服务前执行：模型已带这一列，不执行会导致 source_item 相关查询报错。
-- 幂等，可重复执行。

ALTER TABLE source_item
    ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_source_item_important_feed
    ON source_item (is_important, publish_time, id);
