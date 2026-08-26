# AI collaboration retrospective

I used AI as a design and verification partner, not only as an autocomplete tool.

## Where AI accelerated the work

- **Funnel analysis and boundaries:** I turned the product brief into a state machine, a field-persistence map, and a threat/edge-case list before implementing routes.
- **Data modeling:** AI helped compare a single JSON answer blob with typed assessment columns plus an append-only submission ledger. I then shaped the Prisma schema, PostgreSQL checks, partial unique index, and migration around the chosen model.
- **Contracts and types:** AI generated candidate Zod schemas, DTO allow lists, enum mappings, error envelopes, and header rules. I reviewed the contracts against every route and kept persistence/domain/API representations explicit.
- **Mock and test data:** AI generated boundary tables for ages, heights, weights, goal directions, target BMI, membership expiry, duplicate requests, and concurrent writers. Property-based tests supplement named examples for calculation invariants.
- **Test implementation:** AI helped draft Vitest unit tests, real-PostgreSQL integration flows, and Playwright scenarios. I used failures from typecheck and test runs as feedback, corrected the implementation, and reran the full quality commands.
- **Frontend delivery:** AI helped translate the backend states into a concise, mobile-first funnel with saved-state feedback, recovery, trust copy, a clear preview boundary, and a no-charge demo unlock.

## A proposal I rejected

One early AI-friendly shortcut was to store all answers in a single JSON document and use last-write-wins updates. I rejected it for two reasons. First, JSON-only storage weakens database constraints and makes analytics/migrations for core fields unnecessarily fragile. Second, last-write-wins can silently erase an answer when two tabs submit the same version.

The implemented design uses typed columns for current state, JSONB only for audit/projection data, an append-only step-submission ledger for idempotency, and optimistic concurrency through `If-Match` plus an atomic `updateMany` version predicate. The rejected approach was shorter, but it would have failed the challenge's stability and concurrent-update expectations.

I also rejected using the same result object and deleting paid fields at runtime. Separate preview/full DTO constructors are easier to audit and test: the protected values never enter the preview serialization path.

## Human judgment retained

AI suggestions were treated as hypotheses. I kept the final decisions on supported health ranges, non-binary estimation disclosure, transaction boundaries, public error details, test value, and what not to claim medically. I also avoided an automated `npm audit fix --force` because it proposed a breaking Prisma major-version downgrade for a development-only transitive advisory.

## Remaining limitations

The payment endpoint is deliberately simulated and does not verify provider signatures. The algorithm is general wellness guidance, not a clinical model. Before real launch I would add authenticated account linking, consent/retention controls for health-related data, provider webhook verification, accessibility auditing, more browsers, observability, rate limiting, and load tests.
