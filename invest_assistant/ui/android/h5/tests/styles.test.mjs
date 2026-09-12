import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile card elevation", () => {
  it("keeps ordinary content cards flat while floating actions remain elevated", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const lightTheme = styles.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(lightTheme).toMatch(/--shadow:\s*none;/);
    expect(styles).toMatch(/\.floating-button\s*\{[^}]*box-shadow:\s*(?!none)[^;}]+;/s);
  });

  it("renders notes as a continuous divided list on the page background", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.note-list\s*\{[^}]*gap:\s*0;[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/\.note-card\s*\{[^}]*padding:\s*12px 14px;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(/\.note-card \+ \.note-card\s*\{[^}]*border-top:\s*1px solid var\(--border\);/s);
    expect(styles).toMatch(/\.note-card-meta\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px;/s);
    expect(styles).toMatch(/\.note-card p\s*\{[^}]*margin:\s*6px 0 0;[^}]*font-weight:\s*500;[^}]*line-height:\s*1\.62;/s);
    expect(styles).toMatch(/\.note-card footer\s*\{[^}]*margin-top:\s*8px;/s);
    expect(styles).toMatch(/\.note-card footer \.note-card-tag\s*\{[^}]*background:\s*transparent;/s);
  });

  it("renders the market, track, and stock dashboard content directly on the page background", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.dashboard-flat-section\s*\{[^}]*padding:\s*0 var\(--dashboard-flat-inset\);[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    // --dashboard-page-gutter 是页框左右内边距的副本，页框一改这里必须同步，否则底部切换器会错位。
    const frameGutter = styles.match(/\.mobile-page-frame__content\s*\{[^}]*padding:\s*\d+px (\d+px)/s)?.[1];
    const declaredGutter = styles.match(/--dashboard-page-gutter:\s*(\d+px);/)?.[1];
    expect(frameGutter).toBeDefined();
    expect(declaredGutter).toBe(frameGutter);
    expect(styles).toMatch(/\.dashboard-flat-section \.pool-card\s*\{[^}]*background:\s*var\(--panel\);/s);
    expect(styles).toMatch(/\.dashboard-flat-section \.pool-card--pager\s*\{[^}]*background:\s*var\(--blue-soft\);/s);
  });

  it("keeps the note editor usable when the visual viewport shrinks", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.note-editor textarea\s*\{[^}]*min-height:\s*calc\(3 \* 1\.7em \+ 30px\);/s);
  });

  it("keeps the mobile content surface full-height across WebView viewport implementations", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.mobile-page-frame__content\s*\{[^}]*min-height:\s*calc\(100vh - 36px\);[^}]*min-height:\s*calc\(100dvh - 36px\);/s);
  });

  it("keeps every secondary menu fixed above short and long content", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.mobile-page-frame\s*\{[^}]*padding-top:\s*36px;/s);
    expect(styles).toMatch(/\.mobile-page-frame__top\s*\{[^}]*position:\s*fixed;[^}]*top:\s*0;[^}]*right:\s*0;[^}]*left:\s*0;/s);
  });

  it("lets pager pages claim horizontal gestures that start on their surrounding surface", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.horizontal-tab-pager-surface\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*touch-action:\s*pan-y;/s);
    expect(styles).toMatch(/\.horizontal-tab-pager-surface > \.horizontal-tab-pager\s*\{[^}]*flex:\s*1 0 auto;/s);
    expect(styles).toMatch(/html\.horizontal-tab-pager-document,\s*html\.horizontal-tab-pager-document body\s*\{[^}]*touch-action:\s*pan-y;/s);
    expect(styles).toMatch(/\.horizontal-tab-pager\s*\{[^}]*contain:\s*layout paint;/s);
    expect(styles).toMatch(/\.horizontal-tab-pager\.is-dragging \.horizontal-tab-pager__page,\s*\.horizontal-tab-pager\.is-settling \.horizontal-tab-pager__page\s*\{[^}]*will-change:\s*transform;/s);
    expect(styles.match(/will-change:\s*transform;/g)).toHaveLength(1);
    expect(styles).toMatch(/\.horizontal-tab-pager\.is-settling \.horizontal-tab-pager__page\s*\{[^}]*transition:\s*transform var\(--pager-settle-duration\)/s);
  });

  it("keeps the suggestion list actions symmetric with action-colored borders", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.suggestion-list-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
    expect(styles).toMatch(/\.suggestion-list-actions \.load-more\s*\{[^}]*border:\s*1px solid var\(--blue\);/s);
    expect(styles).toMatch(/\.reject-loaded-button\s*\{[^}]*border:\s*1px solid #dc2626;/s);
  });

  it("allows the composer to scroll inside the visual viewport", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.composer-backdrop\s*\{[^}]*bottom:\s*auto;/s);
    expect(styles).toMatch(/\.composer-sheet\s*\{[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  });

  it("keeps the target portfolio ring large and five compact rows visible", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).not.toMatch(/\.portfolio-refresh/);
    expect(styles).toMatch(/\.donut-chart\s*\{[^}]*width:\s*150px;[^}]*height:\s*160px;/s);
    expect(styles).toMatch(/\.portfolio-allocation\s*\{[^}]*grid-template-columns:\s*150px minmax\(0,\s*1fr\);[^}]*gap:\s*12px;/s);
    expect(styles).toMatch(/\.portfolio-allocation__list\s*\{[^}]*height:\s*160px;[^}]*overflow-y:\s*auto;/s);
    expect(styles).toMatch(/\.portfolio-allocation__item\s*\{[^}]*min-height:\s*32px;/s);
    expect(styles).toMatch(/\.portfolio-allocation__marker\s*\{[^}]*border-radius:\s*50%;/s);
    expect(styles).toMatch(/\.portfolio-allocation__metrics\s*\{[^}]*justify-items:\s*end;/s);
  });

  it("uses the extra logical width of high-density compact Android screens", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/@media \(min-width:\s*390px\) and \(max-width:\s*599px\)\s*\{[^}]*\.donut-chart\s*\{[^}]*width:\s*160px;[^}]*height:\s*168px;/s);
    expect(styles).toMatch(/@media \(min-width:\s*390px\) and \(max-width:\s*599px\)\s*\{[\s\S]*?\.portfolio-allocation\s*\{[^}]*grid-template-columns:\s*160px minmax\(0,\s*1fr\);/s);
  });

  it("keeps the portfolio treemap full-width and in normal document flow", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const treemapRule = styles.match(/\.portfolio-treemap\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(treemapRule).toMatch(/width:\s*100%;/);
    expect(treemapRule).toMatch(/min-width:\s*0;/);
    expect(treemapRule).toMatch(/height:\s*280px;/);
    expect(treemapRule).not.toMatch(/position:\s*(fixed|sticky|absolute)/);
  });

  it("keeps page pull refresh scoped and out of permanent layout flow", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const rootRule = styles.match(/\.pull-to-refresh\s*\{([^}]*)\}/)?.[1] ?? "";
    const indicatorRule = styles.match(/\.pull-to-refresh__indicator\s*\{([^}]*)\}/)?.[1] ?? "";
    const contentRule = styles.match(/\.pull-to-refresh__content\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rootRule).toMatch(/position:\s*relative;/);
    expect(indicatorRule).toMatch(/position:\s*absolute;/);
    expect(indicatorRule).toMatch(/height:\s*40px;/);
    expect(indicatorRule).not.toMatch(/position:\s*(fixed|sticky)/);
    expect(contentRule).toMatch(/transform:\s*translate3d\(0,\s*var\(--pull-distance\),\s*0\);/);
    expect(styles).toMatch(/\.pull-to-refresh__spinner\s*\{[^}]*animation:\s*pull-to-refresh-spin \.8s linear infinite;/s);
  });

  it("keeps both market ranking filters side by side below the list", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.market-ranking-filters\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*8px;[^}]*margin-top:\s*12px;[^}]*padding-top:\s*12px;/s);
    // 热度排行筛选器沉底吸附，与标的页切换器共用同一条内容列与同一套变量。
    expect(styles).toMatch(/\.market-filter-bar\s*\{[^}]*position:\s*fixed;[^}]*right:\s*calc\(var\(--dashboard-page-gutter\) \+ var\(--dashboard-flat-inset\)\);[^}]*bottom:\s*8px;[^}]*left:\s*calc\(var\(--dashboard-page-gutter\) \+ var\(--dashboard-flat-inset\)\);/s);
    expect(styles).toMatch(/\.market-filter-bar \.market-ranking-filters\s*\{[^}]*margin-top:\s*0;[^}]*padding-top:\s*0;[^}]*border-top:\s*0;/s);
    expect(styles).toMatch(/\.market-filter-stack\s*\{[^}]*padding-bottom:\s*62px;/s);
    expect(styles).toMatch(/\.market-ranking-filters \.segmented\s*\{[^}]*min-width:\s*0;[^}]*padding:\s*3px;/s);
    expect(styles).toMatch(/@media \(max-width:\s*359px\)\s*\{[\s\S]*?\.market-ranking-filters\s*\{[^}]*gap:\s*6px;/s);
    expect(styles).toMatch(/@media \(max-width:\s*359px\)\s*\{[\s\S]*?\.market-ranking-filters \.segmented button\s*\{[^}]*font-size:\s*11px;/s);
  });

  it("keeps ranking movement compact and right aligned", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.market-ranking-metrics\s*\{[^}]*display:\s*grid;[^}]*flex:\s*0 0 auto;[^}]*min-width:\s*78px;[^}]*justify-items:\s*end;/s);
    expect(styles).toMatch(/\.market-ranking-movement\s*\{[^}]*display:\s*flex;[^}]*font-size:\s*10px;[^}]*white-space:\s*nowrap;/s);
    expect(styles).toMatch(/\.market-ranking-movement--up\s*\{[^}]*color:\s*#dc2626;/s);
    expect(styles).toMatch(/\.market-ranking-movement--down\s*\{[^}]*color:\s*#16a34a;/s);
  });

  it("keeps pool cards compact and pins the stock view segments in a bordered bar at the bottom", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.pool-card-grid\s*\{[^}]*gap:\s*6px;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s);
    expect(styles).toMatch(/\.pool-card\s*\{[^}]*min-height:\s*58px;[^}]*justify-content:\s*center;[^}]*border-radius:\s*8px;/s);
    expect(styles).toMatch(/\.pool-card strong\s*\{[^}]*color:\s*var\(--text\);[^}]*font-size:\s*13px;[^}]*font-weight:\s*600;/s);
    expect(styles).toMatch(/\.pool-card span\s*\{[^}]*color:\s*var\(--muted\);[^}]*font-size:\s*11px;[^}]*font-variant-numeric:\s*tabular-nums;/s);
    expect(styles).not.toMatch(/\.pool-card em\s*\{/s);
    expect(styles).toMatch(/\.pool-card--pager\s*\{[^}]*background:\s*var\(--blue-soft\);/s);
    // 角标分两组固定槽位：右上研究结论、右下趋势时机，文字按实际占用的槽位留宽才不会压到角标。
    // 没有角标的卡片一律不预留：360px 机型上文字区只有 78px，四字名就占 52px，多留一点就会截断。
    expect(styles).not.toMatch(/\.pool-card strong\s*\{[^}]*padding-right:/s);
    expect(styles).not.toMatch(/\.pool-card span\s*\{[^}]*padding-right:/s);
    expect(styles).toMatch(/\.pool-card--slot-top-1 strong\s*\{[^}]*padding-right:\s*10px;/s);
    expect(styles).toMatch(/\.pool-card--slot-top-2 strong\s*\{[^}]*padding-right:\s*25px;/s);
    expect(styles).toMatch(/\.pool-card--slot-trend span\s*\{[^}]*padding-right:\s*12px;/s);
    expect(styles).toMatch(/\.pool-card \.pool-card__badges\s*\{[^}]*top:\s*4px;[^}]*right:\s*3px;[^}]*padding-right:\s*0;/s);
    // 角标缩到 14px 才能在 360px 机型上给四字名让出位置。
    expect(styles).toMatch(/\.pool-card__badge\s*\{[^}]*min-width:\s*14px;[^}]*height:\s*14px;[^}]*font-size:\s*8px;[^}]*line-height:\s*14px;/s);
    expect(styles).toMatch(/\.pool-card__badge--trend\s*\{[^}]*position:\s*absolute;[^}]*right:\s*3px;[^}]*bottom:\s*5px;/s);
    for (const level of ["T0", "T1", "T2", "T3", "T4", "T5"]) {
      expect(styles).toMatch(new RegExp(String.raw`\.pool-card__badge--trend-${level}\s*\{[^}]*background:[^;}]+;[^}]*color:[^;}]+;`, "s"));
      expect(styles).toMatch(new RegExp(String.raw`:root\[data-theme="dark"\] \.pool-card__badge--trend-${level}\s*\{`, "s"));
    }
    // 视图切换器 portal 到 body，继承不到页框与看板内容的两层内缩，必须显式算回同一条内容列。
    expect(styles).toMatch(/\.stock-view-bar\s*\{[^}]*position:\s*fixed;[^}]*right:\s*calc\(var\(--dashboard-page-gutter\) \+ var\(--dashboard-flat-inset\)\);[^}]*bottom:\s*8px;[^}]*left:\s*calc\(var\(--dashboard-page-gutter\) \+ var\(--dashboard-flat-inset\)\);[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*10px;[^}]*background:\s*var\(--panel\);/s);
    expect(styles).toMatch(/\.stock-view-stack\s*\{[^}]*padding-bottom:\s*54px;/s);
    expect(styles).not.toMatch(/\.stock-view-bar\s*\{[^}]*position:\s*sticky;/s);
    expect(styles).toMatch(/\.stock-view-bar \.pill-segments\s*\{[^}]*margin-bottom:\s*0;/s);
    expect(styles).toMatch(/\.stock-view-bar \.pill-segments button\s*\{[^}]*flex:\s*1 1 0;[^}]*text-align:\s*center;/s);
  });

  it("标的详情档案卡与状态徽章", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.stock-profile\s*\{[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*10px;[^}]*background:\s*var\(--panel\);/s);
    expect(styles).toMatch(/\.stock-profile__head\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;/s);
    expect(styles).toMatch(/\.stock-profile__head h2\s*\{[^}]*font-size:\s*19px;[^}]*text-overflow:\s*ellipsis;/s);
    expect(styles).toMatch(/\.stock-profile__metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*border-top:\s*1px solid var\(--border\);/s);
    expect(styles).toMatch(/\.stock-status--focused\s*\{[^}]*background:\s*var\(--blue-soft\);[^}]*color:\s*var\(--blue\);/s);
    expect(styles).not.toMatch(/\.stock-head\s*\{/s);
    expect(styles).not.toMatch(/\.stock-detail-score-head\s*\{/s);
  });

  it("renders dashboard materials as a compact continuous list", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.dashboard-material-list\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0;/s);
    expect(styles).toMatch(/\.dashboard-material-item \+ \.dashboard-material-item\s*\{[^}]*border-top:\s*1px solid var\(--border\);/s);
    expect(styles).toMatch(/\.dashboard-material-item__entity\s*\{[^}]*min-width:\s*0;/s);
    expect(styles).toMatch(/\.dashboard-material-item__entity strong\s*\{[^}]*min-width:\s*0;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(styles).toMatch(/\.dashboard-material-item p\s*\{[^}]*-webkit-line-clamp:\s*2;/s);
    expect(styles).toMatch(/\.material-direction--positive\s*\{[^}]*color:\s*#dc2626;/s);
    expect(styles).toMatch(/\.material-direction--negative\s*\{[^}]*color:\s*#16a34a;/s);
    expect(styles).toMatch(/\.material-direction--neutral\s*\{[^}]*color:\s*var\(--muted\);/s);
  });
});
