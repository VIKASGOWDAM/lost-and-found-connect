export type ReportType = 'lost' | 'found';
export type ReportStatus = 'open' | 'matched' | 'verifying' | 'resolved' | 'closed' | 'flagged';
export type FieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';
export type MediaVisibility = 'public' | 'private';

export interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  trust_score: number;
  is_verified_identity: boolean;
  role: 'user' | 'org_admin' | 'org_staff' | 'admin';
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface CategoryField {
  id: string;
  category_id: string;
  field_key: string;
  field_label: string;
  field_type: FieldType;
  is_public_default: boolean;
  is_required: boolean;
}

export interface Report {
  id: string;
  type: ReportType;
  reporter_id: string;
  category_id: string;
  status: ReportStatus;
  location_general: string;
  location_exact: string | null;
  date_occurred: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface ReportPublicAttribute {
  id: string;
  report_id: string;
  key: string;
  value: string | null;
}

export interface ReportPrivateAttribute {
  id: string;
  report_id: string;
  key: string;
  value: string | null;
  is_verification_challenge: boolean;
}

export interface ReportMedia {
  id: string;
  report_id: string;
  url: string;
  visibility: MediaVisibility;
  media_type: string | null;
}

export type MatchStatus = 'suggested' | 'confirmed_pending_verification' | 'rejected' | 'expired' | 'verified';

export type VerificationStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'manual_review';

export interface VerificationSession {
  id: string;
  match_id: string;
  status: VerificationStatus;
  initiated_by: string;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  completed_at: string | null;
}

export interface VerificationChallenge {
  id: string;
  session_id: string;
  source_attribute_id: string;
  challenge_prompt: string;
  submitted_answer: string | null;
  is_correct: boolean | null;
  attempt_number: number;
  answered_at: string | null;
}

export interface VerificationSessionView {
  session_id: string;
  match_id: string;
  status: VerificationStatus;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  completed_at: string | null;
  lost_report_id: string;
  found_report_id: string;
  lost_reporter_id: string;
  found_reporter_id: string;
  viewer_role: 'lost_reporter' | 'found_reporter' | null;
  total_challenges: number;
}

export interface Match {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  match_score: number;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  is_system_relayed: boolean;
  read_at: string | null;
}
