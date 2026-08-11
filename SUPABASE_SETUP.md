# Supabase setup for Wisconsin Racer

This project uses Supabase as its shared backend. Built-in templates are seeded
once into Supabase so shared race scores can reference them. Car drawings,
settings, and ghost replays remain local to the browser.

## What you must do in the Supabase dashboard

1. Create or sign in to a Supabase account.
2. Create an organization and a new project on the free plan. Save the
   database password somewhere safe; it is not needed by the React frontend
   and should not be sent to Codex.
3. Open **Project Settings -> API** and copy only:
   - the **Project URL**;
   - the **Publishable key** (older projects may label this the `anon` key).
4. In the repository root, copy `.env.example` to `.env.local` and replace
   the two placeholder values. Never put a `service_role`, secret, or database
   password in this file or in frontend source code.
5. Open **SQL Editor**, create a new query, paste the contents of
   `supabase/migrations/20260810000000_initial_schema.sql`, review it, and run
   it once.
6. Open **Authentication -> Providers** and enable **Anonymous Sign-Ins**.
   Email can remain enabled for a future account-upgrade flow. Configure URL
   redirects for localhost and GitHub Pages if Email confirmations are used.

## Important boundary

The publishable/anon key identifies the project but is not an authorization
mechanism. Row Level Security policies are the authorization boundary.
Anonymous Supabase users receive the `authenticated` database role, while each
write policy still requires ownership through `auth.uid()`.

For a public deployment beyond coursework, enable CAPTCHA or Turnstile in
Supabase Auth to limit anonymous-account abuse.

The current score model still receives a race time from the browser. Supabase
can restrict who submits a score, but it cannot prove that a client-submitted
time was honestly produced. A future authoritative leaderboard would need a
server-side validation design.
