**[ITERATE]**

**Justification**: The plan correctly identifies the Cycle 45.4 regression (chat default mouseTracking true, unconditional SGR parsing, stale !== false source-contract test) and gives credible patch targets in bin/commands/chat.ts and bin/commands/tui/fullscreen-mode.ts. Verified against the repo: those lines match current source; tui-copy-friendly-mouse.test.ts and tui-fullscreen-source-contract.test.ts still contradict. Execution is not guess-free yet because the plan leaves multiple equally valid implementation branches, does not pin mandatory test file updates/order, and understates automated evidence for default-off startup and leaked-SGR safety.

**Summary**:
- Clarity: Strong on broken contract and intended opt-in guard; weak on choosing one default shape and one handleMouseEvent patch.
- Verifiability: Good verification command block and acceptance matrix; gaps for chat.ts default assertion, explicit harness/frame test inclusion, and mandatory vs optional runtime mouse tests.
- Completeness: Core mouse contract covered; regression-guard sections 7-8 need named existing tests; opt-in press/timer selection tradeoff should be explicit in acceptance.
- Big Picture: Aligns with jawcode native-default / opt-in app mouse goal and correctly scopes viewport/frame as non-targets.
- Principle/Option Consistency: Opt-in === true is consistent across narrative and proposed tests, but two chat.ts diffs and Option A/B for handleMouseEvent conflict with a single execution path.
- Alternatives Depth: Alternatives are listed but not resolved; critic needs one mandated path per decision point.
- Risk/Verification Rigor: Risks are sound; verification should require resolving contradictory unit tests in one change set and naming tui-fullscreen-frame-harness.test.ts for committed-row evidence.

**Required fixes (concrete plan edits)**:

F1 — Pick exactly one default for bin/commands/chat.ts: remove omit vs mouseTracking false dual branch; state one mandated diff and persisted-settings semantics (absent key no enable; true enables; false never enables/parses).

F2 — Mandate Option A for handleMouseEvent (mouseTrackingEnabled param + early return) with exact call-site diff; drop Option B or mark out of scope.

F3 — Same commit must update tui-fullscreen-source-contract.test.ts with fullscreen-mode/chat changes; note focused run fails today on stale !== false until then.

F4 — Add chat.ts default evidence to acceptance and verification (source assert chat does not default mouseTracking true, e.g. in tui-chat-launch-scope or copy-friendly test reading chat.ts).

F5 — Pin regression tests: tui-fullscreen-frame-harness.test.ts for committed-row reachability; tui-screen-lifecycle + tui-chat-launch-scope for 3J protection; always include harness in focused npx tsx --test command (not conditional).

F6 — Clarify mandatory vs deferred leaked-SGR and opt-in enable harness tests; align acceptance matrix with source-only vs runtime evidence.

F7 — Non-target: do not redesign opt-in press disableMouse + 2s enableMouse resume in this cycle; document selection tradeoff only.

F8 — Regex guard for isMouseSequence must not false-positive on gated line; prefer positive assert on isMouseTrackingEnabled(ctx) && isMouseSequence(incoming).

After F1-F5 minimum, plan is execution-ready for A-stage; F6-F8 strengthen verification honesty.
