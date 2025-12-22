# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean corporate group affiliate visualization service (대한민국 기업 계열사 시각화). Full-stack monorepo with FastAPI backend and React frontend that integrates with Korean Government Data Portal APIs.

## Commands

### Development

```bash
# Run both API and web in parallel
pnpm dev

# Run individually
pnpm dev:api   # Backend only (port 8000)
pnpm dev:web   # Frontend only (port 3000)

# Build all packages
pnpm build

# Lint all packages
pnpm lint
```

### Backend (packages/api)

```bash
cd packages/api

# Setup
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Unix
pip install -e ".[dev]"

# Run with reload
uvicorn affiliate_api.main:app --reload --port 8000

# Test
pytest
pytest -v  # verbose
pytest tests/test_specific.py::test_function  # single test

# Lint
ruff check .
ruff format .
```

### Frontend (packages/web)

```bash
cd packages/web
pnpm install
pnpm dev      # Dev server on port 3000
pnpm build    # Production build
pnpm lint     # ESLint
```

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   React Frontend    │────▶│   FastAPI Backend   │
│   (port 3000)       │     │   (port 8000)       │
│   /api → proxy      │     │                     │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                            ┌──────────▼──────────┐
                            │   SQLite Database   │
                            │   (affiliate.db)    │
                            └──────────┬──────────┘
                                       │
                            ┌──────────▼──────────┐
                            │  Korean Gov Data    │
                            │  Portal APIs        │
                            │  (data.go.kr)       │
                            └─────────────────────┘
```

### Backend Structure (packages/api/src/affiliate_api/)

- `main.py` - FastAPI app, CORS, router registration
- `config.py` - Settings from env vars (DATA_PORTAL_API_KEY, DATABASE_URL)
- `database.py` - SQLAlchemy engine and session management
- `scheduler.py` - APScheduler for daily sync jobs (2 AM default)
- `clients/data_portal.py` - Government API client (XML→JSON via xmltodict)
- `models/` - SQLAlchemy ORM models (CorporateGroup, Affiliate, HoldingCompanyRelation, Stockholder)
- `routers/` - API endpoints (groups, affiliates, sync, search, holding, stockholder, integrated)
- `services/sync_service.py` - Data sync logic (upsert operations)

### Frontend Structure (packages/web/src/)

- `components/` - GroupList, CollapsibleTree, AffiliateGraph, HoldingTree, IntegratedGraph, StockholderPanel
- `hooks/` - React Query hooks (useGroups, useAffiliates)
- `services/api.ts` - API client functions
- `types/` - TypeScript interfaces

### Database Models

- **CorporateGroup**: Korean corporate groups (code, name, owner, affiliate_count)
- **Affiliate**: Subsidiary companies (group_code FK, name, corporate_number, ceo)
- **HoldingCompanyRelation**: Holding company hierarchies (ownership_rate, relation_type)
- **Stockholder**: Shareholder information (stockholder_name, total_rate, common_rate)

## API Endpoints

- `GET /api/groups` - List corporate groups
- `GET /api/affiliates?group_code=` - List affiliates by group
- `POST /api/sync` - Trigger data sync
- `GET /api/sync/status` - Sync status
- `GET /api/search?keyword=` - Search across all data
- `GET /api/holding/tree/{corpNumber}` - Holding company structure
- `GET /api/integrated/{groupCode}` - Combined holding + affiliate view
- `GET /api/stockholders/{corpNumber}` - Shareholder info

API documentation: http://localhost:8000/docs (Swagger) or /redoc

## Environment Variables

Create `.env` in packages/api/:
```
DATA_PORTAL_API_KEY=your_api_key_from_data.go.kr
DATABASE_URL=sqlite:///./affiliate.db
SCHEDULER_ENABLED=true
SYNC_CRON_HOUR=2
```

## Code Style

- Backend: Python 3.11+, Ruff for linting/formatting, line length 100
- Frontend: TypeScript strict mode, ESLint, Prettier (semi: false, single quotes)
- Path alias: `@/*` → `src/*` in frontend
