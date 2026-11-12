# Tushare → Investment Banking → Liuli valuation

## Scope and routing

This skill's owner explicitly requests Investment Banking valuation support for Liuli. Carry that choice into subsequent uses of this skill; do not require the user to tag the plugin again. Limit the integration to valuation modeling; it does not authorize trading, account access, outreach, or unrelated banking workflows.

After the researcher context and required source pass, discover and read the currently installed `investment-banking:investment-banking` router. Resolve specialists and shared references relative to its installed root; do not hard-code a versioned cache path. Read its invocation policy and routing playbook, then read each selected specialist before use. Preserve the scoped Liuli report as lead output; downstream specialists inherit the target, CNY currency, valuation date, three-year horizon, and report/import requirements without repeating intake questions. Follow a specialist's actual plan/schema and validation requirements; there is no assumed `Investment Banking.valuate` API.

| Step | Investment Banking specialist | Input and responsibility |
| --- | --- | --- |
| Normalize | `financials-normalizer` | Turn the Tushare evidence into reconciled historical financials and an input pack; preserve provenance and adjustment logs. |
| Comparable valuation | `comps-valuation` | Select economically comparable listed peers, source their data, justify valuation multiples, and derive equity-value ranges. |
| Cash-flow valuation | `dcf-model-builder` | Use when cash-flow forecasts and discount-rate assumptions are defensible; build FCFF or FCFE valuation with sensitivities and an explicit valuation date. |
| Scenarios | `scenario-sensitivity-generator` | After the base case exists, assess downside/base/upside and the assumptions that drive the range. |
| Model verification | `model-audit-tieout` | Use for a generated/updated workbook or material model inconsistency; check formulas, sources, units, and valuation bridges. |

For a complete valuation run, use comparable valuation plus DCF when applicable; explain why a method cannot be used. Banks/insurers, early-stage loss-making firms, and highly cyclical businesses require sector-appropriate models. Do not force industrial FCFF onto financial companies or positive P/E onto loss-making peers. LBO, merger models, and transaction comps are outside this integration unless requested and supported by relevant evidence.

## Tushare input pack

Use the required `stock_basic`, `income`, `balancesheet`, `cashflow`, `fina_indicator`, and `daily_basic` pass; add `forecast`, `express`, and `disclosure_date` as available. Obtain peer financials/market data from Tushare too, after documenting peer-selection reasons. Fetch only needed extra fields using the live tool schema. Do not assume default fields include every DCF input.

Keep a structured in-memory table or source-backed input file with:

- Identity and context: `ts_code`, company, valuation date, actual quote date, currency, reporting perimeter, fiscal period, and availability cutoff.
- Source records: interface, request parameters, source field, raw value/unit, normalized value/unit, `ann_date`/`f_ann_date`, `end_date`, retrieval time, source ID, derivation or adjustment, and missing/conflict flags.
- Historical schedules: latest available period and 3–5 fiscal years; annual, YTD, standalone quarter, TTM and forecast values labeled separately.
- Forecast register: evidence and assumptions for growth, margins, tax, D&A, capex, operating working capital, financing, WACC/cost of equity, terminal growth or exit multiple; separate user assumptions, analyst estimates, company guidance and consensus.

| Source | Main inputs and treatment |
| --- | --- |
| `income` | Revenue with a consistent definition, attributable net profit (`n_income_attr_p`) for equity P/E, EBIT/EBITDA/tax when supported; keep reported and normalized earnings separate. |
| `balancesheet` | Assets/liabilities, attributable equity, cash, operating working capital, interest-bearing debt, minorities, and leases where relevant. Net debt is not total liabilities. |
| `cashflow` | CFO (`n_cashflow_act`), acquisition/construction capex (`c_pay_acq_const_fiolta`), D&A and financing detail. Preserve the definition of provider `free_cashflow`; do not automatically treat CFO minus capex as FCFF or FCFE. |
| `fina_indicator` | Profitability, growth, ROE and other checks; reconcile to statements instead of averaging conflicting fields. |
| `daily_basic` | `total_mv`, close, share count, P/E, P/B, P/S and their TTM variants, as of one actual trading date. Use total market value, not circulating market value, for company equity value. |
| Guidance/disclosures | Reporting schedule and preliminary results; keep forecast/flash figures distinct from audited or reported financials. |

