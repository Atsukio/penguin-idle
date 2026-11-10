#!/usr/bin/env node
/* Refactor guard: checks that moving code between files didn't change what any function does.
 *
 *   node tools/compare-functions.js                    compare src/ on disk against the last commit (HEAD)
 *   node tools/compare-functions.js main~3             compare src/ on disk against any git ref
 *   node tools/compare-functions.js abc^ --to abc      compare two commits (used by tools/refactor-guard.js)
 *   node tools/compare-functions.js HEAD --show name   print the old and new body of one function
 *
 * Every named `function` in src/ at the ref is matched by name to src/ now. Comments, whitespace and
 * accessor style are ignored (S() vs S, E() vs E, PI.engine vs E, PI.data vs D, trailing commas),
 * so a faithful move between files reports nothing. Exits 1 if any function changed or went missing.
 * A real behaviour change (feat/fix) will show up here too: that's expected, just check it's the one you meant.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : null; };
const toRef = flag("to");        // null = the files on disk
const only = flag("show");
const ref = args[0] || "HEAD";

const norm = s => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1")
  .replace(/\bS\(\)/g, "S").replace(/\bE\(\)/g, "E").replace(/\bM\(\)/g, "M").replace(/\bD\(\)/g, "D")
  .replace(/\bPI\.engine\b/g, "E").replace(/\bPI\.data\b/g, "D")
  .replace(/\s+/g, "").replace(/;}/g, "}").replace(/,([}\]])/g, "$1");

// Named function declarations and their bodies (brace-matched)
function functions(src) {
  const out = {};
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let p = m.index + m[0].length - 1, depth = 0;
    for (; p < src.length; p++) { if (src[p] === "(") depth++; else if (src[p] === ")") { depth--; if (!depth) break; } }
    const start = src.indexOf("{", p);
    let end = start;
    depth = 0;
    for (; end < src.length; end++) { if (src[end] === "{") depth++; else if (src[end] === "}") { depth--; if (!depth) break; } }
    (out[m[1]] = out[m[1]] || []).push(src.slice(start, end + 1));
  }
  return out;
}

function collect(files, read) {
  const all = {};
  for (const f of files) {
    const fns = functions(read(f));
    for (const name in fns) (all[name] = all[name] || []).push(...fns[name].map(raw => ({ file: f, raw, key: norm(raw) })));
  }
  return all;
}

const git = argv => execFileSync("git", argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const filesAt = r => git(["ls-tree", "-r", "--name-only", r, "src"]).split("\n").filter(f => f.endsWith(".js"));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const diskFiles = () => walk(path.join(ROOT, "src")).filter(f => f.endsWith(".js")).map(f => path.relative(ROOT, f).split(path.sep).join("/"));
const newLabel = toRef || "now";

const before = collect(filesAt(ref), f => git(["show", `${ref}:${f}`]));
const after = toRef
  ? collect(filesAt(toRef), f => git(["show", `${toRef}:${f}`]))
  : collect(diskFiles(), f => fs.readFileSync(path.join(ROOT, f), "utf8"));

const problems = [];
for (const name of Object.keys(before).sort()) {
  if (!after[name]) { problems.push(`${name.padEnd(24)} MISSING (was in ${before[name][0].file})`); continue; }
  const now = new Set(after[name].map(x => x.key));
  if (before[name].some(x => now.has(x.key))) continue;
  problems.push(`${name.padEnd(24)} changed: ${before[name][0].file} -> ${after[name][0].file}`);
  if (only === name) console.log(`=== ${ref}: ${before[name][0].file}\n${before[name][0].raw}\n=== ${newLabel}: ${after[name][0].file}\n${after[name][0].raw}\n`);
}

if (only) process.exit(0);
const total = Object.keys(before).length;
const against = toRef ? `${ref} -> ${toRef}` : ref;
if (problems.length) {
  console.log(`${problems.length} of ${total} functions differ (${against}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`All ${total} functions match (${against}), ignoring comments, whitespace and accessor style.`);
