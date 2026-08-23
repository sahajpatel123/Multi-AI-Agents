// Persona Council — pure helpers for the 16-mind deliberation surface
// at /persona-council. Each of the 16 personas gives a one-line
// take on the user's question. Takes are pulled from a small
// per-persona pool and selected deterministically by a stable
// hash of the question so the same question always produces the
// same 16-take council.

import { PERSONAS } from './personas';

export interface CouncilTake {
  readonly personaId: string;
  readonly stance: 'agrees' | 'cautions' | 'reframes' | 'pushes' | 'listens';
  readonly take: string;
  readonly length: 'short' | 'medium' | 'long';
}

export interface PersonaCouncil {
  readonly question: string;
  readonly takes: ReadonlyArray<CouncilTake>;
  readonly summary: {
    readonly agrees: number;
    readonly cautions: number;
    readonly reframes: number;
    readonly pushes: number;
    readonly listens: number;
  };
}

// Per-persona take templates, keyed by stance. Each persona has 2-3
// takes per stance. Pure data — no DOM, no React, no network.

const COUNCIL_TAKES: Record<
  string,
  ReadonlyArray<{ stance: CouncilTake['stance']; take: string }>
> = {
  analyst: [
    { stance: 'cautions', take: 'The strongest assumption here is unstated. Name it before you act.' },
    { stance: 'reframes', take: 'Look at the failure modes first. The upside is irrelevant if the downside is fatal.' },
    { stance: 'pushes', take: 'What evidence would change your mind? If you cannot answer, you do not yet have a view.' },
  ],
  philosopher: [
    { stance: 'reframes', take: 'The question may be the wrong one. Whose framing produced it?' },
    { stance: 'cautions', take: 'Every answer here is downstream of a definition. Check the definition first.' },
    { stance: 'listens', take: 'The oldest version of this question is more interesting than the new one.' },
  ],
  pragmatist: [
    { stance: 'pushes', take: 'What would you do on Monday morning? If the answer is nothing, the question is academic.' },
    { stance: 'agrees', take: 'Ship the smallest version that proves the loop. Refine after.' },
    { stance: 'cautions', take: 'If the cost of being wrong is bearable, decide fast and move.' },
  ],
  contrarian: [
    { stance: 'pushes', take: 'I will not. The consensus is a polite disagreement you have not started yet.' },
    { stance: 'reframes', take: 'What if the question itself is the trap? Try the opposite framing.' },
    { stance: 'listens', take: 'The boring answer is probably the truth. Look for it.' },
  ],
  scientist: [
    { stance: 'cautions', take: 'What is the sample size? N=1 is anecdote, not evidence.' },
    { stance: 'reframes', take: 'Separate what you observed from what you concluded. The line is often missing.' },
    { stance: 'agrees', take: 'The mechanism behind the claim is what I would test first.' },
  ],
  historian: [
    { stance: 'reframes', take: 'This shape of question has been asked before. Find the precedent.' },
    { stance: 'listens', take: 'The answer that was right last time is rarely right this time. Why?' },
    { stance: 'cautions', take: 'Watch the second act. First act looks like the 1920s every time.' },
  ],
  economist: [
    { stance: 'cautions', take: 'Who benefits if this is true? Follow the incentive.' },
    { stance: 'reframes', take: 'A subsidy is just a tax on someone else. Whose?' },
    { stance: 'pushes', take: 'What is the price elasticity? If you cannot say, you do not have a model.' },
  ],
  ethicist: [
    { stance: 'cautions', take: 'Whose seat is empty from this room? Add them and see what changes.' },
    { stance: 'pushes', take: 'Apply the same standard you would want applied to you.' },
    { stance: 'reframes', take: 'A clean answer to an unethical question is still the wrong answer.' },
  ],
  stoic: [
    { stance: 'reframes', take: 'Which part is in your control, and which is not? Cut the second.' },
    { stance: 'listens', take: 'You have already decided. The question is whether to admit it.' },
    { stance: 'cautions', take: 'Beware the opinion that costs you nothing to hold.' },
  ],
  futurist: [
    { stance: 'pushes', take: 'What does this look like in ten years? The second-order effects compound.' },
    { stance: 'reframes', take: 'The question is not whether this happens, but who shapes it when it does.' },
    { stance: 'listens', take: 'The first signal is always a small one. Most people miss it.' },
  ],
  strategist: [
    { stance: 'pushes', take: 'Pick the move, not the work. Asymmetric bets beat grind every time.' },
    { stance: 'cautions', take: 'If you cannot name the opponent, you have not started yet.' },
    { stance: 'reframes', take: 'A small bet with a clear kill criterion beats a long grind with no exit.' },
  ],
  engineer: [
    { stance: 'pushes', take: 'Which constraint, if removed, changes everything? Solve that one first.' },
    { stance: 'cautions', take: 'If you cannot tell when it is broken, you do not yet understand it.' },
    { stance: 'reframes', take: 'Specs are cut, not negotiated. Decide what you are not shipping.' },
  ],
  optimist: [
    { stance: 'agrees', take: 'The mechanism behind the best case is the same one behind the realistic plan.' },
    { stance: 'pushes', take: 'Do not just say it will work. Name the mechanism, then test it.' },
    { stance: 'reframes', take: 'Cynicism is the default register. Choosing hope is the work.' },
  ],
  empath: [
    { stance: 'cautions', take: 'Who is affected by this and not in the room? Find them first.' },
    { stance: 'listens', take: 'Read the answer in the recipient\'s voice before sending.' },
    { stance: 'reframes', take: 'The loudest voice in the room is rarely the most affected one.' },
  ],
  firstprinciples: [
    { stance: 'reframes', take: 'What assumption, if removed, makes the question collapse? Cut it.' },
    { stance: 'pushes', take: 'You do not yet have an answer. You have a category. Find the load-bearing fact.' },
    { stance: 'cautions', take: 'Common sense is bias that survived. Treat it as a hypothesis.' },
  ],
  devilsadvocate: [
    { stance: 'pushes', take: 'The strongest case against your own position is the one you are most afraid to read.' },
    { stance: 'reframes', take: 'Pretend you are paid to lose the argument. What would you say?' },
    { stance: 'cautions', take: 'If you cannot steelman the opposite, you do not yet understand the question.' },
  ],
};

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Pure — build the council for a question. Returns one take per
 * persona in the catalog, each selected deterministically from the
 * persona's per-stance pool.
 */
