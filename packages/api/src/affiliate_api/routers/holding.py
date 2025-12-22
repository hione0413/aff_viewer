from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
import httpx
import xmltodict

from affiliate_api.database import get_db
from affiliate_api.models import HoldingCompanyRelation
from affiliate_api.services.sync_service import SyncService
from affiliate_api.config import settings

router = APIRouter()


class HoldingRelationResponse(BaseModel):
    """지주회사 관계 응답"""

    id: int
    holding_group_name: str
    holding_corp_number: str
    finance_type: str | None
    subsidiary_name: str
    subsidiary_corp_number: str
    ownership_rate: float
    relation_type: str
    parent_corp_number: str | None

    class Config:
        from_attributes = True


class HoldingTreeNode(BaseModel):
    """트리 노드"""

    name: str
    corp_number: str
    ownership_rate: float
    relation_type: str
    children: list["HoldingTreeNode"] = []


class HoldingTreeResponse(BaseModel):
    """지주회사 트리 응답"""

    holding_group_name: str
    holding_corp_number: str
    finance_type: str | None
    tree: list[HoldingTreeNode]


@router.get("/groups")
async def list_holding_groups(
    db: Session = Depends(get_db),
):
    """지주회사 그룹 목록 조회"""
    # 지주회사 그룹 목록 (중복 제거)
    groups = (
        db.query(
            HoldingCompanyRelation.holding_group_name,
            HoldingCompanyRelation.holding_corp_number,
            HoldingCompanyRelation.finance_type,
        )
        .distinct()
        .all()
    )

    return [
        {
            "name": g.holding_group_name,
            "corp_number": g.holding_corp_number,
            "finance_type": g.finance_type,
        }
        for g in groups
    ]


def build_children(
    parent_corp_number: str,
    relations_by_parent: dict[str, list],
) -> list[HoldingTreeNode]:
    """재귀적으로 자식 노드 생성"""
    children = []
    for r in relations_by_parent.get(parent_corp_number, []):
        children.append(
            HoldingTreeNode(
                name=r.subsidiary_name,
                corp_number=r.subsidiary_corp_number,
                ownership_rate=r.ownership_rate,
                relation_type=r.relation_type,
                children=build_children(r.subsidiary_corp_number, relations_by_parent),
            )
        )
    return children


@router.get("/tree/{corp_number}", response_model=HoldingTreeResponse)
async def get_holding_tree(
    corp_number: str,
    db: Session = Depends(get_db),
):
    """특정 지주회사의 트리 구조 조회"""
    # DB에 데이터가 없으면 동기화
    count = (
        db.query(HoldingCompanyRelation)
        .filter(HoldingCompanyRelation.holding_corp_number == corp_number)
        .count()
    )
    if count == 0:
        sync_service = SyncService(db)
        sync_service.sync_holding_relations()

    # 지주회사 정보
    first_relation = (
        db.query(HoldingCompanyRelation)
        .filter(HoldingCompanyRelation.holding_corp_number == corp_number)
        .first()
    )

    if not first_relation:
        return HoldingTreeResponse(
            holding_group_name="",
            holding_corp_number=corp_number,
            finance_type=None,
            tree=[],
        )

    # 모든 관계 조회
    relations = (
        db.query(HoldingCompanyRelation)
        .filter(HoldingCompanyRelation.holding_corp_number == corp_number)
        .all()
    )

    # parent_corp_number 기준으로 그룹화
    relations_by_parent: dict[str, list] = {}
    for r in relations:
        parent = r.parent_corp_number or corp_number  # 부모가 없으면 지주회사가 부모
        if parent not in relations_by_parent:
            relations_by_parent[parent] = []
        relations_by_parent[parent].append(r)

    # 지주회사 직속 자회사부터 재귀적으로 트리 구성
    tree = build_children(corp_number, relations_by_parent)

    return HoldingTreeResponse(
        holding_group_name=first_relation.holding_group_name,
        holding_corp_number=corp_number,
        finance_type=first_relation.finance_type,
        tree=tree,
    )


