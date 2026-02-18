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
├── app.py                    # Flask backend (all routes + 16 DB models)
├── frontEndCode/
│   ├── app/                  # Expo Router screens (JSX/TSX)
│   │   ├── _layout.jsx       # Root layout with auth + theme providers
│   │   ├── context.jsx       # AuthContext, ThemeContext, API base URL
│   │   ├── dashboard.jsx     # Main dashboard (large file)
│   │   ├── currentProjectViewer.jsx  # Project detail view (large file)
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

## Common Patterns

- API calls use Axios with the base URL from `context.jsx`
- Screens are `.jsx` files in `app/` directory; utility components are `.tsx` in `components/`
- Styles use React Native `StyleSheet.create()` inline in each file
- Theme colors are accessed via `useContext(ThemeContext)`
- Auth state is accessed via `useContext(AuthContext)`
