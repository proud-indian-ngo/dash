# Anonymous Event Feedback — Design Doc

## Context

Participants need a way to provide anonymous feedback on completed events. Feedback is togglable per event, activates once the event ends, and has an optional configurable deadline. Anonymity is structural — no userId stored alongside feedback content.

## Schema

### Modified: `teamEvent` table

New columns:
- `feedbackEnabled` (boolean, default false) — toggle in event settings
- `feedbackDeadline` (timestamp, nullable) — absolute deadline; null = no deadline

### New: `eventFeedback` table

| Column      | Type      | Notes                              |
| ----------- | --------- | ---------------------------------- |
| `id`        | UUID      | PK                                 |
| `eventId`   | UUID      | FK → teamEvent, cascade delete     |
| `content`   | text      | Free-form feedback text            |
| `createdAt` | timestamp | When submitted                     |
| `updatedAt` | timestamp | Last edit                          |

Index on `eventId`.

### New: `eventFeedbackSubmission` table

| Column        | Type      | Notes                              |
| ------------- | --------- | ---------------------------------- |
| `id`          | UUID      | PK                                 |
| `eventId`     | UUID      | FK → teamEvent, cascade delete     |
| `userId`      | text      | FK → user, cascade delete          |
| `feedbackId`  | UUID      | FK → eventFeedback, cascade delete |
| `submittedAt` | timestamp | When first submitted               |

Unique constraint on `(eventId, userId)` — one submission per user per event.

The `feedbackId` link lets the submitter retrieve and edit their own feedback. Admins query `eventFeedback` directly and see only anonymous content.

## Permissions

- `events.manage_feedback` — toggle feedback on/off, set deadline, view all feedback responses. Auto-granted to team leads.

## Mutators

| Mutator                   | Who                | What                                                                                                                               |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `eventFeedback.submit`    | Event member       | Create feedback + submission record. Validates: user is event member, feedback enabled, event is past, deadline not passed.         |
| `eventFeedback.update`    | Original submitter | Update feedback content via submission record lookup `(eventId, userId)` → `feedbackId`.                                           |
| `teamEvent.update` (ext.) | Admin/lead         | Extended to handle `feedbackEnabled` and `feedbackDeadline`.                                                                       |

## Queries

| Query                          | Who                               | Returns                                                                |
| ------------------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| `eventFeedback.byEvent`        | Users with `events.manage_feedback` | All feedback for an event (anonymous — no user info)                   |
| `eventFeedback.mySubmission`   | Event member                      | Own feedback via server function (not Zero query — avoids syncing submission table to client) |

## UI

### Event Form (create/edit dialog)

- New "Feedback" section (visible to users with `events.manage_feedback`):
  - Toggle: "Enable anonymous feedback"
  - Conditional date picker: "Feedback deadline" (shown when toggle on, optional)

### Event Detail — Admin/Lead View

- New **Feedback** tab (alongside Updates/Photos), shown when `feedbackEnabled && isPastEvent`:
  - Response count badge
  - List of anonymous feedback cards (content + timestamp)
  - Empty state if no responses
  - Deadline status line if deadline is set

### Event Detail — Participant View

- When `feedbackEnabled && isPastEvent && isMember && !deadlinePassed`:
  - "Share Feedback" card with textarea + Submit/Update button
  - If already submitted: show own feedback with Edit button
- When deadline passed + not submitted: "Feedback period has ended"
- When deadline passed + submitted: show own feedback read-only

### Notification

- When feedback is enabled on a past event, notify event members that feedback is open. Use existing `EVENTS_SCHEDULE` topic.
