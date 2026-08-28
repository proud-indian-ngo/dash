# Kalakriti Event-Day Phase 2 Evidence

| Task | Outcome | Verification |
| --- | --- | --- |
| KED-001 | Credential subjects generalized to Student or volunteer membership | `packages/zero/src/mutators/__tests__/kalakriti-credential.test.ts`, Drizzle CHECK + partial uniques |
| KED-002 | Reissue and volunteer credential issue | `kalakriti-credential.test.ts`, `credential-print.spec.ts` |
| KED-003 | Print, lookup, credentials admin page | `credential-print.spec.ts`, `kalakriti-registration-release-surface.test.ts` |
| KED-004 | Immutable operation spine | `kalakriti-operation.test.ts`, delete guards on student/entry |
| KED-005 | Center transport setup | `kalakriti-transport.test.ts`, `center-transport.spec.ts` |
| KED-006 | Student transport operations | `event-day-transport.spec.ts`, derived pickup helper |
| KED-007 | Check-in, meals, attendance | `event-day-stations.spec.ts`, station auth in mutator tests |
| KED-008 | Online corrections with reasons | `kalakriti-operation.test.ts` (`correct`), event-day correct panel, `lifecycle-golive.spec.ts` correction journey |
| KED-009 | Go-live readiness and `live` lifecycle | `kalakriti-go-live-readiness.test.ts`, `lifecycle-golive.spec.ts`, `edition-lifecycle-card.tsx` |

## KED-008 correction restore path

1. Supersede a pickup via `kalakritiOperation.correct` → inserts a replacement pickup with `correctionReason` and marks the target `supersededByOperationId`.
2. Effective-state helpers ignore superseded rows, so the replacement pickup keeps meal and attendance eligibility.
3. If a pickup were superseded without a replacement row, the Student would be derived-absent until a new pickup is recorded.

## KED-009 go-live gate

- Forward `record` / `recordManual` / `correct` throw `Edition is not live` unless lifecycle is `live`.
- Print and transport setup remain allowed in `registration_locked`.
- Concurrent go-live attempts rely on the single-live Edition unique index plus Edition row lock in `kalakritiEdition.transition`.
