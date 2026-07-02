TOOL_REGISTRY: dict[str, dict[str, object]] = {
    "market_radar.search_source_items": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "market_radar.service.list_source_items_page",
    },
    "market_radar.get_hotwords": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "market_radar.service.list_hotwords_page",
    },
    "market_radar.get_tag_trend": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "market_radar.service.tag_trend",
    },
    "track_discovery.list_tracks": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "track_discovery.service.list_tracks",
    },
    "track_discovery.get_track_detail": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "track_discovery.service.get_track_detail",
    },
    "stock_analysis.get_stock_profile": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "stock_analysis.service.get_stock_detail",
    },
    "stock_analysis.get_daily_bars": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "stock_analysis.service.list_cached_stock_daily_bars",
    },
    "knowledge_base.get_researcher_profile": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "knowledge_base.service.get_researcher_profile_bundle",
    },
    "knowledge_base.get_researcher_soul": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "knowledge_base.service.read_researcher_soul_bundle",
    },
    "knowledge_base.get_researcher_method": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "knowledge_base.service.read_researcher_method_bundle",
    },
    "report_library.list_reports": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "report_library.service.list_reports_page",
    },
    "report_library.read_report_content": {
        "read_only": True,
        "risk_level": "medium",
        "service_name": "report_library.service.resolve_report_path",
    },
    "report_library.upload_markdown_report": {
        "read_only": False,
        "risk_level": "medium",
        "service_name": "report_library.service.create_markdown_report_file_and_index",
    },
    "portfolio.get_overview": {
        "read_only": True,
        "risk_level": "low",
        "service_name": "portfolio.service.get_overview",
    },
}


def get_tool_metadata(tool_name: str) -> dict[str, object] | None:
    return TOOL_REGISTRY.get(tool_name)


def is_read_only_tool(tool_name: str) -> bool:
    metadata = get_tool_metadata(tool_name)
    return bool(metadata and metadata.get("read_only") is True)


def registered_tool_names() -> list[str]:
    return sorted(TOOL_REGISTRY)