Normalize financial amounts to CNY 亿元 for the Liuli report. Confirm raw units from the provider: financial statement amounts commonly in 元 require division by 1e8; `daily_basic.total_mv` in 万元 requires division by 1e4; shares in 万股 require multiplication by 1e4 when deriving price per share. Do not assume identically named fields across interfaces share units. Preserve per-share yuan, multiples, and ratio conventions separately. Use `close × actual shares` as a market-value scale check, explaining multi-share-class or timing differences.

For cumulative flow statements, standalone Q2 = H1 − Q1, Q3 = 9M − H1, Q4 = FY − 9M; TTM = last FY + current YTD − prior comparable YTD. Apply only when reporting perimeter and accounting basis match. Do not subtract balance-sheet snapshots to create quarterly balances; calculate changes only for defined roll-forwards or working-capital use. Select compatible consolidated statement versions and use revisions published by the valuation cutoff, retaining their audit trail. Do not use later announcements in historical/as-of analysis. Inspect pagination, missing periods, duplicates and report-type metadata before declaring coverage complete.

## Valuation handoff and calculations

Pass normalized historicals, source index, assumptions, conflicts, peer rationale and confirmed output scope to the selected specialist. Adapt to that specialist's actual schema; do not pretend this input pack is an official cross-skill contract. Tushare is the requested source route, so unrelated premium providers are not prerequisites. Supplement material missing inputs from official filings or clearly cited market sources under Liuli's source order; label analyst assumptions explicitly.

For comps, align fiscal/TTM/forward periods and market dates. Use business model, growth, margins, cash conversion, geography and risk to choose peers; justify exclusions and valuation discounts/premiums. Keep negative/undefined multiples out of ordinary median calculations. Do not fabricate forward consensus from historical Tushare fields.

For DCF, choose one consistent architecture:

- FCFF = EBIT × (1 − applicable tax rate) + D&A − capex − increase in operating NWC; discount at WACC, then bridge EV to attributable common equity using debt, usable cash, minorities and other relevant claims/assets without double-counting.
- FCFE is cash flow to common equity after financing effects; discount at cost of equity and do not subtract net debt a second time.

State leases/cash/debt treatment and its consistency with operating cash flow. Cite or label WACC components and terminal assumptions; for perpetual-growth terminal value require discount rate > terminal growth. Show terminal-value concentration and discount-rate/terminal-growth sensitivity; peer-multiple and earnings-growth sensitivity should support the three-year range. Do not mechanically multiply present value by three years of discount-rate growth: interim distributions and future net debt/share changes matter.

## Return to the Liuli report

Return a compact result table containing method, value type (EV or equity), valuation date/horizon, currency/unit, downside/base/upside, key assumptions, source references, calculation checks and evidence limitations. Include the actual specialists and any workbook/plan produced. When the selected specialist requires a workbook, create and validate it as a companion model, following the applicable spreadsheet and file-saving workflow; the integrated report and its final import JSON remain required. Do not upload companion payloads in place of the Markdown report.

Keep the researcher profile authoritative for the original profit/FCF/revenue model definitions and primary-model choice. Use Investment Banking outputs to justify or challenge those assumptions, not to silently change them:

- P/E and P/S peer ranges inform profit and revenue multiples; EV-based metrics need an explicit future EV-to-equity bridge.
- Keep DCF **current equity value** in its own report section. It is not `fcf_model.market_value_3y` or `expected_market_value_3y`.
- If using DCF to support three-year equity value, compute the remaining cash flows/terminal value at the three-year valuation date, bridge using that date's forecast net debt and other claims, and disclose the extra assumptions. Otherwise use DCF only as a present-value cross-check.
- Preserve the existing final JSON keys, `primary_model` enum, units, and expectation-gap formula. A DCF result does not imply a cash-flow multiple; never invent `target_multiple` to fill an unrelated schema.
- Explain material disagreement between models; do not average incompatible horizons or EV/equity values. If the original profile's required numeric fields cannot be supported, use its error JSON rather than zero-filled normal output.

If an Investment Banking specialist is unavailable, mark the enhancement incomplete, name the gap and apply the parent skill's failure rules. A successful calculation does not establish that assumptions are adequately supported. Keep model-check status and evidence confidence distinct.
