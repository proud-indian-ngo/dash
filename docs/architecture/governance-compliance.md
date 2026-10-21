# Governance: compliance, declarations and policies

> **Load when**: compliance calendar, filing due dates, Form 112, ITR-7, Forms 113 and 114, TDS return, 80G or 12AB renewal, trustee term end item, compliance reminders, closing an item with evidence, annual approvals pack, Form 109 accumulation, declaration of interests, related party, payment warning, policy register, policy acknowledgement, accept policies gate, child safeguarding, "Works with children".
> **Related**: `governance.md` (register, vault, registrations), `governance-resolutions.md`, `finance-receipts-and-returns.md` (the donations return), `teams-and-events.md`, `vendor-payments.md`

## Calendar

- The default items and their due dates are code (`packages/shared/src/compliance.ts`), in the April-to-March financial year. A renewal is due 183 days before an 80G or 12AB registration expires, the last day the Act allows an application; a term-end item 90 days before a trustee's last day.
- Form 109 (accumulation of income) is due 31 August, two months before the income-tax return. In a year with nothing set apart it is marked not needed.
- Templates are ensured by key on every server start. The app changes only their owner and whether they're on, so those edits survive a deploy. With no owner, an item goes to everyone with `governance.manage`.
- A daily job creates items for the next 400 days. Each carries a source key, so running it again adds nothing. Another reminds 30, 7 and 1 days before an open item is due.

## Items

- `governance.view` sees items; `governance.manage` changes them.
- Marking an item done needs a vault document as evidence; marking it not needed needs a reason. Closed items can be reopened, and one-off items added.
- The budget, the annual accounts, the auditor's appointment and accumulation of income have resolution templates. Their items open a new circular from the template, and close with the passed resolution as evidence.

## Declarations of interests

- Once a financial year, each trustee in office lists the people and organisations they or a relative are connected to that deal or may deal with the trust, or declares none (clause 5.3), and signs the declaration with their DSC: the auditor's related-party disclosures and the payment warning rely on it, and a click proves only a session.
- Declaring renders the PDF with the trustee's empty signature field (it needs the signing service, as for minutes) and keeps it **waiting for signature**. Declaring again replaces the one waiting; a signed one stays in force until the new one is signed. Each declaration is its own row (`status`, the generated copy's key and hash), so the last signed one per trustee and year counts (`declarationsByTrustee` in `packages/shared/src/declarations.ts`).
- Only the trustee it belongs to signs, as for minutes (`governance-meetings.md`, Minutes): with the DSC helper (an account linked to them, an enrolled certificate, a recent sign-in; the helper shows "Declaration of interests for" the year), or in Acrobat and uploaded. Both copies go through `acceptSignedDeclaration`: the generated PDF with exactly their signature added, by them by name, and from the enrolled certificate for the helper. It is accepted once, under the declaration's lock and against the copy it was checked against, filed in the vault as its document with a long-term copy, and audited as `governance.sign_declaration`.
- Declarations confirmed by a click before signatures were required stay in force as "Confirmed without a signature"; the next one is signed.
- Trustees in office without a declaration in force for the year, or with one waiting for signature, are asked on their dashboard. `governance.view` sees everyone's status.
- **Payment warning**: on a vendor payment, anyone with `requests.approve` is warned when the vendor's name matches a trustee in office on the invoice date (clause 7.24 allows trustees expenses only) or a party in a trustee's declaration in force for that year. Names are compared without case, honorifics, company suffixes and punctuation (`paymentWarnings` in `packages/shared/src/declarations.ts`). It warns and never blocks, because a name match isn't proof.

## Policy register

- A policy is for everyone with an account or for trustees. Each version is an approved vault document with the day it takes effect, after the version before.
- Any signed-in user may read any version.

### Accepting policies

- Anyone with a version in force that is meant for them and that they haven't acknowledged sees `/accept-policies` before the rest of the dashboard, whatever their role, right after sign-in or sign-up too. Kalakriti's `external_user` accounts are left out, as they are from the register's "everyone". One checkbox accepts every listed version (one `policyAcknowledgement.acknowledge` each); opening the documents is optional. A new version in force asks again, marked "Updated".
- The `_app` layout's `beforeLoad` redirects on `policiesPending`, read with the session in `getAuth` (`hasOutstandingPolicies`), so a page load never shows the dashboard first. Mid-session, `PolicyGate` watches the same rule (`outstandingPolicyVersions`) through Zero. Accepting clears the cached session before returning to `redirect`, so the guard reads the new state and doesn't loop.
- The accept page, auth pages, public pages and API routes (policy documents are served by `/api/attachments`) sit outside `_app`, so the gate never blocks them.
- It is a gate in the app only: mutators and API routes don't check it. The child-safeguarding gate below is the one enforced on the server.

### Child-safeguarding gate

- The child-safeguarding policy is ensured on every server start and gates events with children: Kalakriti events, and events of a team marked as working with children.
- Once one of its versions is in force, anyone who hasn't acknowledged that version can't join such an event, show interest, be approved or added by a lead, be enrolled or assigned in Kalakriti, or join through a WhatsApp RSVP. The refusal says what to do. With no version in force, nothing is gated.
- Every one of those paths checks on the server (`packages/zero/src/mutators/safeguarding.ts`, and `safeguardingBlocks` for the RSVP), so a new join path must call it too.
- Not gated: sign-up through an event registration link (the new volunteer is added first and accepts the policy when they open the dashboard), volunteers carried into recurring occurrences, and Kalakriti local volunteers without accounts.

Not built: CSR utilisation certificates. Grants and their utilisation figures exist ([grants](finance-grants.md)); the certificate PDF and its signing come next.
