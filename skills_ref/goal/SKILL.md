---
name: goal
description: Run persistent goals with explicit progress and completion evidence.
license: Apache-2.0
keywords: [goal, persistent task, checkpoint, progress]
triggers: [start a goal, continue until complete, checkpoint work]
---

# Goal

Use this skill when work spans multiple turns or requires persistent progress.

## Contract

- Translate the request into one concrete objective without expanding its authority.
- Keep one current plan with at most one in-progress step.
- Work autonomously through safe, in-scope actions and preserve user changes.
- Record checkpoints that name completed evidence and the next bounded action.
- Treat a transient error or slow test as a condition to investigate, not a reason
  to declare the goal blocked.
- Mark completion only after the requested outcome and proportional verification
  are both finished.

For score-optimization goals, compare candidates against a stable evaluator and
retain the best known result before exploring the next candidate.
