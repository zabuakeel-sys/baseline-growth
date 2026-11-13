# Baseline Growth

Private web app for running a revenue growth company: clients, deal terms, signed baselines,
and (next) checkups, weekly work, monthly results and billing. The company name is set in
`src/lib/config.ts`.

## Run locally

    cp .env.example .env        # fill in DATABASE_URL and the OWNER_* values
    npm install
    npm run migrate             # creates the tables
    npm run seed                # first owner + the first four clients (safe to rerun)
    npm run dev

## Tests

    npm test                    # money and input parsing

## Deploy on Railway

1. New project from this GitHub repo, plus a Postgres service (Railway sets `DATABASE_URL`).
2. Set `OWNER_EMAIL`, `OWNER_PASSWORD` (10+ characters) and `OWNER_NAME` on the app service.
3. Build command `npm run build`; start command `npm run migrate && npm run seed && npm start`.
4. After the first login, the owner password can be removed from the variables; seeding only
   creates an owner when none exists.

## Rules built in

- Money is stored in whole cents.
- Only owners see or change deal terms and fees. Team members never see them.
- Once a client confirms a baseline, only an owner can change it, because the growth bonus is
  measured against it.
