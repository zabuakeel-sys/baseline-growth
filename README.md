# Baseline Growth

Private web app for running a revenue growth company: clients, deal terms, signed baselines,
and (next) checkups, weekly work, monthly results and billing. The company name is set in
`src/lib/config.ts`.

## Run locally

    cp .env.example .env        # fill in DATABASE_URL and the OWNER_* values
    npm install
    npm run migrate             # creates the tables
    npm run seed                # first owner + starting clients (safe to rerun)
    npm run dev

## Tests

    npm test                    # money, input parsing, checkup scoring, billing

## Deploy on Railway

1. New project from this GitHub repo, plus a Postgres service (Railway sets `DATABASE_URL`).
2. Set `OWNER_EMAIL`, `OWNER_PASSWORD` (10+ characters) and `OWNER_NAME` on the app service.
3. Build command `npm run build`; start command `npm run migrate && npm run seed && npm start`.
4. After the first login, the owner password can be removed from the variables; seeding only
   creates an owner when none exists.

## Forgot the owner password

In Railway, on the app service, set a new `OWNER_PASSWORD` (10+ characters) and
`OWNER_RESET_PASSWORD=true`. After it redeploys once, delete `OWNER_RESET_PASSWORD`.

## Revenue Checkup

From a client page, "Start checkup" opens 15 statements across five areas (getting found,
turning inquiries into sales, reaching the right buyers, bringing customers back, pricing).
Rate each 1 to 5 with the owner. The result page scores each area 0 to 100, names the one or
two areas holding revenue back, and builds a 90-day plan from them. "Print or save as PDF"
gives the owner a copy. The statements and plan steps live in `src/lib/checkup.js`.

## The loop

1. **Checkup** finds where a client's revenue is stuck and builds a 90-day plan.
2. **Baseline**: the client's numbers before we start, confirmed by the client.
3. **The work**: "Add plan to tasks" on a checkup turns its plan into tasks due at the end of
   each plan month. "This week" lists open tasks, late ones first; tap the box when done.
4. **Monthly results**: each month's revenue, inquiries and new customers, compared to the
   baseline.
5. **Money** (owner only): the monthly fee for every month from contract start to contract end
   (or now), plus the growth bonus = bonus % x (month revenue - baseline revenue), never below
   zero. The bonus is billed only when the client confirmed both the baseline and that month.
   Each month is due on the 15th of the next month and shows as late after that. The rules live
   in `src/lib/billing.js`, with tests in `tests/billing.test.mjs`.

## Rules built in

- Money is stored in whole cents.
- Only owners see or change deal terms and fees. Team members never see them.
- Once a client confirms a baseline or a month's numbers, only an owner can change them,
  because the growth bonus is measured against them.
