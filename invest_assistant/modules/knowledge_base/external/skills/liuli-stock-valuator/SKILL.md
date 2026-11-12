---
name: liuli-stock-valuator
description: Use when producing a three-year A-share valuation report with liuli's 标的估值师, Tushare financial data, Investment Banking valuation workflows, latest report and guidance checks, profit/FCF/revenue models, final JSON, and liuli research-feedback upload.
---

# Liuli Stock Valuator

## Overview

Use this skill to value an A-share target company with liuli's `标的估值师` researcher. The workflow is evidence-first and order-sensitive: get the complete researcher profile from liuli, request target materials, collect Tushare structured financial and market data, collect CNINFO official disclosures and professional market context, then apply the researcher's method section.

Use Investment Banking as the default valuation-modeling support for this skill, as explicitly requested by its owner. Supply normalized Tushare data to its financial normalization, comparable-company valuation, and applicable DCF workflows. Liuli remains responsible for the researcher method, three-year conclusion, report, and import JSON. This integration is a modeling workflow, not an external valuation API or an instruction to change the Investment Banking plugin itself.

## Capability Execution Requirements

- **相关能力可用就必须使用。** 本 Skill 指定的琉璃 MCP、Tushare、Bigdata、Investment Banking 等能力，凡与当前估值分析相关且可用，必须实际使用，不得为减少耗时或调用而跳过。普通网页搜索、自行计算和已有知识不能静默替代指定能力；无需调用无关接口或重复获取相同数据。Bigdata 用于相关的市场预期、业绩驱动、同行、风险或催化剂证据，在下述 Tushare 与官方披露查询之后使用；Investment Banking 按现有集成说明执行相关专项技能与脚本，不将其误称为单一 MCP 估值接口。仅阅读技能说明不算实际执行。
- **不得未经测试就判定不可用。** 以实际发现、读取或调用结果支持可用性判断，区分未安装、未连接、权限不足、运行失败、返回空数据、方法不适用和规则冲突。单次文件读取失败，应尝试已授权的替代读取方式；返回空数据不等于工具不可用。规则冲突应结合本 Skill 已明确的调用要求判断并如实说明，不得笼统归为不可用，也不得绕过权限限制。只对相关能力做必要检查，不做无关的全量测试。

## Required Source Order

1. Fetch the researcher profile from the liuli MCP tool `knowledge_base.get_researcher_profile` with `researcher="标的估值师"` or `researcher="valuator_001"`. If the MCP tool is unavailable, the profile is not found, or the response lacks `researcher_code`, stop and explain that the valuation cannot continue.
2. Build the valuator context from that single response in this exact order: researcher metadata, `intro`, `soul`, `method`. Keep `id`, `profile_content`, `profile_path`, `profile_hash`, `researcher_code`, `display_name`, and `status` in the evidence scope when available. Do not request target, Tushare, or website data before this context is available.
3. Do not call legacy standalone researcher soul/method tools; they are no longer part of the liuli researcher model.
4. Request target materials from liuli stock-analysis, stock master, local target materials, Tushare MCP, or another structured A-share source. Confirm stock identity, company short name, pure-digit `company_code`, exchange suffix for lookup, business summary, known stock pool context, and available local materials.
   - For Liuli stock context, use `stock_analysis.list_pool(q=company name or code)`, then the matched `stock_id` (not the pool row `id`) with `get_stock_profile`. Explicitly request relevant sections such as `materials/disclosures/valuation`, check dates and truncation, and follow the reference below; a default profile does not load all materials. `score` and `valuation` return only the latest results, not historical sequences; use the report-library route in the reference for historical research.
5. Request related Tushare structured data before external websites. Gather the latest financial period, the prior comparable quarter/year, and the recent 3-5 fiscal years when available. At minimum use `stock_basic`, `income`, `balancesheet`, `cashflow`, `fina_indicator`, and `daily_basic`; add `forecast`, `express`, and `disclosure_date` when available for guidance and reporting schedule checks.
6. Query official and professional external sources only after the Tushare pass:
   - 巨潮资讯网/CNINFO: latest periodic report, latest earnings forecast, latest flash result, announcements, and official disclosure facts.
   - 东方财富 or AkShare: current market value, valuation snapshot, quote-derived market data, and finance/news cross-checks.
   - 新浪财经: company and industry news context.
   - 雪球 and 知乎: market consensus, disagreement, and controversy only; never let them override Tushare financial data or CNINFO official disclosures.
