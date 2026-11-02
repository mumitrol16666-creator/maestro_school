#!/usr/bin/env node
// В-10: no visible text under 12 px on the student's screens.
// Walks the import graph from the student's entry points — src/app/(portal)/**, src/app/login|register|trial-lesson/**
// and the root src/app/*.tsx — and fails when a reached file has text-[Npx] with N < 12 or text-[x rem] under 0.75rem.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const appDir = path.join(src, "app");
const MIN_PX = 12;
const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const extension of EXTENSIONS) {
    if (fs.existsSync(base + extension)) return base + extension;
  }
  return null;
}

function walk(directory, found = []) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isDirectory()) walk(file, found);
    else if (/\.tsx?$/.test(name)) found.push(file);
  }
  return found;
}

const entries = walk(appDir).filter((file) => {
  const relative = path.relative(appDir, file);
  return relative.startsWith("(portal)")
    || relative.startsWith(`login${path.sep}`)
    || relative.startsWith(`register${path.sep}`)
    || relative.startsWith(`trial-lesson${path.sep}`)
    || !relative.includes(path.sep);
});

const seen = new Set();
const queue = [...entries];
const importPattern = /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importPattern)) {
    const target = resolveImport(file, match[1] || match[2]);
    if (target && /\.tsx?$/.test(target)) queue.push(target);
  }
}

const sizePattern = /text-\[\s*(\d+(?:\.\d+)?)(px|rem)\s*\]/g;
const problems = [];
for (const file of [...seen].sort()) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(sizePattern)) {
      const px = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
      if (px < MIN_PX) problems.push(`${path.relative(root, file)}:${index + 1}  ${match[0]}`);
    }
  });
}

if (problems.length) {
  console.error(`Text under ${MIN_PX} px on the student's screens (use text-xs):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`${problems.length} place(s) in ${new Set(problems.map((p) => p.split(":")[0])).size} file(s).`);
  process.exit(1);
}
console.log(`Text size check: ${seen.size} files reached from the student's screens, nothing under ${MIN_PX} px.`);
