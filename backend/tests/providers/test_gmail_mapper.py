"""Unit tests for the Gmail → UnifiedMessage / UnifiedThread mappers.

These are pure-function tests that don't touch the network. They guard the
provider-parity contract: the mapper output must match the unified schema
exactly, including labels, flags, and threading headers.
"""
from __future__ import annotations

from app.providers.gmail import (
    _message_to_unified,
    _normalize_label,
    _thread_full_to_unified,
)


def test_normalize_label_strips_category_prefix():
    assert _normalize_label("CATEGORY_PROMOTIONS") == "promotions"
    assert _normalize_label("INBOX") == "inbox"
    assert _normalize_label("UNREAD") == "unread"


def test_message_mapper_unread_important_flags(gmail_thread_full):
    raw = gmail_thread_full["messages"][0]
    msg = _message_to_unified(raw, account_id="acc1")
    assert msg.flags.unread is True
    assert msg.flags.important is True
    assert msg.flags.starred is False


def test_message_mapper_extracts_addresses_and_subject(gmail_thread_full):
    raw = gmail_thread_full["messages"][0]
    msg = _message_to_unified(raw, account_id="acc1")
    assert msg.from_.address == "sarah@example.com"
    assert msg.from_.name == "Sarah Lee"
    assert msg.subject == "Q3 launch sync"
    assert any(a.address == "user@example.com" for a in msg.to)


def test_message_mapper_decodes_bodies(gmail_thread_full):
    raw = gmail_thread_full["messages"][0]
    msg = _message_to_unified(raw, account_id="acc1")
    assert msg.body_text is not None
    assert "Q3 launch" in msg.body_text
    assert msg.body_html is not None
    assert "<p>" in msg.body_html.lower()


def test_message_mapper_threading_headers(gmail_thread_full):
    raw = gmail_thread_full["messages"][1]
    msg = _message_to_unified(raw, account_id="acc1")
    assert msg.in_reply_to == "<msg1@example.com>"
    assert msg.references == ["<msg1@example.com>"]


def test_thread_mapper_rolls_up_flags(gmail_thread_full):
    detail = _thread_full_to_unified(gmail_thread_full)
    assert detail.thread.message_count == 2
    assert detail.thread.flags.has_unread is True
    # subject from first message is preferred for the thread summary
    assert detail.thread.subject == "Q3 launch sync"
    # participants include both sender and recipient
    addresses = {p.address for p in detail.thread.participants}
    assert "sarah@example.com" in addresses
    assert "user@example.com" in addresses
