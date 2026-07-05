---
name: liuli-stock-valuator
description: Use when producing a three-year valuation report for an A-share listed company with liuli's 标的估值师 researcher, including latest financial-period confirmation, guidance or flash-result checks, current market value retrieval, profit/FCF/revenue valuation models, final JSON output, and upload through liuli research feedback.
---

# Liuli Stock Valuator

## Overview

Use this skill to value an A-share target company with liuli's `标的估值师` researcher. The workflow is evidence-first and order-sensitive: get the complete researcher profile from liuli, request target materials, collect Tushare structured financial and market data, collect CNINFO official disclosures and professional market context, then apply the researcher's method section.

## Required Source Order

1. Fetch the researcher profile from the liuli MCP tool `knowledge_base.get_researcher_profile` with `researcher="标的估值师"` or `researcher="valuator_001"`. If the MCP tool is unavailable, the profile is not found, or the response lacks `researcher_code`, stop and explain that the valuation cannot continue.
2. Build the valuator context from that single response in this exact order: researcher metadata, `intro`, `soul`, `method`. Keep `id`, `profile_content`, `profile_path`, `profile_hash`, `researcher_code`, `display_name`, and `status` in the evidence scope when available. Do not request target, Tushare, or website data before this context is available.
3. Do not call legacy standalone researcher soul/method tools; they are no longer part of the liuli researcher model.
4. Request target materials from liuli stock-analysis, stock master, local target materials, Tushare MCP, or another structured A-share source. Confirm stock identity, company short name, pure-digit `company_code`, exchange suffix for lookup, business summary, known stock pool context, and available local materials.
5. Request related Tushare structured data before external websites. Gather the latest financial period, the prior comparable quarter/year, and the recent 3-5 fiscal years when available. At minimum use `stock_basic`, `income`, `balancesheet`, `cashflow`, `fina_indicator`, and `daily_basic`; add `forecast`, `express`, and `disclosure_date` when available for guidance and reporting schedule checks.
6. Query official and professional external sources only after the Tushare pass:
   - 巨潮资讯网/CNINFO: latest periodic report, latest earnings forecast, latest flash result, announcements, and official disclosure facts.
   - 东方财富 or AkShare: current market value, valuation snapshot, quote-derived market data, and finance/news cross-checks.
   - 新浪财经: company and industry news context.
   - 雪球 and 知乎: market consensus, disagreement, and controversy only; never let them override Tushare financial data or CNINFO official disclosures.
7. Reconcile conflicts by source priority: CNINFO for official disclosure facts, Tushare for structured financial and market fields, Eastmoney/AkShare for latest market value, finance news for event context, Xueqiu/Zhihu for sentiment and controversy only.
8. Apply the profile's `method` section to produce the valuation. Do not invent missing data. State gaps clearly and lower confidence when key evidence is missing. Do not use K-line or short-term chart patterns as valuation evidence.
9. After the final Markdown report is produced, upload it through liuli MCP tool `knowledge_base.upload_research_feedback`. The upload metadata must come from the current execution context: `researcher_code` from the profile response, `skill_name` from this skill's frontmatter `name`, and `business_module` from the current task context. If the upload tool is unavailable, not allowlisted, or any required metadata is missing, stop and state that the report was not uploaded.

## Output Contract

Produce a Chinese Markdown report unless the user asks otherwise. The report body must come first, and the final JSON must be the last content in the report.

The report must include:

- 目标公司、股票代码、分析日期、数据截止日期。
- 研究员上下文摘要: `researcher_code`, `display_name`, 状态、profile hash、简介/价值观/方法论摘要。
- 数据覆盖范围: 标的资料来源、Tushare 财务/估值期间、巨潮公告期间、东方财富/AkShare 市值口径、新闻/观点期间。
- 最新财报确认、业绩预告或业绩快报校验、当季表现、公司阶段、三种模型估值、主模型选择、预期空间判断、最新市值。
- 每个估值模型的关键假设、证据、反证或不确定性、置信度。
- Final JSON using the exact field names required by the researcher profile. For successful reports, include `company`, `company_code`, `report_period`, `report_release_date`, `current_market_value`, `financial_performance`, `trend_reference`, `guidance_check`, `quarter_performance`, `quarter_main_reason`, `profit_model`, `fcf_model`, `revenue_model`, `primary_model`, `expected_market_value_3y`, `expectation_gap_rate`, `analysis_date`, and `researcher_code`.
- If required data is insufficient, end with only an error JSON such as `{ "error": "数据不足或财报周期无法确认" }`.

Do not output buy/sell or position-sizing instructions unless the user explicitly asks for investment decision support. Valuation output is research analysis, not trading advice.

## Research Feedback Upload

When uploading to `knowledge_base.upload_research_feedback`, pass the exact Markdown report body as `markdown`. The tool writes the report body to the report library and stores only feedback index fields such as `report_id`, `report_path`, `researcher_code`, `skill_name`, and `business_module`; do not ask the tool or database to store a second copy of the report body in `knowledge_research_feedback`.

Use this metadata:

- `title`: `公司名称-YYYY-MM-DD-标的估值报告`, for example `万东医疗-2026-07-05-标的估值报告`.
- `researcher_code`: the non-empty value returned by `knowledge_base.get_researcher_profile`.
- `skill_name`: the non-empty `name` in this skill's frontmatter.
- `business_module`: the non-empty business module from the current task context, normally `stock_analysis`.

After a successful upload, include a short result section with `feedback_id`, `report_id`, `report_path`, and `status`. If any of these fields are absent, treat the upload as unconfirmed.

## Failure Handling

If `knowledge_base.get_researcher_profile` is unavailable, the profile cannot be found, or `researcher_code` is missing, stop and explain that the valuator context cannot be built. Do not substitute memory, local files, or stale copies.

If `knowledge_base.upload_research_feedback` is unavailable or the required upload metadata cannot be derived from the current MCP/profile/task context, stop before claiming completion and explicitly mark the report as not uploaded.

If current market value cannot be retrieved, do not produce a normal valuation JSON; end with an error JSON that states the missing data.

If recent financial-period confirmation or guidance/flash-result checking is incomplete, follow the researcher profile's error rules rather than filling gaps.

If Tushare data is unavailable, continue only when the user accepts a lower-confidence qualitative valuation. Mark financial models as insufficiently supported and do not produce importable normal JSON unless required numeric fields are confirmed.

If recent announcements or news are sparse, use the available official filings and say the evidence window is incomplete.

For detailed workflow and JSON requirements, read `references/valuation-workflow.md`.
