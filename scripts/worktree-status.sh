#!/usr/bin/env bash
#
# worktree-status.sh — Show status of all worktree dev servers.
#
# Usage:
#   bash scripts/worktree-status.sh
#
set -euo pipefail

found=false

echo "=============================="
echo "  Worktree Dev Server Status"
echo "=============================="

for pidfile in /tmp/worktree-backend-*.pid; do
    [[ -f "$pidfile" ]] || continue
    found=true
    port=$(echo "$pidfile" | grep -oE '[0-9]+' | tail -1)
    pid=$(cat "$pidfile" 2>/dev/null)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "  Backend  :$port  [running]  PID=$pid"
    else
        echo "  Backend  :$port  [dead]     (stale pidfile)"
    fi
done

for pidfile in /tmp/worktree-frontend-*.pid; do
    [[ -f "$pidfile" ]] || continue
    found=true
    port=$(echo "$pidfile" | grep -oE '[0-9]+' | tail -1)
    pid=$(cat "$pidfile" 2>/dev/null)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "  Frontend :$port  [running]  PID=$pid"
    else
        echo "  Frontend :$port  [dead]     (stale pidfile)"
    fi
done

if ! $found; then
    echo "  No worktree dev servers found."
fi

echo "=============================="
