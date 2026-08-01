---
created: 2026-06-15
status: planning
tags: [podex, tui, fullscreen, jawcode-parity, mouse, scrollback]
---
# Cycle 45.5 — Jawcode Native Scrollback Mouse Contract

## Goal

Restore the jawcode interaction contract for podex fullscreen mode:

- Default fullscreen mode is terminal-native and copy-friendly.
- Native terminal scrollback and drag selection work without a config change.
- Application mouse reporting is opt-in only via `tui.mouseTracking: true`.
- Opt-in app mouse mode still supports wheel-driven transcript scrolling.

This corrects Cycle 45.4's regression where the default moved toward app-owned mouse wheel handling and away from jawcode's native scrollback/selection behavior.

## Root Cause

The current podex fullscreen contract is internally inconsistent:

1. `bin/commands/chat.ts` seeds `tuiConfig` with `mouseTracking: true`, so a user with no persisted setting enters fullscreen with app mouse capture enabled.
2. `bin/commands/tui/fullscreen-mode.ts` currently enables mouse reporting when `ctx.tuiConfig['mouseTracking'] === true`; because the chat default is `true`, default fullscreen sends DECSET mouse enable sequences.
3. The same fullscreen input path parses SGR mouse sequences unconditionally. If a leaked/stale `ESC[<...M` sequence is received while default native mode is intended, `handleMouseEvent()` can call `screen.enableMouse()` from wheel/press resume paths and silently re-enter app mouse capture.
4. `tests/unit/tui-fullscreen-source-contract.test.ts` still carries the Cycle 45.4 opt-out expectation (`!== false`) while `tests/unit/tui-copy-friendly-mouse.test.ts` already asserts the desired opt-in-only contract (`=== true`).

Net effect: the launched TUI can request mouse reporting by default, so the terminal gives drag/wheel input to podex instead of preserving native selection and scrollback behavior.

## Jawcode Comparison

Jawcode's practical contract is terminal-native by default:

- It renders into the normal terminal buffer rather than treating mouse input as mandatory application input.
- Users can drag-select transcript text using the terminal's native selection behavior.
- Terminal scrollback remains a first-class navigation path for committed transcript history.
- Application-level mouse handling is an explicit capability, not a default side effect of entering fullscreen.

podex already ports the major rendering-side pieces of that model: inline frame rendering, committed transcript rows, scrollback protection, and manual viewport reachability. The remaining mismatch is the input contract: fullscreen currently starts with app mouse capture enabled through default config and can re-enable it from parsed mouse input paths.

## Web Research

- Terminfo.dev documents DECSET 1006 SGR mouse mode as `ESC [ ? 1006 h`, enabled "in addition to a tracking mode like ?1000 or ?1003". It reports mouse events as `ESC [ < button ; col ; row M` for press and `ESC [ < button ; col ; row m` for release. This means `screen.enableMouse()`'s `\x1b[?1000h\x1b[?1006h` is not passive formatting; it explicitly asks the terminal to route mouse events to the app. Source: https://terminfo.dev/modes/decset-1006-sgr-mouse
- Ghostty's `mouse-reporting = false` docs say mouse events are not reported to terminal applications even if requested, allowing the mouse to remain available for selection and terminal UI interactions; `true` allows applications to request and receive mouse reporting. Source: https://ghostty.org/docs/config/reference#mouse-reporting
- Ghostty's `mouse-shift-capture = never` docs say Shift is never sent with the mouse protocol and cannot be overridden by the running program; it reserves Shift for mouse selection even if the app requests capture. Source: https://ghostty.org/docs/config/reference#mouse-shift-capture

These docs support the desired default: podex should not request `?1000h`/`?1006h` unless the user explicitly opts into app-owned mouse behavior. Terminal-level `mouse-reporting=false` is a user-side escape hatch, not a replacement for podex's default contract.

## Current Broken Contract

### `bin/commands/chat.ts`

Current default includes app mouse capture:

```ts
let tuiConfig = { pasteCollapseLines: 2, pasteCollapseChars: 160, keymapPreset: 'default', diffStyle: 'summary', themeSeed: 'jaw-default', mouseTracking: true };
```

Because settings merge onto this object, absence of a persisted `tui.mouseTracking` value means `true`.

### `bin/commands/tui/fullscreen-mode.ts`

Current startup is opt-in at the call site but default-on in practice because `chat.ts` supplies `true`:

