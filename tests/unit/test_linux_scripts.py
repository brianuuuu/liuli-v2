from pathlib import Path


def test_stop_script_targets_linux_vite_host_used_by_start_script():
    start_source = Path("start.sh").read_text(encoding="utf-8")
    stop_source = Path("stop.sh").read_text(encoding="utf-8")

    assert "npm run dev -- --host 0.0.0.0 --port 5173" in start_source
    assert "npm run dev -- --host 0.0.0.0 --port 5174" in start_source
    assert "vite --host 0.0.0.0 --port 5173" in stop_source
    assert "vite --host 0.0.0.0 --port 5174" in stop_source
    assert '"$LOG_DIR/h5.log"' in start_source
    assert '"$PID_DIR/h5.pid"' in start_source


def test_stop_script_can_fallback_to_port_5173_owner():
    stop_source = Path("stop.sh").read_text(encoding="utf-8")

    assert "stop_by_port 5173" in stop_source
    assert 'stop_by_pid_file "h5" "npm run dev -- --host 0.0.0.0 --port 5174"' in stop_source
    assert "stop_by_port 5174" in stop_source
    assert "lsof -ti TCP:" in stop_source
    assert '"/proc/$pid/cmdline"' in stop_source
    assert "Refusing to stop it from a stale PID file" in stop_source
