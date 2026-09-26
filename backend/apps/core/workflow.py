"""
Shared state-machine helpers. Every module keeps its own transition table;
these functions apply it the same way everywhere and turn refusals into
consistent API errors.
"""
from rest_framework.exceptions import ValidationError

from .exceptions import ConflictError


class WorkflowError(Exception):
    """A business rule refused the action. `conflict` = the record's state doesn't allow it."""

    def __init__(self, message: str, *, field: str | None = None, conflict: bool = False):
        super().__init__(message)
        self.message = message
        self.field = field
        self.conflict = conflict


def check_transition(current: str, target: str, *, transitions: dict, choices, action_only: dict | None = None,
                     via_action: str | None = None, subject: str = "This record"):
    labels = dict(choices.choices)
    if target not in labels:
        raise WorkflowError(f"Unknown status “{target}”.", field="status")
    if target not in transitions.get(current, set()):
        raise WorkflowError(
            f"Cannot move {subject} from {labels.get(current, current)} to {labels[target]}.", conflict=True
        )
    required = (action_only or {}).get(target)
    if required and via_action != required:
        raise WorkflowError(f"{labels[target]} is set with the “{required}” action.", field="status")


def allowed_next(current: str, *, transitions: dict, choices, action_only: dict | None = None) -> list[dict]:
    """Statuses reachable with a plain status change, for the UI."""
    labels = dict(choices.choices)
    return [
        {"value": str(s), "label": labels[s]}
        for s in sorted(transitions.get(current, set()))
        if s not in (action_only or {})
    ]


def run(fn, *args, **kwargs):
    """Call a workflow service, turning business-rule refusals into API errors (409 / 400)."""
    try:
        return fn(*args, **kwargs)
    except WorkflowError as exc:
        if exc.conflict:
            raise ConflictError(exc.message) from exc
        raise ValidationError({exc.field or "non_field_errors": [exc.message]}) from exc
