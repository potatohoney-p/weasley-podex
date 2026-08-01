---
name: memory
description: Use local and federated memory with explicit privacy boundaries.
license: Apache-2.0
keywords: [memory, notes, recall, profile, episodes]
triggers: [remember this, search memory, save context]
---

# Memory

Store only durable, useful context. Never save credentials or private material
that the user did not ask to retain.

## Scope: L1 vs L2

- **L1 instance-local memory** is the default writable store. Use
  `weasley-podex memory search/read/save`; save always requires both a destination
  file and content.
- **L2 dashboard memory** is cross-instance federation; read-only. Use
  `weasley-podex dashboard memory search/read/instances` only when cross-instance
  context is genuinely needed.

Embedding search is optional and default OFF. Check dashboard memory state and
cost estimates before enabling it. Prefer a concise durable fact over a raw chat
transcript, and include provenance when a memory depends on an external source.
