# 기업 계열사 시각화 서비스

대한민국 대규모기업집단의 계열사 관계를 인터랙티브하게 시각화하는 웹 애플리케이션입니다.

## 주요 기능

- **기업집단 목록 조회**: 약 80개 대규모기업집단 검색 및 조회
- **계열사 관계 시각화**: 2,000+ 계열사의 그룹 관계를 그래프로 표현
- **지주회사 트리 구조**: 지주회사-자회사-손자회사 계층 구조 시각화
- **통합 검색**: 기업집단명 및 계열사명 통합 검색
- **자동 데이터 동기화**: 공공데이터포털 API를 통한 일일 자동 업데이트

## 기술 스택

### Backend
- **FastAPI** - 비동기 REST API 프레임워크
- **SQLAlchemy 2.0** - ORM
- **SQLite** - 데이터베이스
- **APScheduler** - 스케줄링
- **httpx** - 비동기 HTTP 클라이언트

### Frontend
- **React 18** + **TypeScript**
- **Vite** - 빌드 도구
- **@xyflow/react** - 그래프 시각화
- **@tanstack/react-query** - 서버 상태 관리
- **Tailwind CSS** - 스타일링

### Infrastructure
- **pnpm workspace** - 모노레포 관리

## 프로젝트 구조

```
aff/
├── packages/
│   ├── api/                    # 백엔드 (FastAPI)
│   │   └── src/affiliate_api/
│   │       ├── main.py         # 앱 진입점
│   │       ├── models/         # 데이터 모델
│   │       ├── routers/        # API 라우터
│   │       ├── services/       # 비즈니스 로직
│   │       └── clients/        # 외부 API 클라이언트
│   └── web/                    # 프론트엔드 (React)
│       └── src/
│           ├── components/     # React 컴포넌트
│           ├── hooks/          # 커스텀 Hooks
│           ├── services/       # API 클라이언트
│           └── types/          # TypeScript 타입
├── docs/                       # 프로젝트 문서
├── start.sh / start.bat        # 시작 스크립트
└── stop.sh / stop.bat          # 중지 스크립트
```

## 시작하기

### 사전 요구사항

- **Node.js** >= 18.x
- **pnpm** >= 8.x
- **Python** >= 3.11

### 설치

1. 저장소 클론
```bash
git clone <repository-url>
cd aff
```

2. 환경 변수 설정
```bash
cp packages/api/.env.example packages/api/.env
# .env 파일에 공공데이터포털 API 키 입력
```

3. 의존성 설치
```bash
pnpm install
```

### 실행

#### Windows
```batch
start.bat
```

#### Linux / macOS
```bash
./start.sh
```

### 개별 실행

```bash
# 전체 (API + Web 동시)
pnpm dev

# API만
pnpm dev:api

# Web만
pnpm dev:web
```

### 접속 주소

| 서비스 | URL |
|--------|-----|
| Web UI | http://localhost:3000 |
| API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

## API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/groups` | GET | 기업집단 목록 조회 |
| `/api/groups/{code}` | GET | 기업집단 상세 정보 |
| `/api/affiliates` | GET | 계열사 목록 조회 |
| `/api/search` | GET | 통합 검색 |
| `/api/sync` | POST | 데이터 동기화 트리거 |
| `/api/holding/tree/{corp_number}` | GET | 지주회사 트리 조회 |
| `/api/integrated/{group_code}` | GET | 통합 시각화 데이터 |

## 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `DATA_PORTAL_API_KEY` | 공공데이터포털 API 인증키 | - |
| `DEBUG` | 디버그 모드 | `true` |
| `DATABASE_URL` | 데이터베이스 경로 | `sqlite:///./affiliate.db` |
| `SCHEDULER_ENABLED` | 스케줄러 활성화 | `true` |
| `SYNC_CRON_HOUR` | 일일 동기화 시간 (시) | `2` |

## 데이터 출처

- [공공데이터포털](https://www.data.go.kr/) - 공정거래위원회 기업집단포털 API

## 라이선스

MIT License
