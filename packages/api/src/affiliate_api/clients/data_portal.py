import httpx
import xmltodict
from typing import Any

from affiliate_api.config import settings


class DataPortalClient:
    """공공데이터포털 API 클라이언트"""

    BASE_URL = "https://apis.data.go.kr/1130000"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.data_portal_api_key
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _parse_xml(self, xml_text: str) -> dict[str, Any]:
        """XML 응답을 딕셔너리로 변환"""
        return xmltodict.parse(xml_text)

    def _get_items(self, response_dict: dict) -> list[dict]:
        """응답에서 아이템 리스트 추출"""
        try:
            body = response_dict.get("response", {}).get("body", {})
            items = body.get("items", {})

            if items is None:
                return []

            item = items.get("item", [])

            # 단일 아이템인 경우 리스트로 변환
            if isinstance(item, dict):
                return [item]

            return item if item else []
        except (KeyError, TypeError):
            return []

    def _get_total_count(self, response_dict: dict) -> int:
        """응답에서 전체 건수 추출"""
        try:
            return int(response_dict["response"]["body"]["totalCount"])
        except (KeyError, TypeError, ValueError):
            return 0

    async def get_corporate_groups(
        self, year: str = "202405", page: int = 1, num_of_rows: int = 100
    ) -> tuple[list[dict], int]:
        """
        대규모기업집단 목록 조회

        Args:
            year: 지정년월 (YYYYMM 형식, 예: 202405)
            page: 페이지 번호
            num_of_rows: 페이지당 결과 수

        Returns:
            (기업집단 목록, 전체 건수)
        """
        url = f"{self.BASE_URL}/appnGroupSttusList/appnGroupSttusListApi"
        params = {
            "ServiceKey": self.api_key,
            "pageNo": str(page),
            "numOfRows": str(num_of_rows),
            "presentnYear": year,
        }

        response = await self.client.get(url, params=params)
        response.raise_for_status()

        data = self._parse_xml(response.text)
        items = self._get_items(data)
        total = self._get_total_count(data)

        return items, total

    async def get_affiliates(
        self,
        group_code: str,
        year: str = "202405",
        page: int = 1,
        num_of_rows: int = 100,
    ) -> tuple[list[dict], int]:
        """
        특정 기업집단의 계열사 목록 조회

        Args:
            group_code: 기업집단 코드 (예: K1000032)
            year: 지정년월 (YYYYMM 형식)
            page: 페이지 번호
            num_of_rows: 페이지당 결과 수

        Returns:
            (계열사 목록, 전체 건수)
        """
        url = f"{self.BASE_URL}/appnGroupAffiList/appnGroupAffiListApi"
        params = {
            "ServiceKey": self.api_key,
            "pageNo": str(page),
            "numOfRows": str(num_of_rows),
            "presentnYear": year,
            "unityGrupCode": group_code,
        }

        response = await self.client.get(url, params=params)
        response.raise_for_status()

        data = self._parse_xml(response.text)
        items = self._get_items(data)
        total = self._get_total_count(data)

        return items, total

    async def get_all_corporate_groups(self, year: str = "202405") -> list[dict]:
        """모든 기업집단 조회 (페이징 처리)"""
        all_items = []
        page = 1

        while True:
            items, total = await self.get_corporate_groups(year, page, 100)
            all_items.extend(items)

            if len(all_items) >= total or not items:
                break

            page += 1

        return all_items

    async def get_all_affiliates(self, group_code: str, year: str = "202405") -> list[dict]:
        """특정 기업집단의 모든 계열사 조회 (페이징 처리)"""
        all_items = []
        page = 1

        while True:
            items, total = await self.get_affiliates(group_code, year, page, 100)
            all_items.extend(items)

            if len(all_items) >= total or not items:
                break

            page += 1

        return all_items
