from pathlib import Path


def test_stop_script_targets_linux_vite_host_used_by_start_script():
    start_source = Path("start.sh").read_text(encoding="utf-8")
    stop_source = Path("stop.sh").read_text(encoding="utf-8")

    assert "npm run dev -- --host 0.0.0.0 --port 5173" in start_source
    assert "vite --host 0.0.0.0 --port 5173" in stop_source


def test_stop_script_can_fallback_to_port_5173_owner():
    stop_source = Path("stop.sh").read_text(encoding="utf-8")

    assert "stop_by_port 5173" in stop_source
    assert "lsof -ti TCP:" in stop_source
