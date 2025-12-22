from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from affiliate_api.database import Base


class CorporateGroup(Base):
    """기업집단 모델"""

    __tablename__ = "corporate_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # unityGrupCode
    name: Mapped[str] = mapped_column(String(100), index=True)  # unityGrupNm
    owner: Mapped[str | None] = mapped_column(String(50))  # smerNm (동일인/총수)
    representative_company: Mapped[str | None] = mapped_column(String(100))  # repreCmpny
    affiliate_count: Mapped[int] = mapped_column(Integer, default=0)  # sumCmpnyCo
    group_type: Mapped[str | None] = mapped_column(String(50))  # invstmntLmtt (상호출자제한 등)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)  # entrprsCl (공기업 여부)
    designation_year: Mapped[str | None] = mapped_column(String(6))  # 지정년월 (YYYYMM)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # 관계
    affiliates = relationship("Affiliate", back_populates="group", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<CorporateGroup {self.name}>"
