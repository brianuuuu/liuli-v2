# Valuation Workflow Reference

## Researcher Context

Always build the researcher context in this order:

```text
研究员元信息
简介 intro
价值观 soul
方法论 method
```

Use the single `knowledge_base.get_researcher_profile` response as both metadata and content. Fetch it with `researcher="标的估值师"` or `researcher="valuator_001"`. Include `id`, `researcher_code`, `display_name`, `status`, `profile_path`, `profile_hash`, `intro`, `soul`, `method`, and `profile_content` in the evidence scope when available. Do not call legacy standalone researcher soul/method tools. Stop when `researcher_code` is absent.

Do not request target materials, Tushare data, or external website evidence until the researcher context has been fetched and checked.

## Source Sequence

The valuation run must use this order and may not skip ahead:

1. Researcher context from liuli `knowledge_base.get_researcher_profile`.
2. Target materials from liuli stock-analysis, stock master, local target materials, Tushare `stock_basic`, or another structured A-share resolver.
3. Tushare structured data for identity, financial statements, financial indicators, reporting schedule, guidance or flash-result metadata, and market-value fields when available.
4. 巨潮资讯网/CNINFO official disclosures for the latest periodic report, earnings forecast, flash result, and announcement facts.
5. 东方财富 or AkShare for current market value, valuation snapshot, quote-derived market data, and finance/news cross-checks.
6. 新浪财经 and similar finance news sites for company and industry event context.
7. 雪球 and 知乎 for market consensus, disagreement, or controversy only.

When sources conflict, prefer CNINFO for official disclosure facts, Tushare for structured financial data, Eastmoney/AkShare for latest market value, finance news for event context, and Xueqiu/Zhihu only for sentiment or controversy. Do not let social or forum sources override financial statements, official announcements, or structured market data.

## Financial Data Window

Prefer the latest available quarter plus the last 3-5 fiscal years. For the latest quarter, also fetch the prior comparable quarter/year so YoY and QoQ trend fields are supported.

The latest financial report must be recent enough for the researcher profile's rules. If the financial report is older than the allowed window, do not produce a normal valuation JSON.

Use structured data before narrative sources:

```text
stock_basic
income
balancesheet
cashflow
fina_indicator
daily_basic or another market-value source
forecast
express
disclosure_date
```

Useful checks:

- Revenue, net profit, and operating cash flow trend.
- Gross margin, expense ratio, net margin, ROE, ROA, debt ratio, and asset turnover.
- Operating cash flow vs net profit.
- Capex, fixed-asset intensity, or working-capital pressure when relevant.
- Valuation and market-value fields from `daily_basic`, Eastmoney, or AkShare, including PE, PB, PS, total market value, and circulating market value when available.

## Announcement And News Evidence

Official evidence has priority:

```text
CNINFO announcements
earnings forecast
flash result
exchange filing
company official filing
```

Local liuli evidence should be queried first through `market_radar.search_source_items`. For announcements, prioritize:

```text
source_type = announcement
source_name = cninfo
q = company name or stock code
```

If local coverage is insufficient and browsing or an official connector is available, search CNINFO directly for the latest periodic report, earnings forecast, and flash result.

If CNINFO does not show a single-quarter forecast or flash result, state `未发布单季指引` in the report and in `guidance_check.note`.

News and opinion evidence is secondary:

```text
Eastmoney and Sina Finance: recent company and industry news
Xueqiu and Zhihu: sentiment, debate, investor concerns, narrative shifts
```

Do not let community views override structured financials or official announcements. Use them to identify risks, consensus, controversy, and market expectations.

## Valuation Sections

Apply the profile method section first. When it does not specify a stricter format, use these sections:

```text
最新财报确认
业绩预告校验（巨潮）
当季财报表现
公司阶段判断
利润模型
现金流模型
营收模型
主模型选择
预期空间判断
最新市值
最终 JSON
```

Every valuation model should include:

- Growth assumption.
- Multiple or valuation parameter.
- Three-year market value.
- Key evidence.
- Counter-evidence or uncertainty.
- Confidence level.

Quarter performance must identify one single most important driver in `quarter_main_reason`.

## Final JSON

Successful reports must end with this shape:

```json
{
  "company": "",
  "company_code": "",
  "report_period": "",
  "report_release_date": "",
  "current_market_value": 0,
  "financial_performance": {
    "beat_items": [],
    "inline_items": [],
    "miss_items": []
  },
  "trend_reference": {
    "revenue_yoy": 0,
    "revenue_qoq": 0,
    "profit_yoy": 0,
    "profit_qoq": 0
  },
  "guidance_check": {
    "has_guidance": true,
    "guidance_conflict": false,
    "note": ""
  },
  "quarter_performance": "超预期",
  "quarter_main_reason": "",
  "profit_model": {
    "growth_rate": 0,
    "target_multiple": 0,
    "market_value_3y": 0
  },
  "fcf_model": {
    "growth_rate": 0,
    "target_multiple": 0,
    "market_value_3y": 0
  },
  "revenue_model": {
    "growth_rate": 0,
    "target_multiple": 0,
    "market_value_3y": 0
  },
  "primary_model": "profit",
  "expected_market_value_3y": 0,
  "expectation_gap_rate": 0,
  "analysis_date": "YYYY-MM-DD",
  "researcher_code": "valuator_001"
}
```

Rules:

- `company_code` must be pure digits.
- `report_period` must use `YYYY-QN`, such as `2026-Q1`.
- Dates must use `YYYY-MM-DD`.
- `primary_model` must be `profit`, `fcf`, or `revenue`.
- Market values should use the same unit, normally 亿元人民币.
- `quarter_main_reason` must name only one key driver.
- `expectation_gap_rate = expected_market_value_3y / current_market_value - 1`; the liuli importer may recalculate it.

If the report cannot support valuation, end with an error JSON:

```json
{ "error": "数据不足或财报周期无法确认" }
```

## Upload Payload

After the Markdown report is complete, upload it through liuli MCP tool `knowledge_base.upload_research_feedback`. Do not use default upload metadata embedded in this reference. Derive the required metadata from the current execution:

- `researcher_code`: the non-empty value returned by `knowledge_base.get_researcher_profile`.
- `skill_name`: the non-empty `name` in the current skill frontmatter.
- `business_module`: the non-empty business module from the current task context.

Stop and mark the report as not uploaded when the upload tool is unavailable, not allowlisted, or any required metadata value is missing.

The upload `title` must use `公司名称-YYYY-MM-DD-报告类型`. For this skill, `报告类型` is fixed as `标的估值报告`; example: `万东医疗-2026-07-05-标的估值报告`.

Use this payload shape:

```json
{
  "title": "万东医疗-2026-07-05-标的估值报告",
  "markdown": "完整 Markdown 报告正文",
  "researcher_code": "<value from researcher profile>",
  "skill_name": "<current skill frontmatter name>",
  "business_module": "<current task business module>"
}
```

After upload, include the returned `feedback_id`, `report_id`, `report_path`, and `status` in the final response. If the upload response lacks any of these fields, treat the upload as unconfirmed. The feedback table is only an index. The report body belongs to the report library Markdown file, and the import button parses the final JSON into `stock_valuation_snapshot`.
