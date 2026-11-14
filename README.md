# Baseline Growth

Private web app for a company that finds new customers for client businesses and is paid a
share of what those customers spend. The company name is set in `src/lib/config.ts`.

## How it works

**The menu.** Owner: Home, Next up, Businesses, Team, Money. Reps: Next up, My prospects,
Scoreboard. Everything else (all prospects, emails and replies, manual search, referral partners,
insights) is linked from the Businesses page or shows up on Home when it needs a decision.

**Home (owner).** One list of what needs you, in order, each with the button that deals with it:
reply drafts to send, each business's next setup step (answers, mailbox, approve the first email),
prospects to hand over after a held meeting, failed emails, reps with 5+ overdue calls, missing
keys. Plus a button into your own Next up and the last 7 days' numbers.

**Next up (everyone who sells).** One prospect at a time, picked in this order: people who
replied, calls and visits due (most overdue first), then new prospects with a phone number nobody
has called. The card has a big call button (and directions for visits), "Listen and coach me" (the
live call assistant), the opening line, what we know, and the full script. Tap what happened (no
answer, voicemail, gatekeeper, talked, signed up, not interested, wrong number, or book a
meeting) and the next prospect comes up; the system sets the next step itself. "Skip for now"
sends one to the back. Daily goals and the streak show at the top; new customers come up with a referral ask after the due follow-ups. Meetings show at the top, with Held / No-show once their time has passed;
each sets the obvious next step. The owner sees their own prospects plus unassigned ones, with
"Everyone" to see the whole team's. Order rules in `src/lib/queue.js`.

**Approve once.** A business's emails wait for approval until the owner reads its first email
(on Home or the business page) and presses "Looks good, start sending". From then on its schedule
sends on its own. "Pause" puts it back to approving each email. Reply drafts always need approval.

**Setting up a business.** **Add a business** starts with their website. The system reads the
home page and up to four useful pages (about, services, pricing, areas), with the same network
safety checks as prospect research. It picks up the name, logo, phone and booking link, and with
`ANTHROPIC_API_KEY` drafts the offer, reasons customers pick them, first step, customer types,
places served and common objections, using only what the site says. "Nationwide" as a place searches the 50 largest US metro areas. Money answers and the mailing address are optional to start; emails do not send until the address is filled in. Drafted answers are marked
"From their website, check it"; the ones only a person can give are marked "Ask the owner" (who
gets interested customers, what a customer is worth, who not to contact, visits, mailing address)
or "From your agreement" (deal terms). The deal terms can be saved as your standard and are then
pre-filled for the next business. "No website? Fill it in by hand" shows every question
(what they sell, best customer types, places served, what a customer is worth, how customers
start, why people pick them, common objections and answers, pricing, the deal terms) and builds
from the answers: the offer line, the sales script, and a search for every customer type in every
place. **Autopilot** (on per business) then runs inside the background job: it runs searches that
are due (never-run first, each refreshed after 30 days, within the daily Google search limit set
on the Outbox page), adds businesses with a fit score of 60+ and contact details, up to the daily
number per business and never more than two days' worth untouched, splits them among reps by
lightest load (owners if there are no reps), and the outbox queues their first emails. Reps open
Next up and work it. Rules in `src/lib/onboarding.js` and `src/lib/autopilot.js`.


