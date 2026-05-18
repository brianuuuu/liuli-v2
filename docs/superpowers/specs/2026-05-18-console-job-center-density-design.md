# Console Job Center Density Design

## Goal

Improve the Console Job Center page without changing backend APIs or job data models. The page should keep the current card-based mental model, but read more like a compact operations workbench: lower card height, clearer status scanning, a more usable toolbar, and less visual weight on per-card actions.

## Current Issues

- The card grid shows useful fields, but each card is tall and visually heavy.
- Per-card metadata is dense because every field has similar visual priority.
- The toolbar is technically complete, but search, filters, and page actions are all presented with similar weight.
- The primary blue `运行` button is too prominent when placed beside `配置` and `日志`. The size and color weight do not feel coordinated as one action group.
- The page lacks a compact status summary, so users must infer overall task health from individual cards.

## Design Direction

Use a "task management console, leaning compact operations" layout:

- Keep cards as the primary list surface.
- Add a lightweight summary strip above the toolbar.
- Convert the toolbar into search + quick status filters + secondary filters + right-aligned actions.
- Compress each card to focus on title, technical job name, status, module, trigger, last run, timeout, retry, and enabled state.
- Keep running a job as a visible card action, but reduce its visual weight so the action group reads as one coordinated toolbar.
- Optimize card size as a first-class goal: reduce height, avoid oversized blank areas, and keep the grid comfortable for repeated scanning.

## Layout

The Job Center remains inside the current Console tab content area.

Top-to-bottom structure:

1. Summary strip
   - Total jobs
   - Enabled jobs
   - Running jobs
   - Failed or error jobs
   - Optional latest run time when data is available

2. Toolbar
   - Left: search input with a wider target and placeholder `搜索任务名 / 模块 / 描述`
   - Middle: segmented status shortcuts: `全部`, `异常`, `运行中`, `未运行`, `已完成`
   - Secondary filters: module select and enabled select
   - Right: `同步任务定义`, `查看所有日志`

3. Card grid
   - Keep responsive grid.
   - Reduce card minimum height.
   - Use a slightly narrower minimum card width so four columns can fit comfortably on wide desktop when the content area allows it.
   - Use thinner internal spacing.
   - Use a left status rail or small status marker for quick scanning.

Recommended sizing targets:

- Grid minimum column width: about `280px` to `300px`, instead of the current `320px`.
- Card minimum height: about `132px` to `148px`, instead of the current tall card treatment.
- Card padding: about `9px` to `10px`.
- Internal gap: about `6px` to `8px`.
- Card radius: keep at `6px` to `7px`, consistent with the existing workbench style.

## Card Content

Each card shows:

- Display name as the primary line.
- `job_name` as a muted monospace line.
- Status badge in the top-right.
- Description clamped to one line.
- One compact metadata row or two short rows, depending on available width:
  - module
  - trigger type
  - last run
  - timeout
  - retries
  - enabled state

The card should avoid equal-weight label/value grids for every field. Labels can be muted; values should remain readable but not oversized.

Card content priority:

- Required in collapsed card: title, job name, status, module, last run, enabled state, actions.
- Secondary fields can be shortened: trigger, timeout, retries.
- Description should be one line and can be hidden when width is too narrow.
- Long module names and job names must ellipsize without increasing card height.

## Actions

The card can keep a permanent `运行` action, but it must not use the current heavy blue primary-button treatment.

Action model:

- Always-visible coordinated actions:
  - `运行`
  - `日志`
  - `配置`
  - `更多`
- `运行` should use a lower-weight treatment, such as a subtle accent outline, text button, or icon+text button with the same height as the other actions.
- `配置`, `日志`, and `更多` should share the same control height, spacing, and border rhythm.
- If a task is failed/error, the `运行` label may become `重试`, but it should still use the same coordinated action style.
- Running a job still opens the existing run-parameter confirmation modal.
- No bulk run action is added in this iteration.

This keeps the manual-run workflow discoverable while preventing one button from visually overpowering the card.

## Toolbar Behavior

Filtering behavior continues to use the existing client-side job list:

- Search matches display name, job name, module, and description.
- Status shortcuts map to existing `last_status` values.
- `异常` includes `failed` and `error`.
- `已完成` includes `success` and `completed`.
- Module and enabled filters can combine with status shortcuts.
- `同步任务定义` and `查看所有日志` retain existing API behavior.

## Visual Rules

Follow `docs/superpowers/specs/2026-05-16-liuli-web-ui-spec.md`:

- Light, compact operations style.
- 1px borders, small radii, restrained shadows.
- No decorative gradients or large cards.
- Use existing CSS variables for light/dark compatibility.
- Repeated per-card actions should use coordinated low-weight controls. Avoid one repeated action using a large saturated primary style while neighboring actions are plain buttons.

## Scope

In scope:

- `JobsSection.tsx`
- `JobCard.tsx`
- Job Center CSS in `global.css`
- Existing job center modals and drawers if minor copy or trigger wiring changes are needed

Out of scope:

- Backend job APIs
- Job database schema
- New batch operations
- New scheduler semantics
- Replacing the card grid with a full table
- Changing Console navigation or other Console tabs

## Acceptance Criteria

- Task cards are visibly shorter than the current version.
- On the screenshot-sized desktop viewport, the grid should fit more tasks per screen than the current version.
- Cards do not grow tall because of long descriptions, job names, module names, or action wrapping.
- The toolbar reads as one coherent control strip instead of several equal-weight controls.
- The page shows task health summary numbers above the card grid.
- `运行`, `配置`, `日志`, and `更多` appear as a visually coordinated action group with consistent size and spacing.
- `运行` is no longer a heavy saturated blue primary button repeated on every card.
- Existing run, edit, detail, single-job logs, all-job logs, refresh, and sync flows still work.
- Dark mode remains readable.
- `npm.cmd run build` passes.
