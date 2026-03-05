#!/usr/bin/env bash
#
# start-worktree-dev.sh — Auto-allocate ports and start dev servers for a worktree.
#
# Usage:
#   bash scripts/start-worktree-dev.sh          # auto-detect next free port pair
#   bash scripts/start-worktree-dev.sh 8003     # specify backend port (frontend = 3000 + offset)
#
# Port convention:
#   Main repo:    8000 / 3000
#   Worktrees:    8001-8009 / 3001-3009
#
# What it does:
#   1. Detect the worktree root (must contain backend/ and frontend/)
#   2. Find next available port pair (8001+/3001+)
#   3. Create/update frontend/.env.local to point at the backend port
#   4. Install frontend deps if node_modules missing
#   5. Start backend (uvicorn) and frontend (next dev) via setsid (survives parent shell exit)
#   6. Print URLs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validate project structure
if [[ ! -d "$PROJECT_ROOT/backend" || ! -d "$PROJECT_ROOT/frontend" ]]; then
    echo "Error: must run from project root (need backend/ and frontend/)"
    exit 1
fi

# --- Port allocation ---

find_free_port() {
    local base=$1
    local max=$2
    for port in $(seq "$base" "$max"); do
        if ! lsof -iTCP:"$port" -sTCP:LISTEN -P -n &>/dev/null; then
            echo "$port"
            return
        fi
    done
    echo ""
}

if [[ -n "${1:-}" ]]; then
    BACKEND_PORT="$1"
else
    BACKEND_PORT=$(find_free_port 8001 8009)
fi

if [[ -z "$BACKEND_PORT" ]]; then
    echo "Error: no free backend port in 8001-8009"
    exit 1
fi

# Frontend port = 3000 + (backend_port - 8000)
FRONTEND_PORT=$((3000 + BACKEND_PORT - 8000))

# --- Idempotency: skip if already running on these ports ---

BACKEND_PID_FILE="/tmp/worktree-backend-${BACKEND_PORT}.pid"
FRONTEND_PID_FILE="/tmp/worktree-frontend-${FRONTEND_PORT}.pid"

backend_running=false
frontend_running=false

if [[ -f "$BACKEND_PID_FILE" ]]; then
    pid=$(cat "$BACKEND_PID_FILE" 2>/dev/null)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        backend_running=true
    fi
fi

if [[ -f "$FRONTEND_PID_FILE" ]]; then
    pid=$(cat "$FRONTEND_PID_FILE" 2>/dev/null)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        frontend_running=true
    fi
fi

if $backend_running && $frontend_running; then
    echo "Dev servers already running on ports $BACKEND_PORT/$FRONTEND_PORT. Skipping."
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
    exit 0
fi

# Check ports not occupied by other processes
if ! $backend_running && lsof -iTCP:"$BACKEND_PORT" -sTCP:LISTEN -P -n &>/dev/null; then
    echo "Error: backend port $BACKEND_PORT already in use by another process"
    exit 1
fi

if ! $frontend_running && lsof -iTCP:"$FRONTEND_PORT" -sTCP:LISTEN -P -n &>/dev/null; then
    echo "Error: frontend port $FRONTEND_PORT already in use by another process"
    exit 1
fi

echo "Ports: backend=$BACKEND_PORT, frontend=$FRONTEND_PORT"

# --- Frontend .env.local ---

ENV_LOCAL="$PROJECT_ROOT/frontend/.env.local"
MAIN_ENV="$PROJECT_ROOT/../../../frontend/.env.local"

# Copy INSFORGE keys from main repo if our .env.local doesn't exist
if [[ ! -f "$ENV_LOCAL" ]]; then
    if [[ -f "$MAIN_ENV" ]]; then
        INSFORGE_URL=$(grep NEXT_PUBLIC_INSFORGE_URL "$MAIN_ENV" | head -1 | cut -d= -f2-)
        INSFORGE_KEY=$(grep NEXT_PUBLIC_INSFORGE_ANON_KEY "$MAIN_ENV" | head -1 | cut -d= -f2-)
    else
        INSFORGE_URL=""
        INSFORGE_KEY=""
    fi
    cat > "$ENV_LOCAL" <<EOF
NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api
NEXT_PUBLIC_INSFORGE_URL=${INSFORGE_URL}
NEXT_PUBLIC_INSFORGE_ANON_KEY=${INSFORGE_KEY}
EOF
    echo "Created $ENV_LOCAL"
