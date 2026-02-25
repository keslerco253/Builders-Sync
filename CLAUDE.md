# CLAUDE.md

## Project Overview

Builders-Sync is a construction project management application for builders, contractors, and customers. It supports multi-tenant company management, project tracking, scheduling, change orders, document management, daily logs, selections, and go-live workflows.

## Architecture

- **Frontend**: React Native + Expo (SDK 54) with Expo Router (file-based routing) — located in `GrokCode/frontEndCode/`
- **Backend**: Python Flask API with SQLAlchemy ORM — located in `GrokCode/app.py`
- **Database**: MySQL (`liberty_homes` database via `mysql+pymysql`)
- **Auth**: JWT Bearer tokens via `URLSafeTimedSerializer` (7-day expiry)
- **API Base URL**: `https://buildersync.net` (configured in `GrokCode/frontEndCode/app/context.jsx`)

## Directory Structure

```
GrokCode/
├── app.py                    # Flask backend (all routes + 22 DB models)
├── uploads/                  # Uploaded files (UUID-named, served at /uploads/<file>)
├── frontEndCode/
│   ├── app/                  # Expo Router screens (JSX/TSX)
│   │   ├── _layout.jsx       # Root layout with auth + theme providers
│   │   ├── context.jsx       # AuthContext, ThemeContext, API base URL, 80+ color tokens
│   │   ├── login.jsx         # Login screen
│   │   ├── register.jsx      # Registration screen
│   │   ├── dashboard.jsx     # Main dashboard (large file)
│   │   ├── currentProjectViewer.jsx  # Project detail view (large file)
│   │   ├── account.jsx       # User account & company logo management
│   │   ├── admin.jsx         # Admin dashboard (companies, pending users, stats)
│   │   ├── userManagement.jsx # User/company management & invite system
│   │   ├── reports.jsx       # Reports (schedule, budget, change orders)
│   │   ├── scheduleBuilder.jsx
│   │   ├── scheduleCalendar.jsx
│   │   ├── datePicker.jsx    # Custom date picker modal
│   │   └── (tabs)/           # Bottom tab navigation
│   │       ├── _layout.tsx   # Tab config (Home, Projects, New Project, Sub Contractors, Profile)
│   │       ├── index.jsx     # Home tab (calendar view)
│   │       ├── projects.jsx  # Projects list (alphabetical sections)
│   │       ├── newProjects.jsx # New project creation form
│   │       ├── subContractors.jsx # Sub contractors tab
│   │       └── profile.jsx   # User profile tab
│   ├── components/           # Reusable UI components (.tsx)
│   │   ├── themed-text.tsx, themed-view.tsx  # Theme-aware wrappers
│   │   ├── haptic-tab.tsx    # Tab button with haptic feedback
│   │   ├── parallax-scroll-view.tsx
│   │   └── ui/              # Icon system, collapsible
│   ├── constants/theme.ts    # Color/font constants
│   └── hooks/                # useColorScheme, useThemeColor
```

## Setup & Running

### Backend
```bash
cd GrokCode
pip install flask flask-sqlalchemy flask-cors pymysql werkzeug itsdangerous
python app.py
# Runs on 0.0.0.0:5000 (debug mode)
# Auto-migrates schema on startup (adds missing tables/columns)
```

### Frontend
```bash
cd GrokCode/frontEndCode
npm install
npx expo start        # Dev server
npm run android       # Android
npm run ios           # iOS
npm run web           # Web browser
```

## Linting

```bash
cd GrokCode/frontEndCode
npm run lint          # ESLint v9 flat config with eslint-config-expo
```

## Testing

No test suite is currently configured.

## Key Technical Details

- **Auth**: JWT tokens (7-day expiry) containing user_id, role, company_id; protected routes via `@before_request` check
- **Roles**: `admin` (supreme admin), `company_admin`, `builder`, `contractor`, `customer`
- **Multi-Tenancy**: Resources scoped by `company_id`; company status (active/paused/deleted)
- **Theme**: Dark (default) and Light mode via `ThemeContext` with 80+ color tokens; persisted to backend via `PUT /users/{id}/theme`
- **TypeScript**: Strict mode enabled, path alias `@/*` maps to project root
- **New Architecture**: React Native New Architecture is enabled
- **React Compiler**: Enabled in Expo config
- **Typed Routes**: Enabled in Expo config
- **Navigation**: File-based routing via Expo Router with bottom tabs (5 tabs) + stack navigation
- **State Management**: React Context API (no Redux/Zustand)
- **HTTP Client**: Axios with `apiFetch()` helper for authenticated requests
- **Icons**: Font Awesome (`@fortawesome/react-fontawesome`)
- **Calendar**: `react-native-calendars` for home tab and scheduling views
- **React**: 19.1.0, **React Native**: 0.81.5

## Database Models

22 models in `app.py`:

### Core / Multi-Tenant
- **Company** — Top-level tenant (name, status: active/paused/deleted); all resources scoped by company
- **LoginInfo** — Users with auth, profile, role, company_id, company_logo (base64), theme_preference, authorized/registered flags

### Projects
- **Projects** — Construction projects with pricing, status, customer/contractor assignments, subdivision_id, company_id, go_live flag, on_hold/hold_start_date/hold_reason, dates_from_schedule
- **JobUsers** — Project-to-user role mapping

### Scheduling
- **Schedule** — Gantt-style tasks with start/end dates, baseline dates, predecessor linking (FS/SS + lag), contractor/trade assignment, progress, exception support
- **ScheduleEditLog** — Audit trail for schedule changes (field, old/new value, reason, editor)
- **ScheduleTemplate** — Reusable schedule templates (company-scoped, JSON task array)
- **WorkdayExemption** — Global and per-project holidays/non-workdays (supports recurring)

