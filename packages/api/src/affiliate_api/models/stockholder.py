from sqlalchemy import Column, Integer, String, Float, DateTime, Index
from sqlalchemy.sql import func

from affiliate_api.database import Base


class Stockholder(Base):
    """주주현황 테이블"""

    __tablename__ = "stockholders"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 기업집단 정보
    group_code = Column(String(20), nullable=False, index=True)  # 기업집단코드
    group_name = Column(String(200))  # 기업집단명

    # 회사 정보
    corp_number = Column(String(50), nullable=False, index=True)  # 법인등록번호
    company_name = Column(String(200))  # 회사명

    # 주주 정보
    stockholder_name = Column(String(200), nullable=False)  # 주주명
    stockholder_type = Column(String(50))  # 주주구분 (법인/개인/기타)

    # 지분율
    total_rate = Column(Float)  # 전체지분율 (%)
    common_rate = Column(Float)  # 보통주지분율 (%)
    preferred_rate = Column(Float)  # 우선주지분율 (%)

    # 메타 정보
    designation_year = Column(String(10), nullable=False)  # 지정년월
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_stockholder_company', 'group_code', 'corp_number'),
        Index('ix_stockholder_year', 'designation_year', 'group_code'),
    )
