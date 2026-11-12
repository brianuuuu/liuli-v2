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

## Local Stock Context

Resolve `stock_analysis.list_pool(q, limit)` and use the matching `stock_id`, not the pool row `id` or security code. `get_stock_profile(stock_id, sections, history_limit)` accepts `score/valuation/materials/disclosures/tracks/notes/tags`; request only needed sections explicitly. Defaults are not the full material archive. `score` and `valuation` return only `latest_score` and `latest_valuation`; neither default nor explicit sections provide `score_history` or `valuation_history`. Do not increase `history_limit` to retrieve those histories or treat their absence as an error. For returned material/disclosure and other list sections, inspect available `*_total` and `truncated`, and adjust `history_limit` only for relevant list coverage; do not invent pagination arguments. Check prior valuation dates before reuse; JSON text fields such as `profit_model_json` require parsing, and stored valuations cannot replace current financial data or dictate this run’s import schema. For relevant track evidence use verified `track_ids` and `get_track_detail(track_id, sections, list_limit)` with explicit material/history sections.

For historical research, search `report_library.list_reports(q=company name or report-title keyword, limit, offset)`, then call `read_report_content` with the actual returned report ID. Check report type, research date, cutoff, and body before comparing conclusions. Historical reports are research documents, not proof of imported score/valuation snapshots or a complete snapshot history; report gaps explicitly.

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

Pass `start_time` / `end_time` (`YYYY-MM-DD` or ISO timestamps) for the evidence window; paginate with `limit` / `offset` and `has_more`, checking returned dates. Use `content_chars` for initial text size; if a key item is `content_truncated`, narrow the query and re-read with `content_chars=0`, matching item IDs. This retrieves stored text, not necessarily the original article or filing in full. Separate list truncation from content truncation and verify original sources when stored text is only a summary.

If local coverage is insufficient and browsing or an official connector is available, search CNINFO directly for the latest periodic report, earnings forecast, and flash result.

If CNINFO does not show a single-quarter forecast or flash result, state `未发布单季指引` in the report and in `guidance_check.note`.

News and opinion evidence is secondary:

```text
Eastmoney and Sina Finance: recent company and industry news
Xueqiu and Zhihu: sentiment, debate, investor concerns, narrative shifts
```

Do not let community views override structured financials or official announcements. Use them to identify risks, consensus, controversy, and market expectations.

## Investment Banking Modeling Support

After the source sequence above and before the final valuation sections, read `investment-banking-valuation.md` in this references directory. Use its Tushare normalization and Investment Banking specialist handoff, then reconcile the supplemental results with the researcher method. Keep current DCF value separate from the three-year values in the final JSON. Include the enhancement results and any model limitations before the final JSON; preserve the existing upload payload.

## Valuation Sections

