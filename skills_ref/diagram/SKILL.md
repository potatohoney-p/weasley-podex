---
name: diagram
description: Create compact diagrams from verified system relationships.
license: Apache-2.0
keywords: [diagram, flowchart, architecture, sequence, state]
triggers: [draw diagram, visualize flow, show architecture]
---

# Diagram

Use a diagram only when relationships, ordering, or ownership are easier to
understand visually than in a short paragraph.

## Method

1. Identify the audience and the single question the diagram must answer.
2. Verify node names, boundaries, and edge directions from source material.
3. Select the smallest fitting form: flowchart for branching, sequence for
   interactions, state diagram for transitions, and tree for ownership.
4. Keep labels short and quote labels that contain punctuation.
5. Render or parse the result when tooling permits, then compare it with the
   source facts.

## Mermaid baseline

Prefer simple Mermaid syntax when the output surface supports it. Avoid custom
themes, HTML labels, and dense cross-links. A diagram is documentation, not a
substitute for verification; note inferred edges explicitly.
