import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync(new URL("./PortfolioPage.tsx", import.meta.url), "utf8");
const adjustAdvice = fs.readFileSync(new URL("./AdjustAdviceReview.tsx", import.meta.url), "utf8");
const tradeReview = fs.readFileSync(new URL("./TradeReview.tsx", import.meta.url), "utf8");
const positionChange = fs.readFileSync(new URL("./PositionChangeReview.tsx", import.meta.url), "utf8");
const calendar = fs.readFileSync(new URL("./PnlCalendar.tsx", import.meta.url), "utf8");
const scopeBar = fs.readFileSync(new URL("./PortfolioScopeBar.tsx", import.meta.url), "utf8");
const performance = fs.readFileSync(new URL("./PerformanceReview.tsx", import.meta.url), "utf8");
const navigation = fs.readFileSync(new URL("../../app/navigation.tsx", import.meta.url), "utf8");
const chartTheme = fs.readFileSync(new URL("../../components/charts/chartTheme.ts", import.meta.url), "utf8");

assert.match(page, /新建组合/);
assert.match(page, /重命名/);
assert.match(page, /删除组合/);
assert.match(page, /刷新当前组合/);
assert.match(page, /新增持仓/);
assert.match(page, /请选择标的/);
assert.match(page, /股数/);
assert.match(page, /当日盈亏/);
assert.match(page, /当日涨跌幅/);
assert.match(page, /Modal\.confirm/);
assert.match(page, /searchStocks/);
assert.match(page, /getPortfolioOverview/);
assert.match(page, /listPortfolioValueSnapshots/);
assert.match(page, /ChartCard/);
assert.match(page, /市值占比/);
assert.match(page, /组合市值曲线/);
assert.match(page, /标的市值占比/);
assert.match(page, /legendFormatter/);
assert.match(page, /lightAllocationColors/);
assert.match(page, /darkAllocationColors/);
assert.match(page, /allocationColorsForMode/);
assert.match(page, /持仓市值/);
assert.match(page, /graphic/);
assert.match(page, /center: \["63%", "52%"\]/);
assert.match(chartTheme, /return "transparent"/);
assert.match(page, /现金余额/);
assert.match(page, /资金流水/);
// 收益分析独立成子页，只在切到该页时挂载并请求基准行情；调仓复盘只按组合筛选
assert.match(navigation, /\{ key: "portfolios", label: "组合看板" \},\s*\{ key: "performance", label: "收益分析" \},\s*\{ key: "positions", label: "实盘持仓" \},\s*\{ key: "risk", label: "调仓记录" \},\s*\{ key: "review", label: "调仓复盘" \}/);
assert.match(page, /activeTab === "performance"\) return renderPerformance\(\)/);
assert.match(page, /<PerformanceReview/);
assert.doesNotMatch(page, /getPortfolioReviewPerformance/);
assert.doesNotMatch(page, /reviewLineOption|reviewCalendarOption/);
assert.match(tradeReview, /刷新复盘/);
assert.match(performance, /getPortfolioReviewPerformance/);
assert.match(performance, /刷新收益/);
assert.match(performance, /沪深300/);
assert.match(performance, /收益率曲线/);
assert.match(performance, /盈亏日历/);
assert.match(performance, /当月/);
assert.match(performance, /当年/);
assert.match(performance, /有效记录以来/);
assert.match(performance, /reviewLineOption/);
// 曲线 2/3、盈亏日历 1/3 同一行；日历是方格，不再是单行色带
assert.match(performance, /portfolio-performance-grid/);
assert.match(performance, /<PnlCalendar /);
assert.doesNotMatch(performance, /reviewCalendarOption/);
assert.match(calendar, /WEEKDAYS/);
assert.match(performance, /portfolio-review-metrics/);
assert.match(performance, /基准行情可能暂时不可用/);
// 调仓复盘：指标条 → 三张统计表 → 微操报告；口径说明收进标题 ⓘ，正文不再铺说明文字
assert.match(page, /<TradeReview/);
assert.match(tradeReview, /getAdjustAdviceReviews/);
assert.match(tradeReview, /getPositionChangeReview/);
assert.match(tradeReview, /review-kpi-strip/);
// 三张统计表合成一张卡、分段切换；调仓来源逐笔展示标的、股数、金额、20 日影响，每页 10 条
assert.match(tradeReview, /className="tabbed-table-panel"/);
assert.match(tradeReview, /tabbed-table-toolbar/);
assert.match(tradeReview, /toolbar-filter-button active/);
assert.doesNotMatch(tradeReview, /<Segmented/);
assert.match(tradeReview, /调仓来源/);
assert.match(tradeReview, /信号表现/);
assert.match(tradeReview, /风险警示/);
assert.doesNotMatch(tradeReview, /trade-review-grid/);
assert.match(positionChange, /flatMap\(\(row\) => row\.changes\)/);
assert.match(positionChange, /defaultPageSize: 10/);
assert.match(positionChange, /impact_20d/);
assert.match(positionChange, /quantity_delta/);
assert.doesNotMatch(positionChange, /expandedRowRender/);
assert.match(positionChange, /不是已实现盈亏/);
// 微操报告放在数据面板里，表格样式与调仓来源表一致；"显示更多"开关在本表表头最右端，口径说明挂在明细"对错"表头
assert.match(adjustAdvice, /<DataPanel>/);
assert.doesNotMatch(adjustAdvice, /WorkbenchCard/);
assert.match(adjustAdvice, /显示更多/);
assert.doesNotMatch(tradeReview + adjustAdvice, /显示维持和等待/);
assert.match(adjustAdvice, /report-note-toggle/);
assert.doesNotMatch(tradeReview, /showQuiet/);
assert.match(tradeReview, /<header>实际调仓<\/header>/);
assert.match(adjustAdvice, /title="对错" hint=/);
assert.match(adjustAdvice, /HintTitle/);
assert.match(tradeReview, /HintTitle/);
assert.doesNotMatch(adjustAdvice, /Typography\.Paragraph type="secondary"/);
assert.doesNotMatch(positionChange, /Typography\.Paragraph/);
// 统计表不出横向滚动条、样本不足不整行置灰、全页统一"增持 / 减持"、微操机会三态同尺寸
assert.doesNotMatch(positionChange, /max-content/);
assert.doesNotMatch(adjustAdvice, /max-content/);
assert.doesNotMatch(positionChange + adjustAdvice, /adjust-advice-thin-sample/);
assert.match(adjustAdvice, /<SampleCount/);
assert.doesNotMatch(positionChange, /加仓|减仓/);
assert.match(adjustAdvice, /opportunity-badge is-yes/);
assert.match(adjustAdvice, /opportunity-badge is-no/);
assert.doesNotMatch(tradeReview + adjustAdvice, /AdviceStatsPending/);
assert.match(tradeReview, />NA</);
assert.doesNotMatch(tradeReview, /样本 \$\{|待积累|条建议/);
assert.doesNotMatch(page, /coordinateSystem: "calendar"/);
assert.doesNotMatch(page, /cellSize: \["auto", 18\]/);
assert.match(page, /renderOverview/);
assert.match(page, /renderPositions/);
assert.match(page, /renderTrades/);
assert.match(page, /renderReview/);
assert.doesNotMatch(page, /暂无组合复盘/);
assert.doesNotMatch(page, /组合分类维度/);
assert.doesNotMatch(page, /allocationColumns/);

// 组合管理五个页签统一用组合切换条（工具栏按钮），不再用下拉框，也不再写"实盘组合"标题和共用说明
assert.match(scopeBar, /toolbar-filter-button active/);
assert.match(scopeBar, /所有组合/);
assert.equal((page.match(/<PortfolioScopeBar/g) || []).length, 3);
assert.match(performance, /<PortfolioScopeBar/);
assert.match(tradeReview, /<PortfolioScopeBar/);
assert.doesNotMatch(page + performance + tradeReview, /value=\{(overviewPortfolioId|selectedPortfolioId|portfolioId) \?\? 0\}/);
assert.doesNotMatch(page, /WorkbenchCard title="实盘组合"/);
assert.doesNotMatch(page, /与实盘持仓页共用/);

// 整页优化：涨跌色走主题变量（深色主题换亮一档）、来源用普通文字、股数不再红绿、没满期的评估列合并、刷新改图标按钮
assert.doesNotMatch(page + performance + tradeReview + positionChange + adjustAdvice, /#b42318|#047857/);
assert.match(positionChange, /var\(--ll-up\)/);
assert.match(positionChange, /evalLead/);
assert.doesNotMatch(positionChange, /满 20 个交易日后评估/);
assert.doesNotMatch(positionChange, /reasonTypeColors/);
assert.doesNotMatch(positionChange, /value\.slice\(5\)/);
assert.match(tradeReview + page + performance, /ReloadOutlined/);
assert.doesNotMatch(tradeReview + page + performance, />\s*刷新(复盘|看板|收益)\s*</);

// 调仓记录：持仓调整在前、与资金流水合成一个框顶栏切换；校准行写"= 余额"；股数不带小数；去掉币种列；分页 10 条
assert.match(page, /\{ value: "changes", label: "持仓调整"/);
assert.match(page, /className="tabbed-table-panel"/);
assert.match(page, /flow_type === "adjustment"\) return `= \$\{formatMoney/);
assert.match(page, /render: formatShares/);
assert.doesNotMatch(page, /title: "币种"/);
assert.doesNotMatch(page, /\} 估<\/Typography\.Text>/);
assert.match(page, /autoInsertSpace=\{false\}/);

// 实盘持仓：总资产 / 持仓市值 / 现金 / 当日盈亏；去掉价格来源和昨收列，加占比和排序；删除收进菜单；组合管理和现金操作各合成一个下拉
assert.match(page, /metric-panel-label">总资产</);
assert.doesNotMatch(page, /metric-panel-label">当前市值</);
assert.doesNotMatch(page, /title: "价格来源"/);
assert.doesNotMatch(page, /title: "昨收"/);
assert.match(page, />占比</);
assert.match(page, /defaultSortOrder: "descend"/);
assert.match(page, /confirmRemovePosition/);
assert.match(page, /组合管理 <DownOutlined/);
assert.match(page, /现金 <DownOutlined/);
