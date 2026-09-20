export type PageDto<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type UserMe = { id: number; username: string; display_name?: string | null };
export type Tag = { id: number; name: string; status?: string };
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
export type PendingReport = {
  id: number;
  title: string;
  report_id?: number | null;
  researcher_code?: string | null;
  skill_name?: string | null;
  business_module?: string | null;
  source?: string;
  status?: string;
  returned_at?: string | null;
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
  rank_change?: number | null;
  rank_movement?: "up" | "down" | "flat" | "new" | string | null;
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
    day_pnl: number | null;
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
export type TrackCycle = "short" | "mid" | "long";
/** 综合评级，S 最高，由六维评分的平均分分档。阈值在后端，前端只读不算。 */
export type TrackGrade = "S" | "A" | "B" | "C" | "D";
/** 市场热度档位，T0 最热，只由 market_heat_score 决定，与评级各自独立。 */
export type TrackHeatTier = "T0" | "T1" | "T2" | "T3" | "T4";

/** 与后端 track_trend_snapshot 一一对应；JSON 三列在移动端只解析展示用的字段。 */
export type TrackTrendSnapshot = {
  id: number;
  track_id: number;
  research_date: string;
  researcher_code?: string | null;
  headline_cycle: TrackCycle;
  core_judgment?: string | null;
  // 六维评分，0—10，一律"分高=更有利"：周期韧性 10 是弱周期能穿越周期，
  // 行业集中度 10 是格局收敛龙头有定价权，读反了平均分就没有意义。
  market_heat_score: number;
  growth_speed_score: number;
  concentration_score: number;
  cycle_resilience_score: number;
  current_market_size_score: number;
  future_market_size_score: number;
  // 派生三项，后端算好写库。
  overall_score: number;
  track_grade: TrackGrade;
  heat_tier: TrackHeatTier;
  demand_space?: string | null;
  supply_competition?: string | null;
  profit_cashflow?: string | null;
  policy_catalyst?: string | null;
  market_capital?: string | null;
  pricing_expectation_gap?: string | null;
  key_contradiction?: string | null;
  segments_json?: string | null;
  industry_phase?: string | null;
  market_phase?: string | null;
  scenarios_json?: string | null;
  next_verification?: string | null;
  risk_falsification?: string | null;
  change_vs_last?: string | null;
  data_gaps?: string | null;
  data_sources_json?: string | null;
};

export type TrackListItem = {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  current_view?: string | null;
  industry_phase?: string | null;
  market_phase?: string | null;
  confidence_level?: string | null;
  latest_snapshot_id?: number | null;
  // 列表接口直接带最新快照的两个角标和综合分，赛道库不用为每张卡再查一次快照。
  track_grade?: TrackGrade | null;
  heat_tier?: TrackHeatTier | null;
  overall_score?: number | null;
  headline_cycle?: TrackCycle | null;
};

/**
 * 详情页历史快照列表只回这些列。完整快照有近二十列长文本，一次回 30 份能到几百 KB，
 * 而列表只显示日期、角标、六维分数和核心判断一句话。正文看 latest_snapshot。
 */
export type TrackTrendSnapshotBrief = Pick<
  TrackTrendSnapshot,
  | "id"
  | "track_id"
  | "research_date"
  | "researcher_code"
  | "headline_cycle"
  | "core_judgment"
  | "market_heat_score"
  | "growth_speed_score"
  | "concentration_score"
  | "cycle_resilience_score"
  | "current_market_size_score"
  | "future_market_size_score"
  | "overall_score"
  | "track_grade"
  | "heat_tier"
>;

export type TrackDetail = {
  track: TrackListItem;
  summary: {
    tag_count: number;
    material_count: number;
    pending_material_count: number;
    high_importance_material_count: number;
    bound_stock_count: number;
    latest_heat_score?: number | null;
    last_updated_at?: string | null;
  };
  latest_snapshot?: TrackTrendSnapshot | null;
  trend_snapshots: TrackTrendSnapshotBrief[];
  materials: TrackMaterial[];
  stocks: Array<{
    id: number;
    stock_id: number;
    stock_name?: string | null;
    stock_code?: string | null;
    relation_type?: string | null;
    conviction: number;
    reason?: string | null;
    status: string;
  }>;
  tags: Array<{ tag?: { id?: number; name?: string | null } | null; status?: string }>;
};

export type TrackMaterial = {
  id: number;
  track_id: number;
  track_name?: string | null;
  direction?: string | null;
  material_title?: string | null;
  material_summary?: string | null;
  material_source_name?: string | null;
  material_url?: string | null;
  material_time?: string | null;
};
export type StockMaterial = {
  id: number;
  stock_id: number;
  stock_name?: string | null;
  stock_code?: string | null;
  impact_direction?: string | null;
  material_title?: string | null;
  material_summary?: string | null;
  material_source_name?: string | null;
  material_time?: string | null;
};
export type StockScoreSnapshot = {
  id: number;
  report_time: string;
  researcher_code?: string | null;
  business_moat_score: number;
  management_score: number;
  governance_score: number;
  strategy_score: number;
  certainty_score: number;
  growth_score: number;
  total_score: number;
  investment_level?: string | null;
  core_logic?: string | null;
  primary_risk?: string | null;
};

export type StockValuationSnapshot = {
  id: number;
  report_period?: string | null;
  current_market_value?: number | null;
  expected_market_value_3y?: number | null;
  expectation_gap_rate?: number | null;
  primary_model?: string | null;
  analysis_date?: string | null;
  researcher?: string | null;
};

export type StockTrendSnapshot = {
  id: number;
  research_date: string;
  trend_level: string;
  market_data_date?: string | null;
  researcher_code?: string | null;
  main_track?: string | null;
  track_short?: string | null;
  track_mid?: string | null;
  track_long?: string | null;
  company_position?: string | null;
  market_recognition?: string | null;
  capital_recognition?: string | null;
  stock_stage?: string | null;
  mainline_cycle?: string | null;
  remaining_upside?: string | null;
  trend_duration?: string | null;
  suggested_group?: string | null;
  priority_rank?: number | null;
  core_logic?: string | null;
  primary_risk?: string | null;
  next_verification?: string | null;
  data_gaps?: string | null;
};

export type StockDetailMaterial = {
  id: number;
  impact_direction?: string | null;
  importance_level?: string | null;
  status: string;
  material_title?: string | null;
  material_summary?: string | null;
  material_source_name?: string | null;
  material_url?: string | null;
  material_time?: string | null;
};

export type StockDetailNote = {
  id: number;
  note_type: string;
  title: string;
  content: string;
  updated_at?: string | null;
};

export type StockDetail = {
  stock: {
    id: number;
    stock_code?: string | null;
    stock_name?: string | null;
    market?: string | null;
    status?: string | null;
  };
  pool?: { status?: string | null } | null;
  latest_score?: StockScoreSnapshot | null;
  score_history: StockScoreSnapshot[];
  latest_valuation?: StockValuationSnapshot | null;
  valuation_history: StockValuationSnapshot[];
  latest_trend?: StockTrendSnapshot | null;
  trend_history: StockTrendSnapshot[];
  materials: StockDetailMaterial[];
  disclosures: Array<{
    id: number;
    disclosure_type: string;
    title: string;
    publish_time?: string | null;
    source_url?: string | null;
  }>;
  tracks: Array<{ id: number; track?: { id?: number; name?: string | null } | null }>;
  notes: StockDetailNote[];
};

export type StockPoolTrack = {
  id: number;
  name?: string | null;
  status?: string | null;
};

export type StockPoolItem = {
  id: number;
  stock_id: number;
  symbol?: string | null;
  stock_code?: string | null;
  stock_name?: string | null;
  investment_level?: string | null;
  expectation_gap_rate?: number | null;
  trend_level?: string | null;
  status: string;
  tracks?: StockPoolTrack[];
  created_at?: string | null;
  updated_at?: string | null;
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
    day_pnl?: number | null;
    day_pct?: number | null;
    month_pnl?: number | null;
    year_pnl?: number | null;
  };
  allocation_rows?: Array<{ label: string; market_value: number; weight?: number | null; current_price?: number | null; quote_time?: string | null; day_pct?: number | null }>;
  pie_items?: Array<{ label: string; market_value: number; weight?: number | null; current_price?: number | null; quote_time?: string | null; day_pct?: number | null }>;
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
