import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from affiliate_api.config import settings
from affiliate_api.database import SessionLocal
from affiliate_api.services import SyncService

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def sync_job():
    """스케줄러에서 실행되는 동기화 작업"""
    logger.info("스케줄 동기화 작업 시작")

    db = SessionLocal()
    try:
        service = SyncService(db)
        service.sync_all()
    except Exception as e:
        logger.error(f"동기화 작업 실패: {e}")
    finally:
        db.close()

    logger.info("스케줄 동기화 작업 완료")


def start_scheduler():
    """스케줄러 시작"""
    # 매일 설정된 시간에 동기화
    scheduler.add_job(
        sync_job,
        CronTrigger(hour=settings.sync_cron_hour, minute=0),
        id="sync_job",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"스케줄러 시작: 매일 {settings.sync_cron_hour}시에 동기화")


def shutdown_scheduler():
    """스케줄러 종료"""
    scheduler.shutdown()
    logger.info("스케줄러 종료")
