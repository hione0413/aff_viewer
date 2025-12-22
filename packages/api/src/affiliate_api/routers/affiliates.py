from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.models import Affiliate, CorporateGroup
from affiliate_api.services.sync_service import SyncService

router = APIRouter()


class AffiliateResponse(BaseModel):
    """계열사 응답 스키마"""

    id: int
    group_code: str
    name: str
    corporate_number: str | None
    business_number: str | None
    ceo: str | None
    founded_date: str | None
    affiliated_date: str | None

    class Config:
        from_attributes = True


class AffiliateListResponse(BaseModel):
    """계열사 목록 응답"""

    total: int
    group_name: str | None
    items: list[AffiliateResponse]


@router.get("", response_model=AffiliateListResponse)
async def list_affiliates(
    group_code: str = Query(..., description="기업집단 코드"),
    keyword: str | None = Query(None, description="검색 키워드"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """특정 기업집단의 계열사 목록 조회"""
    group = db.query(CorporateGroup).filter(CorporateGroup.code == group_code).first()

    # DB에 계열사가 없으면 실시간 동기화
    existing_count = db.query(Affiliate).filter(Affiliate.group_code == group_code).count()
    if existing_count == 0:
        sync_service = SyncService(db)
        sync_service.sync_group_affiliates(group_code)

    query = db.query(Affiliate).filter(Affiliate.group_code == group_code)

    if keyword:
        query = query.filter(Affiliate.name.contains(keyword))

    total = query.count()
    items = query.order_by(Affiliate.name).offset(skip).limit(limit).all()

    return AffiliateListResponse(
        total=total,
        group_name=group.name if group else None,
        items=items,
    )


@router.get("/{affiliate_id}", response_model=AffiliateResponse)
async def get_affiliate(affiliate_id: int, db: Session = Depends(get_db)):
    """특정 계열사 조회"""
    affiliate = db.query(Affiliate).filter(Affiliate.id == affiliate_id).first()

    if not affiliate:
        raise HTTPException(status_code=404, detail="계열사를 찾을 수 없습니다")

    return affiliate
