# Instive CRM

A first MVP of the internal Instive sales workspace: daily follow-ups, prospects, companies, pipeline, contact imports and activity analytics. Next.js App Router, TypeScript, Supabase Auth/PostgreSQL, custom responsive CSS, Lucide, Papa Parse and ExcelJS. No separate backend server required.

## Run locally

1. Install Node.js 22. Run `npm install`.
2. Create a Supabase project (PostgreSQL 15 or newer). Run `supabase/migrations/001_crm.sql` once in the SQL editor.
3. Copy `.env.example` to `.env.local` and set the project URL and public publishable/anon key (never a service-role key).
4. In Supabase Authentication settings, disable public sign-ups and enable email/password. Create users with secure passwords in Authentication > Users.
5. In the SQL editor, create the workspace and assign your Auth user UUID (replace placeholders):

```sql
insert into public.workspaces (name) values ('Instive AI') returning id;
insert into public.workspace_members (workspace_id,user_id,role)
values ('WORKSPACE_UUID','AUTH_USER_UUID','admin');
```

Add further members via the same statement with role `member`. Memberships are administrator-provisioned; both roles currently have identical CRUD privileges on CRM data within their workspace. They cannot manage memberships from the app. Assignment is a free-text owner label rather than access restriction.

6. Run `npm run dev`; visit http://localhost:3000. Sign in.
7. Run `npm test`, `npm run typecheck`, `npm run build` before deployment.

## Deploy on Vercel

Make the repository private first. Import Instive/instive-crm in Vercel, select Next.js, use Node 22, set both environment variables from `.env.example`, and deploy. Use a commercial-eligible Vercel plan. Add `crm.instive.ai` in Settings > Domains and follow DNS instructions. Set Supabase Auth Site URL to the deployed origin. Do not commit real keys or lead files. Use a separate Supabase project for development and configure backups before importing business data.

## Import format

First row of XLSX/CSV/TSV must contain headers. Common header aliases include Name, First Name, Last Name, Company, Job Title, Email, Phone, LinkedIn URL, Country, Industry, Source, Type, Priority, Notes. The first sheet of XLSX is used; old `.xls` is unsupported. Simple text paste supports blank-line separated blocks with a name, a `Role at Company` line, email and LinkedIn URL; source text is retained as notes. More complex paste needs manual correction. Preview allows editing the name, company, email, and LinkedIn URL. Duplicate checking skips email, phone, LinkedIn and name+company matches. Email uniqueness is database-enforced; other checks are client-side and can race on concurrent imports. Export uses CSV formula escaping.

## Scope and limitations

- Today shows due, overdue, upcoming, new and unscheduled active prospects. The Follow-ups page shows scheduled actions grouped by date, with a 7-day, 30-day or all-upcoming window and priority filter. Dates are local calendar dates; the window includes weekends. Reschedule opens contact editing and snooze moves the current due date (or today, if overdue) one business day forward. Outreach activity updates status and next date atomically; date defaults are editable and skip weekends, not holidays.
- Contacts and interaction history are workspace-shared under row-level security. The app stores a single next action on each contact, not a full task queue per contact.
- Companies are grouped by name with optional company metadata. Deals support a single linked contact, type, stage, value and expected close date; stage is edited in a form, not dragged.
- Analytics are all-time counts and status/channel breakdowns. Campaign tracking, AI parsing, Gmail, calendar sync, automatic lead generation, reminders, enrichment, lead scoring and fine-grained team roles are future work.
- Browser reads/writes Supabase directly with authenticated RLS; there are no privileged server keys. The application loads workspace records with paginated requests, but the UI renders the resulting list client-side; large databases will need server-side filtering/virtualization.
- The repository was built in an environment unable to download npm dependencies. Pure model tests passed, but the full Next.js build, browser flows and live RLS migration have not been verified. Treat as an MVP source handoff, not a production-certified release. Test with dummy records and two different workspaces before real data.

## Initial push (if repository is empty)

```bash
git init -b main
git add .
git commit -m "Build Instive CRM MVP"
git remote add origin https://github.com/Instive/instive-crm.git
git push -u origin main
```

If the remote is no longer empty, clone it and copy these files into a branch instead of overwriting existing work.
