# Rating Workflow Reference

## Researcher Context

Always build the researcher context in this order:

```text
研究员元信息
简介 intro
价值观 soul
方法论 method
```

Use the single `knowledge_base.get_researcher_profile` response as both metadata and content. Include `id`, `researcher_code`, `display_name`, `status`, `profile_path`, `profile_hash`, `intro`, `soul`, `method`, and `profile_content` in the evidence scope when available. Do not call legacy standalone researcher soul/method tools.

## Financial Data Window

Prefer annual statements for the last 3-5 fiscal years plus the latest available quarter. Use Tushare structured data before any scraped or community data.

Minimum Tushare coverage:

```text
stock_basic
income
balancesheet
cashflow
fina_indicator
daily_basic
```

Useful checks:

- Revenue and profit trend.
- Gross margin, net margin, ROE, ROA, asset turnover, debt ratio.
- Operating cash flow vs net profit.
- Capex or fixed-asset intensity when relevant.
- Valuation multiples from `daily_basic`, including PE, PB, PS, dividend yield, total market value, and circulating market value when available.

## Announcement And News Evidence

Official evidence has priority:

```text
CNINFO announcements
exchange filings
annual and interim reports
company official releases
```

Local liuli evidence should be queried first through `market_radar.search_source_items`. For announcements, prioritize:

```text
source_type = announcement
source_name = cninfo
q = company name or stock code
```

News and opinion evidence is secondary:

```text
Eastmoney and Sina Finance: recent company and industry news
Xueqiu and Zhihu: sentiment, debate, investor concerns, narrative shifts
```

Do not let community views override structured financials or official announcements. Use them to identify risks, consensus, controversy, and market expectations.

## Rating Sections

Apply the profile method section's dimensions and weights first. When it does not specify a stricter format, use these sections:

```text
商业模式
管理层
公司治理
战略与竞争格局
经营确定性
成长性
综合评分
估值区间
评级等级
最终 JSON
```

Every score should include:

- Score.
- Key evidence.
- Counter-evidence or uncertainty.
- Confidence level.

## JSON Shape

Use the profile method section's JSON schema when present. If it lacks a strict schema, use:

```json
{
  "company": "",
  "ts_code": "",
  "rating_date": "",
  "data_cutoff": "",
  "analyst": {
    "display_name": "标的评级师",
    "researcher_code": "analyst_001",
    "profile_hash": ""
  },
  "scores": {
    "business_model": null,
    "management": null,
    "governance": null,
    "strategy": null,
    "certainty": null,
    "growth": null,
    "total": null
  },
  "rating": "",
  "valuation_range": {
    "low": null,
    "base": null,
    "high": null,
    "currency": "CNY"
  },
  "key_assumptions": [],
  "major_risks": [],
  "evidence_sources": [],
  "confidence": ""
}
```

Use `null` for missing numeric values. Do not fabricate unavailable data.

## Research Feedback Upload

After the Markdown report is complete, upload it through liuli MCP tool `knowledge_base.upload_research_feedback` when the client allowlist includes that controlled write tool.

Use this payload shape:

```json
{
  "title": "标的评级报告：公司名称（股票代码）",
  "markdown": "完整 Markdown 报告正文",
  "researcher_code": "analyst_001",
  "skill_name": "liuli-stock-rater",
  "business_module": "stock_analysis",
  "source": "mcp",
  "status": "received"
}
```

Prefer the actual `researcher_code` returned by `knowledge_base.get_researcher_profile`; use `analyst_001` only when the profile lookup confirmed that code. The feedback table is only an index. Report body belongs to the report library Markdown file, and follow-up valuation or scoring imports should be handled by later specialized parsing tools.
