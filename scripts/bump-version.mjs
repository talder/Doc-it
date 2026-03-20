#!/usr/bin/env node
/**
 * bump-version.mjs
 *
 * Increments the patch component of the version in package.json.
 * Patch is kept as a zero-padded 2-digit number (00–99).
 * When patch would exceed 99, minor is incremented and patch resets to 00.
 *
 * Examples:
 *   0.1.00 → 0.1.01
 *   0.1.99 → 0.2.00
 *   1.9.99 → 1.10.00
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const current = pkg.version ?? "0.1.00";

// Parse – tolerate both "0.1.0" and "0.1.00"
const parts = current.split(".");
if (parts.length !== 3) {
  console.error(`bump-version: unexpected version format "${current}", skipping.`);
  process.exit(0);
}

let major = parseInt(parts[0], 10);
let minor = parseInt(parts[1], 10);
let patch = parseInt(parts[2], 10);

patch += 1;
if (patch > 99) {
  patch = 0;
  minor += 1;
}

const next = `${major}.${minor}.${String(patch).padStart(2, "0")}`;
pkg.version = next;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`bumped version ${current} → ${next}`);
