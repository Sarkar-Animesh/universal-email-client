---
name: email-mime
description: Use when constructing or parsing RFC 5322 / RFC 2045 email messages — building a reply with proper In-Reply-To and References headers, walking a multipart MIME tree to extract text/plain and text/html bodies, base64url-encoding for the Gmail send API, or quoting prior content properly. Skip for plain JSON shuffling that doesn't touch MIME.
---

# Email MIME Skill

The everyday gotchas you'll otherwise re-learn the hard way.

## Building a reply
A correct reply needs:
- `In-Reply-To: <message-id-of-the-message-you're-replying-to>`
- `References: <ref1> <ref2> ... <message-id-replied-to>` — append, don't replace.
  Take the original's `References` (if any), append its `Message-ID`.
- `Subject: Re: ...` — prefix `Re: ` if not already present (case-insensitive,
  no double-prefixing).
- `From:` matching the account's verified address.
- `To:` = original `Reply-To` if set, else original `From`.

## Building a forward
- `Subject: Fwd: ...`.
- Body: human-readable header block ("---------- Forwarded message ----------"
  with From/Date/Subject/To) then the original body.
- Attach original attachments (re-encode, don't trust the wire encoding).

## Walking a Gmail payload
```python
def walk_parts(part):
    if part.get("parts"):
        for p in part["parts"]:
            yield from walk_parts(p)
    else:
        yield part
```
Pick the highest-fidelity body: prefer `text/html` over `text/plain` if both
present. Watch `multipart/alternative` (pick one) vs `multipart/mixed` (concat
text parts).

## Base64url for Gmail send
```python
import base64
raw = email_message.as_bytes()
encoded = base64.urlsafe_b64encode(raw).decode().rstrip("=")
```
Note the `urlsafe` variant and the stripped `=` padding — Gmail requires both.

## Common bugs you should be paranoid about
- Forgetting `quoted-printable` decode on `text/plain` parts — you'll see `=20`
  in bodies.
- Charset: trust the part's `charset` parameter, fall back to UTF-8, then
  Latin-1. Never assume.
- Threading by subject is wrong. Always use `In-Reply-To` / `References`.
- Inline images (`Content-ID`) — the body HTML references `cid:...`. Replace
  with a data URL or a same-origin proxy URL at render time, after sanitization.
- Display name vs address: `"Foo Bar" <foo@bar.com>` — parse with
  `email.utils.parseaddr`, don't regex.
