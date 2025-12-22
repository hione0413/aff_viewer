# 기업 계열사 시각화 서비스 - 구현 현황

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | 대한민국 기업 계열사 시각화 서비스 |
| 목표 | 특정 기업집단 선택 시 계열사 관계를 시각적으로 표현 |
| 데이터 소스 | 공정거래위원회 기업집단포털 API |
| 대상 범위 | 대규모기업집단 (약 80개 그룹, 2,000+ 계열사) |

---

## 구현 현황

### Phase 1: 기반 구축 ✅ 완료

#### 1.1 프로젝트 초기 설정

- [x] 프로젝트 구조 생성 (pnpm monorepo)
- [x] 패키지 매니저 설정 (pnpm workspace)
- [x] TypeScript 설정
- [x] ESLint, Prettier 설정

#### 1.2 공공데이터포털 API 연동

- [x] 공공데이터포털 API 키 발급
- [x] API 클라이언트 모듈 개발 (`packages/api/src/affiliate_api/clients/data_portal.py`)
  - 지정된 대규모기업집단 조회
  - 소속회사 조회
  - 지주회사 자회사/손자회사 조회
  - XML 응답 파싱 (xmltodict)
- [x] API 응답 타입 정의
- [x] 에러 핸들링 및 재시도 로직

#### 1.3 데이터 모델

**CorporateGroup (기업집단)**
```python
class CorporateGroup(Base):
    id: int                      # Primary Key
    code: str                    # 기업집단코드 (unique, indexed)
    name: str                    # 기업집단명 (indexed)
    owner: str | None            # 동일인(총수)
    representative_company: str  # 대표회사
    affiliate_count: int         # 계열회사 수
    group_type: str | None       # 집단 구분
    is_public: bool              # 공기업 여부
    designation_year: str        # 지정년월 (YYYYMM)
```

**Affiliate (계열사)**
```python
class Affiliate(Base):
    id: int                      # Primary Key
    group_code: str              # 소속 기업집단코드 (FK, indexed)
    name: str                    # 소속회사명 (indexed)
    corporate_number: str | None # 법인등록번호
    business_number: str | None  # 사업자등록번호
    ceo: str | None              # 대표자명
    founded_date: str | None     # 설립일 (YYYYMMDD)
    affiliated_date: str | None  # 계열편입일
    designation_year: str        # 지정년월
```

**HoldingCompanyRelation (지주회사 관계)**
```python
class HoldingCompanyRelation(Base):
    id: int                      # Primary Key
    holding_group_name: str      # 지주회사 그룹명 (indexed)
    holding_corp_number: str     # 지주회사 법인등록번호 (indexed)
    finance_type: str | None     # 금융/일반 구분
    subsidiary_name: str         # 자/손자회사명 (indexed)
    subsidiary_corp_number: str  # 자/손자회사 법인등록번호
    ownership_rate: float        # 지분율
    relation_type: str           # 자회사/손자회사/증손자회사
    parent_corp_number: str      # 부모회사 법인등록번호
    designation_year: str        # 공개년월
```

---

### Phase 2: 백엔드 개발 ✅ 완료

#### 2.1 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| 런타임 | Python | 3.11+ |
| 프레임워크 | FastAPI | >= 0.115.0 |
| ORM | SQLAlchemy | >= 2.0.0 |
| DB | SQLite | - |
| HTTP 클라이언트 | httpx | >= 0.27.0 |
| XML 파싱 | xmltodict | >= 0.14.0 |
| 스케줄러 | APScheduler | >= 3.10.0 |

#### 2.2 구현된 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 | 파일 |
|-----------|--------|------|------|
| `/api/groups` | GET | 기업집단 목록 (검색, 페이징) | `routers/groups.py` |
| `/api/groups/{code}` | GET | 기업집단 상세 정보 | `routers/groups.py` |
| `/api/affiliates` | GET | 계열사 목록 (그룹 필터) | `routers/affiliates.py` |
| `/api/affiliates/{id}` | GET | 계열사 상세 정보 | `routers/affiliates.py` |
| `/api/search` | GET | 기업집단/계열사 통합 검색 | `routers/search.py` |
| `/api/sync` | POST | 데이터 동기화 트리거 | `routers/sync.py` |
| `/api/sync/status` | GET | 동기화 상태 조회 | `routers/sync.py` |
| `/api/holding/groups` | GET | 지주회사 그룹 목록 | `routers/holding.py` |
| `/api/holding/tree/{corp}` | GET | 지주회사 트리 조회 | `routers/holding.py` |
| `/api/holding/sync` | POST | 지주회사 동기화 | `routers/holding.py` |
| `/api/integrated/{code}` | GET | 통합 시각화 데이터 | `routers/integrated.py` |