```ts
if (ctx.tuiConfig['mouseTracking'] === true) screen.enableMouse();
```

Current parsing and press/timer behavior is not fully guarded by the same opt-in condition:

```ts
if (isMouseSequence(incoming)) {
    const parsed = parseSgrMouse(incoming);
    if (parsed) {
        const regions = currentRegions(ctx);
        if (handleMouseEvent(viewport, regions, parsed.event, screen, mouseState)) {
            scheduler.request();
            return;
        }
        return;
    }
}
```

`handleMouseEvent()` can call `screen.enableMouse()` in wheel and press resume paths. In native default mode, parsing a leaked SGR sequence must not call this path at all.

### Tests

`tests/unit/tui-copy-friendly-mouse.test.ts` already encodes the desired contract:

```ts
assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] === true/);
assert.doesNotMatch(source, /mouseTracking.*!== false/);
```

`tests/unit/tui-fullscreen-source-contract.test.ts` is stale and expects default app mouse behavior:

```ts
assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] !== false/);
```

## Exact Patch Targets

1. `bin/commands/chat.ts`
2. `bin/commands/tui/fullscreen-mode.ts`
3. `tests/unit/tui-fullscreen-source-contract.test.ts`
4. `tests/unit/tui-copy-friendly-mouse.test.ts`
5. `tests/unit/tui-chat-launch-scope.test.ts`
6. Existing viewport/frame tests:
   - `tests/unit/tui-screen-lifecycle.test.ts`
   - `tests/unit/tui-fullscreen-frame-harness.test.ts`

Non-targets:

- Do not change `src/cli/tui/render/viewport.ts` behavior where manual scroll includes all flattened transcript rows.
- Do not weaken `src/cli/tui/render/frame.ts` scrollback protection.
- Do not reintroduce alternate-screen behavior.
- Do not redesign opt-in press `disableMouse()` + 2s `enableMouse()` resume behavior in this cycle; document its selection tradeoff only.

## Proposed Code-Level Changes

### 1. `bin/commands/chat.ts` — remove default app mouse capture

Change the default config by **omitting** `mouseTracking`. This is the mandated diff; do not use a literal `mouseTracking: false` default.

```diff
-let tuiConfig = { pasteCollapseLines: 2, pasteCollapseChars: 160, keymapPreset: 'default', diffStyle: 'summary', themeSeed: 'jaw-default', mouseTracking: true };
+let tuiConfig = { pasteCollapseLines: 2, pasteCollapseChars: 160, keymapPreset: 'default', diffStyle: 'summary', themeSeed: 'jaw-default' };
```

Persisted settings semantics:

- absent `tui.mouseTracking` → native/copy-friendly mode; no mouse reporting enabled or parsed.
- `tui.mouseTracking: false` → native/copy-friendly mode; no mouse reporting enabled or parsed.
- `tui.mouseTracking: true` → opt-in app-wheel mode; startup may enable `?1000h` + `?1006h`, SGR wheel parsing is active, and the selection tradeoff is explicit.

### 2. `bin/commands/tui/fullscreen-mode.ts` — centralize the opt-in guard

Add a small local helper so startup, parsing, and resume behavior cannot drift:

```ts
function isMouseTrackingEnabled(ctx: TuiContext): boolean {
    return ctx.tuiConfig['mouseTracking'] === true;
}
```

Use it at startup:

```diff
-if (ctx.tuiConfig['mouseTracking'] === true) screen.enableMouse();
+if (isMouseTrackingEnabled(ctx)) screen.enableMouse();
```

Gate SGR parsing before parsing or handling. Use the local `mouseTrackingEnabled` variable as the single implementation/test shape:

```diff
+const mouseTrackingEnabled = isMouseTrackingEnabled(ctx);
-if (isMouseSequence(incoming)) {
+if (mouseTrackingEnabled && isMouseSequence(incoming)) {
     const parsed = parseSgrMouse(incoming);
```

This is the important safety property: a leaked `ESC[<64;...M` or `ESC[<0;...M` sequence in default native mode must pass through as ordinary input/noise handling, not as a mouse event that can re-enable app reporting.

### 3. `bin/commands/tui/fullscreen-mode.ts` — keep press/timer behavior only inside opt-in mode

Because parsing is gated, `handleMouseEvent()` only runs when opt-in is active. Still mandate an explicit guard in the helper so future call sites cannot bypass the policy.