Follow [expectation-baseline.md](expectation-baseline.md) to independently generate 1–3 next-period hypotheses from financial statements, causal operating drivers and valuation sensitivity. Show the factual basis, forecast bridge, quantified range, verification formula, disconfirmation trigger and three-year value impact. Do not substitute market consensus for the researcher's own analysis or make external forecasts a prerequisite. For current-period validation, prioritize the researcher's actually recorded prior hypotheses; company guidance checks and optional market comparisons remain distinct. Include a valid ex-ante comparison baseline and independently verified first-publication time in the validation context when assigning a quarterly label. Missing prior hypotheses uses initial-hypotheses mode: retain new predictions, skip historical judgment and permit report upload with the nonempty quarterly status `未验证`; do not claim snapshot import until verified.

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
  "valuation_assumptions": {
    "previous_period": null,
    "last_assumptions_vs_actual": [],
    "current_assumptions": [
      { "metric": "2026-Q4单季收入同比增速", "assumed": "不低于15%" }
    ]
  },
  "analysis_date": "YYYY-MM-DD",
  "researcher_code": "valuator_001"
}
```

Rules:

- 示例假设的期间与数字须替换为本次证据支持的预测；说明文字放正文，不放入 `assumed`。
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

## Pre-upload Validation

Run the gate on the final saved UTF-8 Markdown before any upload. The final object must be the last content, inside a complete `json` fence. A successful JSON parse alone is insufficient.

| Required top-level fields | Nested fields / constraints |
|---|---|
| `company`, `company_code`, `researcher_code` | Nonempty strings; code six ASCII digits; identity must match independently verified context |
| `report_period`, `report_release_date`, `analysis_date` | `YYYY-Q1..Q4`, real ISO dates; period end ≤ release ≤ analysis; latest report no older than six calendar months |
| `current_market_value` | Finite number > 0; total equity market value in CNY 亿元, not circulating value |
| `financial_performance` | All three arrays: `beat_items`, `inline_items`, `miss_items`; items nonempty strings; empty arrays allowed only with disclosed lack of applicable comparison evidence |
| `trend_reference` | All four finite numeric decimal ratios: `revenue_yoy`, `revenue_qoq`, `profit_yoy`, `profit_qoq`; manually verify same-period basis, sign convention and denominators |
| `guidance_check` | Actual booleans `has_guidance`, `guidance_conflict`; nonempty `note`; false guidance cannot simultaneously assert a guidance conflict |
| `quarter_performance`, `quarter_main_reason` | For an actual comparison: one of 超预期/符合预期/不如预期 and a key driver matching context.expectation_baseline.metric. Initial-hypotheses mode instead requires the nonempty status `未验证`, empty graded arrays, no claimed historical results and independently reviewed history evidence; executable check requires a quantified ex-ante baseline, independently verified report_public_at, matching period, interval, tolerance, direction and classification; verify provenance and actuals manually; never default to 符合预期 |
| `profit_model`, `fcf_model`, `revenue_model` | Each contains numeric `growth_rate`, positive `target_multiple`, nonnegative `market_value_3y`; no missing model or arbitrary zero-filled substitute; manually verify positive-base growth, forecast horizon, PE/EV scope and cash bridge |
| `primary_model`, `expected_market_value_3y`, `expectation_gap_rate` | `profit`/`fcf`/`revenue`; expected value equals selected model; gap equals expected/current − 1 with 1e−6 arithmetic tolerance |
| `valuation_assumptions` | `previous_period` is an earlier `YYYY-QN` or null; required `last_assumptions_vs_actual` array; each entry has nonempty `metric`, `assumed`, `actual` and three-way `result`; no previous period means empty array; no recorded prior targets also means empty array, explained in prose |
| `valuation_assumptions.current_assumptions` | Required array of 1–3 distinct entries. `metric` is a short label (≤40 characters) containing concrete forward period, reporting scope and metric. `assumed` is only one numeric point, threshold or interval with unit (≤32 characters, ≤4 decimal places); no prose, formulas, source/tolerance notes or second baseline value. Match the prose tracking table; keep derivation and verification details separately in the report. Apply compact-format checks to new hypotheses, not original historical records. |

The bundled validator is the mechanical field contract; the table adds evidence-dependent checks that a parser cannot establish. Null is accepted only for `valuation_assumptions.previous_period`. quarter_performance must be nonempty; use `未验证` only in verified initial-hypotheses mode because the current importer rejects null. Missing required numerical evidence follows the existing error JSON path rather than being silently replaced with null/zero. Unknown fields must be reconciled with the live contract before updating the validator; do not treat them as authorized importer extensions.

Create a task-specific context file from verified inputs, replacing these illustrative values:

The example below contains identity/metadata only. Before a normal upload, add the required `report_public_at` and `expectation_baseline` object using the complete example and source rules in [expectation-baseline.md](expectation-baseline.md); without them an asserted comparison is blocked. For initial-hypotheses mode, use expectation_review instead and set the quarterly status to `未验证`; report upload remains allowed. These are local evidence fields, not new final JSON/importer fields.

```json
{
  "company": "万东医疗",
  "company_code": "600055",
  "report_period": "2026-Q3",
  "report_release_date": "2026-10-24",
  "analysis_date": "2026-10-24",
  "researcher_code": "valuator_001",
  "title": "万东医疗-2026-10-24-标的估值报告",
  "business_module": "stock_analysis",
  "skill_name": "liuli-stock-valuator",
  "source": "mcp",
  "status": "received"
}
```

```bash
python3 scripts/validate_valuation_report.py /absolute/path/report.md \
  --context /absolute/path/context.json --output /absolute/path/validation.json
```

The command exits 0 only for `upload_allowed=true`; invalid reports and error-only reports exit 2. Inspect every error path and the `checked_fields` coverage, then perform the evidence review above. Record the command exit status, coverage, body/context SHA-256 and any resolved issues internally. If the executable cannot run, normal upload stays blocked; do not replace it with a syntax-only check.

Upload only the exact checked bytes decoded as UTF-8 and the same checked metadata. Do not alter the body, append receipts or recompute fields after validation; rerun if anything changes. A passing script proves schema/arithmetic checks, not source truth or actual import. A `received` receipt remains only receipt, not proof that the hypotheses were imported.

## Upload Payload

After the Markdown report is complete and the pre-upload gate passes, upload it through liuli MCP tool `knowledge_base.upload_research_feedback`. Do not use default upload metadata embedded in this reference. Derive the required metadata from the current execution:

- `researcher_code`: the non-empty value returned by `knowledge_base.get_researcher_profile`.
- `skill_name`: the non-empty `name` in the current skill frontmatter.
- `business_module`: `stock_analysis` for this task; do not use `stock` or guess a new module.
- `source="mcp"`, `status="received"` for a new upload. Only `received/parsed/imported` are accepted; no `draft` status exists. Receipt does not prove valuation import.

Stop and mark the report as not uploaded when the upload tool is unavailable, not allowlisted, or any required metadata value is missing.

The upload `title` must use `公司名称-YYYY-MM-DD-报告类型`. For this skill, `报告类型` is fixed as `标的估值报告`; example: `万东医疗-2026-07-05-标的估值报告`.

Use this payload shape:

```json
{
  "title": "万东医疗-2026-07-05-标的估值报告",
  "markdown": "完整 Markdown 报告正文",
  "researcher_code": "<value from researcher profile>",
  "skill_name": "<current skill frontmatter name>",
  "business_module": "stock_analysis",
  "source": "mcp",
  "status": "received"
}
```

After upload, include the returned `feedback_id`, `report_id`, `report_path`, and `status` in the final response. If the upload response lacks any of these fields, treat the upload as unconfirmed. The feedback table is only an index. The report body belongs to the report library Markdown file, and the import button parses the final JSON into `stock_valuation_snapshot`.
