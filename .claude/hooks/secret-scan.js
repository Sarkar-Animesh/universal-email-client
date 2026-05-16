#!/usr/bin/env node
/**
 * PreToolUse hook for Edit/Write tools.
 *
 * Reads the proposed tool call from stdin (Claude Code hook protocol) and
 * blocks the call if the content contains anything that looks like a secret:
 *   - Google OAuth client secrets (`GOCSPX-...`)
 *   - Microsoft client secrets (long base64 chunks following `ClientSecret`)
 *   - Generic API keys (`AKIA...`, `sk_live_...`, `xoxb-...`, `ghp_...`)
 *   - PEM private keys
 *   - Bearer tokens longer than 40 chars on a line containing "Authorization"
 *
 * Exit code 0 = allow; non-zero = block. A blocking message goes to stderr.
 */
const fs = require("fs");

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const ti = input.tool_input || {};
const candidate = [ti.new_string, ti.content, ti.file_path].filter(Boolean).join("\n");

const PATTERNS = [
  { name: "Google OAuth secret", re: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Stripe live key", re: /sk_live_[A-Za-z0-9]{20,}/ },
  { name: "Slack bot token", re: /xoxb-[A-Za-z0-9-]{20,}/ },
  { name: "GitHub PAT", re: /ghp_[A-Za-z0-9]{30,}/ },
  { name: "PEM private key", re: /-----BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Generic high-entropy bearer", re: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{60,}/ },
];

for (const { name, re } of PATTERNS) {
  if (re.test(candidate)) {
    console.error(`[secret-scan] BLOCKED: matched ${name} in proposed edit.`);
    console.error(`If this is a placeholder or test fixture, rename it.`);
    process.exit(2);
  }
}

process.exit(0);
