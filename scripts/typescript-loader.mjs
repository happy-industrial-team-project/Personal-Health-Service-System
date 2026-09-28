import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  let target;
  if (specifier.startsWith('@/')) target = path.resolve(specifier.slice(2));
  else if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
    target = fileURLToPath(new URL(specifier, context.parentURL));
  }
  if (target) {
    for (const suffix of ['', '.ts', '.tsx']) {
      if (existsSync(target + suffix)) return { url: pathToFileURL(target + suffix).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText };
  }
  return nextLoad(url, context);
}
