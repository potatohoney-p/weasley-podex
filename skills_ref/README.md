# Weasley Podex bundled skills

This directory is the offline, Apache-2.0 skill catalog shipped with
`weasley-podex`. `registry.json` is the machine-readable source of truth.

Bundled and active by default:

- `browser` — bounded browser operation and verification
- `dev` — safe, tested repository changes
- `dev-pabcd` — plan/audit/build/check/deliver gates
- `diagram` — evidence-based diagrams
- `goal` — persistent goal execution
- `memory` — instance-local and cross-instance memory boundaries
- `search` — source-first research
- `web-ai` — supported web-AI sessions and artifact capture

Fresh installs and resets use this catalog without network access. Extra skills
may be imported from an installed Codex environment or from the repository set
explicitly in `WEASLEY_PODEX_SKILLS_REPO`. Weasley Podex does not contact a
default remote skill repository.

Run `weasley-podex skill list` to inspect the exact catalog in an installation.
