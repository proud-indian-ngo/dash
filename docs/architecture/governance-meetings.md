# Governance: meetings

> **Load when**: board meeting, notice, agenda, attendance, quorum per agenda item, vote, casting vote, absentee written views, interest declared at a meeting, minutes, chair's signature, circulars to be noted.
> **Related**: `governance.md` (deed rules and versions), `governance-resolutions.md` (numbering, register changes, signature checks)

## Lifecycle

`governance.manage` (the secretary) runs a meeting through these states:

| Status | What happens |
|---|---|
| Draft | Day and time in India time, format and place; the agenda of resolutions and discussion items |
| Notice sent | Refused short of the deed's days of notice. The board on the meeting's day becomes the attendance list, the President is chair by default, the circulars passed since the last held meeting are added to be noted, and those trustees are notified. The day and time can't change after this |
| Open, from the start time | Attendance, votes and decisions |
| Held | Needs every resolution on the agenda decided and a chair recorded. Then the minutes |
| Cancelled | With a reason, before it's held |

- The rules live in `packages/shared/src/meetings.ts` and use the deed version in force on the meeting's day, on the client and the server alike; the version at the notice is only recorded.
- A trustee without `governance.view` sees, read-only, the meetings whose notice went to them.
- A resolution on an agenda is a `resolution` of kind `meeting`: the same templates, never issued as a circular.

## Votes and decisions

- **Present** means in person, or on video when the deed counts video. Absent with leave and absent don't count.
- **Quorum** is worked out for each item: trustees present and not conflicted, against the deed's figure, with the required office holder (the MT) among them.
- **Votes that count** are those of trustees present, plus the written views of trustees who were away (clause 4.20). A trustee who declares an interest takes no part.
- **Result**: a simple majority of the votes that count. A tie goes to the chair's casting vote when the deed gives one and the chair gave it; otherwise it fails.
- Deciding an item runs these rules on the server. A pass takes the next resolution number and makes its register change in the same transaction, as a circular does. An inquorate item records no decision and can be decided again.
- `absenceFlags` implements clause 4.23 (absent without leave from every meeting in six months and from three in a row) for a later cessation resolution.

## Minutes

- The minutes PDF is rendered from the record: attendance, the proceedings, and each item with its text, votes, declared interests and outcome. The chair's block sits where the signing service adds the chair's empty field. Rendering again replaces the unsigned copy.
- The chair, or anyone with `governance.manage`, uploads the copy the chair signed in Acrobat. It must be the generated PDF with exactly the chair's signature added.
- The signed minutes go into the vault, become the evidence for the resolutions passed at the meeting, and get a long-term copy like a passed circular.

Meetings held before the app are vault documents (kind minutes); a meeting in the app starts with a notice the deed allows. Not built: signing minutes through the DSC helper, and minutes written in the editor.