Pass `mouseTrackingEnabled` into `handleMouseEvent()` and return false when disabled:

```diff
 function handleMouseEvent(
     viewport: Viewport,
     regions: Regions,
     ev: { kind: string; row: number },
     screen: Screen,
     mouseState: { resumeTimer: ReturnType<typeof setTimeout> | null },
+    mouseTrackingEnabled: boolean,
 ): boolean {
+    if (!mouseTrackingEnabled) return false;
```

Call-site diff:

```diff
+const mouseTrackingEnabled = isMouseTrackingEnabled(ctx);
-if (isMouseSequence(incoming)) {
+if (mouseTrackingEnabled && isMouseSequence(incoming)) {
     const parsed = parseSgrMouse(incoming);
     if (parsed) {
         const regions = currentRegions(ctx);
-        if (handleMouseEvent(viewport, regions, parsed.event, screen, mouseState)) {
+        if (handleMouseEvent(viewport, regions, parsed.event, screen, mouseState, mouseTrackingEnabled)) {
```

Do not implement a comment-only Option B in this cycle.

Wheel behavior remains opt-in app mode behavior:

```ts
viewport.scrollBy(ev.kind === 'wheel-up' ? -3 : 3, h);
```

Press behavior remains only opt-in app mode behavior:

```ts
screen.disableMouse();
mouseState.resumeTimer = setTimeout(() => {
    mouseState.resumeTimer = null;
    screen.enableMouse();
}, 2000);
```

Default native mode must not reach either `screen.enableMouse()` resume path.

### 4. `tests/unit/tui-fullscreen-source-contract.test.ts` — align with copy-friendly contract

Replace the stale Cycle 45.4 test:

```diff
-test('fullscreen default mouse tracking enables wheel scroll with opt-out', () => {
-    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] !== false/);
-    assert.doesNotMatch(source, /screen\.enter\(\);\s*screen\.enableMouse\(\);/);
-});
+test('fullscreen mouse tracking is opt-in for copy-friendly native scrollback', () => {
+    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] === true/);
+    assert.doesNotMatch(source, /ctx\.tuiConfig\['mouseTracking'\] !== false/);
+    assert.doesNotMatch(source, /screen\.enter\(\);\s*screen\.enableMouse\(\);/);
+});
```

Assert the helper exists and the parser is gated with the local variable shape:

```ts
assert.match(source, /function isMouseTrackingEnabled\(ctx: TuiContext\): boolean/);
assert.match(source, /const mouseTrackingEnabled = isMouseTrackingEnabled\(ctx\)/);
assert.match(source, /mouseTrackingEnabled && isMouseSequence\(incoming\)/);
```


Same implementation commit must update this test together with `bin/commands/chat.ts` and `bin/commands/tui/fullscreen-mode.ts`; the focused suite fails today until the stale `!== false` assertion is removed.
### 5. `tests/unit/tui-copy-friendly-mouse.test.ts` — strengthen the leaked sequence guard

Keep existing opt-in assertions and add source-level guards that SGR parsing is behind the same opt-in predicate:

```ts
assert.match(source, /function isMouseTrackingEnabled\(ctx: TuiContext\): boolean/);
assert.match(source, /const mouseTrackingEnabled = isMouseTrackingEnabled\(ctx\)/);
assert.match(source, /mouseTrackingEnabled && isMouseSequence\(incoming\)/);
```

Mandatory source-level coverage for this cycle:

- Read `bin/commands/chat.ts` and assert the default config does not contain `mouseTracking: true`.
- Assert fullscreen SGR parsing is gated by a positive `mouseTrackingEnabled && isMouseSequence(incoming)` expression after `const mouseTrackingEnabled = isMouseTrackingEnabled(ctx)`.
- Avoid broad negative regexes that can false-positive on the gated line; use positive assertions for the helper and gated condition.

Deferred runtime harness coverage, only if an existing small harness can simulate raw stdin without broad infrastructure work:

- Launch fullscreen with no `tui.mouseTracking` setting.
- Feed `\x1b[<64;10;5M` (wheel up) and `\x1b[<0;10;5M` (press).
- Assert output does not contain `\x1b[?1000h` or `\x1b[?1006h` after startup.
- Assert no resume timer later writes `\x1b[?1000h\x1b[?1006h`.

### 5.5. `tests/unit/tui-chat-launch-scope.test.ts` — assert chat default is native

