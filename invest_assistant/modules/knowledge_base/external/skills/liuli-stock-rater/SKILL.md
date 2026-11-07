---
name: liuli-stock-rater
description: Use 琉璃标的评分员 to rate one A-share listed company with Liuli's 标的评级师 using its complete researcher profile, Tushare financial and valuation data, official announcements, and recent company or industry news. Follow an 11-step workflow with light data validation, peer comparison, and disconfirmation checks, plus optional plugin enrichment. Use for target-company ratings, company research, financial analysis, valuation, announcement review, and expectation or sentiment analysis with controlled Liuli research-feedback upload.
---

# 琉璃标的评分员

## Objective

Produce an evidence-first rating for one A-share company. Build the rating context from Liuli's complete `标的评级师` profile, prioritize structured financials and official disclosures, apply the profile's methodology, and upload the exact completed Markdown report through the controlled research-feedback tool.

## Required workflow

1. Call Liuli `knowledge_base.get_researcher_profile` with `researcher="标的评级师"`.
   - Stop if the tool is unavailable, the profile is missing, or `researcher_code` is empty.
   - Build the context from that single response in this order: researcher metadata, `intro`, `soul`, `method`.
   - Keep `id`, `researcher_code`, `display_name`, `status`, `profile_path`, `profile_hash`, `intro`, `soul`, `method`, and `profile_content` in the evidence scope when present.
   - Do not use legacy standalone researcher soul or method tools.
2. Resolve the target through Tushare and collect the latest 3–5 fiscal years plus the latest available quarter or interim period and its comparison periods. Use at least `stock_basic`, `income`, `balancesheet`, `cashflow`, `fina_indicator`, and `daily_basic` when available.
   - For available Liuli context, resolve `stock_analysis.list_pool(q=company name or code)` and use the matched `stock_id`, not the pool row `id` or security code. Request only needed `get_stock_profile` sections. `score` and `valuation` return only the latest results, not historical sequences; use the report-library route in the reference for historical research. Stored ratings are context, not this run’s scores.
3. **Added: light data validation.** Check duplicates, disclosure dates, units, statement scope, cumulative versus single-quarter figures, and material reconciliation issues before scoring. Resolve material conflicts against official full text in steps 4–5 and repeat affected checks. Read the data-validation rules in [references/rating-workflow.md](references/rating-workflow.md). Deep Data Analytics diagnostics or a reproducible notebook are optional.
4. Search locally ingested official evidence first with Liuli `market_radar.search_source_items`. Prioritize `source_type="announcement"`, `source_name="cninfo"`, and a query containing the company name or code.
5. Read official full text for material claims. If local coverage is insufficient and browsing or an official connector is available, use CNINFO or exchange filings as the primary fallback. Titles and link-only records do not substantiate detailed conclusions. This is the existing conditional fallback, not an added step.
6. Gather recent company and industry news from Eastmoney and Sina Finance when accessible. Use Xueqiu and Zhihu only to identify sentiment, expectations, disputes, and investor concerns; never let community views override financial statements or official disclosures. **Optional enhancement:** use Bigdata for a specific unresolved news, overseas-peer, supply-chain, or expectations question. Stop when coverage or access adds no useful evidence; baseline research must not depend on it.
7. **Added: brief peer comparison.** Seek 1–2 relevant peers and compare the same period and metric definitions, explaining product mix and scale differences. Use available Public Equity Investing comparison guidance when helpful. Disclose unavailable or non-comparable metrics instead of manufacturing a comparison. A larger peer universe and full comparable-company valuation are optional.
8. Apply the current profile's `method` section to the six rating dimensions and its score, weight, and level rules. Do not replace that method with plugin rubrics or invent missing data. State evidence gaps and reduce confidence when key evidence is unavailable.
9. **Added: brief disconfirmation review.** Test at least three material rating claims against the strongest available counter-evidence, with a concrete falsifier and next verification point. Include challenges to both favorable and adverse conclusions. Revisit affected step-8 scores only when evidence warrants it; do not impose an automatic downgrade. A full thesis tracker or independent review is optional.
10. Produce one Chinese Markdown report unless the user requests another language. Integrate the validation, peer, and disconfirmation findings concisely; do not produce eleven separate reports. Follow the output contract below and [references/rating-workflow.md](references/rating-workflow.md).
11. Upload the exact final Markdown body with Liuli `knowledge_base.upload_research_feedback`, unless the user explicitly requests an offline run or no upload.
   - Derive `researcher_code` from the current profile response.
   - Derive `skill_name` from this skill's frontmatter name: `liuli-stock-rater`.
   - Use the verified stock-rating module `business_module="stock_analysis"` for this workflow; do not use `"stock"` or guess a different module.
   - Stop before claiming upload completion if the upload tool is unavailable or not allowlisted, or if any required metadata is empty.

