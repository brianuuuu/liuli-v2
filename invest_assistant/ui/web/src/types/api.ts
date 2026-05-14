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
  description?: string | null;
  enabled: boolean;
  cron_expr?: string | null;
  timeout_seconds?: number | null;
  status?: string | null;
};

export type Report = {
  id: number;
  title: string;
  report_type: string;
  source_module: string;
  target_type?: string | null;
  target_id?: number | null;
  file_path?: string | null;
  created_at?: string | null;
};

export type Disclosure = {
  id: number;
  title: string;
  stock_code?: string | null;
  stock_name?: string | null;
  disclosure_type: string;
  publish_date?: string | null;
  parse_status?: string | null;
};

export type Stock = {
  id: number;
  symbol?: string | null;
  stock_code?: string | null;
  name?: string | null;
  stock_name?: string | null;
  market?: string | null;
  industry?: string | null;
  status?: string | null;
};

export type AnyRecord = Record<string, unknown>;