#### 2.3 데이터 동기화

- APScheduler로 매일 지정 시간(기본 02:00) 자동 동기화
- 수동 동기화 API 제공 (`POST /api/sync`)
- 공공데이터포털 API 호출 → XML 파싱 → DB Upsert

---

### Phase 3: 프론트엔드 개발 ✅ 완료

#### 3.1 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | React | ^18.3.1 |
| 빌드 도구 | Vite | ^6.0.1 |
| 언어 | TypeScript | ~5.6.2 |
| 시각화 | @xyflow/react | ^12.3.0 |
| 상태관리 | @tanstack/react-query | ^5.60.0 |
| 스타일링 | Tailwind CSS | ^3.4.15 |

#### 3.2 구현된 컴포넌트

| 컴포넌트 | 경로 | 기능 |
|---------|------|------|
| App | `src/App.tsx` | 메인 앱, 헤더, 뷰 전환 |
| GroupList | `src/components/GroupList.tsx` | 기업집단 카드 목록, 통합 검색 |
| AffiliateGraph | `src/components/AffiliateGraph.tsx` | 원형 그래프 (중심에 그룹) |
| HoldingTree | `src/components/HoldingTree.tsx` | 지주회사 계층 트리 |
| CollapsibleTree | `src/components/CollapsibleTree.tsx` | 접힐 수 있는 트리 |
| IntegratedGraph | `src/components/IntegratedGraph.tsx` | 통합 시각화 |

#### 3.3 Custom Hooks

| Hook | 경로 | 기능 |
|------|------|------|
| useGroups | `src/hooks/useGroups.ts` | 기업집단 목록 조회 |
| useAffiliates | `src/hooks/useAffiliates.ts` | 계열사 목록 조회 |

#### 3.4 API 클라이언트

`src/services/api.ts`:
- `fetchGroups(keyword?)` - 기업집단 목록
- `fetchAffiliates(groupCode)` - 계열사 목록
- `searchAll(keyword)` - 통합 검색
- `triggerSync()` - 동기화 트리거
- `fetchHoldingGroups()` - 지주회사 목록
- `fetchHoldingTree(corpNumber)` - 지주회사 트리
- `syncHoldingRelations()` - 지주회사 동기화
- `fetchIntegratedGroup(groupCode)` - 통합 정보

---

### Phase 4: 고도화 (선택)

#### 4.1 추가 데이터 연동

- [ ] 소속회사 재무현황 API 연동 (자산, 매출 시각화)
- [ ] 소속회사 주주현황 API 연동 (지분 관계 표현)
- [ ] 순환출자 현황 API 연동 (순환출자 하이라이트)
- [ ] DART API 연동 (상장사 추가 정보)

#### 4.2 시각화 고도화

- [ ] 노드 크기로 자산규모 표현
- [ ] 엣지 두께로 지분율 표현
- [ ] 업종별 색상 구분
- [x] 줌/패닝 인터랙션 (React Flow 내장)
- [ ] 클릭 시 상세 정보 패널

#### 4.3 검색 및 필터

- [x] 통합 검색 (기업집단 + 계열사)
- [ ] 기업명 자동완성 검색
- [ ] 업종별 필터링
- [ ] 연도별 변화 추이 (타임라인)

#### 4.4 배포

- [ ] Docker 컨테이너화
- [ ] CI/CD 파이프라인 구축
- [ ] 프로덕션 배포

---

