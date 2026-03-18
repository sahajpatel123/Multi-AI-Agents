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
  session_id: string;
  prompt: string;
  prompt_category: string;
  winner: AgentResponse;
  winner_agent_id: string;
  all_responses: ScoredAgent[];
  integrity: IntegrityReport | null;
  tools_used: string[];
  timestamp: string;
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

export interface User {
  id: number;
  email: string;
  tier: UserTier;
  created_at: string;
  prompt_count_today: number;
}

export interface TierFeatures {
  debate: boolean;
  discuss: boolean;
  memory: boolean;
  saved_responses: boolean;
  agent_mode: boolean;
  scoring_audit: boolean;
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
