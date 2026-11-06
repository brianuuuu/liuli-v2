# 微操建议复盘 Web 展示实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将调仓建议和风险警示的分类统计变为可展开、可解释的复盘视图。

**Architecture:** 复用现有只读接口，汇总数字以服务端为准，Web 将返回的报告与分类关联。保留全量统计，在报告明细不完整时明确标注范围，不把近期记录误当全部样本。

**Tech Stack:** 现有 React、TypeScript、Ant Design、Vite。

**Spec:** 用户已批准本聊天中的“分类汇总 + 展开具体记录”方案；项目约束见 `docs/liuli_system_spec.md` 第 14.3 节与 Web 调仓复盘说明。

## Global Constraints

- 仅改 Web 展示；不修改后端、数据库表结构、数据库数据、评估规则或 Android。
- 继续当前分支；用户后续已明确授权提交并推送，不部署。
- 只运行不访问数据库的前端验证。
- 原接口最多返回 200 份报告；超出时显示“全部历史统计 / 最近 200 份报告明细”，近期待评估数量须标清范围。
- 报告中的复杂交易条件保留原文；价格触及不解释成条件满足或实际成交。
- 接口未提供的仓位变化、辅助信号、原始风险 change 字段不虚构；风险变化用已有报告记录对照展示。

## Review Focus

- 未满期与行情/评估缺失无法仅凭现有接口精确区分，统一说明待满期或补齐数据，不按自然日推算交易日。
- 连续同方向未执行建议去重，持仓组合不同不混算；完整历史才判断样本归属。
- 维持/等待但有 warning/severe 的记录仍展示风险评估。
- 风险历史降级不覆盖过去警示的事后评估；0% 与无样本分开。
- 切换组合、失败和较晚返回的旧请求不能显示成新组合的数据。

### Task 1: 关联分类和报告记录

**Files:** 新建 `invest_assistant/ui/web/src/pages/portfolio/adviceReviewPresentation.ts` 与 `.test.mjs`。

**Interfaces:** 消费 `AdjustAdviceReviews`；输出 `buildAdviceReviewGroups(data, kind)`，供两个统计视图共用。

- [x] 写针对重复建议、不同组合、待评估、风险降级、截断历史和空数据的纯前端测试，并确认失败。
- [x] 实现只读展示转换；保持后台汇总数值，不修改传入对象。
- [x] 运行 `node --test src/pages/portfolio/adviceReviewPresentation.test.mjs`，7 项全部通过。

### Task 2: 可展开复盘展示

**Files:** 新建 `AdviceStatsReview.tsx`；修改 `AdjustAdviceReview.tsx`、`TradeReview.tsx`、`global.css` 与对应既有结构检查。

**Interfaces:** 消费 Task 1 的分组与明细，复用现有报告读取入口。

- [x] 两个页签改名，增加涉及股票、已评估/待评估、文字结果、样本不足提示及展开记录。
- [x] 展开显示日期、股票、建议数量/价格/星级、原始理由、执行与价格触及、后续收益和评估解释；风险显示个股/基准/差值及后续风险级别。
- [x] 使用既有接口 limit=200；加载、失败及组合切换时避免旧结果误显示；保留原报告列表。
- [x] 更新既有前端结构检查；运行前端测试、TypeScript 检查和 Vite 构建。
- [x] 使用浏览器检查展开交互、明暗主题、空数据及待评估状态；测试数据不接触数据库。

## 验证记录

- 组合相关测试 22/22 通过；TypeScript 检查与 Vite 构建通过。构建有现有大资源包提示。
- 全量 Web `.test.mjs` 从仓库根目录运行：69/72 通过。三个失败项在 HEAD 导出的修改前源码中均复现：`score trend shares the valuation chart palette`、`buildLatestRatingRadarOption uses a ten-point scale and the profile values`、`trackMaterialDirectionColor.test.mjs`。没有改动这些业务或主题配色。
- Playwright 使用独立 Web 预览和拦截的只读接口测试数据，验证展开、风险降级、原报告、空组合、失败组合、历史截断提示、明暗主题与 1280px 布局通过；无真实数据库访问。
- 独立代码复核未发现可操作问题。
- 实现完成后，用户已明确要求提交并推送当前分支；部署不在本次范围内。