These are eleven logical workflow positions: preserve the original eight steps and insert steps 3, 7, and 9. The three added checks are standard lightweight work; external plugins and their deeper analyses are optional. Read only relevant installed helper skills and follow their tool-access requirements. If a helper is unavailable, perform the supported lightweight check with available evidence and disclose limits. Do not install plugins automatically, describe an uncalled plugin as executed, or present multiple helper skills used by one assistant as independent analyst opinions.

When the user requests a process test, include an eleven-row trace with each step's result, original/added/optional-enhancement label, and actual execution status (completed, conditional skip, or limited). Without a comparable baseline run, do not claim a score improvement or measured accuracy gain from the enhancements.

## Output contract

Put the conclusion near the top, followed by the evidence scope and rating detail. Include:

- Company name, stock code, rating date, and data cutoff date.
- Researcher context summary: `researcher_code`, `display_name`, status, profile hash, and concise summaries of intro, values, and methodology.
- Coverage windows for Tushare financial and valuation data, official announcements, and news or opinion evidence.
- Material data-quality findings and resolutions, a brief comparable-peer table or explicit comparison gaps, and at least three disconfirmation checks with follow-up evidence points.
- Independent scores for business model/moat, management, governance, strategy, certainty, and growth. For every dimension, provide the score, supporting evidence, counter-evidence or uncertainty, and confidence.
- Total score, investment level, valuation range, key assumptions, core logic, primary risk, and major risks.
- A trailing JSON object that follows the profile method when stricter. Keep all score-import fields at the top level: `company_code`, `business_moat_score`, `management_score`, `governance_score`, `strategy_score`, `certainty_score`, `growth_score`, `total_score`, `investment_level`, `core_logic`, `primary_risk`, and `researcher_code`.

Use `null` for unavailable numeric values. Do not output direct buy/sell or position-sizing instructions unless the user explicitly requests investment decision support.

## Upload contract

Use the title format `公司名称-YYYY-MM-DD-标的评级报告`. Pass the exact report body as `markdown`; do not ask the tool or feedback table to store a second body copy.

Keep the score JSON last in the uploaded report. After upload, give the user a separate receipt containing `feedback_id`, `report_id`, `report_path`, and `status`; do not silently change the uploaded body to add its receipt. If any field is absent, treat the upload as unconfirmed. Use `source="mcp"`; allowed status values are `received`, `parsed`, and `imported`. For a new report use `status="received"`; this is a receipt state, not proof that scoring data was imported. There is no `draft` value: an explicitly requested unpersisted draft stays offline.

## Failure handling

- Missing researcher profile or `researcher_code`: stop; do not substitute memory, local files, or stale profile copies.
- Missing Tushare data: continue only after the user accepts a lower-confidence qualitative rating; mark financial and valuation scores as insufficiently supported.
- Sparse announcement or news coverage: use available official filings and disclose the incomplete evidence window.
- Material unresolved data conflicts: retain source values and definitions, exclude disputed metrics from definitive claims, and lower affected confidence. Never average conflicting sources or silently replace official figures with plugin data.
- Optional plugin or peer-data gaps: continue supported baseline research, mark the affected check limited, and avoid invented consensus or comparisons.
- Missing upload capability or metadata: the report may be complete, but mark it as not uploaded and never claim workflow completion.
- An upload timeout or incomplete receipt is ambiguous: do not blindly repeat a write. Verify through an available authorized read tool if possible, otherwise report the unconfirmed state. Never bypass a tool denial through another route.
