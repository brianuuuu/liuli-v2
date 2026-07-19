from pathlib import Path


def test_start_script_refuses_duplicate_port_startup():
    source = Path("start.bat").read_text(encoding="utf-8")

    assert "Get-NetTCPConnection -LocalPort" in source
    assert "Port %~1 is already in use" in source
    assert "Please run stop.bat first" in source
    assert "start \"Liuli API :8000\"" in source
    assert "start \"Liuli Worker\"" in source
    assert "start \"Liuli Web :5173\"" in source
    assert "start \"Liuli H5 :5174\"" in source
    assert "call :ensure_port_free 5174 H5" in source


def test_stop_script_targets_liuli_processes_and_parent_cmd_windows():
    source = Path("stop.bat").read_text(encoding="utf-8")

    assert "invest_assistant.main:app" in source
    assert "invest_assistant.worker" in source
    assert "invest_assistant\\\\ui\\\\web" in source
    assert "invest_assistant\\\\ui\\\\android\\\\h5" in source
    assert "vite --host 127.0.0.1 --port 5174" in source
    assert "npm.cmd run dev -- --host 127.0.0.1 --port 5174" in source
    assert "ParentProcessId" in source
    assert "Stopping Liuli PID" in source
