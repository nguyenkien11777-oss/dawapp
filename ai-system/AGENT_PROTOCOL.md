# AI Agent Protocol (BeatForge v2)

Every verification must explicitly reference the relevant section heading in /beatforge/ARCHITECTURE_V1_V2.md

Memory is advisory, not authoritative.
Live repository code always overrides memory artifacts.

When proposing structural changes:
Reference concrete code locations, not memory descriptions.

rejected_by_constitution
requires_human_review
approved

## Constitutional Authority
- **Single authority:** `/beatforge/ARCHITECTURE_V1_V2.md`.
- This protocol is operational only and does not define architecture law.

## Mandatory Pre-Work
1. Before any architecture proposal, refactor plan, or migration design, read `/beatforge/ARCHITECTURE_V1_V2.md`.
2. Treat any conflict between a proposal and that file as a hard stop.

## Compliance Gate (Required)
For every non-trivial change proposal, run this gate:
- Verify deterministic transport behavior remains compliant with `/beatforge/ARCHITECTURE_V1_V2.md`.
- Verify single-authority control paths remain compliant with `/beatforge/ARCHITECTURE_V1_V2.md`.
- Verify in-flight guard behavior remains compliant with `/beatforge/ARCHITECTURE_V1_V2.md`.
- Verify canonical filesystem containment remains compliant with `/beatforge/ARCHITECTURE_V1_V2.md`.
- Verify async isolation behavior remains compliant with `/beatforge/ARCHITECTURE_V1_V2.md`.

If any check fails or is uncertain: **ABORT** and mark proposal status as `rejected_by_constitution`.

## Proposal Lifecycle
- `draft` → `constitution-check` → `approved` or `rejected_by_constitution`.
- No implementation work may begin without `approved` status.

Pre-Decision Drift Check (Required)
Before any architectural proposal:

1. Re-scan affected modules from live repository.
2. Compare structural assumptions in AI_STATE.yaml and LONG_TERM_MEMORY.md with current code.
3. If structural mismatch detected → update memory artifacts before proceeding.
## Conflict Procedure
- Record the exact conflicting module/function.
- Record the affected workflow.
- Reference `/beatforge/ARCHITECTURE_V1_V2.md` as the reason for rejection.
- Do not create alternative rule documents.