else
    # Update just the API URL
    if grep -q "NEXT_PUBLIC_API_URL" "$ENV_LOCAL"; then
        sed -i '' "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api|" "$ENV_LOCAL"
    else
        echo "NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api" >> "$ENV_LOCAL"
    fi
    echo "Updated API_URL in $ENV_LOCAL"
fi

# --- Install frontend deps if missing ---

if [[ ! -d "$PROJECT_ROOT/frontend/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$PROJECT_ROOT/frontend" && npm install --silent)
fi

# --- Symlink backend .env if missing ---

MAIN_ROOT="$(git worktree list --porcelain 2>/dev/null | head -1 | awk '{print $2}')"
BACKEND_ENV="$PROJECT_ROOT/backend/.env"
if [[ ! -f "$BACKEND_ENV" && -n "$MAIN_ROOT" && -f "$MAIN_ROOT/backend/.env" ]]; then
    ln -s "$MAIN_ROOT/backend/.env" "$BACKEND_ENV"
    echo "Symlinked backend/.env from main repo"
fi

# --- Find Python venv ---

VENV=""
if [[ -f "$PROJECT_ROOT/backend/venv/bin/activate" ]]; then
    VENV="$PROJECT_ROOT/backend/venv/bin/activate"
else
    # Worktrees don't have their own venv; use main repo's
    MAIN_VENV="${MAIN_ROOT}/backend/venv/bin/activate"
    if [[ -f "$MAIN_VENV" ]]; then
        VENV="$MAIN_VENV"
    fi
fi

if [[ -z "$VENV" ]]; then
    echo "Error: cannot find Python venv"
    exit 1
fi

# --- Start servers (fully detached from parent process group) ---

# Helper: launch a command in a new process group so it survives parent shell exit.
# Uses setsid on Linux, nohup+disown on macOS (Darwin has no setsid).
launch_detached() {
    local logfile="$1"
    local pidfile="$2"
    shift 2
    if command -v setsid &>/dev/null; then
        setsid "$@" > "$logfile" 2>&1 &
        echo $! > "$pidfile"
    else
        nohup "$@" > "$logfile" 2>&1 &
        echo $! > "$pidfile"
        disown
    fi
}

if ! $backend_running; then
    echo "Starting backend on port $BACKEND_PORT..."
    (
        source "$VENV"
        cd "$PROJECT_ROOT/backend"
        launch_detached \
            "/tmp/worktree-backend-${BACKEND_PORT}.log" \
            "/tmp/worktree-backend-${BACKEND_PORT}.pid" \
            uvicorn app.main:app --reload --port "$BACKEND_PORT"
    )
fi

if ! $frontend_running; then
    echo "Starting frontend on port $FRONTEND_PORT..."
    (
        cd "$PROJECT_ROOT/frontend"
        launch_detached \
            "/tmp/worktree-frontend-${FRONTEND_PORT}.log" \
            "/tmp/worktree-frontend-${FRONTEND_PORT}.pid" \
            npm run dev -- -p "$FRONTEND_PORT"
    )
fi

# Wait a moment and verify
sleep 3

BACKEND_OK=false
FRONTEND_OK=false

if lsof -iTCP:"$BACKEND_PORT" -sTCP:LISTEN -P -n &>/dev/null; then
    BACKEND_OK=true
fi

# Frontend takes longer to start
for i in 1 2 3 4; do
    if lsof -iTCP:"$FRONTEND_PORT" -sTCP:LISTEN -P -n &>/dev/null; then
        FRONTEND_OK=true
        break
    fi
    sleep 2
done

echo ""
echo "=============================="
echo "  Worktree Dev Servers"
echo "=============================="
if $BACKEND_OK; then
    echo "  Backend:  http://localhost:$BACKEND_PORT  [running]"
else
    echo "  Backend:  http://localhost:$BACKEND_PORT  [starting... check /tmp/worktree-backend-${BACKEND_PORT}.log]"
fi
if $FRONTEND_OK; then
    echo "  Frontend: http://localhost:$FRONTEND_PORT  [running]"
else
    echo "  Frontend: http://localhost:$FRONTEND_PORT  [starting... check /tmp/worktree-frontend-${FRONTEND_PORT}.log]"
fi
echo "  Logs:     /tmp/worktree-backend-${BACKEND_PORT}.log"
echo "            /tmp/worktree-frontend-${FRONTEND_PORT}.log"
echo "=============================="