Add the chat default assertion to an existing source-contract test that already reads `bin/commands/chat.ts`:

```ts
assert.doesNotMatch(chatSource, /mouseTracking:\s*true/);
```

This is mandatory evidence for the `bin/commands/chat.ts` diff.

### 6. Tests for opt-in app wheel mode

Add or adjust a focused test that sets `ctx.tuiConfig.mouseTracking = true` and verifies:

- Startup emits `\x1b[?1000h\x1b[?1006h`.
- SGR wheel reports are parsed.
- Wheel up/down call the viewport scroll path:

```ts
viewport.scrollBy(ev.kind === 'wheel-up' ? -3 : 3, h);
```

Source-level coverage is mandatory. Runtime raw-stdin coverage is deferred unless an existing harness supports it without broad infrastructure work. Do not redesign the opt-in press `disableMouse()` + 2s `enableMouse()` escape hatch in this cycle; document it as an opt-in app-wheel selection tradeoff only.

### 7. Keep `src/cli/tui/render/viewport.ts` manual-scroll committed-row behavior

Do not change:

```ts
private visibleRows(): string[] {
    const flat = this.flattenRows();
    return this.follow ? flat.slice(this.committedRows) : flat;
}
```

This is required because manual scroll (`follow === false`) must expose the full flattened transcript, including committed rows already pushed into native scrollback. If this regresses to always slicing `committedRows`, app/manual scroll cannot reach older transcript rows even when the terminal scrollback has them.

Keep the existing `tests/unit/tui-fullscreen-frame-harness.test.ts` committed-row coverage and extend it if needed for an up/down round trip:

- Build a viewport with enough transcript rows to commit some history.
- Mark some rows committed.
- Call `scrollBy(-N, height)` or `pageUp(height)` to leave follow mode.
- Assert `composeRegion()` can show rows from before `committedRows`.
- Call `pageDown(height)` or `followTail(true, height)` and assert later/tail rows are reachable again.
- Return to follow mode and assert tail rendering still slices committed rows.

### 8. Keep/strengthen `src/cli/tui/render/frame.ts` scrollback protection

Do not weaken the existing post-history protection:

```ts
commitLines(...) {
    ...
    this.scrollbackProtected = true;
    this.fullRedrawPending = true;
}

protectScrollback(): void {
    this.scrollbackProtected = true;
}
```

Do not allow protected repaint paths to emit CSI 3J (`\x1b[3J`) after committed history exists. The only acceptable `3J` use is disposable launch/pre-transcript clearing, before transcript rows have been committed/protected.

Keep or strengthen named tests:

- `tests/unit/tui-chat-launch-scope.test.ts` verifies launch/pre-transcript clear and mouse startup contract.
- `tests/unit/tui-screen-lifecycle.test.ts` verifies screen cleanup/mouse disable lifecycle.
- `tests/unit/tui-fullscreen-frame-harness.test.ts` verifies committed-row reachability and manual scroll behavior.
- Frame/source assertions must reject `\x1b[3J` on protected resize/repaint after committed history.

## Verification Commands

Run after implementation, not during this documentation-only task:

```bash
npx tsx --import ./tests/setup/test-home.ts --experimental-test-module-mocks --test tests/unit/tui-copy-friendly-mouse.test.ts tests/unit/tui-fullscreen-source-contract.test.ts tests/unit/tui-chat-launch-scope.test.ts tests/unit/tui-screen-lifecycle.test.ts tests/unit/tui-fullscreen-frame-harness.test.ts tests/unit/tui-mouse.test.ts
```

Run typecheck only after source/test changes are complete:

```bash
npm run typecheck
```

Because this patch changes CLI/runtime source (`bin/commands/chat.ts`, `bin/commands/tui/fullscreen-mode.ts`), run the required build gate after focused tests/typecheck:

```bash
npm run build
```

Optional smoke evidence for terminal behavior:

```bash
npm run smoke:tui-fullscreen
```

Manual Ghostty check:

1. Ensure no `tui.mouseTracking` setting is present.
2. Start `jaw chat --fullscreen`.
3. Drag-select visible transcript text; selection should be native terminal selection.
4. Scroll terminal history using native scrollback; committed transcript rows should be reachable.
5. Confirm startup output does not request `?1000h`/`?1006h` in default mode.
6. Set `tui.mouseTracking: true` and confirm app wheel mode works while accepting the selection tradeoff.

## Risks

