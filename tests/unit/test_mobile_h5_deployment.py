from pathlib import Path


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
