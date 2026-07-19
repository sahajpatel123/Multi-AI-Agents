export type PrismBuddyMode = 'idle' | 'attentive' | 'private' | 'recovering';
export type PrismBuddyAction =
  | 'none'
  | 'wave'
  | 'boop'
  | 'dance'
  | 'stretch'
  | 'approve'
  | 'thinking'
  | 'concerned'
  | 'match';

interface PrismBuddyProps {
  mode: PrismBuddyMode;
  action?: PrismBuddyAction;
  onActivate?: () => void;
}

export function PrismBuddy({ mode, action = 'none', onActivate }: PrismBuddyProps) {
  return (
    <button
      type="button"
      className={`prism-buddy prism-buddy--${mode} prism-buddy--action-${action}`}
      onClick={onActivate}
      aria-label="Play with the Prism Buddy"
      title="Play with Prism Buddy"
    >
      <svg viewBox="0 0 320 340" role="presentation" focusable="false">
        <ellipse className="prism-buddy__shadow" cx="160" cy="316" rx="91" ry="13" />

        <g className="prism-buddy__action-diamonds">
          <path className="prism-buddy__diamond prism-buddy__diamond--one" d="m35 105 10 11-10 11-10-11Z" />
          <path className="prism-buddy__diamond prism-buddy__diamond--two" d="m283 72 8 9-8 9-8-9Z" />
          <path className="prism-buddy__diamond prism-buddy__diamond--three" d="m291 248 7 8-7 8-7-8Z" />
        </g>

        <g className="prism-buddy__creature">
          <g className="prism-buddy__tuft">
            <path d="M137 54C119 42 116 24 126 17c13-8 26 9 28 29" />
            <path d="M156 46c-5-22 5-39 19-38 15 2 14 24 4 43" />
            <path d="M177 49c10-20 28-27 37-16 9 12-6 27-26 31" />
          </g>

          <path className="prism-buddy__body" d="M157 43C99 38 62 78 55 147c-8 76 20 146 95 158 77 12 122-35 117-119-4-78-48-138-110-143Z" />
          <path className="prism-buddy__body-shine" d="M77 151c1-30 11-54 30-72" />
          <path className="prism-buddy__belly" d="M107 230c17-23 82-29 107-2 19 21 11 59-15 72-17 9-67 7-84-7-20-17-23-43-8-63Z" />

          <g className="prism-buddy__face">
            <path className="prism-buddy__brow prism-buddy__brow--left" d="M86 93c20-12 42-12 58-1" />
            <path className="prism-buddy__brow prism-buddy__brow--right" d="M178 90c18-10 39-7 53 5" />

            <g className="prism-buddy__eyes">
              <ellipse className="prism-buddy__eye prism-buddy__eye--left" cx="119" cy="132" rx="39" ry="45" />
              <ellipse className="prism-buddy__eye prism-buddy__eye--right" cx="204" cy="130" rx="38" ry="44" />
              <g className="prism-buddy__pupil prism-buddy__pupil--left">
                <ellipse cx="119" cy="135" rx="12" ry="16" />
                <circle cx="124" cy="129" r="4" />
              </g>
              <g className="prism-buddy__pupil prism-buddy__pupil--right">
                <ellipse cx="204" cy="133" rx="12" ry="16" />
                <circle cx="209" cy="127" r="4" />
              </g>
            </g>

            <ellipse className="prism-buddy__cheek prism-buddy__cheek--left" cx="82" cy="178" rx="17" ry="9" />
            <ellipse className="prism-buddy__cheek prism-buddy__cheek--right" cx="239" cy="176" rx="17" ry="9" />
            <path className="prism-buddy__mouth prism-buddy__mouth--smile" d="M137 183c13 14 34 14 47-1" />
            <path className="prism-buddy__mouth prism-buddy__mouth--shy" d="M145 190c10-4 20-4 30 0" />
            <path className="prism-buddy__mouth prism-buddy__mouth--concerned" d="M139 195c13-12 30-12 43 0" />
            <ellipse className="prism-buddy__mouth prism-buddy__mouth--surprised" cx="160" cy="188" rx="8" ry="11" />
          </g>

          <g className="prism-buddy__arm prism-buddy__arm--left">
            <path d="M73 178c-30 1-48 24-42 51 5 22 27 37 47 24 17-11 25-39 17-57-4-11-12-18-22-18Z" />
            <path className="prism-buddy__finger" d="M45 207c14 0 29 8 39 20M42 220c12 0 25 7 34 16" />
          </g>
          <g className="prism-buddy__arm prism-buddy__arm--right">
            <path d="M247 176c31-1 50 21 45 49-4 23-25 39-46 27-18-10-27-37-20-56 4-12 11-19 21-20Z" />
            <path className="prism-buddy__finger" d="M279 204c-14 1-28 10-37 22M282 217c-12 1-24 8-33 18" />
          </g>

          <g className="prism-buddy__sparkles">
            <path d="M288 104v24M276 116h24" />
            <path d="M302 139v14M295 146h14" />
          </g>

          <path className="prism-buddy__foot prism-buddy__foot--left" d="M92 285c-30 6-43 24-30 37 11 11 51 5 66-13 7-9-15-28-36-24Z" />
          <path className="prism-buddy__foot prism-buddy__foot--right" d="M211 285c29 3 45 19 35 33-9 12-50 10-68-6-9-8 12-29 33-27Z" />
        </g>
      </svg>
    </button>
  );
}
