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
    expect(treemapRule).toMatch(/height:\s*240px;/);
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
