# Plan: Multi-Company Support + Supreme Admin

## What We're Doing

Adding multi-company support to BuilderSync. A Supreme Admin (you, `hyrumjo253@gmail.com`) manages all companies from a separate admin dashboard. Each company's data is isolated — builders in Company A can't see Company B's projects, subs, or templates.

---

## Current Database Problems

Right now there is **zero company isolation**. Here's how data is currently stored:

- **Users (`login_info`):** Have a `companyName` string field but it's just text — not linked to anything. All builders see ALL projects system-wide.
- **Projects:** No owner/company association. `GET /projects` with `role=builder` returns `Projects.query.all()` — every project in the database.
- **Subdivisions:** No company association. Global to the entire system.
- **Templates (schedule, home, document):** All global. Every builder shares the same templates.
- **Selection Items:** Global catalog. No per-company customization.
- **Subcontractors:** Fetched via `GET /users` filtering by `role='contractor'` — returns ALL contractors, not just a company's contractors.

Tables that are already scoped through their parent project (these are fine, they'll inherit company scope automatically):
- `job_users`, `change_orders`, `change_order_document`, `project_selection`, `schedule`, `schedule_edit_log`, `daily_logs`, `todos`, `documents`, `employee`, `subdivision_contractor`, `workday_exemption` (when tied to a project)

---

## Database Changes

### Step 1: New `Company` model

```python
class Company(db.Model):
    id          = Integer, PK
    name        = String(200), required, unique
    status      = String(20), default 'active'   # active | paused | deleted
    created_at  = DateTime
    updated_at  = DateTime
```

### Step 2: Update `LoginInfo` (Users)

Add these columns:
- `company_id` — FK → companies.id (nullable, NULL for Supreme Admin)
- `authorized` — Boolean, default True for now (False for new signups once registration flow is updated)

Add new role value `'admin'` for the Supreme Admin.

Seed the Supreme Admin on startup:
- username: `hyrumjo253@gmail.com`
- password: `Totowewewe43@`
- role: `admin`
- company_id: NULL
- authorized: True

### Step 3: Add `company_id` FK to these tables

| Table | Why |
|-------|-----|
| `projects` | So each project belongs to a company |
| `subdivision` | So each subdivision belongs to a company |
| `schedule_template` | So templates are per-company |
| `home_template` | So home models are per-company |
| `selection_item` | So selection catalogs are per-company |
| `document_template` | So document templates are per-company |
| `workday_exemption` | For global (non-project) exemptions, scope to company |

### Step 4: Update all data-fetching routes to filter by `company_id`

Every GET endpoint that returns lists must scope results to the requesting user's company:
- `GET /projects` — `WHERE company_id = user.company_id`
- `GET /users` — `WHERE company_id = user.company_id`
- `GET /subdivisions` — `WHERE company_id = user.company_id`
- `GET /selection-items`, `/schedule-templates`, `/home-templates`, `/document-templates` — same
- All POST endpoints must set `company_id` from the creating user's company
- All PUT/DELETE endpoints must verify the resource belongs to the user's company

---

## Supreme Admin Backend

### New admin-only API endpoints:

```
GET    /admin/companies                — List all companies with stats
POST   /admin/companies                — Create a new company
PUT    /admin/companies/:id            — Update company name
PUT    /admin/companies/:id/pause      — Pause company (users can't log in)
PUT    /admin/companies/:id/activate   — Reactivate paused company
DELETE /admin/companies/:id            — Soft-delete company + deactivate all its users
GET    /admin/companies/:id/users      — List users in a company
GET    /admin/users/pending            — List users awaiting authorization
PUT    /admin/users/:id/authorize      — Approve a pending user
PUT    /admin/users/:id/reject         — Reject/delete a pending user
GET    /admin/stats                    — Overview stats
```

### Login changes:
- If `user.role == 'admin'` → return role so frontend routes to admin dashboard
- If `user.authorized == False` → return error "Account pending approval"
- If `user.company.status == 'paused'` → return error "Company account is suspended"

---

## Supreme Admin Frontend

### New file: `app/admin.jsx`

Admin dashboard with a sidebar containing:

1. **Companies** (default view)
   - List of all companies: name, status badge, user count, project count, created date
   - Search bar to filter
   - "Add Company" button → modal
   - Click a company → detail panel with:
     - Company info
     - User list (name, email, role)
     - Pause / Activate / Delete buttons

2. **Pending Users**
   - List of users with `authorized=false`
   - Name, email, role, company, signup date
   - Approve / Reject buttons

3. **Overview stats**
   - Total companies, total users, total projects
   - Breakdown by company status

### Routing change in `_layout.jsx`:
- When `user.role === 'admin'`, render admin layout (no bottom tabs, goes straight to admin.jsx)
- All other roles continue to the existing dashboard

---

## Implementation Order

1. **Database models** — Add `Company` model, add `company_id` + `authorized` to `LoginInfo`, add `company_id` to the 7 tables listed above
2. **Seed Supreme Admin** — Auto-create on app startup if not exists
3. **Login flow** — Check authorized, company status, and admin role
4. **Admin API endpoints** — All the `/admin/*` routes
5. **Company-scope existing routes** — Update every GET/POST/PUT/DELETE to filter by company
6. **Admin frontend** — Build `admin.jsx` with companies list, pending users, and stats
7. **Routing** — Update `_layout.jsx` to route admin users to the admin dashboard
