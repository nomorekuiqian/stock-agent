#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
const distIndex = path.join(packageDir, "dist", "index.js");
const assetDir = path.join(packageDir, "assets");
const failures = [];

if (packageJson.name !== "themarketbrew") {
  failures.push(`Unexpected package name: ${packageJson.name}`);
}
if (!packageJson.bin?.themarketbrew) {
  failures.push("themarketbrew bin is missing");
}
if (!fs.existsSync(distIndex)) {
  failures.push("dist/index.js is missing");
}
if (fs.existsSync(assetDir)) {
  failures.push("assets/ must not be included in the local adapter package");
}
if ((packageJson.files || []).some((entry) => entry.includes("assets"))) {
  failures.push("package.json files must not include assets");
}

console.log(JSON.stringify({
  name: packageJson.name,
  version: packageJson.version,
  bin: packageJson.bin,
  files: packageJson.files,
  distIndexExists: fs.existsSync(distIndex),
  assetsDirExists: fs.existsSync(assetDir),
}, null, 2));

if (failures.length) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
