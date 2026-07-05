---
name: liuli-stock-rater
description: Use when rating an A-share listed company with liuli's 标的评级师, including target stock rating, company research, financial analysis, valuation, announcements, and recent company or industry news. Fetch the complete researcher profile from liuli MCP first, gather Tushare and official/news context, produce a structured Markdown rating, and upload the report through the controlled research-feedback MCP tool; stop when required MCP context or upload metadata is missing.
---

# Liuli Stock Rater

## Overview

Use this skill to rate an A-share target company with liuli's `标的评级师` researcher. The workflow is evidence-first: get the complete researcher profile from liuli, collect structured financial data from Tushare, collect official announcements and recent market context, then apply the researcher's method section.

## Required Source Order

1. Fetch the researcher profile from the liuli MCP tool `knowledge_base.get_researcher_profile` with `researcher="标的评级师"`. If the MCP tool is unavailable, the profile is not found, or the response lacks `researcher_code`, stop and explain that the rating cannot continue.
2. Build the rater context from that single response in this exact order: researcher metadata, `intro`, `soul`, `method`. Keep `profile_content`, `profile_path`, `profile_hash`, `researcher_code`, `display_name`, and `status` in the evidence scope.
3. Do not call legacy standalone researcher soul/method tools; they are no longer part of the liuli researcher model.
4. Resolve the target company through Tushare MCP, then gather the most recent 3-5 years of structured data. At minimum use `stock_basic`, `income`, `balancesheet`, `cashflow`, `fina_indicator`, and `daily_basic` when available.
5. Query official announcements first. Use liuli `market_radar.search_source_items` for locally ingested items, prioritizing `source_type="announcement"` and `source_name="cninfo"`. If local coverage is insufficient and browsing or an official connector is available, use CNINFO as the primary announcement source.
6. Gather recent company and industry news from Eastmoney, Sina Finance, Xueqiu, and Zhihu when accessible. Treat Xueqiu and Zhihu as opinion or sentiment evidence only; they must not override Tushare financials or official announcements.
7. Apply the profile's `method` section to produce the rating. Do not invent missing data. State gaps clearly and lower confidence when key evidence is missing.
8. After the final Markdown report is produced, upload it through liuli MCP tool `knowledge_base.upload_research_feedback`. The upload metadata must come from the current execution context: `researcher_code` from the profile response, `skill_name` from this skill's frontmatter `name`, and `business_module` from the current task context. If the upload tool is unavailable, not allowlisted, or any required metadata is missing, stop and state that the report was not uploaded.

## Output Contract

Produce a Markdown report in Chinese unless the user asks otherwise. Put the conclusion near the top, then show the evidence scope and rating details.

The report must include:

- 目标公司、股票代码、评级日期、数据截止日期。
- 研究员上下文摘要：`researcher_code`、`display_name`、状态、profile hash、简介/价值观/方法论摘要。
- 数据覆盖范围：Tushare 财务和估值期间、公告期间、新闻/观点期间。
- 商业模式、管理层、治理、战略、确定性、成长性逐项评分和证据。
- 综合评分、等级、估值区间、关键假设、主要风险。
- 最终 JSON，字段和评分口径按 profile 的方法论优先；缺字段时使用 `null` 并解释原因。

Do not output direct buy/sell or position-sizing instructions unless the user explicitly asks for investment decision support. Ratings are research analysis, not trading orders.

When uploading to `knowledge_base.upload_research_feedback`, pass the exact Markdown report body as `markdown`. The `title` must use the strict format `公司名称-YYYY-MM-DD-报告类型`; for this skill the report type is always `标的评级报告`, for example `万东医疗-2026-07-05-标的评级报告`. The tool writes the report body to the report library and stores only the feedback index fields such as `report_id`, `report_path`, `researcher_code`, `skill_name`, and `business_module`; do not ask the tool or database to store a second copy of the report body in `knowledge_research_feedback`.

After a successful upload, include a research feedback result section with `feedback_id`, `report_id`, `report_path`, and `status`. If any of these fields are absent from the upload response, treat the upload as incomplete and state that the report was not confirmed as uploaded.

## Failure Handling

If `knowledge_base.get_researcher_profile` is unavailable, the profile cannot be found, or `researcher_code` is missing, stop and explain that the rater context cannot be built. Do not substitute memory, local files, or stale copies.

If `knowledge_base.upload_research_feedback` is unavailable or the required upload metadata cannot be derived from the current MCP/profile/task context, stop before claiming completion and explicitly mark the report as not uploaded.

If Tushare data is unavailable, continue only when the user accepts a lower-confidence qualitative rating. Mark financial and valuation scores as insufficiently supported.

If recent announcements or news are sparse, use the available official filings and say the evidence window is incomplete.

For detailed field-level workflow and JSON shape, read `references/rating-workflow.md`.
