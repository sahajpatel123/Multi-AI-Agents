// Persona Mosaic Council — pure helpers for the custom 4-mind
// deliberation surface at /persona-mosaic-council. The user
// picks 4 personas + a question, and only those 4 respond.
// Pure functions only — same inputs produce the same 4 takes.

import { PERSONAS } from './personas';

export type MosaicStance = 'agrees' | 'cautions' | 'reframes' | 'pushes';

export interface MosaicCouncilTake {
  readonly personaId: string;
  readonly stance: MosaicStance;
  readonly take: string;
}

export interface PersonaMosaicCouncil {
  readonly question: string;
  readonly panel: ReadonlyArray<string>;
  readonly takes: ReadonlyArray<MosaicCouncilTake>;
}

const STANCE_TEMPLATES: Record<
  string,
  { agrees: string; cautions: string; reframes: string; pushes: string }
> = {
  analyst: {
    agrees: 'The framing holds up under scrutiny. The assumption that matters is visible, and the conclusion follows.',
    cautions: 'There is a load-bearing assumption here. The conclusion depends on it being true — and it might not be.',
    reframes: 'The question is the trap. Whoever wrote it has already decided the answer. Strip the framing and ask again.',
    pushes: 'A small move is available now. The data is good enough to act. Waiting for perfect data is the failure mode.',
  },
  philosopher: {
    agrees: 'The question is the right one. Most questions are not. That is the difference.',
    cautions: 'The conclusion is in the question. The answer cannot surprise you because the question already assumes it.',
    reframes: 'You are asking a polished version of a vague question. Vague question, vague answer.',
    pushes: 'You have already decided. The question is whether to admit it.',
  },
  pragmatist: {
    agrees: 'You can act on this on Monday morning. That is the test most questions fail.',
    cautions: 'Well-shaped but not actionable. Convert one of its claims into a verb you can do this week.',
    reframes: 'The question sounds smart. The cost of a smart-sounding question is a decision never made.',
    pushes: 'The setup is there; the trigger is not. Define the exact signal that would make you act.',
  },
  contrarian: {
    agrees: 'I am taking the opposite side. The consensus is a polite disagreement you have not started yet.',
    cautions: 'Both sides have a point. Pick one. The cost of false balance is a decision never made.',
    reframes: 'The question itself is the trap. The consensus is a polite disagreement you have not started yet.',
    pushes: 'Take the bold path. The cost of being right later is higher than the cost of being wrong now.',
  },
  scientist: {
    agrees: 'The mechanism is real. The mechanism is what you would test first.',
    cautions: 'Where is the data? You have a narrative, not a study. Find the leading indicator before you commit.',
    reframes: 'You are confusing the data you observed with the data you concluded. Separate the two.',
    pushes: 'Run the experiment. The mechanism is testable. Stop theorizing and design the test.',
  },
  historian: {
    agrees: 'The pattern is real. Where this question has been asked before, the answer was clear. Trust the precedent.',
    cautions: 'Where this has been tried, the regret is asymmetric. The upside did not materialize. The downside did.',
    reframes: 'You are asking a question that looks new. It is not. Find the precedent and ask what it taught.',
    pushes: 'The first move matters most. The cases that defined a generation were the ones that looked unsafe at the time.',
  },
  economist: {
    agrees: 'The expected value calculation supports this. The incentive alignment is sound.',
    cautions: 'Who benefits if this is true? Follow the money. It is rarely lying about its motives.',
    reframes: 'A subsidy is just a tax on someone else. Whose? You have not named the loser yet.',
    pushes: 'A small bet with a clear kill criterion beats a long grind with no exit. Define the exit.',
  },
  ethicist: {
    agrees: 'The decision is consistent with the values you have stated. The cost is borne by the people you have named.',
    cautions: 'Whose seat is empty from this room? Add them and see what changes. The answer usually shifts.',
    reframes: 'A clean answer to an unethical question is still the wrong answer. Check the question first.',
    pushes: 'Apply the same standard you would want applied to you. If you cannot, the decision is wrong.',
  },
  stoic: {
    agrees: 'You have already decided. The question is whether to admit it. The plan that matches your decision is the one you keep.',
    cautions: 'Which part is in your control, and which is not? Cut the second. The first is where your power lives.',
    reframes: 'You have already decided. The question is whether to admit it. Stop rehearsing and start acting.',
    pushes: 'Choose the part that is yours. The rest is a story you tell yourself about why you cannot move.',
  },
  futurist: {
    agrees: 'The trajectory is real. The mechanism behind the best case is the same one behind the realistic plan.',
    cautions: 'The trajectory looks tired. What looks like momentum is actually the last lap of a longer cycle.',
    reframes: 'The question is not whether this happens, but who shapes it when it does. Look for the second-order effects.',
    pushes: 'A small thing now will look enormous in five years. Choose the option that compounds in the direction you want.',
  },
  strategist: {
    agrees: 'The position is right. The first mover wins; the second mover buys the dip.',
    cautions: 'The position is right but the timing is wrong. The setup is there; the trigger is not.',
    reframes: 'A position is not a strategy. A strategy is a position with a kill criterion. Define the exit.',
    pushes: 'Pick the move, not the work. Asymmetric bets beat grind every time. Choose the small bet with the clear exit.',
  },
  engineer: {
    agrees: 'The constraint, if removed, changes everything. Solve that one first. The rest falls.',
    cautions: 'You cannot tell when it is broken. You do not yet understand the system. Find the leading indicator first.',
    reframes: 'Specs are cut, not negotiated. Decide what you are not shipping. The question may be the right one at the wrong scope.',
    pushes: 'Ship the smallest version that proves the loop. Refine after. The setup is the bottleneck.',
  },
  optimist: {
    agrees: 'The mechanism is real. People who bet against it will be wrong, but for the right reasons.',
    cautions: 'Hope without a mechanism is wishful thinking. Name the specific process that will make this true.',
    reframes: 'Cynicism is the default register. Choosing hope is the work. But hope without a mechanism is a story.',
    pushes: 'You are not the cynic you are pretending to be. Be specific about what you are betting on.',
  },
  empath: {
    agrees: 'You read the recipient in their own voice. That is the difference between a good answer and a true one.',
    cautions: 'Who is the loudest voice in the room? Rarely the most affected. The answer usually shifts when you check.',
    reframes: 'You are not asking the person in front of you. You are asking the person you wish were in front of you.',
    pushes: 'You have waited long enough. The cost of waiting longer is borne by someone else, not you.',
  },
  firstprinciples: {
    agrees: 'The framing is sound. The question, stripped of the framing, still asks the same thing.',
    cautions: 'The framing carries an assumption you have not stated. Strip the framing and ask what is left.',
    reframes: 'The question, stripped of the framing, becomes a different question. That is the question you should be asking.',
    pushes: 'You do not yet have an answer. You have a category. Find the load-bearing fact and act on it.',
  },
  devilsadvocate: {
    agrees: 'The strongest case against your own position is the one you are most afraid to read. This is that case.',
    cautions: 'You are defending a position you have not steelmanned. The first move is the strongest case against it.',
    reframes: 'Pretend you are paid to lose the argument. What would you say? That is the reframe.',
    pushes: 'Take the bold path. The cost of being right later is higher than the cost of being wrong now.',
  },
};

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const ALL_STANCES: ReadonlyArray<MosaicStance> = ['agrees', 'cautions', 'reframes', 'pushes'];

