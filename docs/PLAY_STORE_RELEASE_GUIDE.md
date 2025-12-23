# Google Play 스토어 출시 가이드

이 문서는 기업족보 앱을 Google Play 스토어에 출시하는 전체 과정을 설명합니다.

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [Google Play Console 계정 생성](#2-google-play-console-계정-생성)
3. [앱 서명 키 생성](#3-앱-서명-키-생성)
4. [Release 빌드 생성](#4-release-빌드-생성)
5. [Play Console에서 앱 등록](#5-play-console에서-앱-등록)
6. [스토어 등록 정보 작성](#6-스토어-등록-정보-작성)
7. [앱 심사 제출](#7-앱-심사-제출)
8. [출시 후 작업](#8-출시-후-작업)

---

## 1. 사전 준비

### 필수 준비물

| 항목 | 설명 |
|------|------|
| Google 계정 | Play Console 가입용 |
| 신용카드/체크카드 | 개발자 등록비 결제용 ($25, 일회성) |
| 앱 아이콘 | 512x512 PNG (투명 배경 가능) |
| 스크린샷 | 최소 2장 (휴대전화용) |
| 개인정보처리방침 URL | 웹페이지 필수 |

### 광고 ID 변경 (중요!)

출시 전에 테스트 ID를 실제 ID로 변경해야 합니다.

**1. AndroidManifest.xml 수정:**

파일: `packages/web/android/app/src/main/AndroidManifest.xml`

```xml
<!-- 실제 앱 ID로 변경 -->
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-9167710302823457~2889628387"/>
```

**2. ad-service.ts 수정:**

파일: `packages/web/src/services/ad-service.ts`

```typescript
const BANNER_AD_ID = PROD_BANNER_ID  // 실제 ID 사용
```

---

## 2. Google Play Console 계정 생성

### 2.1 Play Console 접속

1. https://play.google.com/console 접속
2. Google 계정으로 로그인

### 2.2 개발자 계정 등록

```
┌─────────────────────────────────────┐
│  Google Play Console 시작하기        │
├─────────────────────────────────────┤
│                                     │
│  개발자 계정 유형 선택:               │
│                                     │
│  ○ 개인  ← 개인 앱이면 선택           │
│  ○ 조직  ← 회사/단체면 선택           │
│                                     │
└─────────────────────────────────────┘
```

### 2.3 개발자 정보 입력

1. **개발자 이름**: Play 스토어에 표시될 이름
2. **이메일**: 사용자 문의용 이메일
3. **전화번호**: 본인 인증용

### 2.4 등록비 결제

- **$25 USD** (일회성, 환불 불가)
- 결제 완료 후 계정 활성화

---

## 3. 앱 서명 키 생성

### 3.1 키스토어 생성

터미널에서 실행:

```bash
cd packages/web/android

# 키스토어 생성
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias corporate-genealogy
```

프롬프트에 입력:

```
키 저장소 비밀번호 입력: [비밀번호 입력]
새 비밀번호 다시 입력: [비밀번호 확인]

이름과 성을 입력하십시오: 홍길동
조직 단위 이름을 입력하십시오: Development
조직 이름을 입력하십시오: MyCompany
구/군/시 이름을 입력하십시오: Seoul
시/도 이름을 입력하십시오: Seoul
이 조직의 두 자리 국가 코드를 입력하십시오: KR

CN=홍길동, OU=Development, O=MyCompany, L=Seoul, ST=Seoul, C=KR이(가) 맞습니까?
  [아니오]: 예
```

### 3.2 키 정보 안전하게 보관

생성된 정보를 **안전한 곳에 메모**:

```
=== 앱 서명 키 정보 (절대 분실하면 안 됨!) ===

키스토어 파일: release-key.jks
키스토어 비밀번호: xxxxxxxxxx
키 별칭(alias): corporate-genealogy
키 비밀번호: xxxxxxxxxx
```

> ⚠️ **중요**: 이 키를 분실하면 앱 업데이트가 불가능합니다!

### 3.3 Gradle 서명 설정

파일: `packages/web/android/app/build.gradle`

```gradle
android {
    // ... 기존 설정 ...

    signingConfigs {
        release {
            storeFile file('../release-key.jks')
            storePassword 'your-store-password'
            keyAlias 'corporate-genealogy'
            keyPassword 'your-key-password'
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

> 💡 **보안 팁**: 비밀번호를 코드에 직접 넣지 말고 환경변수나 `local.properties` 사용 권장

---

## 4. Release 빌드 생성

### 4.1 AAB 빌드 (권장)

Play 스토어는 APK보다 **AAB (Android App Bundle)** 를 권장합니다.

```bash
# 1. 웹 빌드
cd packages/web
npm run build

# 2. Capacitor 동기화
npx cap sync android

# 3. Android 폴더로 이동
cd android

# 4. Release AAB 빌드
gradlew.bat bundleRelease
```

생성 위치:
```
android/app/build/outputs/bundle/release/app-release.aab
```

### 4.2 APK 빌드 (대안)

```bash
gradlew.bat assembleRelease
```

생성 위치:
```
android/app/build/outputs/apk/release/app-release.apk
```

---

## 5. Play Console에서 앱 등록

### 5.1 앱 만들기

1. Play Console 접속
2. **모든 앱** → **앱 만들기**

```
┌─────────────────────────────────────┐
│  앱 만들기                           │
├─────────────────────────────────────┤
│                                     │
│  앱 이름: 기업족보                    │
│                                     │
│  기본 언어: 한국어 – ko-KR            │
│                                     │
│  앱 또는 게임: ● 앱  ○ 게임           │
│                                     │
│  유료 또는 무료: ● 무료  ○ 유료       │
│                                     │
│  [ ] 개발자 프로그램 정책 동의         │
│  [ ] 미국 수출법 동의                 │
│                                     │
│  [앱 만들기]                         │
└─────────────────────────────────────┘
```

### 5.2 대시보드 확인

앱 생성 후 대시보드에서 할 일 목록이 표시됩니다:

- [ ] 앱 액세스 권한 설정
- [ ] 광고 포함 여부
- [ ] 콘텐츠 등급
- [ ] 타겟층
- [ ] 스토어 등록정보
- [ ] 앱 번들 업로드

---

## 6. 스토어 등록 정보 작성

### 6.1 기본 정보

**앱 이름**: 기업족보

**간단한 설명** (80자 이내):
```
대한민국 대규모기업집단 계열사 관계를 한눈에! 지주회사 구조와 주주현황을 시각화합니다.
```

**자세한 설명** (4000자 이내):
```
기업족보는 대한민국 대규모기업집단의 계열사 관계를 시각적으로 보여주는 앱입니다.

주요 기능:
• 92개 대규모기업집단 정보 제공
• 지주회사-자회사-손자회사 구조 시각화
• 계열사 간 지분율 표시
• 주주현황 조회
• 회사명 검색 기능

데이터 출처:
• 공정거래위원회 대규모기업집단 공시
• 금융감독원 전자공시시스템

이 앱은 공공데이터를 활용하여 기업집단 정보를 쉽게 이해할 수 있도록 제작되었습니다.
```

### 6.2 그래픽 자산

| 항목 | 규격 | 필수 |
|------|------|------|
| 앱 아이콘 | 512x512 PNG | ✅ |
| 그래픽 이미지 | 1024x500 PNG/JPG | ✅ |
| 휴대전화 스크린샷 | 최소 2장, 16:9 또는 9:16 | ✅ |
| 태블릿 스크린샷 | 최소 1장 (태블릿 지원 시) | ❌ |

**스크린샷 촬영 팁:**
- Android 에뮬레이터에서 앱 실행
- 주요 화면 캡처 (목록, 트리 뷰, 주주현황 등)
- 권장 해상도: 1080x1920 이상

### 6.3 개인정보처리방침

**필수**: 개인정보처리방침 URL이 있어야 합니다.

간단한 개인정보처리방침 예시:
```
기업족보 앱 개인정보처리방침

1. 수집하는 개인정보
   - 본 앱은 사용자의 개인정보를 수집하지 않습니다.

2. 광고
   - Google AdMob을 통해 광고가 표시됩니다.
   - 광고 제공을 위해 기기 식별자가 수집될 수 있습니다.

3. 문의
   - 이메일: your-email@example.com

최종 수정일: 2024년 X월 X일
```

**호스팅 옵션:**
- GitHub Pages (무료)
- Google Sites (무료)
- 개인 웹사이트

### 6.4 앱 콘텐츠 설정

**광고 포함 여부**: 예, 광고가 포함되어 있습니다

**앱 액세스 권한**: 특별한 액세스 권한 없음

**콘텐츠 등급**: 설문지 작성 → 자동으로 등급 산정 (대부분 "전체이용가")

**타겟층**: 만 13세 이상 (어린이 대상 아님)

---

## 7. 앱 심사 제출

### 7.1 프로덕션 트랙에 AAB 업로드

1. 좌측 메뉴 → **프로덕션**
2. **새 버전 만들기**
3. **App Bundle** 섹션에서 `app-release.aab` 업로드
4. **버전 이름**: 1.0.0
5. **출시 노트** 작성:
   ```
   기업족보 v1.0.0 첫 출시

   - 92개 대규모기업집단 정보 제공
   - 지주회사 구조 시각화
   - 주주현황 조회 기능
   ```

### 7.2 검토 및 출시

1. 모든 필수 항목 완료 확인
2. **검토를 위해 앱 제출** 클릭

### 7.3 심사 기간

- **첫 앱**: 보통 3~7일
- **업데이트**: 보통 1~3일
- 정책 위반 시 거부될 수 있음

---

## 8. 출시 후 작업

### 8.1 AdMob 앱 연결

1. AdMob 콘솔 → 앱 → 기업족보
2. **앱 스토어 연결** 클릭
3. Play 스토어 URL 입력

### 8.2 모니터링

- **Play Console**: 다운로드 수, 평점, 리뷰
- **AdMob**: 광고 수익, 노출 수
- **Firebase Crashlytics** (선택): 앱 충돌 모니터링

### 8.3 업데이트 배포

1. 버전 코드 증가: `android/app/build.gradle`
   ```gradle
   versionCode 2
   versionName "1.0.1"
   ```
2. 새 AAB 빌드
3. Play Console에서 새 버전 업로드

---

## 체크리스트

### 출시 전

- [ ] 테스트 광고 ID → 실제 ID 변경
- [ ] 키스토어 생성 및 안전하게 보관
- [ ] Release AAB 빌드
- [ ] 앱 아이콘 (512x512) 준비
- [ ] 스크린샷 (최소 2장) 준비
- [ ] 개인정보처리방침 페이지 생성
- [ ] Play Console 계정 생성 ($25 결제)
- [ ] 스토어 등록 정보 작성
- [ ] 콘텐츠 등급 설문 완료

### 출시 후

- [ ] AdMob에서 앱 스토어 연결
- [ ] 앱 다운로드 및 광고 표시 확인
- [ ] 사용자 리뷰 모니터링

---

## 문제 해결

### Q: 심사에서 거부되었어요

**A:** 거부 사유 확인 후 수정하여 재제출. 흔한 거부 사유:
- 개인정보처리방침 누락
- 스크린샷 품질 미달
- 앱 설명 부족
- 정책 위반 (광고 배치 등)

### Q: 앱이 검색되지 않아요

**A:** 신규 앱은 검색에 노출되기까지 수일 소요. 다운로드/평점이 늘면 노출 증가.

### Q: 키스토어를 분실했어요

**A:** 기존 앱 업데이트 불가. Play App Signing 사용 시 Google에 키 복구 요청 가능.

---

## 참고 자료

- [Play Console 고객센터](https://support.google.com/googleplay/android-developer)
- [앱 출시 체크리스트](https://developer.android.com/distribute/best-practices/launch/launch-checklist)
- [Play 스토어 정책](https://play.google.com/about/developer-content-policy/)
