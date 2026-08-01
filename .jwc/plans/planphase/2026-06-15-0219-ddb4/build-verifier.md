DONE

## Plan contract
- Default native/copy-friendly fullscreen; app mouse only when `tui.mouseTracking === true`.
- Chat must not seed `mouseTracking: true`; fullscreen must gate startup, SGR parse, and `handleMouseEvent` on the same opt-in predicate.

## Implementation evidence
1. `bin/commands/tui/fullscreen-mode.ts:204-206`: `isMouseTrackingEnabled` returns `ctx.tuiConfig['mouseTracking'] === true` only.
2. `bin/commands/tui/fullscreen-mode.ts:479-481`: `screen.enter()` then `if (isMouseTrackingEnabled(ctx)) screen.enableMouse();`.
3. `bin/commands/tui/fullscreen-mode.ts:506-508`: `const mouseTrackingEnabled = isMouseTrackingEnabled(ctx);` then `if (mouseTrackingEnabled && isMouseSequence(incoming))` before `parseSgrMouse`.
4. `bin/commands/tui/fullscreen-mode.ts:214-216`: `handleMouseEvent` accepts `mouseTrackingEnabled` and returns false when disabled; call site passes it.
5. `src/cli/tui/render/frame.ts:363-365`: `enableMouse()` writes `\x1b[?1000h\x1b[?1006h`; asserted in `tests/unit/tui-copy-friendly-mouse.test.ts`.
6. `bin/commands/chat.ts:107`: default `tuiConfig` omits `mouseTracking`; `tests/unit/tui-chat-launch-scope.test.ts` asserts no `mouseTracking: true`.
7. `tests/unit/tui-chat-launch-scope.test.ts` aligns launch startup with helper-gated startup.

## Parent verification
- Focused unit suite passed: 48 pass / 0 fail.
- `npm run typecheck` exited 0.
- `npm run smoke:tui-fullscreen` printed `tui-fullscreen-frame-smoke ok`.
- `npm run build` completed `[atomic-build] dist/ swapped successfully`.
- Dist search found helper gate and no chat default `mouseTracking: true`.

## Result
DONE
