<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository agent rules

## Source priority
1. User instructions and the current task.
2. Current repository code, configs, tests, lockfiles, and local documentation.
3. Official web documentation, official release notes, and other primary sources found via web search.
4. Reputable secondary web sources used only to supplement or cross-check primary sources.
5. Training knowledge for background only, never as the final source of truth for current or project-specific facts.

## Retrieval-first rules
- If local evidence is insufficient, search the web before answering or coding.
- For anything version-sensitive, time-sensitive, external, or likely to have changed, do not rely on memory alone.
- Prefer official vendor documentation over blogs, forum posts, or summaries.
- If the task depends on current package behavior, framework conventions, APIs, pricing, policies, release notes, or platform behavior, verify with web sources before making changes.
- EXPLICIT TRIGGER: Requests for "templates", "boilerplates", or setup files are ALWAYS version-sensitive. You MUST run tools (`search_web` or terminal commands) to fetch current latest versions and syntaxes before generating them. NEVER generate these from memory.

## No memory-first behavior
- Do not use training knowledge as the first fallback when local evidence is missing.
- Do not present memory-based factual claims as confirmed facts when they have not been verified.
- Use training knowledge only to understand the problem, form better search queries, and assess plausibility.

## Conflict handling
- If web evidence conflicts with memory, prefer the web evidence.
- If multiple web sources conflict, prefer the most official and most recent source, and mention the conflict.
- If no reliable source can be found, state uncertainty explicitly instead of guessing.

## Coding rules
- Read existing code and nearby tests before editing.
- Do not guess API signatures, config formats, framework conventions, CLI flags, dependencies, version numbers, or migration steps from memory.
- Keep changes aligned with existing repository patterns unless the task requires otherwise.
- Make the smallest change that solves the task.

## Validation
- Run the smallest relevant validation first, then broader checks if needed.
- Prefer targeted tests, lint, and typecheck for the affected area.
- If validation cannot be run, explain what should be run and why.

## Boundaries
- Never invent facts, versions, commands, or URLs.
- Ask before destructive actions, schema changes, secret handling, or irreversible migrations.
- If evidence is weak, incomplete, or conflicting, say so clearly.