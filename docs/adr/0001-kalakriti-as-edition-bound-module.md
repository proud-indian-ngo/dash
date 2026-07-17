---
status: accepted
---

# Build Kalakriti as an edition-bound pi-dash module

Kalakriti will be rewritten as a native pi-dash module, not embedded as a second application and not modeled as additions to the global user and student registries. Each Edition owns all yearly configuration, access assignments, students, registrations, operations, and results, while linking one-to-one to a normal pi-dash `teamEvent`. Better Auth remains the only login identity system, and only explicitly assigned central volunteers are synchronized into `teamEventMember`.

## Considered options

- Keeping Kalakriti as a separately deployed application would preserve its current boundaries, but would duplicate authentication, permissions, design, deployment, and shared finance integrations.
- Absorbing Kalakriti records into global student, center, and role tables would reduce table count, but would violate the required yearly isolation and would make historical access and configuration difficult to reason about.
- The chosen native module keeps the existing pi-dash structure intact by adding one bounded section and reusing only genuine shared capabilities: identity, central volunteer membership, notifications, files, reimbursements, and vendor payments.

## Consequences

- Every Kalakriti business row must be reachable from exactly one Edition, directly or through a constrained parent.
- Kalakriti responsibilities remain edition-scoped assignments and must not become global pi-dash roles.
- External Guardian accounts use central Better Auth identities, but their yearly profiles and access live in Edition Memberships and they remain hidden from normal user-management surfaces.
- The old Kalakriti application and its data are outside this implementation path; no migration is required for the first release.
