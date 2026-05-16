"""HMAC state parameter round-trip + tampering detection."""
from __future__ import annotations

import pytest

from app.core.security import StateError, make_state, verify_state


KEY = "test-signing-key-must-be-long-enough-for-hmac"


def test_state_round_trip():
    s = make_state("gmail", KEY)
    payload = verify_state(s, KEY)
    assert payload["p"] == "gmail"


def test_state_tampered_signature_rejected():
    s = make_state("gmail", KEY)
    tampered = s[:-2] + "AB"
    with pytest.raises(StateError):
        verify_state(tampered, KEY)


def test_state_wrong_key_rejected():
    s = make_state("gmail", KEY)
    with pytest.raises(StateError):
        verify_state(s, "different-key-different-length-completely")


def test_state_stale_rejected(monkeypatch):
    import time as t

    # Make a state, then jump 10 minutes into the future.
    s = make_state("gmail", KEY, ttl_s=60)
    real = t.time()
    monkeypatch.setattr(t, "time", lambda: real + 1000)
    try:
        with pytest.raises(StateError):
            verify_state(s, KEY)
    finally:
        monkeypatch.setattr(t, "time", real)


def test_state_provider_in_payload_is_preserved():
    s = make_state("microsoft", KEY)
    payload = verify_state(s, KEY)
    assert payload["p"] == "microsoft"
