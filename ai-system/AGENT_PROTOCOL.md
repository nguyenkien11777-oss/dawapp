# AI Agent Protocol (BeatForge v2)

## Governance Enforcement Rules
Memory artifacts may inform context but must not be used as justification for architectural direction.
Architectural justification must derive from live code and ARCHITECTURE_DOC only.
Compliance Gate results must be definitive (PASS or FAIL).
Each Compliance Gate item must explicitly reference the corresponding rule or section in ARCHITECTURE_DOC.
Uncertainty must be treated as FAIL and may not be assumed safe.
Conditional statements are not sufficient. Compliance Gate output must list each evaluated rule and assign PASS or FAIL explicitly.
Drift Check must:
- Explicitly state either:
  - "No structural drift detected"
  OR
  - "Drift detected in [module]"
- Confirm evaluation against current repository state relative to `snapshot_date` in AI_STATE.yaml.

## Constitutional Authority Reference
ARCHITECTURE_DOC = /beatforge/ARCHITECTURE_V1_V2.md

Every verification must explicitly reference the relevant section heading in ARCHITECTURE_DOC
If section headings are absent or ambiguous, reference the exact paragraph or rule text.

Memory is advisory, not authoritative.
Memory artifacts must never introduce new rules, constraints, or invariants not present in ARCHITECTURE_DOC.
This protocol itself may not define architectural constraints beyond those present in ARCHITECTURE_DOC.
If memory and live code conflict, live code prevails and memory must be updated before further reasoning.
Live repository code always overrides memory artifacts.

When proposing structural changes:
Reference concrete code locations, not memory descriptions.
Structural proposals must include:
- Affected modules
- Preserved invariants
- Non-regression checklist referencing ARCHITECTURE_DOC guarantees.

## Constitutional Authority
- **Single authority:** `ARCHITECTURE_DOC`.
- This protocol is operational only and does not define architecture law.

## Mandatory Pre-Work
1. Before any architecture proposal, refactor plan, or migration design, read `ARCHITECTURE_DOC`.
2. Treat any conflict between a proposal and that file as a hard stop.

## Compliance Gate (Required)
For every non-trivial change proposal, run this gate:
- Verify deterministic transport behavior remains compliant with `ARCHITECTURE_DOC`.
- Verify single-authority control paths remain compliant with `ARCHITECTURE_DOC`.
- Verify in-flight guard behavior remains compliant with `ARCHITECTURE_DOC`.
- Verify canonical filesystem containment remains compliant with `ARCHITECTURE_DOC`.
- Verify async isolation behavior remains compliant with `ARCHITECTURE_DOC`.

If any check fails or is uncertain: **ABORT** and mark proposal status as `rejected_by_constitution`.

## Proposal Lifecycle
- `draft` → `constitution-check` → `approved` / `requires_human_review` / `rejected_by_constitution`
- No implementation work may begin without `approved` status.

Pre-Decision Drift Check (Required)
Before any architectural proposal:

1. Re-scan affected modules from live repository.
2. Compare structural assumptions in AI_STATE.yaml and LONG_TERM_MEMORY.md with current code.
3. If structural mismatch detected:
   - Update memory artifacts first.
   - Log drift in SPRINT_LOG.md.
   - Re-run Compliance Gate before proposal.
## Conflict Procedure
- Record the exact conflicting module/function.
- Record the affected workflow.
- Reference `ARCHITECTURE_DOC` as the reason for rejection.
- Do not create alternative rule documents.

## Constitutional Change Handling
If ARCHITECTURE_DOC is modified:

1. Immediately suspend all architectural proposals.
2. Re-derive all invariants from the updated document.
3. Update AI_STATE.yaml phase if required.
4. Update LONG_TERM_MEMORY.md to remove stale assumptions.
5. Re-run drift checks on all risk-sensitive modules.
6. Log constitutional version change in SPRINT_LOG.md.
