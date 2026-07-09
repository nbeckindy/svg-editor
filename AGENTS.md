# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

## Issue Tracking (beads)

```bash
bd ready                  # Find available work
bd show <id>              # View issue details
bd update <id> --claim    # Claim work atomically
bd close <id>             # Complete work
bd dolt push              # Push beads data to remote
bd remember               # Persist knowledge — do NOT use MEMORY.md files
```

**Rules:**
- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol

## Build & Test

```bash
npm test          # Vitest unit tests
npm run build     # Production build
```

## Architecture

Angular SVG editor with a **partially hexagonal** layout: narrow **ports**, **EditorCommand** undo/redo, **ToolRegistryService** + **CanvasTool** adapters, and registry-driven dock/tool strip UI.

| Doc | Purpose |
|-----|---------|
| [CONTEXT.md](CONTEXT.md) | Editor-runtime vocabulary (**Tool**, **Ports**, **Canvas adapter**, …) |
| [plans/ARCHITECTURE.md](plans/ARCHITECTURE.md) | Current seams, gravity wells, **adding a canvas tool** checklist |
| [plans/epics/hexagonal-architecture-extensibility.md](plans/epics/hexagonal-architecture-extensibility.md) | Phase 1–2 epic history and remaining gaps |

## Coding Conventions

These rules fire automatically when you edit matching files — read them for detail:

| Rule | What it governs |
|------|----------------|
| `.cursor/rules/canvas-tools-ports.mdc` | Adding a **CanvasTool** adapter, orchestrator + ports pattern |
| `.cursor/rules/editor-commands.mdc` | `EditorCommand` / `EditorHistoryService` for undo/redo mutations |
| `.cursor/rules/svg-js.mdc` | SVG mutations via svg.js — `SvgManipulationService.getSVGInstance()` |
| `.cursor/rules/angular-signals.mdc` | Signals over observables for component state |
| `.cursor/rules/angular-components.mdc` | Separate HTML/CSS files, no `standalone: true` |
| `.cursor/rules/angular-input-output.mdc` | `input()` / `output()` over `@Input` / `@Output` |
| `.cursor/rules/angular-view-child.mdc` | `viewChild()` / `viewChildren()` over `@ViewChild` |
| `.cursor/rules/angular-host-listener.mdc` | `host: {}` over `@HostListener` / `@HostBinding` |
| `.cursor/rules/vitest.mdc` | Test setup, mocking, fixture lifecycle |
| `.cursor/rules/jsdom-svg-compat.mdc` | SVG APIs that break in jsdom unit tests |
| `.cursor/rules/svg-overlay-components.mdc` | `svg:` prefix in Angular overlay component templates |
| `.cursor/rules/svg-groups.mdc` | User groups vs clip/mask carrier `<g>` elements |
| `.cursor/rules/creation-gestures.mdc` | Shape creation ghost previews, shift constraints |
| `.cursor/rules/playwright-testability.mdc` | `data-testid` and ARIA labels in HTML templates |
| `.cursor/rules/angular-mcp.mdc` | Use Angular MCP to look up current Angular APIs |

**Chrome → document mutations** go through `ChromeEditorApplyService` → `chrome-apply/*` slices.

## Non-Interactive Shell Commands

Shell aliases on many systems add `-i` (interactive) to `cp`, `mv`, and `rm`, causing agents to hang waiting for y/n input. Always use explicit flags:

```bash
cp -f source dest       # NOT: cp source dest
mv -f source dest       # NOT: mv source dest
rm -f file              # NOT: rm file
rm -rf directory        # NOT: rm -r directory
cp -rf source dest      # NOT: cp -r source dest
```

Other commands that may prompt: `scp` → `-o BatchMode=yes`, `ssh` → `-o BatchMode=yes`, `apt-get` → `-y`, `brew` → `HOMEBREW_NO_AUTO_UPDATE=1`.

## Session Completion

**Work is NOT complete until `git push` succeeds.**

1. File issues for remaining work
2. Run quality gates — `npm test`, `npm run build`
3. Close finished beads, update in-progress items
4. Push:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. Clean up stashes, prune remote branches
6. Hand off context for the next session

**Never** stop before pushing — that leaves work stranded locally. **Never** say "ready to push when you are" — push yourself.
