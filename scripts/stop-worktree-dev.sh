#!/usr/bin/env bash
#
# stop-worktree-dev.sh — Stop worktree dev servers.
#
# Usage:
#   bash scripts/stop-worktree-dev.sh          # stop all worktree dev servers
#   bash scripts/stop-worktree-dev.sh 8001     # stop servers on backend port 8001 / frontend port 3001
#
set -euo pipefail

stop_server() {
    local pidfile="$1"
    local label="$2"
    if [[ ! -f "$pidfile" ]]; then
        return
    fi
    local pid
    pid=$(cat "$pidfile" 2>/dev/null)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null && echo "Stopped $label (PID $pid)" || echo "Failed to stop $label (PID $pid)"
    else
        echo "$label not running (stale pidfile)"
    fi
    rm -f "$pidfile"
}

if [[ -n "${1:-}" ]]; then
    # Stop specific port pair
    BACKEND_PORT="$1"
    FRONTEND_PORT=$((3000 + BACKEND_PORT - 8000))
    stop_server "/tmp/worktree-backend-${BACKEND_PORT}.pid" "Backend :${BACKEND_PORT}"
    stop_server "/tmp/worktree-frontend-${FRONTEND_PORT}.pid" "Frontend :${FRONTEND_PORT}"
else
    # Stop all worktree servers
    found=false
    for pidfile in /tmp/worktree-backend-*.pid /tmp/worktree-frontend-*.pid; do
        [[ -f "$pidfile" ]] || continue
        found=true
        # Extract label from filename
        label=$(basename "$pidfile" .pid | sed 's/worktree-//' | sed 's/-/ :/')
        stop_server "$pidfile" "$label"
    done
    if ! $found; then
        echo "No worktree dev servers found."
    fi
fi
