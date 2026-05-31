import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export function findRepoRoot(start = process.cwd()) {
  let current = start;
  while (current !== dirname(current)) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  throw new Error('Cannot find pnpm-workspace.yaml. Please run ccs inside the monorepo.');
}

export function writeTextFile(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

export function replaceAll(value: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce((next, [key, replacement]) => next.split(key).join(replacement), value);
}

export function copyTemplate(templateDir: string, targetDir: string, replacements: Record<string, string>) {
  if (!existsSync(templateDir)) throw new Error(`Template not found: ${templateDir}`);
  const visit = (from: string, to: string) => {
    for (const entry of readdirSync(from)) {
      const source = join(from, entry);
      const targetName = replaceAll(entry, replacements).replace(/\.tpl$/, '');
      const target = join(to, targetName);
      if (statSync(source).isDirectory()) {
        mkdirSync(target, { recursive: true });
        visit(source, target);
      } else {
        writeTextFile(target, replaceAll(readFileSync(source, 'utf8'), replacements));
      }
    }
  };
  visit(templateDir, targetDir);
}

export function insertBeforeMarker(file: string, marker: string, code: string) {
  const current = readFileSync(file, 'utf8');
  if (current.includes(code.trim())) return false;
  if (!current.includes(marker)) throw new Error(`Marker ${marker} not found in ${file}`);
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markerLine = current.match(new RegExp(`^[ \\t]*${escaped}`, 'm'))?.[0] ?? marker;
  writeTextFile(file, current.replace(markerLine, `${code}\n${markerLine}`));
  return true;
}

export function displayPath(path: string, root: string) {
  return relative(root, path).replace(/\\/g, '/');
}