/**
 * Pure — build a custom 4-mind council on a question. Each persona
 * uses one of their stance templates, picked deterministically from
 * the (question, personaId, slot) hash so the same panel + question
 * produces the same 4 takes every time.
 */
export function buildMosaicCouncil(
  question: string,
  panelIds: ReadonlyArray<string>,
): PersonaMosaicCouncil {
  const normalized = question.trim();
  // Deduplicate + cap at 4.
  const seen = new Set<string>();
  const panel: string[] = [];
  for (const id of panelIds) {
    if (typeof id !== 'string') continue;
    if (seen.has(id)) continue;
    seen.add(id);
    panel.push(id);
    if (panel.length >= 4) break;
  }
  const seed = `${normalized}::${panel.join('|')}`;
  const takes: MosaicCouncilTake[] = panel.map((personaId, slot) => {
    const pool = STANCE_TEMPLATES[personaId];
    const stance: MosaicStance = pool
      ? ALL_STANCES[simpleHash(`${seed}:${personaId}:${slot}`) % ALL_STANCES.length]
      : 'reframes';
    return {
      personaId,
      stance,
      take: pool?.[stance] ?? 'I have no view on this question.',
    };
  });
  return {
    question: normalized,
    panel,
    takes,
  };
}

/** Pure — verify a council's takes reference real personas. */
export function mosaicCouncilValid(council: PersonaMosaicCouncil): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const t of council.takes) {
    if (!known.has(t.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a mosaic council. */
export function mosaicCouncilShareUrl(
  origin: string,
  question: string,
  panel: ReadonlyArray<string>,
): string {
  return `${origin}/persona-mosaic-council?q=${encodeURIComponent(question)}&p=${encodeURIComponent(panel.join(','))}`;
}