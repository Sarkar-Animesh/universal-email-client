import { describe, expect, it } from "vitest";
import { sanitizeMailHtml } from "@/lib/sanitize";

describe("sanitizeMailHtml", () => {
  it("strips script tags from email content", () => {
    const out = sanitizeMailHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).toMatch(/<p>hi<\/p>/i);
  });

  it("strips inline event handlers", () => {
    const out = sanitizeMailHtml('<a href="#" onclick="x()">click</a>');
    expect(out).not.toMatch(/onclick/i);
  });

  it("blocks remote images by default", () => {
    const out = sanitizeMailHtml('<img src="https://tracker.example.com/pixel.gif">');
    expect(out).not.toMatch(/tracker\.example\.com/);
    expect(out).toMatch(/data-blocked="remote-image"/);
  });

  it("allows remote images when opted in", () => {
    const out = sanitizeMailHtml(
      '<img src="https://example.com/pic.png">',
      { loadRemoteImages: true },
    );
    expect(out).toMatch(/https:\/\/example\.com\/pic\.png/);
  });

  it("preserves cid: image references for inline attachments", () => {
    const out = sanitizeMailHtml('<img src="cid:logo@example.com">');
    expect(out).toMatch(/cid:logo@example\.com/);
  });
});
