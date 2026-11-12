"""Preview legacy micro-report identities; --apply backs up before updating data.

No application imports, schema changes, trade attribution guesses, or startup hooks.
The legacy code was verified with the live liuli MCP on 2026-11-12.
"""

import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
from uuid import uuid4

LEGACY_CODE = "portfolio_001"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BEIJING = timezone(timedelta(hours=8))


def timestamp(value):
    result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    # SQLite drops the offset from the project's Beijing-local timestamps.
    return result if result.tzinfo else result.replace(tzinfo=BEIJING)


def identity(value):
    return str(value or "").strip()


def build_plan(advices, feedbacks, before):
    """Only linked legacy micro-report rows before the explicit cutoff qualify."""
    feedback_by_id = {row["id"]: row for row in feedbacks}
    updates, conflicts, skipped = [], [], []
    for advice in advices:
        if timestamp(advice["created_at"]) >= before:
            continue
        feedback = feedback_by_id.get(advice["feedback_id"])
        code = identity(advice["researcher_code"])
        if feedback is None:
            if not code:
                skipped.append({"advice_id": advice["id"], "reason": "关联回流不存在，需人工核对"})
            continue
        other = identity(feedback["researcher_code"])
        if code and other and code != other:
            conflicts.append({"advice_id": advice["id"], "feedback_id": feedback["id"], "reason": "研究员编号冲突"})
            continue
        if any(value and value != LEGACY_CODE for value in (code, other)):
            skipped.append({"advice_id": advice["id"], "reason": "属于其他研究员，保留原值"})
            continue
        if timestamp(feedback["created_at"]) >= before or not re.fullmatch(r".+-\d{4}-\d{2}-\d{2}-微操报告", feedback["title"]):
            skipped.append({"advice_id": advice["id"], "reason": "关联回流不在历史微操范围"})
            continue
        if advice["report_id"] != feedback["report_id"]:
            conflicts.append({"advice_id": advice["id"], "reason": "报告关联不一致"})
            continue
        for table, row in (("portfolio_adjust_advice", advice), ("knowledge_research_feedback", feedback)):
            if not identity(row["researcher_code"]):
                updates.append({"table": table, "id": row["id"], "old_code": row["researcher_code"], "new_code": LEGACY_CODE})
    changed = {row["id"] for row in updates if row["table"] == "portfolio_adjust_advice"}
    active = {}
    for advice in advices:
        if advice["status"] != "active":
            continue
        code = LEGACY_CODE if advice["id"] in changed else identity(advice["researcher_code"])
        key = (advice["portfolio_id"], str(advice["target_trade_date"]), code)
        active.setdefault(key, []).append(advice["id"])
    for ids in active.values():
        if len(ids) > 1 and changed.intersection(ids):
            conflicts.append({"advice_ids": ids, "reason": "补齐后产生同组合、研究员、适用日的多份有效报告"})
    linked = {row["feedback_id"] for row in advices}
    for feedback in feedbacks:
        if feedback["id"] not in linked and not identity(feedback["researcher_code"]) and feedback["title"].endswith("-微操报告") and timestamp(feedback["created_at"]) < before:
            skipped.append({"feedback_id": feedback["id"], "reason": "尚无关联微操记录，需核对原报告"})
    return {"legacy_code": LEGACY_CODE, "before": before.isoformat(), "updates": updates, "conflicts": conflicts, "skipped": skipped}


def profile_registration(root, code):
    if code != "portfolio_002":
        raise ValueError("本脚本只负责注册 portfolio_002")
    relative = f"external/researchers/{code}/profile.md"
    content = (root / "invest_assistant/modules/knowledge_base" / relative).read_text(encoding="utf-8")
    frontmatter = content.split("---", 2)[1]
    metadata = dict(line.split(":", 1) for line in frontmatter.strip().splitlines())
    if metadata.get("researcher_code", "").strip() != code:
        raise ValueError("profile 编号与文件路径不一致")
    return {"researcher_code": code, "display_name": metadata["display_name"].strip(), "profile_path": relative,
            "profile_hash": hashlib.sha256(content.encode("utf-8")).hexdigest(), "status": "active"}


def backup_sqlite(source, destination):
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as reader, sqlite3.connect(destination) as backup:
        reader.backup(backup)
        if backup.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite 备份校验失败")


