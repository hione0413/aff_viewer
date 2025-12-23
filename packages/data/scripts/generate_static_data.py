"""
정적 데이터 생성 스크립트

현재 SQLite DB에서 데이터를 읽어 JSON 파일로 저장합니다.
생성된 JSON 파일은 프론트엔드에서 직접 사용됩니다.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# 프로젝트 루트 설정
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent
API_DIR = DATA_DIR.parent / "api"

# API 모듈 임포트를 위한 경로 추가
sys.path.insert(0, str(API_DIR / "src"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from affiliate_api.models import CorporateGroup, Affiliate, HoldingCompanyRelation, Stockholder


def get_db_session():
    """DB 세션 생성"""
    db_path = API_DIR / "affiliate.db"
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    engine = create_engine(f"sqlite:///{db_path}")
    Session = sessionmaker(bind=engine)
    return Session()


def normalize_company_name(name: str) -> str:
    """회사명 정규화"""
    if not name:
        return ""
    return name.replace('(주)', '').replace('㈜', '').replace('주식회사', '').replace(' ', '').strip()


def find_largest_corporate_stockholder(stockholders: list, affiliate_name_map: dict) -> tuple:
    """최대 법인 주주 찾기"""
    best_stockholder = None
    best_rate = 0.0

    for s in stockholders:
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


def build_company_node(
    name: str,
    corp_number: str,
    source: str,
    ownership_rate: float = None,
    relation_type: str = None,
    inferred: bool = False,
    legal_parent_name: str = None,
    largest_stockholder: str = None,
    largest_stockholder_rate: float = None,
    parent_mismatch: bool = False,
    children: list = None,
) -> dict:
    """CompanyNode 딕셔너리 생성"""
    return {
        "name": name,
        "corp_number": corp_number,
        "ownership_rate": ownership_rate,
        "relation_type": relation_type,
        "source": source,
        "inferred": inferred,
        "legal_parent_name": legal_parent_name,
        "largest_stockholder": largest_stockholder,
        "largest_stockholder_rate": largest_stockholder_rate,
        "parent_mismatch": parent_mismatch,
        "children": children or [],
    }


def find_parent_affiliate(stockholders: list, target_corp_numbers: set, affiliate_name_map: dict) -> tuple:
    """주주 목록에서 같은 그룹 계열사를 찾아 부모로 반환"""
    for s in stockholders:
        stockholder_type = s.stockholder_type or ''
        if '개인' in stockholder_type:
            continue
        if any(kw in stockholder_type for kw in ['친족', '임원']):
            continue

        stockholder_name = s.stockholder_name or ''
        for corp_num in target_corp_numbers:
            affiliate_name = affiliate_name_map.get(corp_num, '')
            normalized_stockholder = normalize_company_name(stockholder_name)
            normalized_affiliate = normalize_company_name(affiliate_name)
            if normalized_stockholder and normalized_affiliate and normalized_stockholder == normalized_affiliate:
                return corp_num, s.total_rate
    return None, None


def generate_integrated_data(db, group: CorporateGroup) -> dict:
    """기업집단 통합 데이터 생성 (integrated.py 로직 재사용)"""

    # 계열사 목록
    affiliates = db.query(Affiliate).filter(Affiliate.group_code == group.code).all()
    affiliate_corp_numbers = {a.corporate_number for a in affiliates if a.corporate_number}
    affiliate_name_map = {a.corporate_number: a.name for a in affiliates if a.corporate_number}

    # 주주현황 데이터
    stockholder_data = db.query(Stockholder).filter(
        Stockholder.corp_number.in_(affiliate_corp_numbers)
    ).all()

    stockholders_by_company = {}
    for s in stockholder_data:
        if s.corp_number not in stockholders_by_company:
            stockholders_by_company[s.corp_number] = []
        stockholders_by_company[s.corp_number].append(s)

    # 지주회사 찾기
    holding_relations = []
    holding_info = None

    for affiliate in affiliates:
        if not affiliate.corporate_number:
            continue
        relations = db.query(HoldingCompanyRelation).filter(
            HoldingCompanyRelation.holding_corp_number == affiliate.corporate_number
        ).all()
        if relations:
            holding_relations = relations
            holding_info = {
                "name": relations[0].holding_group_name,
                "corp_number": affiliate.corporate_number,
                "finance_type": relations[0].finance_type,
            }
            break

    # 지주회사 트리 구조 생성
    tree = []
    holding_corp_numbers = set()

    if holding_relations:
        relations_by_parent = {}
        for r in holding_relations:
            parent = r.parent_corp_number or holding_info["corp_number"]
            if parent not in relations_by_parent:
                relations_by_parent[parent] = []
            relations_by_parent[parent].append(r)
            holding_corp_numbers.add(r.subsidiary_corp_number)

        def build_holding_tree(parent_corp_number: str, parent_name: str) -> list:
            children = []
            for r in relations_by_parent.get(parent_corp_number, []):
                source = "both" if r.subsidiary_corp_number in affiliate_corp_numbers else "holding"

                stockholders = stockholders_by_company.get(r.subsidiary_corp_number, [])
                largest_stockholder, largest_rate = find_largest_corporate_stockholder(
                    stockholders, affiliate_name_map
                )

                parent_mismatch = False
                if largest_stockholder:
                    normalized_parent = normalize_company_name(parent_name)
                    normalized_largest = normalize_company_name(largest_stockholder)
                    if normalized_parent and normalized_largest and normalized_parent != normalized_largest:
                        parent_mismatch = True

                children.append(build_company_node(
                    name=r.subsidiary_name,
                    corp_number=r.subsidiary_corp_number,
                    source=source,
                    ownership_rate=r.ownership_rate,
                    relation_type=r.relation_type,
                    legal_parent_name=parent_name,
                    largest_stockholder=largest_stockholder,
                    largest_stockholder_rate=largest_rate,
                    parent_mismatch=parent_mismatch,
                    children=build_holding_tree(r.subsidiary_corp_number, r.subsidiary_name),
                ))
            return children

        tree = build_holding_tree(holding_info["corp_number"], holding_info["name"])
        holding_corp_numbers.add(holding_info["corp_number"])

    # 기타 계열사 법인번호 목록
    other_corp_numbers = {
        a.corporate_number for a in affiliates
        if a.corporate_number and a.corporate_number not in holding_corp_numbers
    }

    # 주주현황 기반 추론: 지주회사 구조에 연결
    inferred_children = {}  # 부모 법인번호 -> 자식 노드 리스트
    other_affiliate_parent_map = {}  # 자식 -> (부모, 지분율)

    for affiliate in affiliates:
        if not affiliate.corporate_number or affiliate.corporate_number in holding_corp_numbers:
            continue

        stockholders = stockholders_by_company.get(affiliate.corporate_number, [])

        # 1차: 지주회사 구조에서 부모 찾기
        parent_corp, ownership_rate = find_parent_affiliate(
            stockholders, holding_corp_numbers, affiliate_name_map
        )

        if parent_corp:
            parent_name = affiliate_name_map.get(parent_corp, "")
            largest_stockholder, largest_rate = find_largest_corporate_stockholder(
                stockholders, affiliate_name_map
            )
            parent_mismatch = False
            if largest_stockholder:
                normalized_parent = normalize_company_name(parent_name)
                normalized_largest = normalize_company_name(largest_stockholder)
                if normalized_parent and normalized_largest and normalized_parent != normalized_largest:
                    parent_mismatch = True

            child_node = build_company_node(
                name=affiliate.name,
                corp_number=affiliate.corporate_number,
                source="affiliate",
                ownership_rate=ownership_rate,
                relation_type="추론",
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
                stockholders, other_corp_numbers, affiliate_name_map
            )
            if parent_corp and parent_corp != affiliate.corporate_number:
                other_affiliate_parent_map[affiliate.corporate_number] = (parent_corp, ownership_rate)

    # 트리에 추론된 자식 노드 연결
    def attach_inferred_children(nodes: list) -> list:
        for node in nodes:
            if node["corp_number"] in inferred_children:
                node["children"].extend(inferred_children[node["corp_number"]])
            attach_inferred_children(node["children"])
        return nodes

    tree = attach_inferred_children(tree)

    # 지주회사 자체에 연결된 추론 자식도 처리
    if holding_info and holding_info["corp_number"] in inferred_children:
        tree.extend(inferred_children[holding_info["corp_number"]])

    # 기타 계열사 트리 구성
    processed_corp_numbers = holding_corp_numbers.copy()
    for children_list in inferred_children.values():
        for child in children_list:
            processed_corp_numbers.add(child["corp_number"])

    # 기타 계열사 간 parent-child 맵
    other_children_map = {}
    has_parent_in_others = set()

    for child_corp, (parent_corp, rate) in other_affiliate_parent_map.items():
        if child_corp in processed_corp_numbers:
            continue
        if parent_corp not in other_children_map:
            other_children_map[parent_corp] = []
        other_children_map[parent_corp].append((child_corp, rate))
        has_parent_in_others.add(child_corp)

    # 루트 기타 계열사 찾기
    root_other_affiliates = []
    for affiliate in affiliates:
        corp_num = affiliate.corporate_number
        if not corp_num or corp_num in processed_corp_numbers:
            continue
        if corp_num not in has_parent_in_others:
            root_other_affiliates.append(affiliate)

    # 기타 계열사 트리 재귀 구성
    def build_other_affiliate_tree(corp_number: str, parent_name: str, visited: set) -> list:
        children = []
        if corp_number in visited:
            return children
        visited.add(corp_number)

        for child_corp, rate in other_children_map.get(corp_number, []):
            if child_corp in visited:
                continue
            child_name = affiliate_name_map.get(child_corp, child_corp)
            child_stockholders = stockholders_by_company.get(child_corp, [])
            largest_stockholder, largest_rate = find_largest_corporate_stockholder(
                child_stockholders, affiliate_name_map
            )

            children.append(build_company_node(
                name=child_name,
                corp_number=child_corp,
                source="affiliate",
                ownership_rate=rate,
                relation_type="추론",
                inferred=True,
                legal_parent_name=parent_name,
                largest_stockholder=largest_stockholder,
                largest_stockholder_rate=largest_rate,
                children=build_other_affiliate_tree(child_corp, child_name, visited.copy()),
            ))
        return children

    # 기타 계열사 노드 리스트 구성
    other_affiliates = []
    for affiliate in root_other_affiliates:
        corp_num = affiliate.corporate_number
        children = build_other_affiliate_tree(corp_num, affiliate.name, set())

        stockholders = stockholders_by_company.get(corp_num, [])
        largest_stockholder, largest_rate = find_largest_corporate_stockholder(
            stockholders, affiliate_name_map
        )

        other_affiliates.append(build_company_node(
            name=affiliate.name,
            corp_number=corp_num,
            source="affiliate",
            largest_stockholder=largest_stockholder,
            largest_stockholder_rate=largest_rate,
            children=children,
        ))

    # 추론 관계 카운트
    inferred_count = sum(len(children) for children in inferred_children.values())

    def count_inferred_in_tree(nodes: list) -> int:
        count = 0
        for node in nodes:
            if node.get("inferred"):
                count += 1
            count += count_inferred_in_tree(node.get("children", []))
        return count

    inferred_count += count_inferred_in_tree(other_affiliates)

    # 통계
    stats = {
        "total_affiliates": len(affiliates),
        "in_holding_structure": len(holding_corp_numbers),
        "other_affiliates": len(other_affiliates),
        "inferred_relations": inferred_count,
        "subsidiaries": sum(1 for r in holding_relations if r.relation_type == "자회사"),
        "grandchildren": sum(1 for r in holding_relations if r.relation_type == "손자회사"),
        "great_grandchildren": sum(1 for r in holding_relations if r.relation_type == "증손자회사"),
    }

    return {
        "group_code": group.code,
        "group_name": group.name,
        "owner": group.owner,
        "holding_company": holding_info["name"] if holding_info else None,
        "holding_corp_number": holding_info["corp_number"] if holding_info else None,
        "finance_type": holding_info["finance_type"] if holding_info else None,
        "tree": tree,
        "other_affiliates": other_affiliates,
        "stats": stats,
    }


def main():
    print("정적 데이터 생성 시작...")

    # 출력 디렉토리 생성
    output_dir = DATA_DIR / "static"
    integrated_dir = output_dir / "integrated"
    output_dir.mkdir(exist_ok=True)
    integrated_dir.mkdir(exist_ok=True)

    db = get_db_session()

    try:
        # 1. 기업집단 목록 생성
        print("기업집단 목록 생성 중...")
        groups = db.query(CorporateGroup).order_by(CorporateGroup.affiliate_count.desc()).all()

        groups_data = {
            "total": len(groups),
            "items": [
                {
                    "code": g.code,
                    "name": g.name,
                    "owner": g.owner,
                    "representative_company": g.representative_company,
                    "affiliate_count": g.affiliate_count,
                    "group_type": g.group_type,
                    "is_public": g.is_public,
                }
                for g in groups
            ]
        }

        with open(output_dir / "groups.json", "w", encoding="utf-8") as f:
            json.dump(groups_data, f, ensure_ascii=False, indent=2)
        print(f"  - groups.json 생성 완료 ({len(groups)}개 그룹)")

        # 2. 각 기업집단별 통합 데이터 생성
        print("기업집단별 통합 데이터 생성 중...")
        for i, group in enumerate(groups, 1):
            print(f"  [{i}/{len(groups)}] {group.name}...", end=" ")

            integrated_data = generate_integrated_data(db, group)

            with open(integrated_dir / f"{group.code}.json", "w", encoding="utf-8") as f:
                json.dump(integrated_data, f, ensure_ascii=False, indent=2)

            print(f"완료 (계열사 {integrated_data['stats']['total_affiliates']}개)")

        # 3. 계열사 검색 인덱스 생성
        print("계열사 검색 인덱스 생성 중...")
        affiliates = db.query(Affiliate).all()

        # group_code로 그룹명 매핑
        group_name_map = {g.code: g.name for g in groups}

        affiliates_index = [
            {
                "id": a.id,
                "name": a.name,
                "group_code": a.group_code,
                "group_name": group_name_map.get(a.group_code),
                "ceo": a.ceo,
            }
            for a in affiliates
        ]

        with open(output_dir / "affiliates_index.json", "w", encoding="utf-8") as f:
            json.dump(affiliates_index, f, ensure_ascii=False, indent=2)
        print(f"  - affiliates_index.json 생성 완료 ({len(affiliates_index)}개 계열사)")

        # 4. 매니페스트 생성
        manifest = {
            "version": datetime.now().strftime("%Y%m%d%H%M%S"),
            "generated_at": datetime.now().isoformat(),
            "total_groups": len(groups),
            "total_affiliates": len(affiliates_index),
            "data_source": "공정거래위원회 기업집단포털",
            "files": {
                "groups": "groups.json",
                "affiliates_index": "affiliates_index.json",
                "integrated": "integrated/{group_code}.json",
            }
        }

        with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print(f"\nmanifest.json 생성 완료")

        print(f"\n정적 데이터 생성 완료!")
        print(f"출력 디렉토리: {output_dir}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
