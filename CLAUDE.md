# CLAUDE.md

## Project Overview

Builders-Sync is a construction project management application for builders, contractors, and customers. It supports project tracking, scheduling, change orders, document management, and daily logs.

## Architecture

- **Frontend**: React Native + Expo (SDK 54) with Expo Router (file-based routing) — located in `GrokCode/frontEndCode/`
- **Backend**: Python Flask API with SQLAlchemy ORM — located in `GrokCode/app.py`
- **Database**: MySQL (`liberty_homes` database via `mysql+pymysql`)
- **API Base URL**: `https://buildersync.net` (configured in `GrokCode/frontEndCode/app/context.jsx`)

## Directory Structure

```
GrokCode/
├── app.py                    # Flask backend (all routes + 17 DB models)
├── uploads/                  # Uploaded files (UUID-named, served at /uploads/<file>)
├── frontEndCode/
│   ├── app/                  # Expo Router screens (JSX/TSX)
│   │   ├── _layout.jsx       # Root layout with auth + theme providers
│   │   ├── context.jsx       # AuthContext, ThemeContext, API base URL
│   │   ├── dashboard.jsx     # Main dashboard (large file)
│   │   ├── currentProjectViewer.jsx  # Project detail view (large file)
│   │   ├── account.jsx       # User account & company logo management
│   │   ├── scheduleBuilder.jsx
│   │   ├── scheduleCalendar.jsx
│   │   └── (tabs)/           # Bottom tab navigation screens
│   ├── components/           # Reusable UI components
│   ├── constants/theme.ts    # Color/theme constants
│   └── hooks/                # Custom React hooks
```

## Setup & Running

### Backend
```bash
cd GrokCode
pip install flask flask-sqlalchemy flask-cors pymysql werkzeug
python app.py
# Runs on http://192.168.5.36:5000
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
npm run lint          # ESLint with eslint-config-expo
```

## Testing

No test suite is currently configured.

## Key Technical Details

- **Auth**: Email/password login, stored in React Context (`AuthContext`)
- **Theme**: Dark (default) and Light mode via `ThemeContext` with 80+ color tokens
- **TypeScript**: Strict mode enabled, path alias `@/*` maps to project root
- **New Architecture**: React Native New Architecture is enabled
- **React Compiler**: Enabled in Expo config
- **Navigation**: File-based routing via Expo Router with bottom tabs + stack navigation
- **State Management**: React Context API (no Redux/Zustand)
- **HTTP Client**: Axios

## Database Models

Key models in `app.py`:

- **LoginInfo** — Users (builders, contractors, customers) with auth, profile, and `company_logo` (base64)
- **Projects** — Construction projects with pricing, status, customer/contractor assignments
- **Schedule** — Task scheduling with Gantt-style start/end dates, contractor assignment
- **ChangeOrders** — Change orders with digital signatures (builder_sig, customer_sig, sub_sig), status flow (pending_customer → pending_builder → pending_sub → approved/expired), due dates, and task linking
- **ChangeOrderDocument** — Documents attached to change orders (name, description, file_url); auto-copied to project Documents on full approval
- **Documents** — Project/subdivision documents (file_url points to uploads/ dir), supports templates
- **DocumentTemplate** — Reusable document templates (file/folder types)
- **SelectionItem** — Global selection catalog with options (name, image, price, comes_standard)
- **ProjectSelection** — Per-project selection choices
- **Subdivision** — Subdivision groupings for projects
- **DailyLog** — Daily construction logs
- **Punch** — Punch list items
- **Todo** — Task items for projects

## Key Features & Flows

### Change Orders
- Builder creates a change order (auto-signs) → customer signs → sub signs (if assigned) → approved
- Documents can be attached at creation or later via the detail modal
- On approval: contract price updates, task extensions apply, and **attached documents are automatically copied into the project's Documents folder** under the "Change Order" category
- Viewable by builder, customer, and assigned subcontractor
- Endpoints: `GET/POST /projects/:pid/change-orders`, `PUT /change-orders/:id/sign`, `GET/POST /change-orders/:id/documents`, `DELETE /change-order-documents/:id`

### Documents
- Supports documents, photos, and videos (media_type field)
- Upload via base64 to `/upload-file`, stored in `uploads/` as UUID filenames
- Templates define required document types per project/subdivision
- Documents tab has an edit mode (pencil icon) — toggles delete (✕) icons on files
- Tapping a document row opens/views the file; download button (⬇) for saving

### Company Logo
- Builders upload logos in account settings (base64, max 2MB)
- Logo is stored per-user in `company_logo` field
- All builders in a company see the logo (falls back to `/builder-logo` endpoint)
- Customers and contractors see the builder's logo via `/builder-logo`
- Displayed in dashboard sidebar and header

## Common Patterns

- API calls use Axios with the base URL from `context.jsx`
- Screens are `.jsx` files in `app/` directory; utility components are `.tsx` in `components/`
- Styles use React Native `StyleSheet.create()` inline in each file
- Theme colors are accessed via `useContext(ThemeContext)`
- Auth state is accessed via `useContext(AuthContext)`
- Complex modals that need hooks (useState/useEffect) are extracted as separate components (e.g., `ChangeOrderDetailModal`, `NewChangeOrderModal`, `UploadModal`)
- File uploads use base64 encoding sent to `/upload-file` or `/upload-image`, which return a `/uploads/<uuid>.<ext>` path
