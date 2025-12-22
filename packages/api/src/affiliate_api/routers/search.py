from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.models import CorporateGroup, Affiliate

router = APIRouter()


class GroupSearchResult(BaseModel):
    """기업집단 검색 결과"""
    type: str = "group"
    id: int
    code: str
    name: str
    owner: str | None
    affiliate_count: int

    class Config:
        from_attributes = True


class AffiliateSearchResult(BaseModel):
    """계열사 검색 결과"""
    type: str = "affiliate"
    id: int
    name: str
    group_code: str
    group_name: str | None
    ceo: str | None

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """통합 검색 응답"""
    keyword: str
    total: int
    groups: list[GroupSearchResult]
    affiliates: list[AffiliateSearchResult]


@router.get("", response_model=SearchResponse)
async def search(
    keyword: str = Query(..., min_length=1, description="검색 키워드"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """기업집단 및 계열사 통합 검색"""

    # 기업집단 검색
    groups = (
        db.query(CorporateGroup)
        .filter(CorporateGroup.name.contains(keyword))
        .order_by(CorporateGroup.affiliate_count.desc())
        .limit(limit)
        .all()
    )

    group_results = [
        GroupSearchResult(
            type="group",
            id=g.id,
            code=g.code,
            name=g.name,
            owner=g.owner,
            affiliate_count=g.affiliate_count,
        )
        for g in groups
    ]

    # 계열사 검색
    affiliates = (
        db.query(Affiliate)
        .filter(Affiliate.name.contains(keyword))
        .limit(limit)
        .all()
    )

    # 계열사의 그룹명 조회
    affiliate_results = []
    for a in affiliates:
        group = db.query(CorporateGroup).filter(CorporateGroup.code == a.group_code).first()
        affiliate_results.append(
            AffiliateSearchResult(
                type="affiliate",
                id=a.id,
                name=a.name,
                group_code=a.group_code,
                group_name=group.name if group else None,
                ceo=a.ceo,
            )
        )

    return SearchResponse(
        keyword=keyword,
        total=len(group_results) + len(affiliate_results),
        groups=group_results,
        affiliates=affiliate_results,
    )