def create_backups(engine, root, recovery, stamp):
    recovery.mkdir(parents=True, exist_ok=True)
    paths = []
    local = root / "var/db/liuli.sqlite3"
    sources = {local.resolve()} if local.exists() else set()
    if engine.dialect.name == "sqlite":
        sources.add(Path(engine.url.database).resolve())
    for index, source in enumerate(sorted(sources)):
        backup = recovery / f"before-portfolio-researchers-{stamp}-{index}.sqlite3"
        backup_sqlite(source, backup)
        paths.append(str(backup))
    if engine.dialect.name == "postgresql":
        if not shutil.which("pg_dump") or not shutil.which("pg_restore"):
            raise RuntimeError("正式执行需要 pg_dump 和 pg_restore 完成 PostgreSQL 备份校验")
        backup = recovery / f"before-portfolio-researchers-{stamp}.dump"
        env = os.environ.copy()
        if engine.url.password is not None:
            env["PGPASSWORD"] = engine.url.password
        # Keep credentials out of command arguments and logs.
        public_url = engine.url._replace(drivername="postgresql", password=None).render_as_string(hide_password=False)
        result = subprocess.run(["pg_dump", "--dbname", public_url, "--no-password", "--format=custom", "--file", str(backup)], env=env, capture_output=True)
        if result.returncode or not backup.exists() or backup.stat().st_size == 0:
            raise RuntimeError("PostgreSQL 备份失败，未修改数据")
        if subprocess.run(["pg_restore", "--list", str(backup)], capture_output=True).returncode:
            raise RuntimeError("PostgreSQL 备份校验失败，未修改数据")
        paths.append(str(backup))
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True, help="历史截止时点，必须带时区，排除此时点及之后的数据")
    parser.add_argument("--database-url-env", default="LIULI_DATABASE_URL", help="数据库连接串所在环境变量名")
    parser.add_argument("--project-root", type=Path, default=PROJECT_ROOT)
    parser.add_argument("--register-profile", choices=["portfolio_002"])
    parser.add_argument("--apply", action="store_true", help="备份后正式执行；默认只读预览")
    args = parser.parse_args()
    before = datetime.fromisoformat(args.before)
    if before.tzinfo is None:
        parser.error("--before 必须带时区，例如 +08:00")
    database_url = os.environ.get(args.database_url_env)
    if not database_url:
        parser.error(f"未设置环境变量 {args.database_url_env}")
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if url.get_backend_name() not in {"sqlite", "postgresql"}:
        parser.error("仅支持 SQLite 和 PostgreSQL")
    if url.get_backend_name() == "sqlite" and (not url.database or not Path(url.database).is_file()):
        parser.error("SQLite 必须指向已存在的数据库文件")
    root = args.project_root.resolve()
    registration = profile_registration(root, args.register_profile) if args.register_profile else None
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                conn.exec_driver_sql("BEGIN IMMEDIATE" if args.apply else "PRAGMA query_only=ON")
            elif args.apply:
                conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                conn.execute(text("LOCK TABLE knowledge_researcher, knowledge_research_feedback, portfolio_adjust_advice IN SHARE ROW EXCLUSIVE MODE"))
            else:
                conn.execute(text("SET TRANSACTION READ ONLY"))
            researchers = list(conn.execute(text("SELECT researcher_code, display_name, profile_path FROM knowledge_researcher")).mappings())
            by_code = {row["researcher_code"]: row for row in researchers}
            if LEGACY_CODE not in by_code:
                raise ValueError("目标数据库中不存在已确认的 portfolio_001，停止")
            if registration and registration["researcher_code"] in by_code:
                existing = by_code[registration["researcher_code"]]
                if any(existing[key] != registration[key] for key in ("display_name", "profile_path")):
                    raise ValueError("portfolio_002 已被不同研究员占用，停止")
                registration = None
            advices = list(conn.execute(text("SELECT id, feedback_id, report_id, researcher_code, created_at, status, portfolio_id, target_trade_date FROM portfolio_adjust_advice")).mappings())
            feedbacks = list(conn.execute(text("SELECT id, title, report_id, researcher_code, created_at FROM knowledge_research_feedback")).mappings())
            plan = build_plan(advices, feedbacks, before)
            plan["register_profile"] = registration
            print(json.dumps(plan, ensure_ascii=False, indent=2, default=str))
            if not args.apply:
                conn.rollback()
                return 0
            if plan["conflicts"]:
                raise ValueError("存在归属冲突，正式执行已中止")
            if not plan["updates"] and not registration:
                conn.rollback()
                print("无需修改，已有身份完整。")
                return 0
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
            recovery = root / "var/db/recovery"
            plan["backups"] = create_backups(engine, root, recovery, stamp)
            receipt = recovery / f"portfolio-researchers-{stamp}.json"
            receipt.write_text(json.dumps(plan, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
            for update in plan["updates"]:
                result = conn.execute(text(f"UPDATE {update['table']} SET researcher_code=:new_code WHERE id=:id AND NULLIF(TRIM(researcher_code), '') IS NULL"), update)
                if result.rowcount != 1:
                    raise RuntimeError("待补数据发生变化，整笔事务回滚")
            if registration:
                now = datetime.now(BEIJING)
                conn.execute(text("INSERT INTO knowledge_researcher (researcher_code, display_name, profile_path, profile_hash, status, created_at, updated_at) VALUES (:researcher_code, :display_name, :profile_path, :profile_hash, :status, :now, :now)"), {**registration, "now": now})
            conn.commit()
            print(f"已补齐 {len(plan['updates'])} 条空身份；注册研究员 {int(registration is not None)} 个；审计记录：{receipt}")
        return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        # Driver exceptions can contain credentials; keep connection details private.
        print(f"执行失败（{type(exc).__name__}），连接关闭后未提交事务自动回滚。", file=sys.stderr)
        sys.exit(1)
