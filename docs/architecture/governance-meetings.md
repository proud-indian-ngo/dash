# Governance: meetings

> **Load when**: board meeting, notice, agenda, attendance, quorum per agenda item, vote, casting vote, absentee written views, interest declared at a meeting, minutes, chair's signature, circulars to be noted.
> **Related**: `governance.md` (deed rules and versions), `governance-resolutions.md` (numbering, register changes, signature checks)

## Lifecycle

`governance.manage` (the secretary) runs a meeting through these states:

| Status | What happens |
|---|---|
| Draft | Day and time in India time, format and place; the agenda of resolutions and discussion items |
| Notice sent | Checked and recorded under the meeting's lock, then the register's. Refused short of the deed's days of notice, or while a resolution lacks its text or a valid register change. The board on the meeting's day becomes the attendance list, the President is chair by default, the passed circulars no held meeting has noted are added to be noted (one on a cancelled meeting stays due), and those trustees are notified. The day, the time and the resolutions are then fixed: none is added or edited (cancel and convene again); discussion items can still be added |
| Open, from the start time | Attendance, votes and decisions. Arrivals, departures and a change of chair count for the items still to decide; a decided item's votes are fixed |
| Held | Needs every resolution on the agenda put to the vote and a chair recorded. One with no decision is withdrawn on its item, which keeps its text in the minutes, and a copy becomes a new circular draft. Then the minutes |
| Cancelled | With a reason, before it's held and before any resolution passes or fails. Its resolutions are handed back as on closing |

- The rules live in `packages/shared/src/meetings.ts` and use the deed version in force on the meeting's day, on the client and the server alike; the version at the notice is only recorded.
- A trustee without `governance.view` sees, read-only, the meetings whose notice went to them.
- A resolution on an agenda is a `resolution` of kind `meeting`: the same templates, never issued as a circular.

## Votes and decisions

- **Present** means in person, or on video when the deed counts video. Absent with leave and absent don't count.
- **Quorum** is worked out for each item: trustees present and not conflicted, against the deed's figure, with the required office holder (the MT) among them.
- **Votes that count** are those of trustees present, plus the written views of trustees who were away (clause 4.20). A trustee who declares an interest takes no part. A decided item marks any other recorded choice as not counted.
- **Result** by the template's threshold. Majority templates: a simple majority of the votes that count; a tie goes to the chair's casting vote when the deed gives one and the chair is on the attendance list, counted present and not conflicted on the item, otherwise it fails. Two-thirds (amendment) and all other trustees (removal, the subject leaving the count) need that many votes for out of the trustees on the attendance list who aren't conflicted, as on a circular.
- Deciding an item runs these rules on the server under the meeting's row lock, which every attendance, vote, agenda and chair write takes first, then the resolution's row and the register's lock, so the outcome matches the votes and the board it counted. The item records what the result was worked out from (`decisionBasis`: the attendance, the chair, whether the casting vote was used, and the counts), and shows and minutes that, not the current attendance. Deciding an inquorate item again replaces it. A pass takes the next resolution number and makes its register change in the same transaction, as a circular does. An inquorate item records no decision and can be decided again.
- `absenceFlags` implements clause 4.23 (absent without leave from every meeting in six months and from three in a row) for a later cessation resolution.

## Minutes

- The minutes PDF is rendered from the record: attendance, the proceedings, and each item with its text (rich text, drawn as on a circular), the votes that counted, declared interests and outcome, plus who attended it differently from the list (arrived or left) or another chair. The chair's block sits where the signing service adds the chair's empty field. Rendering again replaces the unsigned copy. Editing the meeting's or an item's notes drops the generated copy, and a render is kept only if the meeting didn't change while it ran, so the chair always signs the current record.
- The chair signs in one of two ways, and both copies go through the same checks: the generated PDF with exactly the chair's signature added.
  - **DSC helper**, as for a circular (`governance-resolutions.md`, Signing): only the recorded chair, signed in to an account linked to that trustee, with an enrolled certificate and a recent sign-in, on held minutes that are made and unsigned. The job reserves the chair's field in the current minutes, the helper shows "Minutes of the board meeting of" the date, and the signature must come from the enrolled certificate. It is audited as `meeting.sign_minutes` in the chair's name.
  - **Acrobat**: the chair, or anyone with `governance.manage`, uploads the copy the chair signed.
- The signed minutes are stored by content, then accepted once, under the meeting's lock and against the copy they were checked against: the vault document, the meeting's signed status and every passed resolution's evidence in one transaction. They get a long-term copy like a passed circular.

Meetings held before the app are vault documents (kind minutes); a meeting in the app starts with a notice the deed allows. Not built: minutes written in the editor.
