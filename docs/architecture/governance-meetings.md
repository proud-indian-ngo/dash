# Governance: meetings

> **Load when**: board meeting, notice, agenda, attendance, quorum per agenda item, vote, casting vote, absentee written views, interest declared at a meeting, minutes, chair's signature, circulars to be noted.
> **Related**: `governance.md` (deed rules and versions), `governance-resolutions.md` (numbering, register changes, signature checks)

## Lifecycle

| Status | Who | What happens |
|---|---|---|
| Draft | `governance.manage` | Day and time (India time), format and place; the agenda of resolutions and discussion items |
| Notice sent | `governance.manage` | Refused short of the deed's days of notice. Snapshots the board on the meeting's day as the attendance list (with their offices), makes the President chair by default, adds the circulars passed since the last held meeting to be noted, and notifies those trustees (topic Governance). The day and time are fixed from now on |
| Open, from the start time | `governance.manage` (the secretary) | Attendance, votes and decisions |
| Held | `governance.manage` | Closing needs every resolution on the agenda decided and a chair recorded. Then the minutes |
| Cancelled | `governance.manage` | With a reason, before it's held |

- The rules live in `packages/shared/src/meetings.ts` and always use the deed version in force on the meeting's day; the version at the notice is only recorded.
- A trustee without `governance.view` sees the meetings whose notice went to them, read-only.
- A resolution on an agenda is a `resolution` of kind `meeting`: drafted with the same templates, never issued as a circular.

## Votes and decisions

- **Present** means in person, or on video when the deed counts video. Absent with leave and absent don't count.
- **Quorum** is worked out for each item: trustees present and not conflicted, against the deed's figure, with the required office holder (the MT) among them.
- **Votes that count** are those of trustees present, plus the written views of trustees who were away (clause 4.20). A trustee who declares an interest takes no part.
- **Result**: a simple majority of the votes that count. A tie goes to the chair's casting vote when the deed gives one and the chair gave it; otherwise it fails.
- **Record the decision** applies all this on the server. A pass takes the next resolution number and makes its register change in the same transaction, as a circular does. An inquorate item records no decision and can be decided again.
- `absenceFlags` implements clause 4.23 (absent without leave from every meeting in six months and from three in a row) for a later cessation resolution.

## Minutes

- **Make the minutes** renders the PDF from the record: attendance, the proceedings, and each item with its text, votes, declared interests and outcome. The chair's block sits where the signing service adds the chair's empty field. Making them again replaces the unsigned copy.
- The chair, or anyone with `governance.manage`, uploads the copy the chair signed in Acrobat. It must be the generated PDF with exactly the chair's signature added.
- The signed minutes go into the vault as minutes, become the evidence for the resolutions passed at the meeting, and get a long-term copy like a passed circular.

Past meetings are vault documents (kind minutes): a meeting in the app starts with a notice the deed allows. Minutes can't yet be signed through the DSC helper, and they are generated from the record rather than written in the editor.
