"""Regression: the agent pipeline stage order must stay in lockstep with
the frontend `STAGE_KEYS` and the documented research-pipeline spec.

Backend (`arena/core/agent_pipeline.py`) hardcodes the run order in
three sites:
  1. Main pipeline: planner → researcher → solver → critic → verifier →
     synthesizer → judge (line 183-214).
  2. Live re-execution: planner → researcher → critic → solver → verifier
     (line 434).
  3. Refinement: solver → synthesizer → judge (line 217).

Frontend (`web/frontend/src/lib/agentPipelineStages.ts::STAGE_KEYS`)
lists the 7 stages in the same order as the main pipeline. If a
contributor reorders a stage on one side without the other, the
status dots and the calligraphy word drift out of sync — the loader
would show "researcher" while the backend is on "solver".

This test pins the main pipeline order so a future refactor that
silently reorders stages gets a red CI. The two shorter orders
(refinement, live re-execution) are subsets of the main pipeline and
checked separately.
"""

from __future__ import annotations


def test_main_pipeline_stage_order_is_canonical():
    """Read the main pipeline order from agent_pipeline.py and assert
    it matches the expected research-pipeline order.

    We use a regex (not AST) for simplicity: the order is a
    whitespace-tolerant sequence of `await run_<stage>(` lines.
    """
    import re
    from pathlib import Path

    pipeline_src = (
        Path(__file__).resolve().parent.parent / "arena" / "core" / "agent_pipeline.py"
    ).read_text()

    expected = [
        "planner",
        "researcher",
        "solver",
        "critic",
        "verifier",
        "synthesizer",
        "judge",
    ]

    # Find each `await run_<stage>(` call in order. `re.finditer` is
    # robust to leading whitespace and parentheses depth.
    actual = [m.group(1) for m in re.finditer(r"await\s+run_(\w+)\s*\(", pipeline_src)]

    # The main pipeline is the FIRST run of all 7 expected stages in
    # expected order. Subset calls (refinement, live re-execution) reuse
    # the same function names, so the main sequence is a contiguous
    # slice of the finditer output.
    found_at = None
    for i in range(len(actual) - len(expected) + 1):
        if actual[i : i + len(expected)] == expected:
            found_at = i
            break

    assert found_at is not None, (
        f"Main pipeline order drifted from canonical research-pipeline "
        f"order. Expected: {expected}. Found: {actual}. "
        f"Frontend STAGE_KEYS (web/frontend/src/lib/agentPipelineStages.ts) "
        f"uses the same expected order, so a backend reorder without a "
        f"matching frontend change desyncs the loader dots from the "
        f"backend stage the agent is actually on."
    )


def test_pipeline_stages_match_frontend_stage_keys():
    """The 7 backend run_<stage> functions must match the frontend
    STAGE_KEYS list (planner/researcher/solver/critic/verifier/
    synthesizer/judge). The frontend pins the loader dot count and
    order; the backend must keep the run_<stage> function set in sync.
    """
    import re
    from pathlib import Path

    pipeline_src = (
        Path(__file__).resolve().parent.parent / "arena" / "core" / "agent_pipeline.py"
    ).read_text()
    frontend_src = (
        Path(__file__).resolve().parent.parent.parent
        / "web"
        / "frontend"
        / "src"
        / "lib"
        / "agentPipelineStages.ts"
    ).read_text()

    # Match the import block at the top of agent_pipeline.py — that's the
    # canonical list of run_<stage> functions this module orchestrates.
    # Filtering on the import block avoids matching helper functions like
    # `run_agent_pipeline` or `run_steelman_step` that wrap the real
    # stages.
    import_block_matches = re.findall(
        r"from arena\.core\.stages\.\w+\s+import\s+run_\w+", pipeline_src
    )
    assert import_block_matches, (
        "Could not locate `from arena.core.stages.<file> import run_<stage>` "
        "in arena/core/agent_pipeline.py. Has the import layout changed? "
        "Update this guard to match."
    )
    backend_stages = sorted(
        stage
        for match in import_block_matches
        for stage in re.findall(r"run_(\w+)", match)
    )

    frontend_match = re.search(
        r"STAGE_KEYS\s*=\s*\[(.*?)\]\s*as\s*const", frontend_src, re.DOTALL
    )
    assert frontend_match, (
        "Could not find `STAGE_KEYS = [...] as const` in "
        f"{frontend_src}. Has the frontend lib been refactored? "
        "Update this guard to match."
    )
    frontend_stages = sorted(
        re.findall(r"['\"](\w+)['\"]", frontend_match.group(1))
    )

    assert backend_stages == frontend_stages, (
        f"Pipeline stages drifted between backend and frontend. "
        f"Backend: {backend_stages}. Frontend: {frontend_stages}. "
        f"A stage added/removed on one side without the other silently "
        f"breaks the loader's progress dots."
    )