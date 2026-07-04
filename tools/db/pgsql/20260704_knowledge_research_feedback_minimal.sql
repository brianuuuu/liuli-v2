-- Knowledge research feedback minimal-schema server update.
-- Date: 2026-07-04
--
-- This script is intentionally non-destructive:
-- - it only adds the minimal common feedback columns when missing;
-- - it backfills defaults for source/status;
-- - it does not drop legacy columns that may still exist on an older server.
--
-- If you need to physically remove legacy columns such as report_content,
-- structured_conclusion, valuation_assumption, risk_points, observation_signals,
-- data_sources_json, verification_result, research_time, or researcher_id,
-- do that as a separate migration after backing up the production database.

BEGIN;

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS report_id INTEGER;

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS report_path VARCHAR(512);

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS researcher_code VARCHAR(64);

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS skill_name VARCHAR(128);

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS business_module VARCHAR(64);

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'mcp';

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'received';

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP;

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

ALTER TABLE knowledge_research_feedback
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

UPDATE knowledge_research_feedback
SET source = 'mcp'
WHERE source IS NULL OR source = '';

UPDATE knowledge_research_feedback
SET status = 'received'
WHERE status IS NULL OR status = '';

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
