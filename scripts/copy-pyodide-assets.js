// Copies the Pyodide runtime (WASM interpreter + stdlib) from node_modules
// into public/pyodide/ so it can be served as a static asset and loaded from
// a Web Worker at runtime. Runs automatically via the "postinstall" script.
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "node_modules", "pyodide");
const DEST_DIR = path.join(__dirname, "..", "public", "pyodide");

const FILES = [
  "pyodide.mjs",
  "pyodide.mjs.map",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
];

if (!fs.existsSync(SRC_DIR)) {
  console.warn("[copy-pyodide-assets] node_modules/pyodide not found, skipping");
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

for (const file of FILES) {
  const src = path.join(SRC_DIR, file);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-pyodide-assets] missing ${file}, skipping`);
    continue;
  }
  fs.copyFileSync(src, path.join(DEST_DIR, file));
}

console.log(`[copy-pyodide-assets] copied Pyodide assets to ${DEST_DIR}`);
