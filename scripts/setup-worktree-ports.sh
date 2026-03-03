#!/bin/bash
# setup-worktree-ports.sh
# Detects if running in a worktree and configures offset ports.
# Main repo: backend :8000, frontend :3000
# Worktree:  backend :8001, frontend :3001

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Detect if in a worktree by checking the path
if [[ "$PROJECT_ROOT" == *".claude/worktrees"* ]]; then
    BACKEND_PORT=8001
    FRONTEND_PORT=3001
    echo "Worktree detected. Using ports: backend=$BACKEND_PORT, frontend=$FRONTEND_PORT"
else
    BACKEND_PORT=8000
    FRONTEND_PORT=3000
    echo "Main repo. Using ports: backend=$BACKEND_PORT, frontend=$FRONTEND_PORT"
fi

# Update frontend/.env.local with correct API URL
ENV_FILE="$PROJECT_ROOT/frontend/.env.local"
if [ -f "$ENV_FILE" ]; then
    # Replace NEXT_PUBLIC_API_URL line
    if grep -q "NEXT_PUBLIC_API_URL" "$ENV_FILE"; then
        sed -i '' "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api|" "$ENV_FILE"
    fi
    echo "Updated $ENV_FILE -> NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api"
else
    echo "Warning: $ENV_FILE not found. Creating from main repo..."
    # Copy from main repo if available
    MAIN_ENV="$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/worktree //')/frontend/.env.local"
    if [ -f "$MAIN_ENV" ]; then
        cp "$MAIN_ENV" "$ENV_FILE"
        sed -i '' "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}/api|" "$ENV_FILE"
        echo "Copied and updated from main repo."
    else
        echo "Error: Cannot find .env.local template."
        exit 1
    fi
fi

# Export for use in other scripts
export BACKEND_PORT
export FRONTEND_PORT

echo ""
echo "To start servers:"
echo "  Backend:  cd $PROJECT_ROOT/backend && uvicorn app.main:app --reload --port $BACKEND_PORT"
echo "  Frontend: cd $PROJECT_ROOT/frontend && npm run dev -- -p $FRONTEND_PORT"
