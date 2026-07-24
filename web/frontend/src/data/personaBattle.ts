// Persona Battle preset matchups — curated 2-persona pairings with
// suggested topics. Public to allow tests to import directly.

export interface PersonaBattlePreset {
  readonly id: string;
  readonly leftId: string;
  readonly rightId: string;
  readonly topic: string;
  readonly tagline: string;
}

export const PERSONA_BATTLE_PRESETS: ReadonlyArray<PersonaBattlePreset> = [
  {
    id: 'contrarian-optimist-glass',
    leftId: 'contrarian',
    rightId: 'optimist',
    topic: 'Is the glass half empty or half full?',
    tagline: 'Spite vs. hope',
  },
  {
    id: 'philosopher-engineer-ai',
    leftId: 'philosopher',
    rightId: 'engineer',
    topic: 'Can a machine ever understand what it is doing?',
    tagline: 'Premise vs. mechanism',
  },
  {
    id: 'analyst-futurist-crypto',
    leftId: 'analyst',
    rightId: 'futurist',
    topic: 'Will decentralized money replace central banks?',
    tagline: 'Failure modes vs. second-order effects',
  },
  {
    id: 'stoic-empath-mercy',
    leftId: 'stoic',
    rightId: 'empath',
    topic: 'Should you comfort someone in avoidable pain?',
    tagline: 'Control vs. care',
  },
  {
    id: 'pragmatist-firstprinciples-strategy',
    leftId: 'pragmatist',
    rightId: 'firstprinciples',
    topic: 'How should a startup pick its first market?',
    tagline: 'What works vs. what is true',
  },
  {
    id: 'ethicist-strategist-negotiation',
    leftId: 'ethicist',
    rightId: 'strategist',
    topic: 'Is it ethical to bluff in a high-stakes negotiation?',
    tagline: 'Who pays vs. who wins',
  },
];

/** Pure helper — return the 2-persona preset that matches the URL key, if any. */
export function findBattlePreset(id: string | null): PersonaBattlePreset | null {
  if (!id) return null;
  return PERSONA_BATTLE_PRESETS.find((p) => p.id === id) ?? null;
}