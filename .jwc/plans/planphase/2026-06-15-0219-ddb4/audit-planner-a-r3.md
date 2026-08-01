PASS

a-r2 finding disposition (revision a-r3 plan only):
- DECSET assertion file ownership (PLANNER-A1): resolved — §5 mandates `frameSource` from `src/cli/tui/render/frame.ts` and `assert.match(frameSource, /process\.stdout\.write\('\\x1b\[\?1000h\\x1b\[\?1006h'\)/)`; startup/parser asserts stay on `source` (`fullscreen-mode.ts`) at lines 245-263.
- Single `mouseTrackingEnabled` declaration (PLANNER-A5): resolved — §163 plus §3 lines 185-195 state the call-site reuses §2’s declaration and must not add a second `const mouseTrackingEnabled`; §3 diff only gates `isMouseSequence` / `handleMouseEvent` args.
- Launch-scope startup helper assertion (PLANNER-A2/ARCH-A2): resolved — §5.5 lines 281-285 require updating the embedded startup expectation and `assert.match(fullscreenSource, /if \(isMouseTrackingEnabled\(ctx\)\) screen\.enableMouse\(\)/)` alongside the chat default `doesNotMatch`.

Most likely misread: §5 and §5.5 both assert `if (isMouseTrackingEnabled(ctx)) screen.enableMouse()` on fullscreen source — implementers may treat that as duplicate ownership and skip updating the launch-scope embedded snippet, relying only on `tui-copy-friendly-mouse.test.ts`.
