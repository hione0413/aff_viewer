import { Capacitor } from '@capacitor/core'
import {
  AdMob,
  BannerAdOptions,
  BannerAdSize,
  BannerAdPosition,
  BannerAdPluginEvents,
  AdMobBannerSize,
} from '@capacitor-community/admob'

// 테스트용 광고 단위 ID
// const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111'

// 실제 광고 단위 ID (AdMob 콘솔에서 발급받은 ID로 교체)
const PROD_BANNER_ID = 'ca-app-pub-9167710302823457/6680521977'

// 개발 모드 여부
const isDev = import.meta.env.DEV

// 광고 단위 ID (테스트 시 TEST_BANNER_ID, 배포 시 PROD_BANNER_ID)
// TODO: 배포 시 PROD_BANNER_ID로 변경
const BANNER_AD_ID = PROD_BANNER_ID

let isInitialized = false
let isBannerShowing = false

/**
 * AdMob 초기화
 */
export async function initializeAdMob(): Promise<void> {
  // 네이티브 플랫폼에서만 실행
  if (!Capacitor.isNativePlatform()) {
    console.log('[AdMob] 웹 환경에서는 광고가 표시되지 않습니다.')
    return
  }

  if (isInitialized) {
    return
  }

  try {
    await AdMob.initialize({
      // 테스트 기기 설정 (실제 기기 테스트 시 기기 ID 추가)
      // testingDevices: ['YOUR_DEVICE_ID'],
      initializeForTesting: isDev,
    })

    isInitialized = true
    console.log('[AdMob] 초기화 완료')
  } catch (error) {
    console.error('[AdMob] 초기화 실패:', error)
  }
}

/**
 * 하단 배너 광고 표시
 */
export async function showBannerAd(onSize?: (height: number) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  if (!isInitialized) {
    await initializeAdMob()
  }

  if (isBannerShowing) {
    return
  }

  try {
    const options: BannerAdOptions = {
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: isDev,
    }

    // 크기 변경 이벤트 리스너 등록
    if (onSize) {
      AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info: AdMobBannerSize) => {
        console.log('[AdMob] 배너 크기 변경:', info.height)
        onSize(info.height)
      })

      AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
        // 로드 시에도 크기 확인이 필요할 수 있음
        console.log('[AdMob] 배너 로드됨')
      })
    }

    await AdMob.showBanner(options)
    isBannerShowing = true
    console.log('[AdMob] 배너 광고 표시')
  } catch (error) {
    console.error('[AdMob] 배너 광고 표시 실패:', error)
  }
}

/**
 * 배너 광고 숨기기
 */
export async function hideBannerAd(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isBannerShowing) {
    return
  }

  try {
    await AdMob.hideBanner()
    isBannerShowing = false
    console.log('[AdMob] 배너 광고 숨김')
  } catch (error) {
    console.error('[AdMob] 배너 광고 숨기기 실패:', error)
  }
}

/**
 * 배너 광고 제거
 */
export async function removeBannerAd(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isBannerShowing) {
    return
  }

  try {
    await AdMob.removeBanner()
    isBannerShowing = false
    console.log('[AdMob] 배너 광고 제거')
  } catch (error) {
    console.error('[AdMob] 배너 광고 제거 실패:', error)
  }
}

/**
 * 배너 광고 다시 표시
 */
export async function resumeBannerAd(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isInitialized) {
    return
  }

  try {
    await AdMob.resumeBanner()
    isBannerShowing = true
    console.log('[AdMob] 배너 광고 재개')
  } catch (error) {
    console.error('[AdMob] 배너 광고 재개 실패:', error)
  }
}
