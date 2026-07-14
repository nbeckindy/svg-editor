#!/usr/bin/env node
/**
 * Architecture guard checks for canvas tool anti-patterns.
 * Run: npm run lint:arch
 *
 * @see .cursor/rules/canvas-tools-ports.mdc (Enforcement)
 * @see plans/ARCHITECTURE.md
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'src/app/tools');
const CANVAS_COMPONENT = join(ROOT, 'src/app/components/svg-canvas/svg-canvas.component.ts');

/** Baseline from DEBT-001 refactor (2026-07-11). Fail only when NEW branches are added. */
const TOOL_BRANCH_BASELINE = 6;

const CANVAS_COMPONENT_IMPORT =
  /(?:import\s+.*\s+from\s+|export\s+.*\s+from\s+)['"][^'"]*svg-canvas\.component[^'"]*['"]/;
const TOOL_BRANCH_PATTERN = /getCurrentTool\(\) === '|tool === '/;

function walkTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkTsFiles(full));
      continue;
    }
    if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function checkToolsNoCanvasComponentImport() {
  const violations = [];
  for (const file of walkTsFiles(TOOLS_DIR)) {
    const content = readFileSync(file, 'utf8');
    if (CANVAS_COMPONENT_IMPORT.test(content)) {
      violations.push(relative(ROOT, file));
    }
  }
  return violations;
}

function countToolBranches() {
  const content = readFileSync(CANVAS_COMPONENT, 'utf8');
  return content.split('\n').filter((line) => TOOL_BRANCH_PATTERN.test(line)).length;
}

function fail(message) {
  console.error(`architecture-guard: ${message}`);
  process.exitCode = 1;
}

const importViolations = checkToolsNoCanvasComponentImport();
if (importViolations.length > 0) {
  fail(
    `src/app/tools must not import svg-canvas.component:\n  - ${importViolations.join('\n  - ')}`,
  );
}

const branchCount = countToolBranches();
if (branchCount > TOOL_BRANCH_BASELINE) {
  fail(
    `svg-canvas.component.ts has ${branchCount} tool-literal branches (baseline ${TOOL_BRANCH_BASELINE}). ` +
      'Register a CanvasTool adapter instead of adding getCurrentTool() === or tool === branches.',
  );
}

if (process.exitCode !== 1) {
  console.log(
    `architecture-guards: ok (tools import check, ${branchCount}/${TOOL_BRANCH_BASELINE} tool branches)`,
  );
}