0. **Find.** For each client, save what kind of business to look for and where ("independent
   auto repair shop" in "Detroit, MI"), plus names to skip (chains). "Run search" pulls matching
   businesses from Google Places, drops closed, excluded, unreachable and already-known ones,
   reads each website for a public contact email and a one-line description, and scores fit
   0-100. Tick the good ones to make them prospects. Needs `GOOGLE_PLACES_API_KEY` (Google bills
   per search). Website reads refuse internal network addresses, follow at most 3 redirects and
   are capped in size and time.
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

**Sales team.** Each rep logs in to **Today**: replies waiting (call now), callbacks and next steps
due, meetings today and tomorrow, then fresh prospects grouped by city for calling or visiting.
On every prospect a rep logs a call, visit, email or LinkedIn touch with an outcome (no answer,
voicemail, gatekeeper, talked, meeting booked, signed, not interested, wrong contact); the outcome
moves the prospect along and sets a default next step, and any real conversation stops queued
emails. Meetings are booked with a time and marked held, no-show or cancelled. Each client has a
sales script shown on its prospect cards. When a prospect replies by email, the assigned rep (or
the owners) is emailed at once. **Scoreboard** shows calls, visits, conversations, meetings booked
and held, and customers per rep; commission is each rep's percent (set on Team) of what the
company has earned on customers they won, counting only client-confirmed amounts. Rules in
`src/lib/sales.js`.

**Rep tools.** Each open prospect shows a 30-second brief built from known data (what they do,
rating signals, history, the one question to open with). "Show their page" opens a personal page
for the business with the client's offer, a QR code and a button to the client's claim or booking
link, tagged `?ref=bg-<prospect id>`. Clients with pricing rules get an instant quote (price per
1,000 sq ft per visit by building type, a minimum, a +/- range) that can be saved to the prospect.
Today groups visits by city with a Google Maps route link (up to 10 stops), shows daily goals and
a streak, and lists new customers to ask for referrals. **Partners** get a public link
(`/r/<code>`) to send referrals, guarded by a hidden bot field, a per-address rate limit and the
do-not-contact list; referrals land on the rep's Today list. **Insights** shows each client's
funnel and why deals were lost. Rules in `src/lib/playbook.js`.

**Call assistant** (`/call/<prospect id>`). After the rep confirms the prospect agreed to a
note-taker, the browser's speech recognition transcribes the speakerphone call on the page (no
audio stored) and the next best line is suggested every few seconds: by Claude when
`ANTHROPIC_API_KEY` is set (`src/lib/coach.ts`), otherwise from the client's script by matching
objections. The rep can also type what was said. Speech recognition needs a browser that supports
it (Chrome works best).

Also: anyone marked "asked not to be contacted" can never be added again, for any client.
"This week" lists other tasks.

**The mixed schedule.** Each prospect walks seven steps from the day they were added: email
(day 0), call (day 1), email (day 3), visit (day 5), email (day 7), call (day 10), email (day 14).
Emails are queued in the Outbox; calls and visits appear on the assigned rep's Today list. A step
that cannot be done is skipped (no email address, no phone). Visits happen only for businesses
answered "yes" to "could a rep stop by?" and prospects with an address; otherwise the visit becomes
a call. A call or visit nobody logged is skipped after 3 days, or when the next email comes due,
so emails always go out on their days. Logging a call or visit moves the prospect past that step.
Any real reply or conversation stops the schedule and a person takes over.

**A mailbox per business.** On each business's page (owner only), connect the address the
business gave you: Google, Microsoft or other, with an app password. The password is stored
encrypted with `APP_SECRET` (set it on the server: a long random value; changing it makes saved
passwords unreadable, so re-enter them). "Test connection" logs in to send and to read. That
business's outreach goes out from its mailbox, under its own daily limit, and replies are read from
it. Businesses without one use the shared mailbox (the `SMTP_*`/`IMAP_*` settings), which is also
used for rep alerts and hand-offs when set. A logo link (answer in the onboarding questions, https
only) is shown small under the signature in the HTML version of each email.

**Connect with Microsoft.** Microsoft 365 mailboxes no longer accept passwords from outside apps,
so they connect with a button instead: the owner signs in to Microsoft and approves, and the
system stores an encrypted refresh token (no password) and signs in to send and read with
short-lived tokens. Needs an app registration in the Azure portal with the redirect address
`https://<this site>/oauth/microsoft/callback`, delegated permissions `SMTP.Send` and
`IMAP.AccessAsUser.All` (Office 365 Exchange Online) plus `offline_access`, `openid`, `email`,
and `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` in Railway. The mailbox
also needs "Authenticated SMTP" allowed in the Microsoft 365 admin center. Google mailboxes use an
app password.

