#!/usr/bin/env node
/**
 * PostToolUse hook for Edit/Write tools.
 *
 * After a file is edited, this hook runs the matching formatter:
 *   - .py        -> ruff format (if available)
 *   - .ts/.tsx/.js/.jsx/.json/.md -> prettier (if available, via pnpm)
 *
 * Non-zero formatter exit codes are reported but not fatal: we don't want to
 * block tool flow on a missing formatter in a fresh checkout. The user can
 * always run formatters manually.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const ti = input.tool_input || {};
const file = ti.file_path;
if (!file || !fs.existsSync(file)) process.exit(0);

const ext = path.extname(file).toLowerCase();
const which = (cmd) => {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0;
};

let cmd = null;
let args = [];

if (ext === ".py") {
  if (which("ruff")) {
    cmd = "ruff";
    args = ["format", file];
  }
} else if ([".ts", ".tsx", ".js", ".jsx", ".json", ".md"].includes(ext)) {
  if (which("pnpm")) {
    cmd = "pnpm";
    args = ["exec", "prettier", "--write", file];
  }
}

if (cmd) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[post-edit-format] ${cmd} ${args.join(" ")} exited ${r.status} (non-fatal).`);
  }
}

process.exit(0);
