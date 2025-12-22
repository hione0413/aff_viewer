import logging
from datetime import datetime

import httpx
import xmltodict
from sqlalchemy.orm import Session

from affiliate_api.config import settings
from affiliate_api.models import CorporateGroup, Affiliate, HoldingCompanyRelation

logger = logging.getLogger(__name__)


class SyncService:
    """공공데이터포털 데이터 동기화 서비스"""

    BASE_URL = "https://apis.data.go.kr/1130000"

    def __init__(self, db: Session):
        self.db = db
        self.api_key = settings.data_portal_api_key

    def sync_all(self, year: str | None = None):
        """기업집단만 동기화 (빠름)"""
        if not year:
            now = datetime.now()
            if now.month >= 5:
                year = f"{now.year}05"
            else:
                year = f"{now.year - 1}05"

        logger.info(f"동기화 시작: year={year}")

        try:
            self._sync_groups(year)
            logger.info("동기화 완료")
        except Exception as e:
            logger.error(f"동기화 실패: {e}")
            raise

    def sync_group_affiliates(self, group_code: str, year: str | None = None):
        """특정 기업집단의 계열사만 동기화"""
        if not year:
            now = datetime.now()
            if now.month >= 5:
                year = f"{now.year}05"
            else:
                year = f"{now.year - 1}05"

        logger.info(f"계열사 동기화: group_code={group_code}")

        try:
            params = {
                "pageNo": "1",
                "numOfRows": "500",
                "presentnYear": year,
                "unityGrupCode": group_code,
            }
            affiliates = self._fetch_api("appnGroupAffiList/appnGroupAffiListApi", params)

            for affiliate_data in affiliates:
                self._upsert_affiliate(group_code, affiliate_data, year)

            self.db.commit()
            logger.info(f"계열사 동기화 완료: {len(affiliates)}개")
            return len(affiliates)
        except Exception as e:
            logger.error(f"계열사 동기화 실패: {e}")
            self.db.rollback()
            raise

    def _fetch_api(self, endpoint: str, params: dict) -> list[dict]:
        """API 호출 및 파싱"""
        params["ServiceKey"] = self.api_key

        with httpx.Client(timeout=30.0) as client:
            response = client.get(f"{self.BASE_URL}/{endpoint}", params=params)
            response.raise_for_status()

        data = xmltodict.parse(response.text)

        try:
            # 다양한 API 응답 형식 처리
            body = (
                data.get("appnGroupSttusList")
                or data.get("appnGroupAffiList")
                or data.get("holdingProgCompSttusList")
                or {}
            )
            items = (
                body.get("appnGroupSttus")
                or body.get("appnGroupAffi")
                or body.get("holdingProgCompSttus")
                or []
            )

            if isinstance(items, dict):
                return [items]
            return items if items else []
        except (KeyError, TypeError):
            return []

    def sync_holding_relations(self, year: str | None = None):
        """지주회사 자회사/손자회사 관계 동기화"""
        if not year:
            year = "202104"  # 기본값

        logger.info(f"지주회사 관계 동기화 시작: year={year}")

        try:
            # 페이징 처리
            page = 1
            total_count = 0

            while True:
                params = {
                    "pageNo": str(page),
                    "numOfRows": "500",
                    "presentnYm": year,
                }
                items = self._fetch_api(
                    "holdingProgCompSttusList/holdingProgCompStusListApi", params
                )

                if not items:
                    break

                success_count = 0
                for item in items:
                    if self._upsert_holding_relation(item, year):
                        success_count += 1

                total_count += success_count
                self.db.commit()

                logger.info(f"지주회사 관계 동기화 진행: {total_count}건")

                if len(items) < 500:
                    break

                page += 1

            logger.info(f"지주회사 관계 동기화 완료: 총 {total_count}건")
            return total_count
        except Exception as e:
            logger.error(f"지주회사 관계 동기화 실패: {e}")
            self.db.rollback()
            raise

    def _upsert_holding_relation(self, data: dict, year: str) -> bool:
        """지주회사 관계 upsert. 성공 시 True 반환."""
        # 필수 필드 체크
        holding_corp = data.get("jurirno", "")
        subsidiary_corp = data.get("cdpnyJurirno", "")
        subsidiary_name = data.get("cdpnyNm", "")

        # 필수 데이터가 없으면 건너뜀
        if not holding_corp or not subsidiary_corp or not subsidiary_name:
            logger.debug(f"필수 데이터 누락, 건너뜀: {data}")
            return False

        relation = (
            self.db.query(HoldingCompanyRelation)
            .filter(
                HoldingCompanyRelation.holding_corp_number == holding_corp,
                HoldingCompanyRelation.subsidiary_corp_number == subsidiary_corp,
            )
            .first()
        )

        if not relation:
            relation = HoldingCompanyRelation(
                holding_corp_number=holding_corp,
                subsidiary_corp_number=subsidiary_corp,
            )
            self.db.add(relation)

        relation.holding_group_name = data.get("unityGrupNm", "")
        relation.finance_type = data.get("fnncSeNm")
        relation.subsidiary_name = subsidiary_name
        relation.ownership_rate = float(data.get("cdpnyQotaRate", 0) or 0)
        relation.relation_type = data.get("hldcpSeNm", "")
        relation.parent_corp_number = data.get("parentJurirno") or None
        relation.designation_year = year
        relation.updated_at = datetime.utcnow()

        return True

    def _sync_groups(self, year: str):
        """기업집단 동기화"""
        logger.info("기업집단 동기화 시작")

        params = {"pageNo": "1", "numOfRows": "200", "presentnYear": year}
        groups = self._fetch_api("appnGroupSttusList/appnGroupSttusListApi", params)

        logger.info(f"조회된 기업집단: {len(groups)}개")

        for group_data in groups:
            self._upsert_group(group_data, year)

        self.db.commit()
        logger.info("기업집단 동기화 완료")

    def _sync_affiliates(self, year: str):
        """모든 기업집단의 계열사 동기화"""
        logger.info("계열사 동기화 시작")

        groups = self.db.query(CorporateGroup).all()

        for group in groups:
            logger.info(f"계열사 동기화: {group.name}")

            try:
                params = {
                    "pageNo": "1",
                    "numOfRows": "500",
                    "presentnYear": year,
                    "unityGrupCode": group.code,
                }
                affiliates = self._fetch_api("appnGroupAffiList/appnGroupAffiListApi", params)

                for affiliate_data in affiliates:
                    self._upsert_affiliate(group.code, affiliate_data, year)

                self.db.commit()
            except Exception as e:
                logger.error(f"계열사 동기화 실패 ({group.name}): {e}")
                self.db.rollback()

        logger.info("계열사 동기화 완료")

    def _upsert_group(self, data: dict, year: str):
        """기업집단 upsert"""
        code = data.get("unityGrupCode", "")

        group = self.db.query(CorporateGroup).filter(CorporateGroup.code == code).first()

        if not group:
            group = CorporateGroup(code=code)
            self.db.add(group)

        group.name = data.get("unityGrupNm", "")
        group.owner = data.get("smerNm")
        group.representative_company = data.get("repreCmpny")
        group.affiliate_count = int(data.get("sumCmpnyCo", 0) or 0)
        group.group_type = data.get("invstmntLmtt")
        group.is_public = data.get("entrprsCl") == "공기업"
        group.designation_year = year
        group.updated_at = datetime.utcnow()

    def _upsert_affiliate(self, group_code: str, data: dict, year: str):
        """계열사 upsert"""
        corporate_number = data.get("jurirno", "")
        name = data.get("entrprsNm", "")

        affiliate = (
            self.db.query(Affiliate)
            .filter(
                Affiliate.group_code == group_code,
                Affiliate.corporate_number == corporate_number,
            )
            .first()
        )

        if not affiliate:
            affiliate = Affiliate(group_code=group_code, corporate_number=corporate_number)
            self.db.add(affiliate)

        affiliate.name = name
        affiliate.business_number = data.get("bizrno")
        affiliate.ceo = data.get("rprsntvNm")
        affiliate.founded_date = data.get("fondDe")
        affiliate.affiliated_date = data.get("grinil")
        affiliate.designation_year = year
        affiliate.updated_at = datetime.utcnow()
