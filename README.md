# CCAR
A web-based platform where students and staff can book clinic appointments online, while clinic staff manage schedules and maintain basic health records. The system provides a centralized way to organize consultations and reduce walk-in congestion at the campus clinic.
## Database setup

`backend/schema.sql` is the complete schema for a new, empty PostgreSQL database. Configure the backend connection in `backend/.env`, then apply the schema to that empty database before starting the server. The server does not change the database schema at startup. This repository has no automatic migration runner or upgrade scripts; do not point a current deployment at an older database schema without first planning and verifying its upgrade and backup.

## Tests

Run `npm test` for authentication, frontend API handling, and backend integration checks. Database tests create uniquely named disposable PostgreSQL databases and drop them afterward; they do not insert data into the configured application database.

## Appointment lifecycle

Pending appointments reserve their selected staff member, date, and time, matching the booking transaction's lock policy. Student reschedule requests leave the current appointment in place; the requested alternative is not reserved until an administrator approves it, and availability is checked again at approval. Only one reschedule request per appointment can be pending.

Appointment types, cancellation/rescheduling deadlines, clinic closures, notifications/reminders, and clinical authorization remain clinic-policy or infrastructure decisions. Clinical permissions are granted explicitly per staff member; an administrator role alone does not grant clinical access.
