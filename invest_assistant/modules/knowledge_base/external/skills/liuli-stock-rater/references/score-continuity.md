# Score continuity — 1.0.50

## Read the latest three rating periods

- Search `report_library.list_reports(q=company name, report_kind="stock", limit=20, offset=0)` and use `read_report_content(report_id)` for matching rating reports.
- Select the same company code and current profile researcher, with research dates no later than this run; use the latest valid revision for each of the latest three dates.
- The listing sorts by creation time, not research date; inspect title dates, page as needed, and do not equate `limit=3` with three research periods.
- Compare scores against the latest eligible report and use the other two to examine consistency; record actual IDs, dates, and any coverage gaps in the report body.
- Fewer than three eligible periods is valid; search/read failures are not empty history and must not be presented as first research.
- Trace older reports only to resolve referenced conditions, missing context, or conflicting judgments; never claim an exhaustive history audit.

## Explain and carry forward

- Explain every changed dimension and grade, plus material logic/risk changes; distinguish new evidence, judgment revision, data correction, method change, and risk adjustment.
- For each original `(report_id, check_id)`, use its latest valid result and carry pending/insufficient-evidence items forward with their original condition; older pending entries do not reopen a completed check.
- Use pending before the condition is due and insufficient evidence when required proof is missing; support, weakening, and invalidation require evidence.
- State why a completed judgment is reopened; create a new check only for a new period or materially different condition.
- Review legacy prose observations in the body without fabricating historical check IDs; preserve at least three current-report disconfirmation checks.

## Output contract

Append this object to the existing profile JSON; IDs below are illustrative and must come from actual report-library results.

```json
{
  "continuity": {
    "previous_report_id": 101,
    "change_reasons": [],
    "previous_checks": [
      {"report_id": 95, "check_id": "cash_conversion", "result": "pending", "reason": "原条件要求核对年度回款，年报尚未披露。", "evidence": []}
    ],
    "next_checks": []
  }
}
```

| Field | Rule |
|---|---|
| `previous_report_id` | Latest eligible comparison report ID, or null if no usable history; do not supply snapshot IDs |
| `change_reasons[]` | `field/type/reason/evidence`; cover changed dimensions and grade, plus material logic/risk changes |
| `previous_checks[]` | `report_id/check_id/result/reason/evidence`; retain the original report and check IDs without duplicates |
| `next_checks[]` | `id/condition`; 1–3 initial checks, then 0–3 new conditions with a target period and falsifier |

- `field`: the six score fields, `investment_level`, `core_logic`, `primary_risk`, or `total_score` for independent calculation/method changes.
- `type`: `new_evidence/judgment_revision/data_correction/method_change/risk_adjustment`; total-score reasons allow only correction/method change, and risk adjustments use `investment_level`.
- `result`: `supported/weakened/invalidated/pending/insufficient_evidence`; reasons are nonempty and evidence lists trace source names, dates, links/pages or report sections.
- Evidence may be empty only for pending/insufficient evidence; explain any extra risk downgrade even on first research or an unchanged final grade.
- Do not duplicate old scores, deltas, or full source text in JSON; unavailable scores stay null and prevent score import, not archival.
- All four continuity fields are required; an absent object is legacy format, while null/malformed continuity is an error.
- Explain changes to available scores even if the comparison report is not imported; unknown historical scores stay incomparable, and the server binds a fixed snapshot only when already imported.
- Keep exact-body upload and the separate receipt; `received` proves receipt only, and source reports must remain traceable.
