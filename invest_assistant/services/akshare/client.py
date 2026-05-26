def fetch_a_stock_code_name_rows() -> list[dict]:
    try:
        import akshare as ak
    except Exception as exc:
        raise RuntimeError(f"akshare is unavailable: {exc}") from exc

    try:
        df = ak.stock_info_a_code_name()
    except Exception as exc:
        raise RuntimeError(f"failed to fetch A-share stock list from AkShare: {exc}") from exc

    required_columns = {"code", "name"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise RuntimeError(f"AkShare stock list missing columns: {', '.join(sorted(missing_columns))}")
    return [dict(row) for _, row in df.iterrows()]


def fetch_cls_news_rows(limit: int) -> list[dict]:
    try:
        import akshare as ak
    except Exception as exc:
        raise RuntimeError(f"akshare is unavailable: {exc}") from exc

    try:
        df = ak.stock_info_global_cls(symbol="全部")
    except Exception as exc:
        raise RuntimeError(f"failed to fetch CLS news: {exc}") from exc

    return [dict(row) for _, row in df.head(max(int(limit), 1)).iterrows()]


def fetch_futu_news_rows(limit: int) -> list[dict]:
    try:
        import akshare as ak
    except Exception as exc:
        raise RuntimeError(f"akshare is unavailable: {exc}") from exc

    try:
        df = ak.stock_info_global_futu()
    except Exception as exc:
        raise RuntimeError(f"failed to fetch Futu news: {exc}") from exc

    return [dict(row) for _, row in df.head(max(int(limit), 1)).iterrows()]
