export interface AgentResponse {
  agent_id: string;
  agent_number: number;
  verdict: string;
  one_liner: string;
  confidence: number;
  key_assumption: string;
  timestamp: string;
}

export interface ContradictionFlag {
  detected: boolean;
  previous_statement: string;
  current_statement: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ScoredAgent {
  response: AgentResponse;
  score: number;
  is_winner: boolean;
  contradiction?: ContradictionFlag;
}

export interface IntegrityReport {
  drift_scores: Record<string, number>;
  overlap_pairs: Array<{ agent_a: string; agent_b: string; similarity: number }>;
  flags: string[];
}

export interface PromptResponse {
  request_id?: string | null;
  session_id: string;
  prompt: string;
  prompt_category: string;
  winner: AgentResponse;
  winner_agent_id: string;
  all_responses: ScoredAgent[];
  scoring_reasoning?: string | null;
  integrity: IntegrityReport | null;
  tools_used: string[];
  timestamp: string;
}

export interface PromptContextItem {
  role: 'user' | 'assistant';
  agent_id?: string;
  name?: string;
  content: string;
}

export interface AgentConfig {
  agent_id: string;
  agent_number: number;
  name: string;
  color: string;
  oneLiner?: string;
}

export interface DebateMessage {
  agent_id: string;
  content: string;
  round_number: number;
  timestamp: string;
}

export interface DebateReaction {
  agent_id: string;
  agent_number: number;
  content: string;
  stance: string;
  timestamp: string;
}

export interface DebateRoundResponse {
  request_id?: string | null;
  round_number: number;
  challenged_agent_id: string;
  reactions: DebateReaction[];
  debate_history: DebateMessage[];
  session_id: string;
}

export interface DiscussChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export interface DiscussResponse {
  request_id?: string | null;
  agent_id: string;
  content: string;
  conversation_history: DiscussChatMessage[];
  session_id: string;
}

export interface SessionTurn {
  turn_id: string;
  prompt: string;
  prompt_category?: string;
  agent_responses: Record<string, AgentResponse>;
  winner_id: string;
  timestamp: string;
}

export type PromptCategory = 'question' | 'task' | 'statement' | 'debate';

export interface SavedResponseItem {
  id: string | number;
  session_id: string;
  turn_id: string;
  prompt: string;
  prompt_category?: string;
  agent_id: string;
  persona_id?: string;
  persona_name?: string;
  persona_color?: string;
  score?: number | null;
  confidence?: number | null;
  pinned?: boolean;
  pinned_at?: string | null;
  one_liner: string;
  verdict: string;
  timestamp: string;
}

export interface SessionData {
  session_id: string;
  user_id: string;
  turns: SessionTurn[];
  topics: string[];
  created_at: string;
  last_active: string;
}

export type UserTier = 'GUEST' | 'FREE' | 'PLUS' | 'PRO';

export interface FeedbackCalibration {
  adjustment: number;
  reliable: boolean;
  total_feedback: number;
  wrong_rate: number;
}

export interface User {
  id: number;
  email: string;
  tier: UserTier;
  created_at: string;
  prompt_count_today: number;
  name?: string;
  expertise_level?: string;
  expertise_domain?: string;
  feedback_calibration?: FeedbackCalibration;
  consecutive_payments?: number;
  loyalty_reward_active?: boolean;
  loyalty_free_months_remaining?: number;
  loyalty_resume_at?: string | null;
  agent_addon_active?: boolean;
  agent_addon_cancelling?: boolean;
  addon_subscription_id?: string | null;
  subscription_billing_period?: string | null;
}

export interface TierFeatures {
  debate: boolean;
  discuss: boolean;
  memory: boolean;
  saved_responses: boolean;
  agent_mode: boolean;
  agent_orchestrate: boolean;
  agent_watchlist: boolean;
  scoring_audit: boolean;
}

export interface MemorySummaryKeyPosition {
  persona_id?: string;
  topic?: string;
  stance?: string;
  confidence?: number;
}

export interface MemorySummary {
  id: number;
  session_id: string;
  dominant_category: string | null;
  preferred_depth: string | null;
  trusted_persona: string | null;
  exchange_count: number;
  main_topics: string[];
  compressed_at: string | null;
  created_at: string | null;
  /** Only present on detail responses (list rows omit long-form fields). */
  session_summary?: string;
  key_positions_taken?: MemorySummaryKeyPosition[];
  raw_exchanges_count?: number;
}

export interface MemorySummariesResponse {
  summaries: MemorySummary[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  filters: {
    category: string | null;
    persona_id: string | null;
    search: string | null;
    from_date: string | null;
    to_date: string | null;
  };
}

export interface TierStatus {
  tier: UserTier;
  daily_limit: number;
  messages_used_today: number;
  messages_remaining: number;
  allowed_personas: string[];
  features: TierFeatures;
  upgrade_to: string | null;
}

export interface ScoringAuditConfidence {
  agent_id: string;
  confidence: number;
}

export interface ScoringAuditRound {
  id: number;
  prompt_snippet: string;
  prompt_category: string | null;
  winner_agent_id: string | null;
  winner_persona_id: string | null;
  winner_score: number | null;
  scores: Record<string, number> | null;
  criteria_breakdown: Record<string, Record<string, number>> | null;
  confidence_values: ScoringAuditConfidence[] | null;
  persona_ids_used: string[];
  scoring_duration_ms: number | null;
  fallback_used: boolean;
  created_at: string | null;
}

export interface ScoringAuditResponse {
  session_id: string;
  audits: ScoringAuditRound[];
  audit_count: number;
  total_count: number;
}

export const AGENTS: Record<string, AgentConfig> = {
  agent_1: {
    agent_id: 'agent_1',
    agent_number: 1,
    name: 'The Analyst',
    color: '#8C9BAB',
    oneLiner: 'I find the flaw in everything.',
  },
  agent_2: {
    agent_id: 'agent_2',
    agent_number: 2,
    name: 'The Philosopher',
    color: '#9B8FAA',
    oneLiner: 'I question the premise first.',
  },
  agent_3: {
    agent_id: 'agent_3',
    agent_number: 3,
    name: 'The Pragmatist',
    color: '#8AA899',
    oneLiner: 'I only care what actually works.',
  },
  agent_4: {
    agent_id: 'agent_4',
    agent_number: 4,
    name: 'The Contrarian',
    color: '#B0977E',
    oneLiner: 'I say what no one else will.',
  },
};
