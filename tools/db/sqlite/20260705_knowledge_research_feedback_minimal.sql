-- Knowledge research feedback minimal-schema full rebuild for SQLite.
-- Date: 2026-07-05

PRAGMA foreign_keys = OFF;

BEGIN;

DROP TABLE IF EXISTS knowledge_research_feedback;

CREATE TABLE knowledge_research_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    report_id INTEGER REFERENCES report(id),
    report_path VARCHAR(512),
    researcher_code VARCHAR(64),
    skill_name VARCHAR(128),
    business_module VARCHAR(64),
    source VARCHAR(64) NOT NULL DEFAULT 'mcp',
    status VARCHAR(32) NOT NULL DEFAULT 'received',
    returned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_knowledge_research_feedback_report_id
    ON knowledge_research_feedback (report_id);

CREATE INDEX IF NOT EXISTS ix_knowledge_research_feedback_researcher_code
    ON knowledge_research_feedback (researcher_code);

CREATE INDEX IF NOT EXISTS ix_knowledge_research_feedback_business_module
    ON knowledge_research_feedback (business_module);

CREATE INDEX IF NOT EXISTS ix_knowledge_research_feedback_source
    ON knowledge_research_feedback (source);

CREATE INDEX IF NOT EXISTS ix_knowledge_research_feedback_status
    ON knowledge_research_feedback (status);

COMMIT;

PRAGMA foreign_keys = ON;
