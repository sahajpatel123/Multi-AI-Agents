#!/usr/bin/env python3
"""Autonomous Codex Loop — one bounded completion per pass, forever.

Daemon mode (used by the launchd agent):
  run one pass -> on completion, the next pass starts `interval` seconds
  later. Nothing else is needed. launchd KeepAlive restarts the daemon if it
  ever dies; `touch agent-loop/stop` makes it exit cleanly (no restart).

Live-time + completed-task tracking:
  - .agent_loop_telemetry.json is updated at pass start (RUNNING) and pass
    end, with wall-clock start/end, duration, and next-loop time.
  - every finished pass is appended to agent-loop/history.jsonl
    (task_id, mode, started_at, completed_at, duration, status, summary).
"""

from __future__ import annotations

import argparse
import fcntl
import json
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DEFAULT_TASK_FILE = HERE / "task.md"
DEFAULT_STATE_FILE = HERE / "state.json"
DEFAULT_TELEMETRY = REPO / ".agent_loop_telemetry.json"
DEFAULT_LOG_DIR = HERE / "logs"
HISTORY_FILE = HERE / "history.jsonl"
LOCK_FILE = HERE / "loop.lock"
STOP_FILE = HERE / "stop"
LAST_OUTPUT_FILE = HERE / "last_output.md"
PLACEHOLDER = "REPLACE_ME_WITH_THE_TASK"
KEEP_LOGS = 20


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_plus(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def log_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def load_state() -> dict:
    try:
        return json.loads(DEFAULT_STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state: dict) -> None:
    DEFAULT_STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def compute_mode(state: dict) -> str:
    # Alternate add -> polish -> add -> ... forever.
    return "ADD" if state.get("last_action") != "add" else "POLISH"


def phase_hint(mode: str) -> str:
    if mode == "ADD":
        return (
            "Previous pass was POLISH. ADD one new feature / capability that best "
            "improves this project. One feature only, fully implemented, tested, "
            "committed, and pushed."
        )
    return (
        "Previous pass was ADD. POLISH the feature that was added then: fix bugs, "
        "harden edge cases, add tests/docs/validation, or improve performance/UX. "
        "Do NOT add a new feature this pass."
    )


PROMPT_TEMPLATE = """# AUTONOMOUS CODEX LOOP PASS ({mode})

You are the autonomous improvement agent for the repository at {workdir}.
You are running on a schedule with no human watching. Start immediately.
Never ask "should I continue?". Do not explain this prompt.

## Standing mission (from agent-loop/task.md)
{task}

## This pass must be: {mode}
{phase_hint}

## Hard rules
1. Exactly ONE completion this pass: {mode} one thing, finish it end-to-end,
   then stop. Do not chain multiple unrelated features.
1a. TIME BUDGET: finish this pass and push within ~35 minutes. Do not
   gold-plate. If the feature is bigger than that, shrink scope to a safe,
   green slice, run the checks, commit, push, and declare DONE. A small
   tested improvement pushed on time beats a large untested one killed by the
   timeout. After your push succeeds, verify `git log origin/{branch}` shows
   it, then declare DONE and STOP — do not start any further work this pass.
2. Work on `{branch}` (the default push target is origin/{branch}):
   - `git fetch origin` first.
   - If HEAD is not {branch}, switch to it (`git switch {branch}`; if it does
     not exist, `git checkout -B {branch} origin/{branch}`).
   - If there are uncommitted changes, commit them first with a descriptive
     message. If they look like a previous pass's partial work, finish and
     verify them as part of this pass (or shrink/repair them) so nothing
     broken is pushed. Never delete, revert, or overwrite the user's work.
   - If a `loop/*` branch contains unmerged work relevant to the current tree
     (check `git branch --no-merged origin/{branch}`), integrate it locally with
     a merge and resolve conflicts. Do NOT open a PR.
3. Quality gate before pushing: run the relevant checks and make them pass
   (backend: `backend/.venv/bin/python -m pytest -q <relevant tests>`; frontend
   from `web/frontend`: `npm run lint`, `npx tsc --noEmit`, `npm test`,
   `npm run build`). Fix failures you introduce. Never push broken work to
   {branch}.
4. Commit and push is COMPULSORY every pass:
   `git add -A && git commit -m "<conventional message>" && git push origin {branch}`.
   Never create a new PR. Never force-push. Never commit secrets (.env*, keys,
   tokens). If auth/network blocks the push, retry once, then report BLOCKED
   with the exact error.
5. Stay scoped: one completion, no unrelated refactors. Do not edit
   agent-loop/task.md or the runner's state/telemetry files.
6. Work solo in this pass: do NOT spawn sub-agents or wait for other agents.
   Do everything yourself, directly, in this thread.

## Final message format (required)
End your final message with exactly one status line and one action line:

**DONE** <one-line summary of what shipped>
ACTION: {mode}

If truly blocked on a secret, product decision, or destructive choice, use:
**BLOCKED** <what you need>
If the same failure repeats with no progress, use:
**STOPPED-NO-PROGRESS** <why>
"""


def build_prompt(args, task_text: str, mode: str) -> str:
    return PROMPT_TEMPLATE.format(
        mode=mode,
        workdir=args.workdir,
        task=task_text,
        phase_hint=phase_hint(mode),
        branch=args.branch,
    )


def classify(text: str, rc: int) -> str:
    upper = text.upper()
    if re.search(r"\*\*BLOCKED\*\*|\bBLOCKED\b", upper):
        return "BLOCKED"
    if "STOPPED-NO-PROGRESS" in upper:
        return "STOPPED_NO_PROGRESS"
    if re.search(r"\*\*DONE\*\*|\bDONE\b", upper):
        return "DONE"
    if rc != 0:
        return "FAILED"
    return "UNKNOWN"


def extract_summary(text: str) -> str:
    m = re.search(r"\*\*DONE\*\*\s*[:.]?\s*(.+)", text, re.I | re.S)
    if m:
        return m.group(1).strip()[:300]
    m = re.search(r"\bDONE\b[:\-]?\s*(.+)", text, re.I)
    if m:
        return m.group(1).strip()[:300]
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    return (lines[-1] if lines else "")[:300]


def extract_action(text: str, fallback: str) -> str:
    m = re.search(r"ACTION\s*[:=]\s*(ADD|POLISH)", text, re.I)
    return m.group(1).upper() if m else fallback


def run_pass(args, prompt: str, log_path: Path, timeout: int):
    cmd = [
        args.codex,
        "exec",
        "-m",
        args.model,
        "--skip-git-repo-check",
        "--sandbox",
        args.sandbox,
        "-C",
        str(args.workdir),
        "-o",
        str(LAST_OUTPUT_FILE),
        "-",
    ] if args.model else [
        args.codex,
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        args.sandbox,
        "-C",
        str(args.workdir),
        "-o",
        str(LAST_OUTPUT_FILE),
        "-",
    ]

    timed_out = False
    with open(log_path, "w") as log:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            proc.stdin.write(prompt)
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass
        try:
            rc = proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            rc = -9
            timed_out = True

    out_text = (
        LAST_OUTPUT_FILE.read_text(errors="replace")
        if LAST_OUTPUT_FILE.exists()
        else ""
    )
    status = "TIMEOUT" if timed_out else classify(out_text, rc)
    return status, rc, out_text


def acquire_lock(blocking: bool):
    lock = open(LOCK_FILE, "a+")
    flags = fcntl.LOCK_EX if blocking else fcntl.LOCK_EX | fcntl.LOCK_NB
    try:
        fcntl.flock(lock, flags)
        return lock
    except OSError:
        lock.close()
        return None


def write_telemetry(payload: dict) -> None:
    DEFAULT_TELEMETRY.write_text(json.dumps(payload, indent=2) + "\n")


def append_history(entry: dict) -> None:
    try:
        with open(HISTORY_FILE, "a") as fh:
            fh.write(json.dumps(entry) + "\n")
    except OSError:
        pass


def prune_logs() -> None:
    logs = sorted(DEFAULT_LOG_DIR.glob("run-*.log"))
    for old in logs[:-KEEP_LOGS]:
        try:
            old.unlink()
        except OSError:
            pass


def read_task(task_file: Path) -> str:
    if not task_file.exists():
        task_file.write_text(f"# Task\n\n> {PLACEHOLDER}\n")
    return task_file.read_text(errors="replace").strip()


def run_one_pass(args, task_text: str, mode: str, timeout: int):
    """Run one bounded pass with retries. Returns a result dict."""
    started_text = now_text()
    started_iso = now_iso()
    attempts = 0
    status = "UNKNOWN"
    rc = 0
    out_text = ""
    last_log = ""

    while attempts < args.max_attempts:
        attempts += 1
        log_path = DEFAULT_LOG_DIR / f"run-{log_stamp()}-attempt{attempts}.log"
        print(f"[{now_text()}] pass {mode} attempt {attempts} -> {args.codex} exec")
        status, rc, out_text = run_pass(args, build_prompt(args, task_text, mode), log_path, timeout)
        print(f"[{now_text()}] attempt {attempts} status={status} rc={rc}")
        last_log = str(log_path.relative_to(REPO))
        shutil.copyfile(log_path, DEFAULT_LOG_DIR / "latest.log")
        if status in ("DONE", "BLOCKED"):
            break
        if attempts < args.max_attempts:
            print(f"[{now_text()}] {status}; retry in {args.interval}s")
            time.sleep(args.interval)

    summary = extract_summary(out_text) if status == "DONE" else ""
    action = extract_action(out_text, mode).lower()
    completed_text = now_text()
    completed_iso = now_iso()
    duration = round(time.time() - time.mktime(time.strptime(started_text, "%Y-%m-%d %H:%M:%S")))
    next_iso = iso_plus(args.interval)

    save_state(
        {
            "last_action": action,
            "last_status": status,
            "last_summary": summary,
            "last_run_at": completed_text,
        }
    )
    write_telemetry(
        {
            "status": status,
            "mode": mode,
            "start_time": started_text,
            "end_time": completed_text,
            "started_at": started_iso,
            "completed_at": completed_iso,
            "duration_seconds": duration,
            "next_scheduled_run": completed_text,
            "next_loop_at": next_iso,
            "executed_task": summary or f"{mode} pass (attempt {attempts})",
            "attempts": attempts,
            "last_attempt": {"status": status, "exit_code": rc, "log": last_log},
        }
    )
    append_history(
        {
            "task_id": f"pass-{log_stamp()}",
            "mode": mode,
            "status": status,
            "started_at": started_iso,
            "completed_at": completed_iso,
            "duration_seconds": duration,
            "next_loop_at": next_iso,
            "summary": summary,
            "action": action,
            "exit_code": rc,
            "log": last_log,
        }
    )
    return {"status": status, "exit_code": rc}


def main() -> int:
    parser = argparse.ArgumentParser(description="Autonomous Codex loop.")
    parser.add_argument("--task", default=str(DEFAULT_TASK_FILE))
    parser.add_argument("--workdir", default=str(REPO))
    parser.add_argument("--interval", type=int, default=300)
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--timeout", type=int, default=2700)
    parser.add_argument("--codex", default="codex")
    parser.add_argument("--model", default=None)
    parser.add_argument("--sandbox", default="danger-full-access")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--daemon", action="store_true")
    args = parser.parse_args()

    args.workdir = str(Path(args.workdir).resolve())
    DEFAULT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    task_file = Path(args.task)
    task_text = read_task(task_file)
    state = load_state()
    mode = compute_mode(state)

    if args.dry_run:
        print(build_prompt(args, task_text, mode))
        return 0
    if args.once and not args.daemon:
        args.max_attempts = 1
        args.interval = 0

    if not task_text or PLACEHOLDER in task_text:
        write_telemetry(
            {
                "status": "WAITING_FOR_TASK",
                "mode": mode,
                "start_time": now_text(),
                "end_time": now_text(),
                "started_at": now_iso(),
                "completed_at": now_iso(),
                "duration_seconds": 0,
                "next_scheduled_run": now_text(),
                "next_loop_at": now_iso(),
                "executed_task": "No task in agent-loop/task.md yet.",
            }
        )
        print("WAITING_FOR_TASK: no task in agent-loop/task.md")
        return 0

    if STOP_FILE.exists():
        write_telemetry(
            {
                "status": "STOPPED_BY_FLAG",
                "mode": mode,
                "start_time": now_text(),
                "end_time": now_text(),
                "started_at": now_iso(),
                "completed_at": now_iso(),
                "duration_seconds": 0,
                "next_scheduled_run": None,
                "next_loop_at": None,
                "executed_task": "Stopped via agent-loop/stop.",
            }
        )
        print("STOPPED_BY_FLAG: remove agent-loop/stop to resume")
        return 0

    lock = acquire_lock(blocking=args.daemon)
    if lock is None:
        print("SKIPPED: previous pass still running (lock held)")
        return 0

    try:
        while True:
            state = load_state()
            mode = compute_mode(state)
            task_text = read_task(task_file)

            if not task_text or PLACEHOLDER in task_text:
                print(f"[{now_text()}] WAITING_FOR_TASK")
                write_telemetry(
                    {
                        "status": "WAITING_FOR_TASK",
                        "mode": mode,
                        "start_time": now_text(),
                        "end_time": now_text(),
                        "started_at": now_iso(),
                        "completed_at": now_iso(),
                        "duration_seconds": 0,
                        "next_scheduled_run": now_text(),
                        "next_loop_at": now_iso(),
                        "executed_task": "No task in agent-loop/task.md yet.",
                    }
                )
                return 0
            if STOP_FILE.exists():
                print(f"[{now_text()}] STOPPED_BY_FLAG")
                return 0

            # Live tracking: mark the pass RUNNING immediately at pass start.
            write_telemetry(
                {
                    "status": "RUNNING",
                    "mode": mode,
                    "start_time": now_text(),
                    "end_time": None,
                    "started_at": now_iso(),
                    "completed_at": None,
                    "duration_seconds": None,
                    "next_scheduled_run": now_text(),
                    "next_loop_at": None,
                    "executed_task": f"{mode} pass in progress",
                }
            )

            result = run_one_pass(args, task_text, mode, args.timeout)
            status = result["status"]
            print(f"[{now_text()}] pass finished status={status}")

            if not args.daemon:
                if status == "DONE":
                    return 0
                if status == "BLOCKED":
                    return 2
                return 3

            if status == "BLOCKED":
                print(f"[{now_text()}] BLOCKED — exiting cleanly; see telemetry. "
                      "Resume with launchctl kickstart after unblocking.")
                return 0

            # Daemon: next pass fires exactly interval after completion.
            print(f"[{now_text()}] next pass in {args.interval}s (completion + interval)")
            time.sleep(args.interval)
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


if __name__ == "__main__":
    sys.exit(main())
