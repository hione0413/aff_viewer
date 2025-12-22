from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.services.sync_service import SyncService

router = APIRouter()


class SyncResponse(BaseModel):
    """동기화 응답"""

    message: str
    status: str


class SyncStatusResponse(BaseModel):
    """동기화 상태 응답"""

    groups_count: int
    affiliates_count: int
    last_sync: str | None


@router.post("", response_model=SyncResponse)
async def trigger_sync(
    background_tasks: BackgroundTasks,
    year: str | None = None,
    db: Session = Depends(get_db),
):
    """수동 동기화 트리거"""
    sync_service = SyncService(db)

    # 백그라운드에서 실행
    background_tasks.add_task(sync_service.sync_all, year)

    return SyncResponse(message="동기화가 시작되었습니다", status="started")


@router.get("/status", response_model=SyncStatusResponse)
async def get_sync_status(db: Session = Depends(get_db)):
    """동기화 상태 조회"""
    from affiliate_api.models import CorporateGroup, Affiliate

    groups_count = db.query(CorporateGroup).count()
    affiliates_count = db.query(Affiliate).count()

    # 최근 업데이트 시간
    latest_group = (
        db.query(CorporateGroup).order_by(CorporateGroup.updated_at.desc()).first()
    )
    last_sync = latest_group.updated_at.isoformat() if latest_group else None

    return SyncStatusResponse(
        groups_count=groups_count,
        affiliates_count=affiliates_count,
        last_sync=last_sync,
    )
