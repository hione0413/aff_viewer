from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """애플리케이션 설정"""

    # API 설정
    app_name: str = "Affiliate Visualization API"
    debug: bool = False

    # 공공데이터포털 API
    data_portal_api_key: str = ""

    # 데이터베이스
    database_url: str = "sqlite:///./affiliate.db"

    # 스케줄러
    scheduler_enabled: bool = True
    sync_cron_hour: int = 2  # 매일 새벽 2시에 동기화

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
