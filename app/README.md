# App

This directory is reserved for the **built and runnable application** — the packaged,
deployable output of the project (compiled builds, container images, server bundles,
release artifacts).

## Convention

- `web/` holds **source** (frontend + backend code you edit).
- `app/` holds **output** (what actually runs / ships).

Keep source code out of this directory. Generate build artifacts here via CI or a build
script so the root of the repository cleanly separates "what we build" (`web/`) from
"what we run" (`app/`).