export function buildCouncil(question: string): PersonaCouncil {
  const normalized = question.trim();
  const takes: CouncilTake[] = [];
  for (const persona of PERSONAS) {
    const pool = COUNCIL_TAKES[persona.id] ?? [];
    if (pool.length === 0) continue;
    const idx = simpleHash(`${normalized}:${persona.id}`) % pool.length;
    const pick = pool[idx];
    takes.push({
      personaId: persona.id,
      stance: pick.stance,
      take: pick.take,
      length:
        pick.take.length > 90 ? 'long' : pick.take.length > 50 ? 'medium' : 'short',
    });
  }
  const summary = takes.reduce(
    (acc, t) => {
      acc[t.stance] += 1;
      return acc;
    },
    { agrees: 0, cautions: 0, reframes: 0, pushes: 0, listens: 0 },
  );
  return {
    question: normalized,
    takes,
    summary,
  };
}

/** Pure — the dominant stance across the council (mode). */
export function dominantStance(
  council: PersonaCouncil,
): CouncilTake['stance'] | null {
  const entries = Object.entries(council.summary) as Array<
    [CouncilTake['stance'], number]
  >;
  if (entries.length === 0) return null;
  const [top] = entries.sort((a, b) => b[1] - a[1]);
  return top[1] > 0 ? top[0] : null;
}

/** Build a shareable URL for a council. */
export function councilShareUrl(origin: string, question: string): string {
  return `${origin}/persona-council?q=${encodeURIComponent(question)}`;
}

// Counter — lifetime count of councils convened, persisted across
// reloads so the user can see their own track record.

const COUNTER_KEY = 'arena:persona-council:counter:v1';

export function readCouncilCounter(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(COUNTER_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function incrementCouncilCounter(): number {
  const next = readCouncilCounter() + 1;
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(COUNTER_KEY, String(next));
  } catch {
    /* silent */
  }
  return next;
}

export function clearCouncilCounter() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* silent */
  }
}

/** Pure — verify a council's takes reference real personas. */
export function councilValid(council: PersonaCouncil): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const take of council.takes) {
    if (!known.has(take.personaId)) return false;
  }
  return true;
}
