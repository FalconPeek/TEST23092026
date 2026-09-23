# VERIFIER handoff (2026-09-23)

- Current task: none in progress. T-001 through T-004 are verified (PASS). T-005 has status `done` but I haven't started verifying it (PAUSE was active on restart).
- Checks half-done: none.
- Next step on restart: run `bash .orchestra/wait-for-task.sh done worker` (timeout 600000). It should return T-005. Verify it: lib/actions/groups.ts, errors.ts, their tests, and messages/es.ts.
- Gotchas:
  - `cn` is imported from the `cn` npm package (shadcn), not `@/lib/utils`. That's the project convention.
  - /dev/* routes sit behind proxy.ts auth, and no browser/E2E user is available, so there's no visual check.
  - Root `debug*.test.ts` files from other sessions sometimes show up. They're not worker files.
  - The worker tree often contains FATHER's untracked migrations and lib/brackets work. Don't blame the worker for them.
