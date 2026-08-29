import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "init_liuli_mcp_oauth.sh"


def bash_executable() -> str:
    git_bash = Path("C:/Program Files/Git/bin/bash.exe")
    if git_bash.exists():
        return str(git_bash)
    executable = shutil.which("bash")
    if executable is None:
        raise RuntimeError("bash is required for this test")
    return executable


def write_executable(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
    path.chmod(0o755)


def prepare_fake_project(tmp_path: Path) -> tuple[Path, Path]:
    project = tmp_path / "liuli-v2"
    event_log = tmp_path / "events.log"
    python = project / ".venv/bin/python"
    write_executable(
        python,
        """#!/usr/bin/env bash
set -eu
{
  printf 'python:'
  printf ' %q' "$@"
  printf '\\n'
} >> "$FAKE_EVENT_LOG"
if [[ "$*" == *"provision-client"* ]]; then
  printf 'client_id=liuli_test_client\\n'
  printf 'client_secret=test-secret-value\\n'
fi
""",
    )
    write_executable(
        project / "start_ubuntu_pg.sh",
        """#!/usr/bin/env bash
export DATABASE_URL="postgresql://user:password@example.test:5432/liuli"
exit 99
""",
    )
    return project, event_log


def run_script(project: Path, event_log: Path):
    environment = os.environ.copy()
    environment.update(
        {
            "LIULI_PROJECT_ROOT": project.as_posix(),
            "FAKE_EVENT_LOG": event_log.as_posix(),
        }
    )
    return subprocess.run(
        [bash_executable(), SCRIPT.as_posix()],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        check=False,
    )


def test_init_script_only_provisions_oauth_client_and_prints_credentials(tmp_path: Path):
    project, event_log = prepare_fake_project(tmp_path)

    result = run_script(project, event_log)

    assert result.returncode == 0, result.stderr
    events = event_log.read_text(encoding="utf-8").splitlines()
    assert events == [
        "python: -m invest_assistant.modules.basic.mcp.oauth.cli provision-client --name ChatGPT "
        "--redirect-uri https://chatgpt.com/connector/oauth/vKrIV9rCrHIT --profile chatgpt "
        "--token-auth-method client_secret_basic"
    ]
    assert "client_id=liuli_test_client" in result.stdout
    assert "client_secret=test-secret-value" in result.stdout
