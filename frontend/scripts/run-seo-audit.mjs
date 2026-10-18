// Run the typed audit with the project's existing TypeScript compiler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const load = createRequire(import.meta.url);
load.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
load('./seo-audit.ts');