@router.post("/sync")
async def sync_holding_relations(
    year: str = Query("202104", description="공개년월 (YYYYMM)"),
    reset: bool = Query(False, description="기존 데이터 삭제 후 동기화"),
    db: Session = Depends(get_db),
):
    """지주회사 관계 동기화"""
    if reset:
        # 기존 데이터 삭제
        deleted = db.query(HoldingCompanyRelation).delete()
        db.commit()

    sync_service = SyncService(db)
    count = sync_service.sync_holding_relations(year)

    # 통계 조회
    stats = {}
    relations = db.query(HoldingCompanyRelation).all()
    for r in relations:
        stats[r.relation_type] = stats.get(r.relation_type, 0) + 1

    has_parent = sum(1 for r in relations if r.parent_corp_number)

    return {
        "message": f"지주회사 관계 {count}건 동기화 완료",
        "count": count,
        "relation_type_stats": stats,
        "records_with_parent": has_parent,
    }


@router.get("/debug/{corp_number}")
async def debug_holding_data(
    corp_number: str,
    db: Session = Depends(get_db),
):
    """디버그: 지주회사 관계 원본 데이터 조회"""
    relations = (
        db.query(HoldingCompanyRelation)
        .filter(HoldingCompanyRelation.holding_corp_number == corp_number)
        .all()
    )

    return [
        {
            "id": r.id,
            "holding_group_name": r.holding_group_name,
            "holding_corp_number": r.holding_corp_number,
            "subsidiary_name": r.subsidiary_name,
            "subsidiary_corp_number": r.subsidiary_corp_number,
            "ownership_rate": r.ownership_rate,
            "relation_type": r.relation_type,
            "parent_corp_number": r.parent_corp_number,
        }
        for r in relations
    ]


@router.get("/examples")
async def get_example_holdings(
    db: Session = Depends(get_db),
):
    """손자회사/증손자회사가 있는 지주회사 예시 조회"""
    # 모든 관계 조회
    relations = db.query(HoldingCompanyRelation).all()

    # 지주회사별로 통계 집계
    stats: dict[str, dict] = {}
    for r in relations:
        key = r.holding_corp_number
        if key not in stats:
            stats[key] = {
                "name": r.holding_group_name,
                "corp_number": r.holding_corp_number,
                "total": 0,
                "subsidiaries": 0,
                "grandchildren": 0,
                "great_grandchildren": 0,
            }
        stats[key]["total"] += 1
        if r.relation_type == "자회사":
            stats[key]["subsidiaries"] += 1
        elif r.relation_type == "손자회사":
            stats[key]["grandchildren"] += 1
        elif r.relation_type == "증손자회사":
            stats[key]["great_grandchildren"] += 1

    # 손자회사가 있는 것만 필터링하고 총 개수 순으로 정렬
    result = [
        s for s in stats.values()
        if s["grandchildren"] > 0
    ]
    result.sort(key=lambda x: x["total"], reverse=True)

    return result[:10]


@router.get("/test-api")
async def test_raw_api(
    year: str = Query("202104", description="공개년월"),
    page: int = Query(1, description="페이지"),
    rows: int = Query(100, description="행수"),
):
    """디버그: API 원본 응답 확인"""
    params = {
        "ServiceKey": settings.data_portal_api_key,
        "pageNo": str(page),
        "numOfRows": str(rows),
        "presentnYm": year,
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.get(
            "https://apis.data.go.kr/1130000/holdingProgCompSttusList/holdingProgCompStusListApi",
            params=params,
        )

    data = xmltodict.parse(response.text)

    # 통계 추가
    items = data.get("holdingProgCompSttusList", {}).get("holdingProgCompSttus", [])
    if isinstance(items, dict):
        items = [items]

    stats = {}
    grandchildren_samples = []
    for item in items:
        relation = item.get("hldcpSeNm", "unknown")
        stats[relation] = stats.get(relation, 0) + 1
        # 손자회사 샘플 수집
        if relation == "손자회사" and len(grandchildren_samples) < 3:
            grandchildren_samples.append(item)

    return {
        "total": data.get("holdingProgCompSttusList", {}).get("totalCount"),
        "relation_type_stats": stats,
        "grandchildren_samples": grandchildren_samples,
        "raw_sample": items[:3] if items else [],
    }