**AI writing (needs `ANTHROPIC_API_KEY`).** The first email gets one personal opening sentence
written from the facts found about the prospect (rating, notes); if there is nothing specific and
true to say, there is no line. When a prospect replies, a reply is drafted from the business's
offer, reasons, first step, booking link, pricing and script, labelled with what they seem to want,
and shown under Outbox, Reply drafts. Drafts are never sent without a person pressing Approve &
send, even in automatic mode. Without the key, the email has no personal line and the draft is a
short template.

**Automatic sending and replies (Outbox).** Every 5 minutes the server queues messages that are
due, sends approved ones on weekdays inside the sending hours (default 9 to 17, Michigan time) up
to a daily cap (default 20), and reads the outreach inbox. Replies are matched to prospects by
email thread, then by sender, and sorted: a real reply moves the prospect to Talking and stops the
sequence; "no thanks" / unsubscribe blocks them for good; "not interested" marks them lost;
bounces mark the address bad; out-of-office is ignored. Follow-ups go out as replies in the same
thread. "Email to client" sends the client the prospect's details and what they wrote. Approve
first is the default; automatic mode is a setting. A Postgres advisory lock stops two runs from
overlapping, so nothing is sent twice. Nothing queues until sending is connected.

Mailbox settings (Railway variables on the app service; use a separate outreach domain):
`OUTREACH_FROM`, `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `IMAP_HOST`,
`IMAP_PORT` (993), `IMAP_USER`, `IMAP_PASS`. `OUTREACH_BACKGROUND=off` stops the background runs.

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

    # Browser tests other than autopilot expect e2e/fixtures.sql loaded after seeding.
    npm test                    # money rules, outreach schedule and messages
    node e2e/model.cjs          # full browser run against http://localhost:3100 (needs Playwright
                                # and a freshly migrated + seeded database, owner password
                                # testpassword123 for owner@example.test)
    node e2e/smtp-capture.cjs & # mail test: SMTP capture on :2525 plus a local IMAP server
    node e2e/mail.cjs           # (user outreach / testpass on :1143); app started with the SMTP_*,
                                # IMAP_* and OUTREACH_FROM settings, OUTREACH_BACKGROUND=off and
                                # OUTREACH_IGNORE_HOURS=1
    node e2e/mock-google.cjs &  # stand-in for Google Places on :3200, then start the app with
    node e2e/tools.cjs          # rep tools: page + QR, quote, brief, route, partners, referrals, goals, call
    node e2e/mock-claude.cjs &  # stand-in Claude API on :3300; start the app with ANTHROPIC_API_KEY=test-key
    node e2e/coach-ai.cjs       # ANTHROPIC_BASE_URL=http://localhost:3300, then this checks the AI coach
    node e2e/autopilot.cjs      # empty system -> questions -> autopilot -> reps' Today (no fixtures)
    node e2e/sales.cjs          # sales team: Today, logging, meetings, scoreboard, commission
    node e2e/find.cjs           # GOOGLE_PLACES_API_KEY=test-key PLACES_API_URL=http://localhost:3200/places ALLOW_PRIVATE_FETCH=1
    node e2e/nextup.cjs         # Home to-do list, approve once, Next up queue (APP_SECRET, OUTREACH_BACKGROUND=off)
    node e2e/signup.cjs         # add a business from its website (mock-claude on :3300, ALLOW_PRIVATE_FETCH=1)
    node e2e/microsoft.cjs      # Connect with Microsoft against e2e/mock-microsoft.cjs (:3500); see the file for settings
    node e2e/schedule.cjs       # business mailbox, mixed schedule, logo, AI first line and reply drafts.
                                # App started WITHOUT SMTP_/IMAP_, with APP_SECRET, ANTHROPIC_API_KEY=test-key,
                                # ANTHROPIC_BASE_URL=http://localhost:3300, OUTREACH_BACKGROUND=off,
                                # OUTREACH_IGNORE_HOURS=1; IMAP user sales@libra.example / app-pass-1

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
