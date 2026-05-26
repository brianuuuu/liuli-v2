import { ReloadOutlined, SearchOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, Drawer, Input, Select, Space, Tag, Typography, message } from "antd";
import { UIEvent, useCallback, useEffect, useMemo, useState } from "react";
import { listSourceItems, syncClsMarketFlashes, syncFutuMarketFlashes } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import type { SourceItem } from "../../../types/api";
import { filterFlashRows } from "./flashFilters";
import { FLASH_PAGE_SIZE, shouldLoadNextFlashPage } from "./flashPagination";
import { formatTime } from "./shared";

const flashTypes = new Set(["news", "policy", "sentiment", "announcement", "financial"]);

const sourceTypeOptions = [
  { value: "news", label: "新闻" },
  { value: "policy", label: "政策" },
  { value: "sentiment", label: "舆情" },
  { value: "announcement", label: "公告" },
  { value: "financial", label: "财报" }
];

function isImportantFlash(item: SourceItem) {
  const text = `${item.title}\n${item.content}`;
  return /重要|重大|风口|电报解读|预增|预减|停牌|复牌|重组|并购|处罚|监管|芯片|半导体|AI|算力/.test(text);
}

function flashDate(item: SourceItem) {
  return item.publish_time ? item.publish_time.slice(0, 10) : "未注明日期";
}

function flashText(item: SourceItem) {
  return `${item.title}\n${item.content}`.toLowerCase();
}

function dotClass(item: SourceItem) {
  if (isImportantFlash(item)) return "flash-dot important";
  if (item.source_type === "announcement" || item.source_type === "financial") return "flash-dot filing";
  return "flash-dot";
}

