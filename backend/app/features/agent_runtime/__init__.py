"""Shared agent runtime primitives.

This module is the migration point from feature-local ADK runners toward a
user-scoped agent runtime. It intentionally starts small: durable session
interfaces, context assembly, and run metadata that existing feature agents can
adopt without changing their public API.
"""

from app.features.agent_runtime.context import (
    AssembledContext,
    BudgetPlan,
    ContextAssemblyRequest,
    DefaultContextEngine,
    default_budget_plan,
)
from app.features.agent_runtime.models import (
    AgentRunRequest,
    AgentRuntimeTurn,
    RuntimeEvent,
    SessionSnapshot,
    TranscriptEntry,
)
from app.features.agent_runtime.runtime import AgentRuntimeService
from app.features.agent_runtime.session_store import (
    AgentSessionsSessionStore,
    HybridSessionStore,
    InMemorySessionStore,
    PickerConversationSessionStore,
)

__all__ = [
    "AgentRunRequest",
    "AgentRuntimeService",
    "AgentRuntimeTurn",
    "AgentSessionsSessionStore",
    "AssembledContext",
    "BudgetPlan",
    "ContextAssemblyRequest",
    "DefaultContextEngine",
    "HybridSessionStore",
    "InMemorySessionStore",
    "PickerConversationSessionStore",
    "RuntimeEvent",
    "SessionSnapshot",
    "TranscriptEntry",
    "default_budget_plan",
]
