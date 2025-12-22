"""통합 시각화 API - 기업집단 + 지주회사 구조"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.models import CorporateGroup, Affiliate, HoldingCompanyRelation

router = APIRouter()


class CompanyNode(BaseModel):
    """회사 노드"""
    name: str
    corp_number: str
    ownership_rate: float | None = None
    relation_type: str | None = None  # 자회사, 손자회사, 증손자회사
    source: str  # "holding", "affiliate", "both"
    children: list["CompanyNode"] = []


class IntegratedGroupResponse(BaseModel):
    """통합 그룹 응답"""
    group_code: str
    group_name: str
    owner: str | None

    # 지주회사 정보 (있는 경우)
    holding_company: str | None = None
    holding_corp_number: str | None = None
    finance_type: str | None = None

    # 통합 트리
    tree: list[CompanyNode]

    # 지주회사 구조에 없는 계열사
    other_affiliates: list[CompanyNode]

    # 통계
    stats: dict


def build_holding_tree(
    parent_corp_number: str,
    relations_by_parent: dict[str, list],
    affiliate_corp_numbers: set[str],
) -> list[CompanyNode]:
    """지주회사 트리 구조 생성"""
    children = []
    for r in relations_by_parent.get(parent_corp_number, []):
        # 계열사에도 있는지 확인
        source = "both" if r.subsidiary_corp_number in affiliate_corp_numbers else "holding"

        children.append(
            CompanyNode(
                name=r.subsidiary_name,
                corp_number=r.subsidiary_corp_number,
                ownership_rate=r.ownership_rate,
                relation_type=r.relation_type,
                source=source,
                children=build_holding_tree(
                    r.subsidiary_corp_number,
                    relations_by_parent,
                    affiliate_corp_numbers
                ),
            )
        )
    return children


@router.get("/{group_code}")
async def get_integrated_group(
    group_code: str,
    db: Session = Depends(get_db),
):
    """기업집단 + 지주회사 통합 정보 조회"""

    # 1. 기업집단 정보
    group = db.query(CorporateGroup).filter(CorporateGroup.code == group_code).first()
    if not group:
        raise HTTPException(status_code=404, detail="기업집단을 찾을 수 없습니다")

    # 2. 계열사 목록
    affiliates = db.query(Affiliate).filter(Affiliate.group_code == group_code).all()
    affiliate_corp_numbers = {a.corporate_number for a in affiliates if a.corporate_number}
    affiliate_map = {a.corporate_number: a for a in affiliates if a.corporate_number}

    # 3. 지주회사 찾기 (계열사 중에서 지주회사 구조가 있는 회사 찾기)
    holding_relations = []
    holding_info = None

    for affiliate in affiliates:
        if not affiliate.corporate_number:
            continue
        relations = (
            db.query(HoldingCompanyRelation)
            .filter(HoldingCompanyRelation.holding_corp_number == affiliate.corporate_number)
            .all()
        )
        if relations:
            holding_relations = relations
            holding_info = {
                "name": relations[0].holding_group_name,
                "corp_number": affiliate.corporate_number,
                "finance_type": relations[0].finance_type,
            }
            break

    # 4. 지주회사 트리 구조 생성
    tree = []
    holding_corp_numbers = set()

    if holding_relations:
        # parent_corp_number 기준으로 그룹화
        relations_by_parent: dict[str, list] = {}
        for r in holding_relations:
            parent = r.parent_corp_number or holding_info["corp_number"]
            if parent not in relations_by_parent:
                relations_by_parent[parent] = []
            relations_by_parent[parent].append(r)
            holding_corp_numbers.add(r.subsidiary_corp_number)

        # 트리 구성
        tree = build_holding_tree(
            holding_info["corp_number"],
            relations_by_parent,
            affiliate_corp_numbers
        )

        # 지주회사도 holding_corp_numbers에 추가
        holding_corp_numbers.add(holding_info["corp_number"])

    # 5. 지주회사 구조에 없는 계열사
    other_affiliates = []
    for affiliate in affiliates:
        if affiliate.corporate_number and affiliate.corporate_number not in holding_corp_numbers:
            other_affiliates.append(
                CompanyNode(
                    name=affiliate.name,
                    corp_number=affiliate.corporate_number,
                    source="affiliate",
                )
            )

    # 6. 통계
    stats = {
        "total_affiliates": len(affiliates),
        "in_holding_structure": len(holding_corp_numbers),
        "other_affiliates": len(other_affiliates),
        "subsidiaries": sum(1 for r in holding_relations if r.relation_type == "자회사"),
        "grandchildren": sum(1 for r in holding_relations if r.relation_type == "손자회사"),
        "great_grandchildren": sum(1 for r in holding_relations if r.relation_type == "증손자회사"),
    }

    return IntegratedGroupResponse(
        group_code=group_code,
        group_name=group.name,
        owner=group.owner,
        holding_company=holding_info["name"] if holding_info else None,
        holding_corp_number=holding_info["corp_number"] if holding_info else None,
        finance_type=holding_info["finance_type"] if holding_info else None,
        tree=tree,
        other_affiliates=other_affiliates,
        stats=stats,
    )
