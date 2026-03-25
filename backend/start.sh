#!/bin/bash
set -e

cd "$(dirname "$0")"

# Migrations + schema check run inside migrate_and_start.py before uvicorn binds the port.
exec python migrate_and_start.py