7. Reconcile conflicts by source priority: CNINFO for official disclosure facts, Tushare for structured financial and market fields, Eastmoney/AkShare for latest market value, finance news for event context, Xueqiu/Zhihu for sentiment and controversy only.
8. Read [Investment Banking integration](references/investment-banking-valuation.md), normalize the Tushare data, reconcile official disclosures, and use the installed Investment Banking valuation specialists as downstream support. Apply the profile's `method` section to synthesize their results into the original three models. Keep DCF present value separate from three-year equity value. Do not invent missing data. State gaps clearly and lower confidence when key evidence is missing. Do not use K-line or short-term chart patterns as valuation evidence.
9. Validate the exact final Markdown and upload metadata using the mandatory gate below. Upload only after the executable validator exits 0, every field has passed evidence/semantic review, and the validated body and metadata remain unchanged. Then upload it through liuli MCP tool `knowledge_base.upload_research_feedback`. The upload metadata must come from the current execution context: `researcher_code` from the profile response, `skill_name` from this skill's frontmatter `name`, and `business_module` from the current task context. If the upload tool is unavailable, not allowlisted, or any required metadata is missing, stop and state that the report was not uploaded.

## 经营类型与财务联动

在公司阶段判断后、三模型估值前，按实际经营类型选择重大因素并补取财报附注：资本开支（维持／扩张）、在建工程达到预定可使用状态后的转固折旧与利息费用化、产能爬坡、资产减值、合同资产／合同负债及应收存货周转、有息负债与负债率。重资产企业重点看投入与转固，周期企业看价差与减值，项目交付企业看履约与回款，其他企业按业务实质取舍。

将重大因素对收入、利润、经营现金流、自由现金流及融资需求的联动影响纳入三年预测数字，区分非现金损益与实际收支，核对资本开支、分红后的资金缺口及债务利息，避免重复扣减。数据不足时披露假设并做敏感性分析，不默认影响为零；保持现有导入 JSON 结构。

## 连续研究：先读旧报告，再更新判断（必做）

每次撰写或重写报告，必须先通过报告库查找并读取同标的、同研究员的上一份完整报告（正文及JSON），再读取最近一个更早财报期的完整报告；两者相同时只读一次。记录报告ID、日期、财报期，不能只看快照、摘要或上次结论。检索失败不等于没有历史报告，必须披露断档。

上一份报告用于延续研究论点、比较参数和解释本次修订；上一期报告中形成于本期财报公布前、覆盖本期的预测才可用于兑现验证。同期重写必须对照上一份说明改了什么，不能自我验证。此处“上一份用于版本和论点对照”扩展旧profile将其仅用于识别同期重跑的用途，仍禁止当作上一期兑现基准。

正文必须有两张对照表：①原判断／假设｜最新财报事实｜验证状态与原因｜维持／调整／推翻；②估值参数｜上次｜本次｜变化依据。后者覆盖收入、利润、FCF、增长率、倍数、现金桥、主模型、目标市值及市场市值。区分经营变化、口径纠错、模型方法调整和预测期限滚动；量化主要估值变化贡献，不能把方法变化全部归为业绩恶化。预测尚未到期就标注待验证，不因新一季波动宣布长期命题已证伪。

即使旧报告没有短期量化假设，也必须比较其长期论点与估值参数；只能留空历史兑现数组，不能跳过连续研究。逐项交代原跟踪指标的保留、调整或替换理由，随后给出下一期1–3个简洁目标。事实、旧预测、新预测明确区分，不为连续性沿用旧错误，不回填或覆盖旧预测。