- **Wheel expectation tradeoff:** Default native mode gives terminal scrollback/selection priority. App-owned wheel scrolling only works when `tui.mouseTracking: true`; this is intentional jawcode parity.
- **Leaked SGR input:** Some terminals or prior app states can leave SGR-looking bytes in stdin. Gating parsing behind `mouseTracking === true` prevents those bytes from re-enabling mouse reporting by default.
- **Settings migration:** Users who relied on Cycle 45.4 default app wheel behavior must opt in with `tui.mouseTracking: true`. No migration should set this globally because that would preserve the broken default.
- **Test drift:** Source-contract tests can become brittle. Prefer one or two source-contract assertions for policy plus focused runtime/harness tests for emitted mouse sequences when practical.
- **Scrollback erase regression:** Any future clear/repaint path that emits `CSI 3J` after `scrollbackProtected` or committed rows exist would break the native scrollback contract. Keep frame tests around protected repaint behavior.

## Critic Round 1 Synthesis

Recorded verdict: `ITERATE` (`.jwc/plans/planphase/2026-06-15-0219-ddb4/stage-01-critic.md`).

Accepted findings and plan changes:

- F1 accepted: the plan now mandates omission of `mouseTracking` from `bin/commands/chat.ts` defaults and defines absent/false/true semantics.
- F2 accepted: Option A is mandatory; `handleMouseEvent()` receives `mouseTrackingEnabled` and returns false when disabled.
- F3 accepted: the source-contract test update is in the same implementation commit as `chat.ts`/`fullscreen-mode.ts`.
- F4 accepted: chat default assertion is mandatory in `tests/unit/tui-chat-launch-scope.test.ts`.
- F5 accepted: verification now pins `tests/unit/tui-fullscreen-frame-harness.test.ts`, `tests/unit/tui-screen-lifecycle.test.ts`, and `tests/unit/tui-chat-launch-scope.test.ts`.
- F6 accepted: source-level leaked-SGR coverage is mandatory; raw-stdin harness coverage is deferred unless already available.
- F7 accepted: opt-in press timer redesign is out of scope.
- F8 accepted: tests use positive gated-condition assertions rather than broad negative regexes.

## Critic Round 2 Synthesis

Recorded verdict: `ITERATE` (`.jwc/plans/planphase/2026-06-15-0219-ddb4/stage-02-critic.md`).

Accepted findings and plan changes:

- G1 accepted: removed the broad `doesNotMatch(... /if \(isMouseSequence.../)` regex and kept only positive gated-parser assertions.
- G2 accepted: selected one gate shape for implementation and tests: `const mouseTrackingEnabled = isMouseTrackingEnabled(ctx);` plus `mouseTrackingEnabled && isMouseSequence(incoming)`.
- G3 accepted: exact patch targets now name `tests/unit/tui-chat-launch-scope.test.ts` and `tests/unit/tui-fullscreen-frame-harness.test.ts`.
- G4 accepted: non-targets now explicitly exclude opt-in press timer redesign.
- G5 accepted: acceptance matrix cites the `tui-chat-launch-scope.test.ts` chat default assertion.

## Acceptance Matrix

| Requirement | Patch/Test Evidence |
| --- | --- |
| Default fullscreen starts native/copy-friendly | `chat.ts` no longer defaults `mouseTracking: true`; `tests/unit/tui-chat-launch-scope.test.ts` asserts that default; startup only calls `screen.enableMouse()` when `mouseTracking === true`. |
| SGR parsing cannot re-enable mouse by default | `fullscreen-mode.ts` gates `isMouseSequence()`/`parseSgrMouse()` behind `mouseTrackingEnabled && isMouseSequence(incoming)` and passes `mouseTrackingEnabled` into `handleMouseEvent()`. |
| Opt-in app wheel mode still works | With `tui.mouseTracking: true`, startup enables `?1000h` + `?1006h`; wheel events call `viewport.scrollBy(...)`. |
| Tests agree on opt-in policy | `tui-fullscreen-source-contract.test.ts` matches `tui-copy-friendly-mouse.test.ts` and rejects `!== false`. |
| Manual scroll can reach committed rows | `viewport.ts` keeps `follow ? flat.slice(committedRows) : flat`; test covers page/up committed-row reachability. |
| Scrollback is not erased after history commit | `frame.ts` protection remains; tests reject `\x1b[3J` on protected resize/repaint after committed history. |

