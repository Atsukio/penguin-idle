#!/usr/bin/env node
/* Refactor guard for CI: every `refactor` commit must leave every function's behaviour unchanged.
 *
 *   node tools/refactor-guard.js <base> <head>    check refactor commits in base..head
 *   node tools/refactor-guard.js                  check just the last commit
 *
 * For each commit whose subject starts with "refactor" (Conventional Commits), runs
 * tools/compare-functions.js between that commit's parent and the commit. Other commit types
 * (feat, fix, ...) are expected to change behaviour and are skipped. Exits 1 if any refactor
 * commit changed a function, naming the commit and the functions.
 */
"use strict";
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const git = argv => execFileSync("git", argv, { cwd: ROOT, encoding: "utf8" }).trim();
const exists = ref => { try { git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]); return true; } catch (e) { return false; } };

let [base, head = "HEAD"] = process.argv.slice(2);
// A new branch's first push has no "before" commit (all zeros); fall back to the last commit
if (!base || /^0+$/.test(base) || !exists(base)) base = `${head}~1`;
if (!exists(base)) { console.log("refactor-guard: no parent commit to compare against; skipping."); process.exit(0); }

const commits = git(["rev-list", "--reverse", "--no-merges", `${base}..${head}`]).split("\n").filter(Boolean);
let failed = 0, checked = 0;
for (const sha of commits) {
  const subject = git(["log", "-1", "--format=%s", sha]);
  if (!/^refactor(\(|:|!)/.test(subject)) continue;
  checked++;
  const parent = `${sha}^`;
  if (!exists(parent)) continue;
  const res = spawnSync(process.execPath, [path.join(__dirname, "compare-functions.js"), parent, "--to", sha], { cwd: ROOT, encoding: "utf8" });
  const short = sha.slice(0, 7);
  if (res.status === 0) { console.log(`ok   ${short} ${subject}`); continue; }
  failed++;
  console.log(`FAIL ${short} ${subject}\n${(res.stdout + res.stderr).trim().replace(/^/gm, "     ")}`);
}

if (!checked) console.log(`refactor-guard: no refactor commits in ${commits.length} commit(s).`);
if (failed) {
  console.log(`\n${failed} refactor commit(s) changed behaviour. Move code without rewriting it, or use feat/fix if the change is intended.`);
  process.exit(1);
}
