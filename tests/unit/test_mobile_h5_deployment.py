from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]


def test_mobile_h5_source_is_isolated_under_android():
    package = (ROOT / "invest_assistant/ui/android/h5/package.json").read_text(encoding="utf-8")
    assert '"name": "liuli-android-h5"' in package
    assert "../../web/src" not in package


def test_start_scripts_run_mobile_h5_on_an_independent_port():
    windows = (ROOT / "start.bat").read_text(encoding="utf-8")
    linux = (ROOT / "start.sh").read_text(encoding="utf-8")

    for source in (windows, linux):
        assert "invest_assistant/ui/android/h5" in source.replace("\\", "/")
        assert "5174" in source
        assert "sync-mobile-h5.mjs" not in source


def test_mobile_h5_uses_the_5174_root_and_local_api_proxy():
    vite = (ROOT / "invest_assistant/ui/android/h5/vite.config.ts").read_text(encoding="utf-8")
    index = (ROOT / "invest_assistant/ui/android/h5/index.html").read_text(encoding="utf-8")
    android = (ROOT / "invest_assistant/ui/android/app/build.gradle.kts").read_text(encoding="utf-8")

    assert 'base: "/"' in vite
    assert "strictPort: true" in vite
    assert '"http://127.0.0.1:8000"' in vite
    assert 'href="/liuli-logo.svg"' in index
    assert "http://115.29.176.240:5174/" in android


def test_legacy_desktop_mobile_sync_is_removed():
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "invest_assistant/ui/web/public/mobile/" not in ignore
    assert not (ROOT / "scripts/sync-mobile-h5.mjs").exists()


def test_android_releases_the_exact_webview_owned_by_android_view():
    source = (
        ROOT
        / "invest_assistant/ui/android/app/src/main/java/com/liuli/app/MainActivity.kt"
    ).read_text(encoding="utf-8")

    assert "DisposableEffect(webView)" not in source
    assert "onRelease = { releasedWebView ->" in source
    assert 'releasedWebView.removeJavascriptInterface("LiuliNative")' in source
    assert "releasedWebView.destroy()" in source


def test_android_bottom_surface_paints_behind_the_navigation_gesture_inset():
    source = (
        ROOT
        / "invest_assistant/ui/android/app/src/main/java/com/liuli/app/MainActivity.kt"
    ).read_text(encoding="utf-8")
    bottom_bar = source[source.index("private fun HybridBottomBar(") :]

    assert ".fillMaxWidth()\n            .windowInsetsPadding(" not in bottom_bar
    assert (
        "Column(\n"
        "            modifier = Modifier.windowInsetsPadding("
        "WindowInsets.navigationBars.only(WindowInsetsSides.Bottom)),"
    ) in bottom_bar


def test_android_status_bar_and_h5_navigation_share_one_theme_surface():
    source = (
        ROOT
        / "invest_assistant/ui/android/app/src/main/java/com/liuli/app/MainActivity.kt"
    ).read_text(encoding="utf-8")

    assert "containerColor = systemChromeBackground" in source
    assert "HybridBottomBar(" in source
    assert "background = systemChromeBackground" in source


def test_mobile_h5_geometry_uses_the_shared_compact_layout():
    styles = (
        ROOT / "invest_assistant/ui/android/h5/src/styles.css"
    ).read_text(encoding="utf-8")

    top = re.search(r"\.mobile-page-frame__top\s*\{([^}]*)\}", styles, re.S)
    navigation = re.search(r"\.secondary-navigation\s*\{([^}]*)\}", styles, re.S)
    note = re.search(r"\.note-card p\s*\{([^}]*)\}", styles, re.S)
    article = re.search(
        r"\.article-detail > p:not\(\.article-source\)\s*\{([^}]*)\}",
        styles,
        re.S,
    )
    frame = re.search(r"\.mobile-page-frame\s*\{([^}]*)\}", styles, re.S)

    assert top and "height: 36px;" in top.group(1)
    assert top and "padding-top:" not in top.group(1)
    assert navigation and "height: 36px;" in navigation.group(1)
    assert "padding-top:" not in navigation.group(1)
    assert "--content-font-size: 14px;" in styles
    assert note and "font-size: var(--content-font-size);" in note.group(1)
    assert note and "overflow-wrap: anywhere;" in note.group(1)
    assert article and "font-size: var(--content-font-size);" in article.group(1)
    assert frame and "overflow-x: clip;" in frame.group(1)


def test_note_editor_forces_soft_wrapping_without_horizontal_scroll():
    page = (
        ROOT / "invest_assistant/ui/android/h5/src/pages/DetailPages.tsx"
    ).read_text(encoding="utf-8")
    styles = (
        ROOT / "invest_assistant/ui/android/h5/src/styles.css"
    ).read_text(encoding="utf-8")
    editor = re.search(r"\.note-editor textarea\s*\{([^}]*)\}", styles, re.S)

    assert '<textarea wrap="soft"' in page
    assert editor and "overflow-x: hidden;" in editor.group(1)
    assert editor and "white-space: pre-wrap;" in editor.group(1)
