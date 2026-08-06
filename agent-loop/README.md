# Agent Loop — 5-minute autonomous improvement loop

This directory runs an **infinite autonomous loop** for the Arena project:

- launchd wakes the loop every **5 minutes** (`StartInterval 300`, `RunAtLoad`).
- Each wakeup completes **exactly one completion**: **ADD** a feature or
  **POLISH** the previous one, alternating forever.
- Every pass commits and pushes to `main`. **No PRs are ever created.**
- Status lands in `../.agent_loop_telemetry.json`; every pass is logged under
  `logs/`.

## How it works

1. `task.md` is the standing mission (edit it any time; changes apply next pass).
2. `state.json` records the last action (`add` / `polish`) so passes alternate.
3. `run_loop.py` builds a loop-mode prompt and runs:
   `codex exec --sandbox workspace-write -C <repo> -o last_output.md -`
4. The result is classified (`DONE` / `BLOCKED` / `STOPPED-NO-PROGRESS` /
   `FAILED`), telemetry is written, and the process exits. launchd starts the
   next pass 5 minutes later. A lock file prevents overlapping passes.

## Install (automatic launch, survives reboots)

```bash
bash agent-loop/install_launchagent.sh
```

The script copies the plist into `~/Library/LaunchAgents` (injecting your
`OPENCODE_API_KEY`, which launchd does not inherit from shell profiles) and
registers it. The loop runs immediately on load, then every 5 minutes.

## Stop / pause / resume

- Graceful stop: `touch agent-loop/stop` (next wakeup records `STOPPED_BY_FLAG`
  and exits; remove the file to resume).
- Hard stop: `launchctl bootout gui/$(id -u)/com.arena.codex-loop`
- Run one pass now by hand:
  `python3 agent-loop/run_loop.py --once --max-attempts 1`
- Preview the prompt without running:
  `python3 agent-loop/run_loop.py --dry-run`

## Check status

```bash
cat .agent_loop_telemetry.json
tail -50 agent-loop/logs/latest.log
tail -50 agent-loop/logs/launchd.err.log
```

## Notes

- First pass is an integration pass: it switches to `main`, merges the current
  `loop/*` branch and any uncommitted work onto main, runs checks, and pushes —
  so the loop starts from a clean `main`.
- Each pass runs relevant tests before pushing; broken work is never pushed.
- In-chat alternative: type `/loop <interval> <prompt>` in Codex to loop in the
  current conversation instead of via launchd.
