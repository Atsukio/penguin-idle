/* Loads the game's data and engine into Node (no DOM), for the simulator and engine tests.
 * The script list comes from index.html (data.js plus every engine script, in page order),
 * so moving or splitting engine files never needs an edit here. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const ENGINE_FILES = [...html.matchAll(/<script src="([^"]+)"/g)]
  .map(m => m[1])
  .filter(src => /^src\/(data\.js|engine[\/-]|engine\.js)/.test(src));

if (!ENGINE_FILES.some(f => /engine/.test(f))) throw new Error("load-engine: no engine scripts found in index.html");

globalThis.PI = globalThis.PI || {};
for (const f of ENGINE_FILES) require(path.join(ROOT, f));

module.exports = globalThis.PI;
