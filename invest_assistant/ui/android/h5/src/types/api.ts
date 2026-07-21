export type PageDto<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type UserMe = { id: number; username: string; display_name?: string | null };
export type Tag = { id: number; name: string };
export type SourceItem = {
  id: number;
  source_type: string;
  source_name: string;
  title: string;
  content?: string;
  source_url?: string | null;
  publish_time?: string | null;
  created_at?: string | null;
  source_tags?: Array<{ id: number; tag?: Tag | null }>;
};
export type NoteGroup = { id: number; name: string; sort_order: number; status: string };
export type KnowledgeNote = {
  id: number;
  title?: string;
  content: string;
  group_id?: number | null;
  tags_text?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  group?: NoteGroup | null;
  tags?: Tag[];
};
export type AlertEvent = {
  id: number;
  event_level: string;
  title: string;
  message: string;
  status: string;
  event_time?: string | null;
};
export type AlertStats = { total: number; unread: number; read: number; handled: number };
export type Report = {
  id: number;
  title: string;
  report_type: string;
  source_module: string;
  summary?: string | null;
  file_format?: string;
  status?: string;
  publish_time?: string | null;
  created_at?: string | null;
};
export type MarketOverview = {
  source_items: number;
  tags: number;
  active_tags: number;
  ai_tag_suggestions: number;
};
export type TagHeat = {
  tag_id: number;
  trigger_count: number;
  source_count: number;
  heat_score: number;
  rank_no: number;
  tag?: Tag | null;
};
export type WorkbenchMarketIndex = {
  code: string;
  name: string;
  price?: number | null;
  change?: number | null;
  pct_chg?: number | null;
  quote_time?: string | null;
  source?: string | null;
  status: string;
  message?: string | null;
  updated_at?: string | null;
};
export type WorkbenchToday = {
  market_indices: {
    items: WorkbenchMarketIndex[];
  };
  portfolio_today?: {
    portfolio_count: number;
    position_count: number;
    total_value: number;
    position_market_value: number;
    cash_amount: number;
    day_pnl: number;
    day_pct?: number | null;
    latest_quote_time?: string | null;
  };
};
export type TrackDashboard = {
  summary?: {
    warming_tracks_count?: number;
    focus_tracks_count?: number;
    pending_materials_count?: number;
    top_heat_track?: { name: string; heat_score: number } | null;
  };
  heat_rankings?: Array<{
    rank: number;
    track_id: number;
    track_name: string;
    current_heat: number;
    today_material_count: number;
  }>;
  latest_materials?: Array<{
    id: number;
    track_name?: string;
    material_title?: string;
    material_time?: string;
  }>;
};
export type StockDashboard = {
  summary?: {
    pool_count?: number;
    focused_count?: number;
    pending_materials_count?: number;
    top_score_stock?: { stock_name?: string; stock_code?: string; total_score?: number } | null;
  };
  score_rankings?: Array<{
    rank: number;
    stock_id: number;
    stock_name?: string;
    stock_code?: string;
    investment_level?: string;
    total_score?: number;
  }>;
};
export type PortfolioOverview = {
  scope?: string;
  portfolio_id?: number | null;
  portfolio_options?: Array<{ id: number; name: string; base_currency: string }>;
  summary?: {
    portfolio_count?: number;
    position_count?: number;
    position_market_value?: number;
    cash_amount?: number;
    total_value?: number;
    day_pnl?: number;
    day_pct?: number | null;
    year_pnl?: number | null;
  };
  allocation_rows?: Array<{ label: string; market_value: number; weight?: number | null; day_pct?: number | null }>;
  pie_items?: Array<{ label: string; market_value: number; weight?: number | null; day_pct?: number | null }>;
};
export type PortfolioValuePoint = {
  snapshot_date: string;
  total_value: number;
  position_market_value?: number;
  cash_amount?: number;
  day_pnl?: number | null;
  day_pct?: number | null;
  position_count?: number;
};
export type AiTagSuggestion = {
  id: number;
  suggested_text: string;
  final_tag_name?: string | null;
  score?: number | null;
  reason?: string | null;
  status: string;
  rejected_count: number;
  created_at?: string | null;
};
export type AiTagSuggestionWrite = {
  suggested_text: string;
  score?: number | null;
  reason?: string | null;
  status?: string;
};
export type AiTagSuggestionApprove = {
  final_tag_name?: string | null;
  target_type: "hotword" | "track" | "stock";
  target_id?: number | null;
  target_name?: string | null;
};
export type HotwordOption = { id: number; name: string; description?: string | null; status: string };
export type TrackOption = { id: number; name: string; description?: string | null; status: string };
export type StockOption = {
  id: number;
  stock_name?: string | null;
  stock_code?: string | null;
  symbol?: string | null;
  name?: string | null;
};
