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
  trigger_type?: string;
  enabled: boolean;
  cron_expr?: string | null;
  timeout_seconds?: number | null;
  max_retries?: number | null;
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
  market?: string | null;
  exchange?: string | null;
  industry?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockAlias = {
  id: number;
  stock_id: number;
  alias: string;
  alias_type?: string | null;
  source?: string | null;
  created_at?: string | null;
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
  type: "stock" | "track" | "hotword" | string;
  category?: string | null;
  stock_id?: number | null;
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
  created_at?: string | null;
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

export type TagCandidate = {
  id: number;
  name: string;
  suggested_type: string;
  category?: string | null;
  source_item_id?: number | null;
  confidence: number;
  reason?: string | null;
  status: string;
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

export type TrackThesis = {
  id: number;
  user_id?: number | null;
  title: string;
  core_thesis: string;
  underlying_change?: string | null;
  old_bottleneck?: string | null;
  new_solution?: string | null;
  value_chain_shift?: string | null;
  time_horizon?: string | null;
  confidence_level?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
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

export type TrackValidationIndicator = {
  id: number;
  thesis_id: number;
  name: string;
  indicator_type?: string | null;
  data_source?: string | null;
  current_value?: string | null;
  direction?: string | null;
  validation_meaning?: string | null;
  updated_at?: string | null;
};

export type TrackEvidence = {
  id: number;
  thesis_id: number;
  source_item_id?: number | null;
  evidence_direction: string;
  evidence_strength: number;
  summary?: string | null;
  affected_segments?: string | null;
  related_stock_ids?: string | null;
  created_at?: string | null;
};

export type TrackRelatedStock = {
  id: number;
  thesis_id: number;
  stock_id: number;
  role?: string | null;
  relevance_score: number;
  evidence_count: number;
  heat_score: number;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockPoolItem = {
  id: number;
  stock_id: number;
  status: string;
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

export type StockCompareGroup = {
  id: number;
  name: string;
  track_id?: number | null;
  stock_ids: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AnyRecord = Record<string, unknown>;