### Change Orders
- **ChangeOrders** — Digital signatures (builder/customer/sub with initials + name), status flow (pending_customer → pending_builder → pending_sub → approved/expired), due dates, task linking with extension days
- **ChangeOrderDocument** — Documents attached to change orders; auto-copied to project Documents on full approval

### Documents
- **Documents** — Project/subdivision documents (media_type: document/photo/video), file_url to uploads/ dir, template support
- **DocumentTemplate** — Reusable templates (file/folder type, applies_to: projects/subdivisions/both)

### Selections
- **SelectionItem** — Company-scoped selection catalog with JSON options array
- **ProjectSelection** — Per-project customer choices (status: pending/confirmed)

### Subdivisions
- **Subdivision** — Subdivision groupings (company-scoped)
- **SubdivisionContractor** — Trade-to-contractor mapping per subdivision

### Go-Live Workflow
- **GoLiveStep** — Configurable go-live checklist steps per company (sortable)
- **GoLiveProjectStep** — Tracks step completion per project (completed_by, completed_at)

### Other
- **HomeTemplate** — Pre-built home design templates (sqft, stories, bedrooms, bathrooms, company-scoped)
- **Employee** — Subcontractor employees (name, job_description, phone)
- **DailyLogs** — Daily construction logs (date, author, weather, notes, workers)
- **Todos** — Task items for projects (assignee, due_date, priority, done)

## API Endpoints (109 routes)

### Authentication
- `POST /login`, `POST /register`, `POST /change-password`

### Supreme Admin (`/admin/*`)
- Company CRUD, pause/activate/delete companies
- Pending user authorization/rejection
- Admin invites, database reset, stats dashboard

### Company Admin (`/company/*`)
- Invite users, list/remove company users

### Users
- CRUD, toggle active, reset password, theme preference, company logo, company trades

### Projects
- CRUD, hold/unhold with reason, go-live steps (list + mark complete)

### Schedule
- Task CRUD with predecessor linking, batch update, edit with audit trail
- Schedule edit log, exceptions, workday exemptions (global + per-project)

### Templates
- Schedule templates CRUD, home templates CRUD, document templates CRUD

### Change Orders
- Project change orders (list/create), sign flow, document attach/delete
- User-scoped change orders listing

### Selections, Subdivisions, Documents, Daily Logs, Todos
- Standard CRUD patterns scoped by project/company

### File Upload
- `POST /upload-file`, `POST /upload-image` — Base64 input → `/uploads/<uuid>.<ext>`
- `GET /uploads/<filename>` — Public file serving

## Key Features & Flows

### Multi-Tenant Company Management
- Supreme admin creates/manages companies; company admins manage their own users
- User invitation flow: admin invites → user registers → admin authorizes
- Company pause/delete cascades to user deactivation
- All resources (projects, templates, selections) scoped by company_id

### Change Orders
- Builder creates a change order (auto-signs) → customer signs → sub signs (if assigned) → approved
- Documents can be attached at creation or later via the detail modal
- On approval: contract price updates, task extensions apply, and **attached documents are automatically copied into the project's Documents folder** under the "Change Order" category
- Viewable by builder, customer, and assigned subcontractor

### Schedule & Workday Intelligence
- Gantt-style scheduling with predecessor relationships (FS/SS + lag days)
- Workday calculation helpers: `_add_workdays()`, `_workday_count()`, `_calc_end_from_workdays()`
- Global and per-project workday exemptions (holidays, non-workdays)
- Schedule edit audit trail with reason tracking
- Reusable schedule templates auto-applied on project creation

### Go-Live Workflow
- Company admins define configurable go-live checklist steps (sorted)
- Per-project step completion tracking with user attribution and timestamps
- Projects have a `go_live` flag toggled when workflow completes

### Project Hold
- Projects can be put on hold with a reason (`on_hold`, `hold_start_date`, `hold_reason`)
- Hold preview available without DB writes via `_apply_hold_preview()`

### Documents
- Supports documents, photos, and videos (media_type field)
- Upload via base64 to `/upload-file`, stored in `uploads/` as UUID filenames
- Templates define required document types per project/subdivision (applies_to: projects/subdivisions/both)
- Documents tab has an edit mode (pencil icon) — toggles delete (✕) icons on files
- Tapping a document row opens/views the file; download button (⬇) for saving

### Company Logo
- Builders upload logos in account settings (base64, max 2MB)
- Logo is stored per-user in `company_logo` field
- All builders in a company see the logo (falls back to `/builder-logo` endpoint)
- Customers and contractors see the builder's logo via `/builder-logo`
- Displayed in dashboard sidebar and header

### Reports
- Schedule reports, budget reports, and change order reports via `reports.jsx`

## Common Patterns

- API calls use Axios with the base URL from `context.jsx`; `apiFetch()` injects auth token
- Screens are `.jsx` files in `app/` directory; utility components are `.tsx` in `components/`
- Styles use React Native `StyleSheet.create()` inline in each file
- Theme colors are accessed via `useContext(ThemeContext)`
- Auth state (user, token, role) accessed via `useContext(AuthContext)`
- Complex modals that need hooks (useState/useEffect) are extracted as separate components (e.g., `ChangeOrderDetailModal`, `NewChangeOrderModal`, `UploadModal`)
- File uploads use base64 encoding sent to `/upload-file` or `/upload-image`, which return a `/uploads/<uuid>.<ext>` path
- All models have `.to_dict()` methods for JSON serialization
- Auto-migration on backend startup: adds missing tables/columns with safe defaults
- Backend uses string-based dates (YYYY-MM-DD) for frontend compatibility