上传前逐项确认：旧报告全文已读、最新财报已核对、两张对照表齐全、重大估值调整已解释、新假设承接旧判断。没有历史报告时记录实际检索范围并首次建档；有历史但读取失败时标注连续性研究未完成，不冒称完成闭环。沿用既有导入JSON结构。

## 从财报自主提出假设与跨期闭环（必做）

执行 [自主假设与验证规则](references/expectation-baseline.md)。核心任务是从最新财报、附注及连续季度变化识别真正影响三年价值的经营矛盾，自主推演下一报告期的1–3个关键指标，并在下一期财报中验证。预测必须是本研究员自己的判断，不能把寻找或摘抄市场一致预期当成假设生成。公司指引仍按原流程核验；市场预期只作可选外部参考，不作为生成假设的前提。

本期兑现评价优先使用上一期本研究员已经记录且覆盖本期的假设，将其来源、形成时间、目标期间、指标口径、单位、预测区间、容差和实际值写入正文及独立校验上下文 `expectation_baseline`；注明标签是“相对本研究员预期”。公司指引兑现和市场预期差单独说明，不替换自身预测的验证对象。同期复跑不得把本期已知结果后的假设当作事前基准；历史同期、上季度及盈亏平衡线可帮助生成未来假设，但不能冒称过去预期。没有旧假设时明确“无上一期可验证假设”，仍须自主生成下一期假设；首次建档按下述规则允许报告上传：不做历史兑现评价，只记录本次自主假设供下一期验证，不能因没有旧假设而阻断。

每次在 `valuation_assumptions.current_assumptions` 固定记录1–3项下一报告期可验证的指标。**这两个字段直接用于跟踪卡片，必须简洁：** `metric` 只写“明确期间＋单季／累计／期末等口径＋指标名”，如 `2026-Q4单季营业收入`；`assumed` 只写一个带单位的量化目标，如 `不低于20%`、`大于0亿元`、`不高于70亿元`、`6.8—8.0亿元` 或 `-0.25至0.80亿元`。不得放入解释、公式、来源、基准值与区间并列、容差说明或“研究员预测”等标签。`metric` 不超过40字符，`assumed` 不超过32字符；金额通常保留1–2位小数，精确计算值留正文。单边阈值和双边区间按实际判断选取，不为缩短展示改变原预测含义。详见参考文件的格式规则及示例。

先识别关键矛盾再选指标，不能每家公司固定填收入／毛利／现金流，也不能先猜数字再补理由。正文先列与JSON完全一致的“指标｜量化目标”简表，再逐项展示“财报事实→关键矛盾与传导机制→下一期量化推演→证伪条件→三年估值影响”；基准值、容差、精确核验公式、来源及研究员预测身份均写正文，区分事实、判断和预测。区间本身可作容差，此时额外容差为0；不能为了卡片简洁丢掉核验依据。亏损指标优先用利润金额或亏损额，不用负基数普通CAGR。下一期必须读取原报告正文及JSON，按原口径兑现验证，再解释是否调整新假设；不回填或覆盖旧假设，不新增导入JSON字段。

## Output Contract

Produce a Chinese Markdown report unless the user asks otherwise. The report body must come first, and the final JSON must be the last content in the report.

The report must include:

- 目标公司、股票代码、分析日期、数据截止日期。
- 研究员上下文摘要: `researcher_code`, `display_name`, 状态、profile hash、简介/价值观/方法论摘要。
- 数据覆盖范围: 标的资料来源、Tushare 财务/估值期间、巨潮公告期间、东方财富/AkShare 市值口径、新闻/观点期间。
- 在正文、最终 JSON 之前增加“本文分析的数据类型和来源”表格，列为：`数据类型或分析用途 | 对应 MCP tool／网站／文档 | 数据期间或截止日期 | 实际使用情况与限制`。按本文实际使用的来源填写具体工具名称；网站给出链接，文档给出标题、披露日期和可用链接。Investment Banking 列出实际执行的专项技能或脚本，并注明其输入数据来源，不把方法当成数据来源。已尝试但无有效结果、无法使用或不适用的指定来源也如实标注原因；不得把仅发现或读取说明写成已使用。该表只增强来源透明度，不新增阻止正常 JSON 或上报的条件，沿用现有失败处理规则。
- 最新财报确认、业绩预告或业绩快报校验、当季表现、公司阶段、三种模型估值、主模型选择、预期空间判断、最新市值。
- 每个估值模型的关键假设、证据、反证或不确定性、置信度。
- Investment Banking 估值复核：实际使用的估值工作流、Tushare 输入期间与口径、可比公司及倍数区间、适用时的 DCF 当前股权价值、悲观/基准/乐观情景与敏感性，以及与琉璃三年估值的差异解释。标明未执行或不适用的模型及原因；补充模型结果放在 Markdown 正文，不改变下列导入 JSON 结构。
- Final JSON using the exact field names required by the researcher profile. For successful reports, include `company`, `company_code`, `report_period`, `report_release_date`, `current_market_value`, `financial_performance`, `trend_reference`, `guidance_check`, `quarter_performance`, `quarter_main_reason`, `profit_model`, `fcf_model`, `revenue_model`, `primary_model`, `expected_market_value_3y`, `expectation_gap_rate`, `valuation_assumptions`, `analysis_date`, and `researcher_code`. The valuation_assumptions container (previous_period, last_assumptions_vs_actual, current_assumptions) is mandatory even when the prose already discusses assumptions; use an empty historical validation array only when the previous-period evidence supports that absence, and include 1–3 quantified current hypotheses.
- If required data is insufficient, end with only an error JSON such as `{ "error": "数据不足或财报周期无法确认" }`.

Do not output buy/sell or position-sizing instructions unless the user explicitly asks for investment decision support. Valuation output is research analysis, not trading advice.

## 首次建档与现有导入契约（只改Skill及报告）

首次研究，或有历史报告但此前没有可验证的本期量化假设时：跳过历史兑现评价，上一期验证数组留空，仍完整分析财报、估值并生成1–3条下一期自主假设。`quarter_performance="未验证"`表示未作预期兑现评价，三档预期数组为空，不能默认“符合预期”。本地CONTEXT.json加入 `expectation_review={"status":"initial_hypotheses","prior_hypotheses_available":false,"evidence":"实际读取的历史报告及无可验证假设的依据"}`；校验通过即可上传报告。下一期读取本次原假设再验证，不补造过去的预测。

假设字段按实时完整profile与当前接口使用 `valuation_assumptions`，包含 `previous_period/last_assumptions_vs_actual/current_assumptions`；不再使用旧的两个顶层假设字段，避免报告有假设但接口读不到。现有导入器将null视为缺少必填字段，但接受非空字符串，字段存储为String(64)；因此首次使用非空状态“未验证”，不省略、不留null、不伪造三档评级。此为用户指定的首次建档表达，覆盖旧profile只列三档的限制，不改变项目代码。报告接收与快照导入仍分别确认，不能仅凭received就宣称已导入。

## Mandatory Pre-upload JSON Gate