export function FlashSection() {
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingMoreSources, setLoadingMoreSources] = useState(false);
  const [hasMoreSources, setHasMoreSources] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [sourceName, setSourceName] = useState<string | undefined>();
  const [sourceType, setSourceType] = useState<string | undefined>();
  const [importantOnly, setImportantOnly] = useState(false);
  const [activeTagId, setActiveTagId] = useState<number | null>(null);
  const [syncingCls, setSyncingCls] = useState(false);
  const [syncingFutu, setSyncingFutu] = useState(false);
  const [detail, setDetail] = useState<SourceItem | null>(null);

  const loadSourcePage = useCallback(async (offset: number, replace: boolean) => {
    if (replace) {
      setLoadingSources(true);
    } else {
      setLoadingMoreSources(true);
    }
    try {
      const nextItems = await listSourceItems({ limit: FLASH_PAGE_SIZE, offset });
      setHasMoreSources(nextItems.length === FLASH_PAGE_SIZE);
      setSourceItems((currentItems) => {
        if (replace) return nextItems;
        const seenIds = new Set(currentItems.map((item) => item.id));
        return [...currentItems, ...nextItems.filter((item) => !seenIds.has(item.id))];
      });
    } finally {
      if (replace) {
        setLoadingSources(false);
      } else {
        setLoadingMoreSources(false);
      }
    }
  }, []);

  const refreshFirstPage = useCallback(async () => {
    await loadSourcePage(0, true);
  }, [loadSourcePage]);

  useEffect(() => {
    void refreshFirstPage();
  }, [refreshFirstPage]);

  const sourceOptions = useMemo(() => {
    const names = Array.from(new Set(sourceItems.map((item) => item.source_name).filter(Boolean))).sort();
    return names.map((name) => ({ value: name, label: name }));
  }, [sourceItems]);

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const filteredRows = sourceItems
      .filter((item) => flashTypes.has(item.source_type))
      .filter((item) => !sourceName || item.source_name === sourceName)
      .filter((item) => !sourceType || item.source_type === sourceType)
      .filter((item) => !importantOnly || isImportantFlash(item))
      .filter((item) => !query || flashText(item).includes(query))
      .sort((a, b) => String(b.publish_time || b.created_at || "").localeCompare(String(a.publish_time || a.created_at || "")));

    return filterFlashRows(filteredRows, { activeTagId });
  }, [activeTagId, importantOnly, keyword, sourceItems, sourceName, sourceType]);

  const feedItems = useMemo(() => {
    const result: Array<{ type: "date"; date: string; key: string } | { type: "flash"; item: SourceItem; key: string }> = [];
    let lastDate = "";
    rows.forEach((item) => {
      const currentDate = flashDate(item);
      if (currentDate !== lastDate) {
        result.push({ type: "date", date: currentDate, key: `date-${currentDate}` });
        lastDate = currentDate;
      }
      result.push({ type: "flash", item, key: `flash-${item.id}` });
    });
    return result;
  }, [rows]);

  async function syncCls() {
    setSyncingCls(true);
    try {
      const result = await syncClsMarketFlashes(100);
      if (!result.success) {
        message.error(result.message || "同步财联社快讯失败");
        return;
      }
      message.success(`新增 ${result.inserted_count} 条，跳过 ${result.skipped_count} 条`);
      await refreshFirstPage();
    } finally {
      setSyncingCls(false);
    }
  }

  async function syncFutu() {
    setSyncingFutu(true);
    try {
      await syncFutuMarketFlashes(100);
      message.success("已提交富途同步任务");
      await refreshFirstPage();
    } finally {
      setSyncingFutu(false);
    }
  }

  function resetFilters() {
    setKeyword("");
    setSourceName(undefined);
    setSourceType(undefined);
    setImportantOnly(false);
    setActiveTagId(null);
  }

  function toggleTagFilter(tagId: number) {
    setActiveTagId((current) => (current === tagId ? null : tagId));
  }

  function handleFlashScroll(event: UIEvent<HTMLDivElement>) {
    if (loadingSources || loadingMoreSources || !hasMoreSources) return;
    const target = event.currentTarget;
    if (!shouldLoadNextFlashPage(target)) return;
    void loadSourcePage(sourceItems.length, false);
  }

  return (
    <>
      <div className="flash-layout">
        <div className="flash-content-column">
          <section className="flash-feed-panel">
            <div className="flash-command-bar">
              <div className="flash-command-primary">
                <div className="flash-toolbar-left" aria-label="快讯重要性筛选">
                  <button className={!importantOnly ? "flash-segment active" : "flash-segment"} onClick={() => setImportantOnly(false)}>
                    全部
                  </button>
                  <button className={importantOnly ? "flash-segment active important" : "flash-segment"} onClick={() => setImportantOnly(true)}>
                    重要
                  </button>
                </div>
                <div className="flash-command-summary">
                  <span>{rows.length} 条信息流</span>
                  {activeTagId ? <span>已按标签筛选</span> : null}
                </div>
              </div>
              <Space className="flash-command-actions" size={8}>
                <Button size="small" icon={<SyncOutlined />} loading={syncingCls} onClick={syncCls}>同步财联社</Button>
                <Button size="small" icon={<SyncOutlined />} loading={syncingFutu} onClick={syncFutu}>同步富途</Button>
                <Button size="small" icon={<ReloadOutlined />} loading={loadingSources} onClick={refreshFirstPage}>刷新</Button>
              </Space>
            </div>
            <div className="flash-scroll" onScroll={handleFlashScroll}>
              <div className="flash-feed">
                {feedItems.map((entry) => {
                  if (entry.type === "date") {
                    return (
                      <div className="flash-date-row" key={entry.key}>
                        <span className="flash-rail-line" />
                        <div className="flash-date-label">{entry.date}</div>
                      </div>
                    );
                  }
                  const item = entry.item;
                  const itemTags = (item.source_tags || []).map((sourceTag) => sourceTag.tag).filter(Boolean).slice(0, 8);
                  return (
                    <article className="flash-row" key={entry.key}>
                      <div className="flash-rail">
                        <span className="flash-rail-line" />
                        <span className={dotClass(item)} />
                      </div>
                      <button className="flash-line" onClick={() => setDetail(item)}>
                        <div className="flash-line-head">
                          <span className="flash-time">{formatTime(item.publish_time)}</span>
                          <span>{item.source_name}</span>
                          <span>{item.source_type}</span>
                          {isImportantFlash(item) ? <Tag color="orange">重要</Tag> : null}
                        </div>
                        <div className="flash-title">{item.title}</div>
                        <div className="flash-content">{item.content}</div>
                        <div className="flash-tags">
                          {itemTags.length ? itemTags.map((tag) => (
                            <Tag
                              className={activeTagId === tag.id ? "flash-tag active" : "flash-tag"}
                              key={tag.id}
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleTagFilter(tag.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                event.stopPropagation();
                                toggleTagFilter(tag.id);
                              }}
                            >
                              {tag.name}
                            </Tag>
                          )) : <span>暂无命中标签</span>}
                        </div>
                      </button>
                    </article>
                  );
                })}
                {!loadingSources && feedItems.length === 0 ? <EmptyAction description="暂无快讯，可同步财联社或调整筛选条件" /> : null}
                {loadingMoreSources ? <div className="flash-load-more">加载更多信息流...</div> : null}
                {!hasMoreSources && feedItems.length > 0 ? <div className="flash-load-more">已加载全部信息流</div> : null}
              </div>
            </div>
          </section>
        </div>

        <aside className="flash-filter-panel">
          <Typography.Title level={5}>筛选</Typography.Title>
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索标题或正文"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select allowClear placeholder="来源" value={sourceName} options={sourceOptions} onChange={setSourceName} />
            <Select allowClear placeholder="类型" value={sourceType} options={sourceTypeOptions} onChange={setSourceType} />
            <Button block onClick={resetFilters}>重置筛选</Button>
          </Space>
        </aside>
      </div>

      <Drawer
        title="快讯详情"
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        width={580}
      >
        {detail ? (() => {
          const content = detail.content || "";
          const match = content.match(/^【(.*?)】(.*)$/s);
          const lead = match ? match[1] : null;
          const body = match ? match[2].trim() : content;

          const sourceTypeNames: Record<string, string> = {
            news: "新闻",
            policy: "政策",
            sentiment: "舆情",
            announcement: "公告",
            financial: "财报"
          };

          return (
            <div className="flash-detail-container">
              <h2 className="flash-detail-title">{detail.title}</h2>
              
              <div className="flash-detail-meta">
                <span className="flash-detail-meta-item" style={{ fontWeight: 600, color: 'var(--ll-accent)' }}>
                  {detail.source_name}
                </span>
                <span className="flash-detail-meta-divider">|</span>
                <span className="flash-detail-meta-item">
                  <Tag size="small" style={{ margin: 0, fontSize: '11px', height: '18px', lineHeight: '16px' }}>
                    {sourceTypeNames[detail.source_type] || detail.source_type}
                  </Tag>
                </span>
                <span className="flash-detail-meta-divider">|</span>
                <span className="flash-detail-meta-item">
                  {formatTime(detail.publish_time)}
                </span>
              </div>

              {lead ? (
                <div className="flash-detail-lead">
                  {lead}
                </div>
              ) : null}

              <div className="flash-detail-body">
                {body}
              </div>

              <div className="flash-detail-actions">
                <Button 
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(content);
                    message.success("已复制正文");
                  }}
                >
                  复制原文
                </Button>
                {detail.source_url ? (
                  <Button 
                    size="small" 
                    type="primary" 
                    href={detail.source_url} 
                    target="_blank"
                  >
                    查看外部链接
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })() : null}
      </Drawer>
    </>
  );
}
