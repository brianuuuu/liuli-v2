-- Manual cleanup for legacy Track Discovery tables.
-- Do not run this file unless the operator has explicitly approved dropping
-- these tables for the current database.

DROP TABLE IF EXISTS track_related_stock;
DROP TABLE IF EXISTS track_thesis;
DROP TABLE IF EXISTS track_validation_indicator;
DROP TABLE IF EXISTS track_evidence;
DROP TABLE IF EXISTS track_heat_snapshot;
