from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def gmail_thread_full() -> dict[str, Any]:
    """A small recorded Gmail thread for mapper tests. Sanitized."""
    return json.loads((FIXTURES / "gmail_thread_full.json").read_text("utf-8"))