## 기술 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  React + Vite + TypeScript + @xyflow/react      │   │
│  │  Tailwind CSS + React Query                     │   │
│  │  (개발: http://localhost:3000)                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP/REST (Vite Proxy → /api)
┌─────────────────────────▼───────────────────────────────┐
│                        Server                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  FastAPI + Python 3.11+ + SQLAlchemy 2.0        │   │
│  │  (http://localhost:8000)                         │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  SQLite (affiliate.db) + APScheduler            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP/REST (XML)
┌─────────────────────────▼───────────────────────────────┐
│              공공데이터포털 API                          │
│  - 기업집단포털 (공정거래위원회)                         │
│    • 대규모기업집단 조회                                │
│    • 소속회사 조회                                      │
│    • 지주회사 자회사/손자회사 현황                       │
└─────────────────────────────────────────────────────────┘
```

---

## 디렉토리 구조

```
aff/
├── docs/                           # 문서
│   ├── 01-data-research.md         # 데이터 조사 보고서
│   └── 02-implementation-plan.md   # 구현 현황 (현재 문서)
│
├── packages/
│   ├── api/                        # 백엔드 (FastAPI)
│   │   ├── src/affiliate_api/
│   │   │   ├── __init__.py
│   │   │   ├── main.py             # FastAPI 앱 진입점
│   │   │   ├── config.py           # 설정 관리
│   │   │   ├── database.py         # SQLAlchemy 설정
│   │   │   ├── scheduler.py        # APScheduler 설정
│   │   │   ├── models/             # 데이터 모델
│   │   │   │   ├── group.py
│   │   │   │   ├── affiliate.py
│   │   │   │   └── holding.py
│   │   │   ├── routers/            # API 라우터
│   │   │   │   ├── groups.py
│   │   │   │   ├── affiliates.py
│   │   │   │   ├── sync.py
│   │   │   │   ├── search.py
│   │   │   │   ├── holding.py
│   │   │   │   └── integrated.py
│   │   │   ├── services/           # 비즈니스 로직
│   │   │   │   └── sync_service.py
│   │   │   └── clients/            # 외부 API 클라이언트
│   │   │       └── data_portal.py
│   │   ├── .env                    # 환경 변수
│   │   ├── .env.example            # 환경 변수 템플릿
│   │   └── pyproject.toml          # Python 프로젝트 설정
│   │
│   └── web/                        # 프론트엔드 (React)
│       ├── src/
│       │   ├── main.tsx            # React 진입점
│       │   ├── App.tsx             # 메인 App 컴포넌트
│       │   ├── components/         # React 컴포넌트
│       │   │   ├── GroupList.tsx
│       │   │   ├── AffiliateGraph.tsx
│       │   │   ├── CollapsibleTree.tsx
│       │   │   ├── HoldingTree.tsx
│       │   │   └── IntegratedGraph.tsx
│       │   ├── hooks/              # 커스텀 Hooks
│       │   │   ├── useGroups.ts
│       │   │   └── useAffiliates.ts
│       │   ├── services/           # API 통신
│       │   │   └── api.ts
│       │   └── types/              # TypeScript 타입
│       │       └── index.ts
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.js
│       └── tailwind.config.js
│
├── .prettierrc                     # Prettier 설정
├── .gitignore                      # Git 무시 파일
├── package.json                    # 루트 monorepo 설정
├── pnpm-workspace.yaml             # pnpm workspace 설정
├── start.sh / start.bat            # 시작 스크립트
├── stop.sh / stop.bat              # 중지 스크립트
└── README.md                       # 프로젝트 README
```

---

## 실행 방법

### 시작

```bash
# Windows
start.bat

# Linux / macOS
./start.sh

# 또는 pnpm 명령어
pnpm dev        # 전체 (API + Web)
pnpm dev:api    # API만
pnpm dev:web    # Web만
```

### 접속

| 서비스 | URL |
|--------|-----|
| Web UI | http://localhost:3000 |
| API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

### 중지

```bash
# Windows
stop.bat

# Linux / macOS
./stop.sh
```

---

## 진행 상태 요약

| 단계 | 작업 | 상태 |
|------|------|------|
| Phase 1 | 프로젝트 초기화 & API 연동 | ✅ 완료 |
| Phase 2 | 백엔드 API 개발 | ✅ 완료 |
| Phase 3 | 프론트엔드 UI & 시각화 | ✅ 완료 |
| Phase 4 | 고도화 (재무, 지분, 배포) | ⬜ 대기 |
