"""통합 시각화 API - 기업집단 + 지주회사 구조"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.models import CorporateGroup, Affiliate, HoldingCompanyRelation, Stockholder

router = APIRouter()


class CompanyNode(BaseModel):
    """회사 노드"""
    name: str
    corp_number: str
    ownership_rate: float | None = None
    relation_type: str | None = None  # 자회사, 손자회사, 증손자회사
    source: str  # "holding", "affiliate", "both"
    inferred: bool = False  # 주주현황 기반 추론 관계 (점선으로 표시)
    children: list["CompanyNode"] = []
    # 최대주주 정보 (불일치 감지용)
    legal_parent_name: str | None = None  # 법적 상위회사명
    largest_stockholder: str | None = None  # 최대주주명
    largest_stockholder_rate: float | None = None  # 최대주주 지분율
    parent_mismatch: bool = False  # 법적 상위 != 최대주주


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


def find_largest_corporate_stockholder(
    stockholders: list,
    affiliate_name_map: dict[str, str],
) -> tuple[str | None, float | None]:
    """회사의 주주 목록에서 최대 지분을 가진 법인 주주를 찾음"""
    best_stockholder = None
    best_rate = 0.0

    for s in stockholders:
        # 개인, 친족, 임원 등 제외 (법인만)
        # 주의: '동일인'은 기업집단의 총수를 의미하므로 제외하지 않음
        stockholder_type = s.stockholder_type or ''
        if '개인' in stockholder_type:
            continue
        if any(kw in stockholder_type for kw in ['친족', '임원']):
            continue

        rate = s.total_rate or 0.0
        if rate > best_rate:
            best_rate = rate
            best_stockholder = s.stockholder_name

    return (best_stockholder, best_rate) if best_stockholder else (None, None)


def normalize_company_name(name: str) -> str:
    """회사명 정규화 (비교용)"""
    if not name:
        return ""
    return name.replace('(주)', '').replace('㈜', '').replace('주식회사', '').replace(' ', '').strip()


def build_holding_tree(
    parent_corp_number: str,
    parent_name: str,
    relations_by_parent: dict[str, list],
    affiliate_corp_numbers: set[str],
    stockholders_by_company: dict[str, list],
    affiliate_name_map: dict[str, str],
) -> list[CompanyNode]:
    """지주회사 트리 구조 생성"""
    children = []
    for r in relations_by_parent.get(parent_corp_number, []):
        # 계열사에도 있는지 확인
        source = "both" if r.subsidiary_corp_number in affiliate_corp_numbers else "holding"

        # 해당 회사의 주주현황에서 최대주주 찾기
        stockholders = stockholders_by_company.get(r.subsidiary_corp_number, [])
        largest_stockholder, largest_rate = find_largest_corporate_stockholder(
            stockholders, affiliate_name_map
        )

        # 법적 상위와 최대주주 불일치 확인
        parent_mismatch = False
        if largest_stockholder:
            normalized_parent = normalize_company_name(parent_name)
            normalized_largest = normalize_company_name(largest_stockholder)
            if normalized_parent and normalized_largest and normalized_parent != normalized_largest:
                parent_mismatch = True

        children.append(
            CompanyNode(
                name=r.subsidiary_name,
                corp_number=r.subsidiary_corp_number,
                ownership_rate=r.ownership_rate,
                relation_type=r.relation_type,
                source=source,
                legal_parent_name=parent_name,
                largest_stockholder=largest_stockholder,
                largest_stockholder_rate=largest_rate,
                parent_mismatch=parent_mismatch,
                children=build_holding_tree(
                    r.subsidiary_corp_number,
                    r.subsidiary_name,  # 현재 노드가 자식들의 부모가 됨
                    relations_by_parent,
                    affiliate_corp_numbers,
                    stockholders_by_company,
                    affiliate_name_map,
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

    # 4. 모든 계열사의 주주현황 데이터 조회 (불일치 감지용)
    stockholder_data = db.query(Stockholder).filter(
        Stockholder.corp_number.in_(affiliate_corp_numbers)
    ).all()

    # 법인등록번호로 주주 데이터 그룹화
    stockholders_by_company: dict[str, list] = {}
    for s in stockholder_data:
        if s.corp_number not in stockholders_by_company:
            stockholders_by_company[s.corp_number] = []
        stockholders_by_company[s.corp_number].append(s)

    # 계열사 법인등록번호 → 이름 매핑
    affiliate_name_map = {a.corporate_number: a.name for a in affiliates if a.corporate_number}

    # 5. 지주회사 트리 구조 생성
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
            holding_info["name"],
            relations_by_parent,
            affiliate_corp_numbers,
            stockholders_by_company,
            affiliate_name_map,
        )

        # 지주회사도 holding_corp_numbers에 추가
        holding_corp_numbers.add(holding_info["corp_number"])

    # 6. 주주현황 기반으로 기타 계열사의 소유 관계 추론
    # 기타 계열사 법인등록번호 목록
    other_corp_numbers = {
        a.corporate_number for a in affiliates
        if a.corporate_number and a.corporate_number not in holding_corp_numbers
    }

    # 주주 이름으로 계열사 매칭 (법인등록번호가 없으므로 이름으로 매칭)
    def find_parent_affiliate(stockholders: list, all_affiliate_corp_numbers: set) -> tuple[str | None, float | None]:
        """주주 목록에서 같은 그룹 계열사를 찾아 부모로 반환"""
        for s in stockholders:
            # 주주가 법인인 경우만 (개인 제외)
            if not s.stockholder_type or '개인' in (s.stockholder_type or ''):
                continue
            if any(kw in (s.stockholder_type or '') for kw in ['친족', '임원']):
                continue

            # 주주 이름으로 계열사 매칭
            stockholder_name = s.stockholder_name or ''
            for corp_num in all_affiliate_corp_numbers:
                affiliate_name = affiliate_name_map.get(corp_num, '')
                # 이름 정규화 비교 (주식회사, (주), ㈜ 등 제거하고 비교)
                normalized_stockholder = stockholder_name.replace('(주)', '').replace('㈜', '').replace('주식회사', '').strip()
                normalized_affiliate = affiliate_name.replace('(주)', '').replace('㈜', '').replace('주식회사', '').strip()
                if normalized_stockholder and normalized_affiliate and normalized_stockholder == normalized_affiliate:
                    return corp_num, s.total_rate
        return None, None

    # 추론된 자식 관계를 저장할 맵 (부모 법인번호 -> 자식 노드 리스트)
    inferred_children: dict[str, list[CompanyNode]] = {}

    # 기타 계열사 간 관계 분석을 위한 데이터 구조
    other_affiliate_parent_map: dict[str, tuple[str, float | None]] = {}  # 자식 -> (부모, 지분율)

    for affiliate in affiliates:
        if not affiliate.corporate_number or affiliate.corporate_number in holding_corp_numbers:
            continue

        stockholders = stockholders_by_company.get(affiliate.corporate_number, [])

        # 1차: 지주회사 구조에 있는 계열사에서 부모 찾기
        parent_corp, ownership_rate = find_parent_affiliate(
            stockholders,
            holding_corp_numbers  # 지주회사 구조에 있는 회사만 대상
        )

        if parent_corp:
            # 지주회사 구조 내 부모를 찾음 - 추론된 관계로 연결
            parent_name = affiliate_name_map.get(parent_corp, "")
            largest_stockholder, largest_rate = find_largest_corporate_stockholder(
                stockholders, affiliate_name_map
            )
            # 불일치 확인 (추론된 부모 vs 최대주주)
            parent_mismatch = False
            if largest_stockholder:
                normalized_parent = normalize_company_name(parent_name)
                normalized_largest = normalize_company_name(largest_stockholder)
                if normalized_parent and normalized_largest and normalized_parent != normalized_largest:
                    parent_mismatch = True

            child_node = CompanyNode(
                name=affiliate.name,
                corp_number=affiliate.corporate_number,
                ownership_rate=ownership_rate,
                relation_type="추론",
                source="affiliate",
                inferred=True,
                legal_parent_name=parent_name,
                largest_stockholder=largest_stockholder,
                largest_stockholder_rate=largest_rate,
                parent_mismatch=parent_mismatch,
            )
            if parent_corp not in inferred_children:
                inferred_children[parent_corp] = []
            inferred_children[parent_corp].append(child_node)
        else:
            # 2차: 기타 계열사에서 부모 찾기
            parent_corp, ownership_rate = find_parent_affiliate(
                stockholders,
                other_corp_numbers  # 기타 계열사에서 찾기
            )
            if parent_corp and parent_corp != affiliate.corporate_number:  # 자기 자신 제외
                other_affiliate_parent_map[affiliate.corporate_number] = (parent_corp, ownership_rate)

    # 6. 트리에 추론된 자식 노드 연결
    def attach_inferred_children(nodes: list[CompanyNode]) -> list[CompanyNode]:
        """트리 노드에 추론된 자식 노드 연결 (재귀)"""
        for node in nodes:
            # 현재 노드의 추론된 자식 추가
            if node.corp_number in inferred_children:
                node.children.extend(inferred_children[node.corp_number])
            # 기존 자식들도 재귀 처리
            attach_inferred_children(node.children)
        return nodes

    tree = attach_inferred_children(tree)

    # 지주회사 자체에 연결된 추론 자식도 처리
    if holding_info and holding_info["corp_number"] in inferred_children:
        tree.extend(inferred_children[holding_info["corp_number"]])

    # 7. 기타 계열사 트리 구성 (주주현황 기반)
    # 이미 처리된 법인번호 (지주회사 구조 + 지주회사에 추론 연결된 것들)
    processed_corp_numbers = holding_corp_numbers.copy()
    for children_list in inferred_children.values():
        for child in children_list:
            processed_corp_numbers.add(child.corp_number)

    # 기타 계열사 간 parent-child 맵 구성
    other_children_map: dict[str, list[tuple[str, float | None]]] = {}  # 부모 -> [(자식, 지분율), ...]
    has_parent_in_others = set()  # 다른 기타 계열사에 의해 소유되는 회사들

    for child_corp, (parent_corp, rate) in other_affiliate_parent_map.items():
        if child_corp in processed_corp_numbers:
            continue
        if parent_corp not in other_children_map:
            other_children_map[parent_corp] = []
        other_children_map[parent_corp].append((child_corp, rate))
        has_parent_in_others.add(child_corp)

    # 순환 참조 감지 및 방지
    def has_cycle(start: str, visited: set[str]) -> bool:
        if start in visited:
            return True
        visited.add(start)
        for child_corp, _ in other_children_map.get(start, []):
            if has_cycle(child_corp, visited.copy()):
                return True
        return False

    # 루트 기타 계열사 찾기 (다른 기타 계열사에 소유되지 않는 회사)
    root_other_affiliates = []
    for affiliate in affiliates:
        corp_num = affiliate.corporate_number
        if not corp_num or corp_num in processed_corp_numbers:
            continue
        if corp_num not in has_parent_in_others:
            root_other_affiliates.append(affiliate)

    # 기타 계열사 트리 재귀 구성
    def build_other_affiliate_tree(
        corp_number: str,
        parent_name: str,
        visited: set[str]
    ) -> list[CompanyNode]:
        """기타 계열사의 자식 노드들을 재귀적으로 구성"""
        children = []
        if corp_number in visited:  # 순환 참조 방지
            return children
        visited.add(corp_number)

        for child_corp, rate in other_children_map.get(corp_number, []):
            if child_corp in visited:  # 순환 참조 방지
                continue
            child_name = affiliate_name_map.get(child_corp, child_corp)

            # 최대주주 정보 조회
            child_stockholders = stockholders_by_company.get(child_corp, [])
            largest_stockholder, largest_rate = find_largest_corporate_stockholder(
                child_stockholders, affiliate_name_map
            )

            children.append(
                CompanyNode(
                    name=child_name,
                    corp_number=child_corp,
                    ownership_rate=rate,
                    relation_type="추론",
                    source="affiliate",
                    inferred=True,
                    legal_parent_name=parent_name,
                    largest_stockholder=largest_stockholder,
                    largest_stockholder_rate=largest_rate,
                    parent_mismatch=False,  # 기타 계열사는 불일치 표시 안함
                    children=build_other_affiliate_tree(child_corp, child_name, visited.copy()),
                )
            )
        return children

    # 기타 계열사 노드 리스트 구성
    other_affiliates = []
    for affiliate in root_other_affiliates:
        corp_num = affiliate.corporate_number
        children = build_other_affiliate_tree(corp_num, affiliate.name, set())

        # 루트 기타 계열사의 최대주주 정보
        stockholders = stockholders_by_company.get(corp_num, [])
        largest_stockholder, largest_rate = find_largest_corporate_stockholder(
            stockholders, affiliate_name_map
        )

        other_affiliates.append(
            CompanyNode(
                name=affiliate.name,
                corp_number=corp_num,
                source="affiliate",
                inferred=False,  # 루트는 추론이 아님
                largest_stockholder=largest_stockholder,
                largest_stockholder_rate=largest_rate,
                parent_mismatch=False,  # 기타 계열사는 불일치 표시 안함
                children=children,
            )
        )

    # 8. 통계
    inferred_count = sum(len(children) for children in inferred_children.values())
    # 기타 계열사 내 추론 관계도 카운트
    def count_inferred_in_tree(nodes: list[CompanyNode]) -> int:
        count = 0
        for node in nodes:
            if node.inferred:
                count += 1
            count += count_inferred_in_tree(node.children)
        return count
    inferred_count += count_inferred_in_tree(other_affiliates)
    stats = {
        "total_affiliates": len(affiliates),
        "in_holding_structure": len(holding_corp_numbers),
        "other_affiliates": len(other_affiliates),
        "inferred_relations": inferred_count,  # 주주현황 기반 추론 관계
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
