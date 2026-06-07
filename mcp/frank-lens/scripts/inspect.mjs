#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
const distIndex = path.join(packageDir, "dist", "index.js");
const assetDir = path.join(packageDir, "assets");

console.log(JSON.stringify({
  name: packageJson.name,
  version: packageJson.version,
  bin: packageJson.bin,
  files: packageJson.files,
  distIndexExists: fs.existsSync(distIndex),
  assetsDirExists: fs.existsSync(assetDir),
}, null, 2));
