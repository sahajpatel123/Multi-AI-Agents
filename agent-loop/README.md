# Agent Loop — 5-minute autonomous improvement loop

This directory runs an **infinite autonomous loop** for the Arena project:

- A launchd daemon keeps the loop alive (`RunAtLoad` + `KeepAlive`).
- Each pass completes **exactly one completion**: **ADD** a feature or
  **POLISH** the previous one, alternating forever.
- The next pass fires automatically **5 minutes after the previous pass
  completes** (completion time + interval), not on a fixed clock — so timing
  never drifts even when a pass takes longer.
- Every pass commits and pushes to `main`. **No PRs are ever created.**
- Live status lands in `../.agent_loop_telemetry.json` (updated at pass start
  with `RUNNING`, then at pass end with start/end times, duration, and the
  next-loop time). Every finished pass is appended to `history.jsonl` with
  `task_id`, `mode`, `started_at`, `completed_at`, `duration_seconds`, and a
  summary — so you always have a track of completed tasks. Full logs live
  under `logs/`.

## How it works

1. `task.md` is the standing mission (edit it any time; changes apply next pass).
2. `state.json` records the last action (`add` / `polish`) so passes alternate.
3. `run_loop.py` builds a loop-mode prompt and runs:
   `codex exec --sandbox workspace-write -C <repo> -o last_output.md -`
4. The result is classified (`DONE` / `BLOCKED` / `STOPPED-NO-PROGRESS` /
   `FAILED`), telemetry and history are written, and the daemon sleeps the
   interval before the next pass. A lock file prevents overlapping passes.
5. If the daemon ever dies, launchd restarts it automatically. `BLOCKED`
   passes exit cleanly so the loop never thrashes on an unresolvable blocker.

## Install (automatic launch, survives reboots)

```bash
bash agent-loop/install_launchagent.sh
```

The script copies the plist into `~/Library/LaunchAgents` (injecting your
`OPENCODE_API_KEY`, which launchd does not inherit from shell profiles) and
registers it. The loop runs immediately on load, then every 5 minutes after
each pass completes.

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
- Interval is **300s (5 minutes)** as you set it. To change it (e.g. to 15
  minutes), edit `--interval` in the plist to `900` and re-run the installer.
- In-chat alternative: type `/loop <interval> <prompt>` in Codex to loop in the
  current conversation instead of via launchd.
