/**
 * Sanitize email HTML for safe rendering inside a sandboxed iframe.
 *
 * The iframe is `sandbox="allow-scripts"` (but NOT allow-same-origin), so:
 *   - DOMPurify strips all `<script>`, inline handlers, and `<style>` from
 *     the email itself — no email-supplied JS or CSS ever runs.
 *   - The only script that runs is our own appended FIT_SCRIPT, which the
 *     iframe sees as same-document and the parent can't be reached from.
 *   - With no same-origin, that script can't read cookies, localStorage,
 *     or the parent window — fail-shut even if our sanitizer were bypassed.
 *
 * External <img src> is rewritten to a blocked placeholder by default so we
 * don't leak read receipts to senders the user hasn't trusted.
 */

import DOMPurify from "dompurify";

export type SanitizeOptions = {
  /** Whether to load remote images. Default false (privacy). */
  loadRemoteImages?: boolean;
};

// Base typography + safety. We deliberately let the email render at its
// natural width (no `max-width: 100vw` clamps) — the FIT_SCRIPT below
// measures the rendered scrollWidth and applies a transform: scale() to
// shrink the document to fit. That's the only approach that works for
// arbitrarily nested marketing tables; CSS alone can't beat them.
const VIEWPORT_CSS = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a1a;
    background: #fff;
  }
  body {
    padding: 12px !important;
    box-sizing: border-box !important;
  }
  img, video, picture {
    max-width: 100%;
    height: auto;
  }
  /* No nowrap — Yahoo and Mailchimp set this on hero copy, which is the
   * single biggest cause of horizontal overflow we still see after scaling. */
  * { white-space: normal !important; }
  pre, code { white-space: pre-wrap !important; word-break: break-word; }
  td, th, div, p, span, h1, h2, h3, h4, h5, h6, li, a {
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  a { color: #1d4ed8; }
`;

// Runs inside the sandboxed iframe. The email's own scripts were stripped
// by DOMPurify before this template was assembled, so this is the only JS
// that executes. Sandbox lacks allow-same-origin, so even this script can
// only see the iframe's own document — no cookies, no parent window.
//
// Strategy: let the email render at its natural width, measure that width,
// then transform: scale() the body down so the rendered width fits the
// iframe's inner width. Re-fits on resize and on image load (images change
// scrollWidth after they finish loading).
const FIT_SCRIPT = `
(function () {
  function fit() {
    var body = document.body;
    if (!body) return;
    body.style.transformOrigin = 'top left';
    body.style.transform = 'none';
    body.style.width = 'auto';
    var viewport = document.documentElement.clientWidth;
    var natural = Math.max(body.scrollWidth, body.offsetWidth);
    if (natural > viewport && natural > 0) {
      var scale = viewport / natural;
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (viewport / scale) + 'px';
      document.documentElement.style.height = (body.scrollHeight * scale) + 'px';
    } else {
      document.documentElement.style.height = '';
    }
  }
  window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  // Re-fit as images come in — they grow the layout after first paint.
  document.addEventListener('load', function (e) {
    if (e.target && e.target.tagName === 'IMG') fit();
  }, true);
  setTimeout(fit, 0);
  setTimeout(fit, 250);
})();
`;

export function sanitizeMailHtml(html: string, opts: SanitizeOptions = {}): string {
  const config: Parameters<typeof DOMPurify.sanitize>[1] = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "srcset"],
    ALLOW_DATA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
  };
  let clean = DOMPurify.sanitize(html, config) as string;
  if (!opts.loadRemoteImages) {
    clean = clean.replace(
      /<img\b([^>]*?)\bsrc\s*=\s*(["'])(?!cid:|data:)[^"']+\2/gi,
      '<img$1 src="" data-blocked="remote-image" alt="[remote image blocked]"',
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${VIEWPORT_CSS}</style></head><body>${clean}<script>${FIT_SCRIPT}</script></body></html>`;
}
