from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from affiliate_api.config import settings
from affiliate_api.database import create_tables
from affiliate_api.routers import groups, affiliates, sync, search, holding, integrated
from affiliate_api.scheduler import start_scheduler, shutdown_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 라이프사이클 관리"""
    # 시작 시
    create_tables()
    if settings.scheduler_enabled:
        start_scheduler()

    yield

    # 종료 시
    if settings.scheduler_enabled:
        shutdown_scheduler()


app = FastAPI(
    title=settings.app_name,
    description="대한민국 대규모기업집단 계열사 정보 API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(groups.router, prefix="/api/groups", tags=["기업집단"])
app.include_router(affiliates.router, prefix="/api/affiliates", tags=["계열사"])
app.include_router(sync.router, prefix="/api/sync", tags=["동기화"])
app.include_router(search.router, prefix="/api/search", tags=["검색"])
app.include_router(holding.router, prefix="/api/holding", tags=["지주회사"])
app.include_router(integrated.router, prefix="/api/integrated", tags=["통합"])


@app.get("/")
async def root():
    return {"message": "Affiliate Visualization API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