Read [the complete field contract](references/valuation-workflow.md#pre-upload-validation) and run `python3 scripts/validate_valuation_report.py REPORT.md --context CONTEXT.json --output VALIDATION.json` from this skill directory immediately before **every** upload, including corrections and retries. The script uses only Python's standard library. Build CONTEXT.json from the current verified researcher, target, disclosure and upload metadata, not by blindly copying the generated JSON. See the reference for its exact shape.

- Validate the full final JSON recursively: every required top-level/nested field, list item, name, type, enum, nonempty value, finite number, code/date/period and permitted null/empty condition. Include the complete `valuation_assumptions` object; prose is not a substitute. Reject duplicate/unknown keys, placeholders and normal reports missing data. If the live researcher/import contract adds fields, reconcile the validator and template before upload; do not drop fields to make validation pass.
- Check main-model value, expectation-gap arithmetic, period ordering, previous-period identity, 1–3 quantified current hypotheses, and upload metadata. Use decimal ratios and CNY 亿元 consistently. An error-only JSON is recognized but never passes a normal valuation upload.
- Review **every** JSON field against the current profile, evidence and report: numbers/formulas/units/horizons must agree; growth from a negative base must not masquerade as ordinary CAGR; hypotheses must be genuinely forward-looking and next-report-verifiable; historical claims require actually recorded prior assumptions. An empty array or plausible number must not conceal missing evidence. An allowed quarterly label is not automatically supported: never default to 符合预期 merely because the enum is mandatory. If there are no recorded applicable prior hypotheses, use the initial-hypotheses mode below rather than manufacturing a quarterly comparison. A claimed comparison still requires a valid ex-ante baseline.
- Require exit code 0 and `upload_allowed=true`, no unresolved field errors, plus completed evidence review. Fix the evidence/report and rerun on failure. Never bypass the gate, fill arbitrary defaults, or upload first and validate later. If required evidence remains missing, follow the error-report path and mark normal upload blocked.
- Retain the validation log, per-field `checked_fields`, exact report SHA-256 and metadata SHA-256 as internal evidence. Send the **same checked Markdown string** and matching metadata to `upload_research_feedback`. Any later text, field, metadata or file-byte change invalidates the pass and requires rerunning. Keep the receipt separate so the report still ends in JSON.

## Research Feedback Upload

When uploading to `knowledge_base.upload_research_feedback`, pass the exact Markdown report body as `markdown`. The tool writes the report body to the report library and stores only feedback index fields such as `report_id`, `report_path`, `researcher_code`, `skill_name`, and `business_module`; do not ask the tool or database to store a second copy of the report body in `knowledge_research_feedback`.

Use this metadata:

- `title`: `公司名称-YYYY-MM-DD-标的估值报告`, for example `万东医疗-2026-07-05-标的估值报告`.
- `researcher_code`: the non-empty value returned by `knowledge_base.get_researcher_profile`.
- `skill_name`: the non-empty `name` in this skill's frontmatter.
- `business_module`: `stock_analysis` for this stock-valuation task; do not guess another module or use `stock`.
- `source`: `mcp`.
- `status`: `received` for a new report. The only accepted values are `received/parsed/imported`; do not send `draft` or claim that receipt proves valuation import. Keep an explicitly requested unpersisted draft offline.

After a successful upload, include a short result section with `feedback_id`, `report_id`, `report_path`, and `status`. If any of these fields are absent, treat the upload as unconfirmed.

## Failure Handling

If `knowledge_base.get_researcher_profile` is unavailable, the profile cannot be found, or `researcher_code` is missing, stop and explain that the valuator context cannot be built. Do not substitute memory, local files, or stale copies.

If `knowledge_base.upload_research_feedback` is unavailable or the required upload metadata cannot be derived from the current MCP/profile/task context, stop before claiming completion and explicitly mark the report as not uploaded.

If current market value cannot be retrieved, do not produce a normal valuation JSON; end with an error JSON that states the missing data.

If recent financial-period confirmation or guidance/flash-result checking is incomplete, follow the researcher profile's error rules rather than filling gaps.

If Tushare data is unavailable, continue only when the user accepts a lower-confidence qualitative valuation. Mark financial models as insufficiently supported and do not produce importable normal JSON unless required numeric fields are confirmed.

If Investment Banking or a required specialist cannot be read or executed, mark `Investment Banking 增强估值未完成` and identify the missing workflow. Continue the original Liuli valuation only when its own required evidence is sufficient; do not claim the integration ran or substitute another plugin silently. If the user explicitly requires an Investment Banking model as the deliverable, report that part as blocked. Data gaps in one supplemental model do not justify fabricated inputs or invalidate independently supported models.

An upload timeout or incomplete receipt may have persisted data. Search `report_library.list_reports(q=exact title, limit, offset)`, then read the matched body through `read_report_content(report_id=returned report ID)` before considering a retry. Never guess IDs or blindly repeat a write. Listing failure, including a server serialization error, is not evidence of no report; preserve the unconfirmed status. Finding a report alone does not prove feedback indexing or valuation import.

If recent announcements or news are sparse, use the available official filings and say the evidence window is incomplete.

For detailed workflow and JSON requirements, read `references/valuation-workflow.md`.
