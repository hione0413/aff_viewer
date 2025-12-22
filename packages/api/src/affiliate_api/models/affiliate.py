from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from affiliate_api.database import Base


class Affiliate(Base):
    """계열사 모델"""

    __tablename__ = "affiliates"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_code: Mapped[str] = mapped_column(
        String(20), ForeignKey("corporate_groups.code"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), index=True)  # entrprsNm
    corporate_number: Mapped[str | None] = mapped_column(String(20))  # jurirno (법인등록번호)
    business_number: Mapped[str | None] = mapped_column(String(20))  # bizrno (사업자등록번호)
    ceo: Mapped[str | None] = mapped_column(String(100))  # rprsntvNm (대표자명)
    founded_date: Mapped[str | None] = mapped_column(String(8))  # fondDe (설립일 YYYYMMDD)
    affiliated_date: Mapped[str | None] = mapped_column(String(8))  # grinil (계열편입일)
    designation_year: Mapped[str | None] = mapped_column(String(6))  # 지정년월 (YYYYMM)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # 관계
    group = relationship("CorporateGroup", back_populates="affiliates")

    def __repr__(self):
        return f"<Affiliate {self.name}>"
