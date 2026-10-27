# CCAR
A web-based platform where students and staff can book clinic appointments online, while clinic staff manage schedules and maintain basic health records. The system provides a centralized way to organize consultations and reduce walk-in congestion at the campus clinic.

## Run locally

Run `npm run dev` and open the Vite URL it prints. This starts both the frontend and API server. The API uses an embedded PostgreSQL-compatible database by default, creates the schema automatically, and stores data in the ignored `backend/data` directory. No separate PostgreSQL installation or `.env` file is required; a development JWT secret is used if `JWT_SECRET` is unset.

To connect to an existing PostgreSQL server instead, set `DB_DRIVER=postgres` and configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET` in the project `.env` file. Apply `backend/schema.sql` to that database before starting the server.
