**[ITERATE]**

**Justification**: Round 1 F1-F7 are substantively addressed. F8 is partial: section 5 still shows brittle doesNotMatch on bare isMouseSequence while prose says use positive asserts. New gap G2: section 2 shows isMouseTrackingEnabled(ctx) gate but mandated call-site uses mouseTrackingEnabled local; section 4-5 test regexes target the ctx form and can fail a correct implementation.

**Summary**:
- Clarity: Strong except gate-expression mismatch across sections.
- Verifiability: Good command list; align test regex with implemented gate line.
- Completeness: Exact Patch Targets header still vague on named test files.
- Big Picture: Ready after G1-G2 alignment.
- Principle/Option Consistency: Single paths for default and handleMouseEvent.
- Alternatives Depth: Resolved.
- Risk/Verification Rigor: Source-only leaked-SGR scope is explicit and acceptable.

**F1-F8**: F1 resolved. F2 resolved. F3 resolved. F4 resolved (5.5 mandatory). F5 resolved. F6 resolved. F7 resolved in section 6; add Non-targets bullet. F8 partial (section 5 negative regex remains).

**Required edits**:
G1 — Delete section 5 doesNotMatch if isMouseSequence(incoming); keep only positive gated-condition asserts per F8 guidance.
G2 — Unify gate shape across section 2 example, section 3 call-site, sections 4-5 regexes, acceptance matrix: use mouseTrackingEnabled local and assert that substring in source tests (or document both forms as equivalent and test both).
G3 — Exact Patch Targets: replace any existing viewport file with tui-chat-launch-scope.test.ts and tui-fullscreen-frame-harness.test.ts.
G4 — Non-targets: do not redesign opt-in press disableMouse plus 2s enableMouse resume.

After G1-G2, OKAY for pending approval and A-stage.
