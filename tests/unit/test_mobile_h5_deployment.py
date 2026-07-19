from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_mobile_h5_source_is_isolated_under_android():
    package = (ROOT / "invest_assistant/ui/android/h5/package.json").read_text(encoding="utf-8")
    assert '"name": "liuli-android-h5"' in package
    assert "../../web/src" not in package


def test_start_scripts_build_and_sync_mobile_h5_without_a_runtime_port():
    windows = (ROOT / "start.bat").read_text(encoding="utf-8")
    linux = (ROOT / "start.sh").read_text(encoding="utf-8")

    for source in (windows, linux):
        assert "invest_assistant/ui/android/h5" in source.replace("\\", "/")
        assert "sync-mobile-h5.mjs" in source
        assert "5174" not in source


def test_generated_mobile_assets_are_not_tracked_as_desktop_web_source():
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "invest_assistant/ui/web/public/mobile/" in ignore
