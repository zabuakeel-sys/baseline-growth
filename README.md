# Baseline Growth

Private web app for a company that finds new customers for client businesses and is paid a
share of what those customers spend. The company name is set in `src/lib/config.ts`.

## How it works

1. **Prospects.** For each client, add the people or businesses we will reach. Each gets a
   ready-to-send first message built from the client's one-line offer, then follow-ups 3, 7 and
   14 days later until they reply. Copy the message or open it in email, send it, tap "I sent
   it". Every message signs on the client's behalf, offers an opt-out and carries a mailing
   address, which US law (CAN-SPAM) requires in commercial email.
2. **Introduce and close.** Interested prospects are marked "Introduced to client" with a date:
   the record that the customer came from us. When they buy, "Became a customer" with the date.
3. **Customers we brought.** Each month the client reports what each of those customers paid
   them. We enter it and mark it confirmed once the client confirms.
4. **Money** (owner only). Per client: revenue share % x confirmed revenue of each customer we
   brought, for the agreed number of months from the month they became a customer (or as long as
   they stay), plus an optional fee per new customer and an optional monthly fee. Each month is
   due the 15th of the next month and shows as late after that. The rules live in
   `src/lib/billing.js`, tested in `tests/billing.test.mjs`.

Also: anyone marked "asked not to be contacted" can never be added again, for any client.
"This week" lists other tasks. The Revenue Checkup (15 questions, five areas) is an optional
tool for understanding a new client before agreeing terms.

Texts to prospects are deliberately not offered: cold texting carries legal risk under the
TCPA. Nothing is sent automatically; that needs an email provider, a sending domain and a
lawyer's sign-off.

## Run locally

    cp .env.example .env        # fill in DATABASE_URL and the OWNER_* values
    npm install
    npm run migrate             # creates the tables
    npm run seed                # first owner + starting clients (safe to rerun)
    npm run dev

## Tests

    npm test                    # money rules, outreach schedule and messages, checkup scoring
    node e2e/model.cjs          # full browser run against http://localhost:3100 (needs Playwright
    node e2e/checkup.cjs        # and a freshly migrated + seeded database, owner password
                                # testpassword123 for owner@example.test)

## Deploy on Railway

1. New project from this GitHub repo, plus a Postgres service (Railway sets `DATABASE_URL`).
2. Set `OWNER_EMAIL`, `OWNER_PASSWORD` (10+ characters) and `OWNER_NAME` on the app service.
3. Build command `npm run build`; start command `npm run migrate && npm run seed && npm start`.

## Forgot the owner password

In Railway, on the app service, set a new `OWNER_PASSWORD` (10+ characters) and
`OWNER_RESET_PASSWORD=true`. After it redeploys once, delete `OWNER_RESET_PASSWORD`.

## Rules built in

- Money is stored in whole cents.
- Only owners see deal terms and money. Team members never do.
- Once the client confirms a customer's monthly amount, only an owner can change it.
