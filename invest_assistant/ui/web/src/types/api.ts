export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type UserMe = {
  id: number;
  username: string;
  display_name?: string | null;
  role: string;
};

export type Id = number;

export type JobConfig = {
  id: number;
  job_name: string;
  module_name: string;
  display_name?: string;
  description?: string | null;
  config_json: Record<string, unknown>;
  ext_json: Record<string, unknown>;
  params_schema?: Record<string, unknown> | null;
  last_run_at?: string | null;
  last_status?: string | null;
  next_run_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type JobRunRequest = {
  id: number;
  job_name: string;
  params_json?: string | null;
  status: string;
  requested_by?: number | null;
  requested_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
};

export type JobRunLog = {
  id: number;
  job_name: string;
  module_name: string;
  trigger_type: string;
  status: string;
  params_json?: string | null;
  result_json?: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  fetched_count: number;
  processed_count: number;
  inserted_count: number;
  updated_count: number;
  error_message?: string | null;
};

export type Report = {
  id: number;
  title: string;
  report_type: string;
  source_module: string;
  target_type?: string | null;
  target_id?: number | null;
  summary?: string | null;
  file_format?: string | null;
  file_path?: string | null;
  generated_by?: string | null;
  status?: string | null;
  publish_time?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Disclosure = {
  id: number;
  title: string;
  stock_id?: number | null;
  stock_code?: string | null;
  stock_name?: string | null;
  source?: string | null;
  disclosure_type: string;
  publish_date?: string | null;
  publish_time?: string | null;
  report_period?: string | null;
  source_url?: string | null;
  file_path?: string | null;
  parsed_text_path?: string | null;
  parsed_markdown_path?: string | null;
  parse_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Stock = {
  id: number;
  symbol?: string | null;
  stock_code?: string | null;
  name?: string | null;
  stock_name?: string | null;
  name_pinyin?: string | null;
  name_abbr?: string | null;
  market?: string | null;
  exchange?: string | null;
  industry?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DataSourceStatus = {
  key: string;
  name: string;
  module: string;
  provider: string;
  record_count: number;
  status?: string | null;
  last_sync_at?: string | null;
};

export type SystemConfig = {
  id: number;
  config_key: string;
  config_value: string;
  config_type: string;
  module_name?: string | null;
  description?: string | null;
  enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MarketTag = {
  id: number;
  name: string;
  type?: "stock" | "track" | "hotword" | "general" | string | null;
  source?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SourceItem = {
  id: number;
  source_type: string;
  source_name: string;
  title: string;
  content: string;
  source_url?: string | null;
  publish_time?: string | null;
  related_type?: string | null;
  related_id?: number | null;
  created_at?: string | null;
  source_tags?: SourceTag[];
};

export type SourceTag = {
  id: number;
  source_item_id: number;
  tag_id: number;
  trigger_text?: string | null;
  confidence: number;
  extractor: string;
  created_at?: string | null;
  tag?: MarketTag | null;
};

export type TagHeat = {
  id: number;
  tag_id: number;
  window_type: string;
  stat_time: string;
  trigger_count: number;
  source_count: number;
  heat_score: number;
  avg_count: number;
  change_ratio: number;
  rank_no: number;
  created_at?: string | null;
  tag?: MarketTag | null;
};

export type TagBinding = {
  id: number;
  tag: MarketTag;
  source?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AiTagSuggestion = {
  id: number;
  suggested_text: string;
  final_tag_name?: string | null;
  score?: number | null;
  reason?: string | null;
  final_tag_id?: number | null;
  rejected_count: number;
  ext_json: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Hotword = {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  tags: TagBinding[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type Track = {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  track_score?: number | null;
  current_view?: string | null;
  stage?: string | null;
  confidence_level?: string | null;
  tag?: MarketTag | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MarketGraphEdge = {
  stock_tag?: MarketTag | null;
  related_tag?: MarketTag | null;
  weight: number;
  source_count: number;
  latest_source_item_id?: number | null;
};

export type MarketGraph = {
  nodes: MarketTag[];
  edges: MarketGraphEdge[];
};

export type TrackCandidate = {
  tag: MarketTag;
  heat: {
    window_type: string;
    trigger_count: number;
    source_count: number;
    heat_score: number;
    rank_no: number;
  };
};

export type TrackMaterial = {
  id: number;
  track_id: number;
  material_type: "source_item" | "knowledge_note" | string;
  material_id: number;
  direction?: string | null;
  importance_level?: string | null;
  status: string;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TrackAnalysisSnapshot = {
  id: number;
  track_id: number;
  analysis_date: string;
  market_space?: string | null;
  market_size?: string | null;
  growth_rate?: string | null;
  heat_summary?: string | null;
  ai_summary?: string | null;
  opportunity_points?: string | null;
  risk_points?: string | null;
  watch_signals?: string | null;
  score?: number | null;
  confidence_level?: string | null;
  created_at?: string | null;
};

export type StockPoolItem = {
  id: number;
  stock_id: number;
  symbol?: string | null;
  stock_code?: string | null;
  stock_name?: string | null;
  track_ids?: number[];
  tracks?: Pick<Track, "id" | "name" | "status">[];
  status: string;
  source?: string | null;
  reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockResearchNote = {
  id: number;
  stock_id: number;
  note_type: string;
  title: string;
  content: string;
  related_track_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockScoreSnapshot = {
  id: number;
  stock_id: number;
  score_date: string;
  track_id?: number | null;
  growth_score: number;
  valuation_score: number;
  moat_score: number;
  risk_score: number;
  total_score: number;
  created_at?: string | null;
};

export type StockScoreComparisonItem = {
  stock_id: number;
  symbol?: string | null;
  stock_code?: string | null;
  stock_name?: string | null;
  status?: string;
  tracks?: Pick<Track, "id" | "name" | "status">[];
  score_id?: number | null;
  score_date?: string | null;
  track_id?: number | null;
  growth_score?: number | null;
  valuation_score?: number | null;
  moat_score?: number | null;
  risk_score?: number | null;
  total_score?: number | null;
  created_at?: string | null;
};

export type StockValuationComparisonItem = {
  stock_id: number;
  symbol?: string | null;
  stock_code?: string | null;
  stock_name?: string | null;
  status?: string;
  tracks?: Pick<Track, "id" | "name" | "status">[];
  valuation_id?: number | null;
  company?: string | null;
  company_code?: string | null;
  report_period?: string | null;
  report_release_date?: string | null;
  current_market_value?: number | null;
  financial_performance_json?: string | null;
  trend_reference_json?: string | null;
  guidance_check_json?: string | null;
  quarter_performance?: string | null;
  quarter_main_reason?: string | null;
  profit_model_json?: string | null;
  fcf_model_json?: string | null;
  revenue_model_json?: string | null;
  primary_model?: string | null;
  expected_market_value_3y?: number | null;
  expectation_gap_rate?: number | null;
  analysis_date?: string | null;
  researcher?: string | null;
  created_at?: string | null;
};

export type StockCompareGroup = {
  id: number;
  name: string;
  track_id?: number | null;
  stock_ids: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockTrackRelation = {
  id: number;
  stock_id: number;
  track_id: number;
  relation_type?: string | null;
  conviction: number;
  reason?: string | null;
  status: string;
  track?: Track | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockTrackTagBinding = StockTrackRelation;

export type PortfolioGroup = {
  id: number;
  portfolio_id: number;
  name: string;
  group_type: string;
  target_weight?: number | null;
  max_stock_count?: number | null;
  sort_order: number;
  note?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AnyRecord = Record<string, unknown>;
