DONE

## Gates
- `bun run check` attempted: red because package.json has no `check` script (`Script not found "check"`); classified as tooling/baseline issue, not implementation failure.
- Focused affected suite: PASS, 48 pass / 0 fail.
- `npm run typecheck`: PASS, exit 0.
- `npm run smoke:tui-fullscreen`: PASS, `tui-fullscreen-frame-smoke ok`.
- `npm run build`: PASS, `[atomic-build] dist/ swapped successfully`.
- `npm test`: red with 10 unrelated baseline failures outside touched files/acceptance; see devlog/_plan/260614_interactive_mode_full_port/336_cycle45_5_check_synthesis.md.

## Acceptance
- Default mouse reporting off by omission of chat default and helper-gated startup: met.
- SGR parsing cannot re-enable mouse by default: met.
- Opt-in app wheel mode preserved: met via source contract and frame DECSET assertion.
- Tests aligned: met in affected suite.
- Build artifact updated: met.

## Residual risk
Manual Ghostty native drag selection/scrollback behavior remains a human terminal-emulator check; source tests verify the required precondition that default mode does not request mouse reporting.
