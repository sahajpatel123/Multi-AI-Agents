import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import {
  recordDailyStreak,
  milestoneFor,
  type DailyStreakState,
} from '../lib/dailyStreak';

const EMPTY: DailyStreakState = { v: 1, lastVisit: '', current: 0, longest: 0 };

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DailyStreakProps {
  /** Heading shown above the widget. */
  heading?: string;
}

/**
 * Daily-streak widget for the hub. Records today's visit on mount and
 * surfaces the current + longest consecutive-day count. Renders
 * nothing when the streak is 0 (cold start) so first-time visitors
 * don't see a "0 day streak" widget.
 */
export function DailyStreak({ heading = 'Your streak' }: DailyStreakProps) {
  const [state, setState] = useState<DailyStreakState>(EMPTY);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const today = formatLocalDate(new Date());
    const next = recordDailyStreak(window.localStorage, today);
    setState(next);
  }, []);

  if (state.current === 0) return null;

  const milestone = milestoneFor(state.current);

  return (
    <section className="ppg-streak" aria-label={heading}>
      <div className="ppg-streak__icon" aria-hidden="true">
        <Flame />
      </div>
      <div className="ppg-streak__body">
        <p className="ppg-streak__heading">{heading}</p>
        <p className="ppg-streak__count">
          <strong>{state.current}</strong>
          <span>{state.current === 1 ? 'day' : 'days'}</span>
          {milestone && (
            <span
              className="ppg-streak__badge"
              title={`${milestone.name} — ${milestone.days}+ day streak`}
            >
              <span aria-hidden="true">{milestone.glyph}</span>
              {milestone.name}
            </span>
          )}
        </p>
        {state.longest > state.current && (
          <p className="ppg-streak__longest">Longest: {state.longest} days</p>
        )}
      </div>
    </section>
  );
}
