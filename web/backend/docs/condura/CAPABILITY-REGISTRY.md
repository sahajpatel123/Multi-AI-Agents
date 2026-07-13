# Capability Registry

Source of truth in code: `arena/core/capabilities.py`.
This document mirrors the registry for Condura and product review.

## Legend

| Env | Server | Machine | UI |
|---|---|---|---|
| `web` | All | Nothing | Normal |
| `condura` | Reject 409 | All | Powered by Condura CTA |
| `hybrid_prep` | Plan + mirror | Sync execute | Run / Send to Condura |
| `hybrid_delegate` | Watch | Long loop | Send (long-running) |

**Rule:** hybrid capabilities NEVER carry file bytes. File uploads are `web`
(server extracts text) or `condura` (user re-attaches in Condura).

---

## Web capabilities

| ID | Description | Notes |
|---|---|---|
| `arena.respond` | 4-agent panel response | Core Arena |
| `arena.debate` | Debate mode | Plus+ |
| `arena.discuss` | 1:1 focused chat | Plus+ |
| `agent.research` | 8-stage research pipeline | Pro / agent add-on; attachments OK |
| `agent.orchestrate` | Multi-task synthesis | Pro |
| `agent.refine` | Refinement loop | Pro |
| `agent.feedback` | Answer feedback | Pro |
| `agent.challenge` | Challenge answer | Pro |
| `agent.rebuttal` | Rebuttal | Pro |
| `watchlist.create` | Recurring research (server cron) | Plus+ |
| `watchlist.toggle` | Toggle watchlist item | Plus+ |
| `agent.verify_arena_answer` | Verify Arena winner (web path) | Pro; Phase 3 may offer hybrid_prep |

---

## Condura capabilities (demonstrative + future)

| ID | Description | Condura method | Args (sketch) |
|---|---|---|---|
| `app.open_in_linear` | Create Linear ticket from research | `arena.app.linear` | `{action, ticket: {title, body, project?}, source_prompt}` |
| `screen.capture` | Capture screen/window (future) | `arena.screen.capture` | `{mode, annotation?}` |

---

## Hybrid prep

| ID | Description | Condura method | Heartbeat | Args (sketch) |
|---|---|---|---|---|
| `report.save_to_local` | Save report text to local path | `arena.report.save` | 60s | `{report_format, suggested_dir, suggested_filename, report_text}` |
| `agent.verify_arena_answer_local` | Optional local verify of Arena answer | `arena.agent.verify` | 60s | `{arena_answer, original_question, persona_name, score}` |

---

## Hybrid delegate

| ID | Description | Condura method | Heartbeat | Args (sketch) |
|---|---|---|---|---|
| `agent.long_research` | Long-running research loop | `arena.agent.research.delegate` | 600s | `{task, stop_conditions, deliver_every}` |

---

## Demonstrative templates (Phase 1+)

| Template id | Capability | Badge |
|---|---|---|
| `open_in_linear` | `app.open_in_linear` | condura |
| `save_report_local` | `report.save_to_local` | hybrid_prep |
| `long_research_delegate` | `agent.long_research` | hybrid_delegate (disabled until Phase 4) |

Existing research templates (`market_research`, `competitor_analysis`, etc.)
remain `web` via `agent.research`.
