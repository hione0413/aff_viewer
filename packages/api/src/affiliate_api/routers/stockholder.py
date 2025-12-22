from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from affiliate_api.database import get_db
from affiliate_api.models import Stockholder
from affiliate_api.clients.data_portal import DataPortalClient

router = APIRouter()


@router.get("/test-api")
async def test_stockholder_api(
    year: str = Query("202405"),
    group_code: str | None = Query(None, description="기업집단코드 (선택)"),
):
    """주주현황 API 테스트"""
    async with DataPortalClient() as client:
        try:
            items, total = await client.get_stockholders(year, group_code, page=1, num_of_rows=10)
            return {
                "total": total,
                "sample_count": len(items),
                "items": items[:5],
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API 호출 실패: {str(e)}")


@router.post("/sync")
async def sync_stockholders(
    year: str = Query("202405", description="지정년월 (YYYYMM)"),
    group_code: str | None = Query(None, description="기업집단코드 (없으면 전체)"),
    db: Session = Depends(get_db),
):
    """주주현황 데이터 동기화"""
    async with DataPortalClient() as client:
        try:
            items = await client.get_all_stockholders(year, group_code)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API 호출 실패: {str(e)}")

    count = 0
    for item in items:
        corp_number = item.get("jurirno")
        stockholder_name = item.get("shrholdrNm")

        if not corp_number or not stockholder_name:
            continue

        existing = db.query(Stockholder).filter(
            Stockholder.corp_number == corp_number,
            Stockholder.stockholder_name == stockholder_name,
            Stockholder.designation_year == year,
        ).first()

        total_rate = item.get("allQotaRate")
        common_rate = item.get("nrmltyQotaRate")
        preferred_rate = item.get("priorQotaRate")

        # 필드 매핑 (주주현황 API 응답 구조)
        group_name = item.get("unityGrupNm", "")
        company_name = item.get("entrprsNm", "")
        stockholder_type = item.get("shrholdrSe", "")

        if existing:
            existing.group_code = group_name  # 이 API는 코드 대신 이름 제공
            existing.group_name = group_name
            existing.company_name = company_name
            existing.stockholder_type = stockholder_type
            existing.total_rate = float(total_rate) if total_rate else None
            existing.common_rate = float(common_rate) if common_rate else None
            existing.preferred_rate = float(preferred_rate) if preferred_rate else None
        else:
            stockholder = Stockholder(
                group_code=group_name,
                group_name=group_name,
                corp_number=corp_number,
                company_name=company_name,
                stockholder_name=stockholder_name,
                stockholder_type=stockholder_type,
                total_rate=float(total_rate) if total_rate else None,
                common_rate=float(common_rate) if common_rate else None,
                preferred_rate=float(preferred_rate) if preferred_rate else None,
                designation_year=year,
            )
            db.add(stockholder)

        count += 1

    db.commit()

    return {
        "message": f"주주현황 {count}건 동기화 완료",
        "count": count,
        "year": year,
    }


class StockholderResponse(BaseModel):
    stockholder_name: str
    stockholder_type: str | None
    total_rate: float | None
    common_rate: float | None
    preferred_rate: float | None
    is_corporate: bool  # 법인 여부


class StockholderListResponse(BaseModel):
    company_name: str
    corp_number: str
    stockholders: list[StockholderResponse]
    total_count: int
    corporate_count: int  # 법인 주주 수
    individual_count: int  # 개인 주주 수
    individual_total_rate: float  # 개인 주주 합산 지분율


def is_corporate_stockholder(stockholder_type: str | None, name: str) -> bool:
    """법인 주주 여부 판단"""
    # 개인 관련 키워드
    individual_keywords = ['동일인', '친족', '임원', '비등기임원', '계열회사임원']

    if stockholder_type:
        # 명확한 개인 유형
        if any(kw in stockholder_type for kw in individual_keywords):
            return False
        # 명확한 법인 유형
        if any(kw in stockholder_type for kw in ['법인', '비영리법인', '기관', '외국법인', '국내법인', '자기주식', '기타']):
            return True

    # 이름에 법인 관련 키워드가 있으면 법인으로 판단
    corporate_keywords = ['(주)', '주식회사', '㈜', '(유)', '유한회사', '(재)', '재단', '공단', '공사', '은행', '금고', '조합', '펀드', '투자', '보험']
    return any(kw in name for kw in corporate_keywords)


@router.get("/{corp_number}", response_model=StockholderListResponse)
async def get_stockholders(
    corp_number: str,
    hide_individuals: bool = Query(False, description="개인 주주 숨김 (집계만 표시)"),
    db: Session = Depends(get_db),
):
    """
    특정 회사의 주주현황 조회

    - hide_individuals=true: 개인 주주는 숨기고 집계 정보만 표시
    """
    stockholders = db.query(Stockholder).filter(
        Stockholder.corp_number == corp_number
    ).order_by(Stockholder.total_rate.desc()).all()

    if not stockholders:
        raise HTTPException(status_code=404, detail="주주현황 정보가 없습니다")

    company_name = stockholders[0].company_name if stockholders else ""

    result_stockholders = []
    individual_total_rate = 0.0
    corporate_count = 0
    individual_count = 0

    for s in stockholders:
        is_corp = is_corporate_stockholder(s.stockholder_type, s.stockholder_name)

        if is_corp:
            corporate_count += 1
            result_stockholders.append(StockholderResponse(
                stockholder_name=s.stockholder_name,
                stockholder_type=s.stockholder_type,
                total_rate=s.total_rate,
                common_rate=s.common_rate,
                preferred_rate=s.preferred_rate,
                is_corporate=True,
            ))
        else:
            individual_count += 1
            individual_total_rate += s.total_rate or 0

            if not hide_individuals:
                # 개인 주주도 표시 (이름은 마스킹 처리)
                masked_name = s.stockholder_name[0] + "*" * (len(s.stockholder_name) - 1) if s.stockholder_name else "***"
                result_stockholders.append(StockholderResponse(
                    stockholder_name=masked_name,
                    stockholder_type="개인",
                    total_rate=s.total_rate,
                    common_rate=s.common_rate,
                    preferred_rate=s.preferred_rate,
                    is_corporate=False,
                ))

    return StockholderListResponse(
        company_name=company_name,
        corp_number=corp_number,
        stockholders=result_stockholders,
        total_count=len(stockholders),
        corporate_count=corporate_count,
        individual_count=individual_count,
        individual_total_rate=round(individual_total_rate, 2),
    )
