<!--
Sync Impact Report:
- Version change: Uninitialized template ([CONSTITUTION_VERSION]) → 1.0.0
- Ratification date: 2026-09-21
- Last amended date: 2026-09-21
- Principles defined:
  - I. Phase-Level Specification Quality & Full Context
  - II. Workspace Isolation (Git Worktree Default)
  - III. Dedicated Subagent Execution Isolation
  - IV. Mandatory Test-Driven Development (TDD)
  - V. Iterative Review & Zero-Defect Bug Hunting Loop
  - VI. Phase-End Commits & Feature Finalization
- Added sections:
  - Task Breakdown & Phase Generation Standards
  - Phase Execution Lifecycle & Quality Gates
- Removed sections: None
- Follow-up TODOs: None
-->

# Excel Flow Constitution

## Core Principles

### I. Phase-Level Specification Quality & Full Context
- Task generation by `speckit-tasks` MUST read both the feature specification (`spec.md`) and architecture plan (`plan.md`) completely before generating tasks; partial context generation is strictly prohibited.
- Phases within task breakdowns MUST be ordered strictly by dependency. Referencing unbuilt upstream components or dependencies without first declaring and scheduling them in an upstream phase is prohibited.
- Specification quality standards MUST apply comprehensively at the phase level rather than being diluted across disconnected micro-tasks.
- Every phase MUST define the exact, unambiguous relative file paths for all files to be created, modified, or deleted. Vague references or placeholders are prohibited.
- Every phase MUST provide complete code snippets, detailed pseudocode, or explicit technical implementation instructions; high-level or ambiguous summaries are prohibited.
- Every phase MUST supply explicit verification steps, including exact test execution commands, expected outputs, and objective acceptance criteria.
- All phase workflow standards (Phase 1 git worktree setup, subagent execution per phase, TDD steps, iterative review subagent loop, phase-end conventional commits, and final feature-level review phase) MUST be explicitly listed as actionable checklist items (`- [ ]`) in `tasks.md`.

### II. Workspace Isolation (Git Worktree Default)
- Phase 1 MUST prioritize creating and switching to a dedicated git worktree to isolate feature workspace changes from the primary working tree before implementation begins.
- The workflow MUST prompt the user to confirm the creation of the git worktree, defaulting to creating a new isolated worktree.

### III. Dedicated Subagent Execution Isolation
- Each phase in `tasks.md` MUST be executed within its own dedicated subagent session to maintain clean context boundaries and isolated task execution.
- Executing multiple implementation phases sequentially in a single bloated agent context without fresh subagent boundaries is prohibited.

### IV. Mandatory Test-Driven Development (TDD)
- All feature and logic implementation tasks MUST strictly adhere to the Test-Driven Development cycle (Red-Green-Refactor).
- Unit/integration tests MUST be written first and observed to fail (`Red`) prior to writing production code.
- Implement only the minimal production code necessary to turn failing tests green (`Green`).
- Refactor for cleanliness, readability, and performance while ensuring all tests continue to pass (`Refactor`).

### V. Iterative Review & Zero-Defect Bug Hunting Loop
- At the conclusion of each phase, a dedicated code review subagent MUST be spawned to perform comprehensive spec compliance auditing, code quality inspection, ESLint validation (`bun run lint`), and proactive bug hunting.
- Any bugs, regressions, type errors, or specification deviations discovered MUST be addressed and fixed immediately.
- After implementing fixes, another review subagent MUST be dispatched to re-inspect and search for lingering defects.
- The review cycle (`Review Subagent` → `Fix Identified Issues` → `Re-review Subagent`) MUST repeat iteratively until zero bugs, zero lint errors, and zero spec discrepancies remain.

