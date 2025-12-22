from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column

from affiliate_api.database import Base


class HoldingCompanyRelation(Base):
    """지주회사 자회사/손자회사 관계 모델"""

    __tablename__ = "holding_company_relations"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 지주회사 정보
    holding_group_name: Mapped[str] = mapped_column(String(200), index=True)  # unityGrupNm
    holding_corp_number: Mapped[str] = mapped_column(String(20), index=True)  # jurirno
    finance_type: Mapped[str | None] = mapped_column(String(50))  # fnncSeNm (금융/일반)

    # 자회사/손자회사 정보
    subsidiary_name: Mapped[str] = mapped_column(String(200), index=True)  # cdpnyNm
    subsidiary_corp_number: Mapped[str] = mapped_column(String(20))  # cdpnyJurirno
    ownership_rate: Mapped[float] = mapped_column(Float, default=0)  # cdpnyQotaRate (지분율)
    relation_type: Mapped[str] = mapped_column(String(20))  # hldcpSeNm (자회사/손자회사)
    parent_corp_number: Mapped[str | None] = mapped_column(String(20))  # parentJurirno

    designation_year: Mapped[str | None] = mapped_column(String(6))  # 공개년월

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<HoldingRelation {self.holding_group_name} -> {self.subsidiary_name}>"
