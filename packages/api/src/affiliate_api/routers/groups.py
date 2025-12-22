from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.models import CorporateGroup

router = APIRouter()


class GroupResponse(BaseModel):
    """기업집단 응답 스키마"""

    id: int
    code: str
    name: str
    owner: str | None
    representative_company: str | None
    affiliate_count: int
    group_type: str | None
    is_public: bool

    class Config:
        from_attributes = True


class GroupListResponse(BaseModel):
    """기업집단 목록 응답"""

    total: int
    items: list[GroupResponse]


@router.get("", response_model=GroupListResponse)
async def list_groups(
    keyword: str | None = Query(None, description="검색 키워드"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """기업집단 목록 조회"""
    query = db.query(CorporateGroup)

    if keyword:
        query = query.filter(CorporateGroup.name.contains(keyword))

    total = query.count()
    items = query.order_by(CorporateGroup.affiliate_count.desc()).offset(skip).limit(limit).all()

    return GroupListResponse(total=total, items=items)


@router.get("/{group_code}", response_model=GroupResponse)
async def get_group(group_code: str, db: Session = Depends(get_db)):
    """특정 기업집단 조회"""
    group = db.query(CorporateGroup).filter(CorporateGroup.code == group_code).first()

    if not group:
        raise HTTPException(status_code=404, detail="기업집단을 찾을 수 없습니다")

    return group
