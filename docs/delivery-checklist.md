# Delivery checklist

This file maps every challenge requirement to an implementation or a remaining release action.

## Funnel and persistence

- [x] Five-step user flow: gender, goal, body profile, weight target, activity.
- [x] Incremental strict-JSON step endpoint.
- [x] Anonymous 30-day session; only token hash stored server-side.
- [x] Restore latest assessment and previously entered answers after reload.
- [x] Explicit step ordering and earlier-step revision behavior.
- [x] Idempotency key plus immutable submission audit record.
- [x] Optimistic version check for concurrent updates.
- [x] One in-progress assessment per session enforced in PostgreSQL.

## Calculation

- [x] Server-side BMI and category.
- [x] BMR, activity-adjusted energy, and goal-adjusted recommended calories.
- [x] Conservative calorie floor and ceiling.
- [x] Predicted target date and weekly projection.
- [x] Versioned result persisted transactionally with completion.
- [x] General-wellness/medical disclaimer and documented model compromise.

## Subscription and access

- [x] Result ownership and session authentication.
- [x] Dedicated preview DTO omits all protected values.
- [x] Full DTO requires active status and future expiry.
- [x] `/pay` endpoint and versioned `/api/v1/pay` alias.
- [x] Replay-safe mock payment event and 30-day activation.
- [x] New assessments retain the same session/subscription.

## Validation and failure modes

- [x] Missing, extra, malformed, wrong-type, NaN, infinity, and out-of-range input.
- [x] Goal/target direction, maintenance tolerance, 50% delta, and target-BMI rules.
- [x] Target validation happens at its step and again at completion.
- [x] Wrong owner, expired/revoked token, missing headers, stale version, unknown step.
- [x] Completed assessment is immutable.
- [x] Stable error envelope, field errors, request ID, and no-store headers.
- [ ] Rate limiting and abuse prevention (documented production follow-up).

## Automated quality

- [x] Algorithm and validation unit tests, including property-based invariants.
- [x] Preview/full field-isolation tests.
- [x] PostgreSQL integration tests: resume, order, retries, key conflict, concurrency.
- [x] Payment and access-transition integration test.
- [x] Desktop/mobile Playwright funnel, reload, validation, leakage, and unlock tests.
- [x] One-command test and coverage scripts.
- [x] CI provisions PostgreSQL, migrates, checks, builds, and runs Playwright.
- [x] README states coverage choices and known omissions.
- [ ] Obtain online CI green badge after first GitHub push.

## UX and documentation

- [x] Mobile-first branded UI with progress, save state, trust copy, paywall, chart.
- [x] API documentation and reproducible cURL payment call.
- [x] Prisma schema, SQL migration, constraints, indexes, and Mermaid ER diagram.
- [x] Local setup, quality scripts, design decisions, security advisory explanation.
- [x] AI collaboration retrospective with a rejected AI proposal.

## Release-only actions

- [ ] Create/connect a managed PostgreSQL production database.
- [ ] Run the production migration.
- [x] Create the public GitHub repository.
- [ ] Push the baseline commit and obtain a green CI run.
- [ ] Deploy the Next.js app to a public HTTPS URL.
- [ ] Run the online funnel and payment smoke test.
- [ ] Create a paid reviewer session and add its session ID/token to README.
- [ ] Add the live URL, repository URL, and CI status to README.
- [ ] Replace the draft owner/name/date in the final submission filename/email.