### VI. Phase-End Commits & Feature Finalization
- Upon successful phase completion and verification by the review loop with zero remaining bugs, all phase modifications MUST be committed using an atomic, descriptive conventional commit message (`feat(...)`, `fix(...)`, `test(...)`, etc.).
- The final phase of `tasks.md` MUST be dedicated entirely to a holistic, feature-level integration review across all previous phases.
- A dedicated feature review subagent MUST execute a holistic bug hunt and end-to-end integration assessment across the completed feature.
- Any feature-wide defects found MUST undergo the iterative review loop until zero defects remain.
- Once zero feature-wide defects remain, a final comprehensive commit MUST be recorded to finalize the feature implementation.

## Task Breakdown & Phase Generation Standards

When `speckit-tasks` generates `tasks.md`, it MUST adhere to the following decomposition structure:

1. **Context Ingestion**: Both `spec.md` and `plan.md` MUST be read and cross-referenced in their entirety.
2. **Phase 1 (Workspace & Setup)**:
   - Must include an explicit task to prompt the user and initialize a new git worktree for isolated development.
   - Must include environment setup, dependency installations, and baseline project configuration.
3. **Phases 2..N (Dependency-Ordered Feature Phases)**:
   - Each phase MUST be self-contained, ordered strictly by dependency, and contain concrete technical implementation guidance.
   - Each phase checklist MUST explicitly include:
     - Subagent dispatch task: Spawn dedicated subagent for the phase.
     - TDD test authoring task (failing test verification).
     - Minimal implementation task to satisfy tests.
     - Verification command task (exact command and expected output).
     - Iterative review & bug hunt subagent loop task (including ESLint verification and repeat until zero bugs remain).
     - Phase-end conventional commit task.
4. **Final Phase (Feature-Level Holistic Review & Integration Gate)**:
   - Must be scheduled as the concluding phase of `tasks.md`.
   - Must include spawning a dedicated review subagent for holistic feature bug hunting and integration testing across all phases.
   - Must include the iterative fix/re-review loop until zero bugs remain.
   - Must include the final feature completion commit.

## Phase Execution Lifecycle & Quality Gates

The execution lifecycle for any feature defined in `tasks.md` MUST satisfy the following quality gates:

1. **Pre-Implementation Gate**:
   - Workspace isolation established via git worktree confirmation.
2. **Phase Implementation Gate**:
   - Dedicated subagent spawned per phase.
   - Strict TDD execution: red test output confirmed before green implementation.
3. **Phase-End Quality Gate**:
   - Automated test suite passes.
   - Linting check (`bun run lint` / ESLint) passes with zero warnings/errors.
   - Review subagent certifies zero bugs and complete spec compliance.
   - Conventional commit created.
4. **Feature Completion Gate**:
   - Holistic review subagent validates all user stories, integration points, and edge cases.
   - Iterative review loop concludes with zero outstanding issues.
   - Final completion commit recorded.

## Governance

This Constitution serves as the single source of truth for engineering governance, task breakdown standards, and quality controls within `excel-flow`.

1. **Supremacy & Agent Compliance**:
   - This constitution supersedes all informal instructions, ad-hoc workflows, or undocumented practices.
   - All Spec Kit commands (`speckit-plan`, `speckit-tasks`, `speckit-implement`, `speckit-converge`, `speckit-analyze`) MUST strictly comply with the principles and standards outlined herein.
   - Generated task breakdowns that fail to include phase-level exact paths, explicit technical guidance, TDD steps, subagent review loops, or worktree isolation are considered non-compliant and MUST be regenerated.
2. **Amendment Procedure**:
   - Any amendment, deprecation, or expansion of principles requires explicit documentation of rationale, a proposed version bump, and maintainer approval.
3. **Versioning Policy**:
   - Semantic versioning (MAJOR.MINOR.PATCH) applies to this constitution:
     - **MAJOR**: Incompatible governance removals, principle deletions, or fundamental workflow rewrites.
     - **MINOR**: Addition of new principles, sections, or materially expanded quality gates.
     - **PATCH**: Non-semantic clarifications, typographical corrections, and wording refinements.

**Version**: 1.0.0 | **Ratified**: 2026-09-21 | **Last Amended**: 2026-09-21
