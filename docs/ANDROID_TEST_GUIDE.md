# Android 테스트 가이드

이 문서는 기업족보 앱을 Android에서 테스트하는 방법을 설명합니다.

## 사전 요구사항

### 1. Android Studio 설치

1. https://developer.android.com/studio 에서 Android Studio 다운로드
2. 설치 시 다음 항목 포함 선택:
   - Android SDK
   - Android Virtual Device (에뮬레이터)

### 2. 환경 변수 설정 (Windows)

시스템 환경 변수에 다음 추가:

```
ANDROID_HOME = C:\Users\{사용자명}\AppData\Local\Android\Sdk
```

Path 환경 변수에 추가:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

### 3. 설치 확인

터미널에서 확인:
```bash
adb version
```

---

## 테스트 방법

### 방법 1: Android Studio에서 실행 (권장)

```bash
cd packages/web

# 1. 웹 빌드
pnpm build

# 2. Capacitor 동기화 (빌드된 파일을 android 폴더로 복사)
npx cap sync android

# 3. Android Studio 열기
npx cap open android
```

Android Studio가 열리면:
1. 프로젝트 동기화 완료까지 대기 (우측 하단 진행바 확인)
2. 상단 툴바의 기기 선택 드롭다운에서 에뮬레이터 또는 연결된 실제 기기 선택
3. ▶️ (Run) 버튼 클릭

### 방법 2: 명령줄에서 실행

```bash
cd packages/web

# 빌드 및 동기화
pnpm build
npx cap sync android

# 연결된 기기/에뮬레이터에서 실행
npx cap run android
```

---

## 실제 기기에서 테스트

### USB 디버깅 활성화

1. **개발자 옵션 활성화**
   - 설정 → 휴대전화 정보 → 소프트웨어 정보
   - "빌드번호"를 7번 연속 탭
   - "개발자 모드가 활성화되었습니다" 메시지 확인

2. **USB 디버깅 켜기**
   - 설정 → 개발자 옵션
   - "USB 디버깅" 활성화

3. **기기 연결**
   - USB 케이블로 PC와 연결
   - 기기에서 "USB 디버깅 허용" 팝업이 뜨면 허용

### 연결 확인

```bash
adb devices
```

정상 출력 예시:
```
List of devices attached
XXXXXXXX    device
```

### 기기에서 앱 실행

```bash
npx cap run android --target={기기ID}
```

---

## 라이브 리로드 (개발 모드)

코드 수정 시 앱을 재빌드하지 않고 즉시 반영하려면:

### 1. PC의 로컬 IP 확인

```bash
# Windows
ipconfig
# IPv4 주소 확인 (예: 192.168.0.10)
```

### 2. capacitor.config.ts 수정

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aff.corporate',
  appName: '기업족보',
  webDir: 'dist',
  server: {
    url: 'http://192.168.0.10:3000',  // PC의 로컬 IP로 변경
    cleartext: true
  }
};

export default config;
```

### 3. 실행

```bash
# 터미널 1: 개발 서버
pnpm dev

# 터미널 2: 앱 실행
npx cap sync android
npx cap run android
```

> ⚠️ **주의**: 라이브 리로드 설정은 개발 중에만 사용하고, 배포 전에 `server` 설정을 제거해야 합니다.

---

## APK 빌드

### Debug APK

```bash
cd packages/web/android

# Windows
gradlew.bat assembleDebug

# macOS/Linux
./gradlew assembleDebug
```

생성 위치: `app/build/outputs/apk/debug/app-debug.apk`

### Release APK (서명 필요)

1. **키스토어 생성** (최초 1회)
   ```bash
   keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-alias
   ```

2. **app/build.gradle에 서명 설정 추가**
   ```gradle
   android {
       signingConfigs {
           release {
               storeFile file('my-release-key.jks')
               storePassword 'your-store-password'
               keyAlias 'my-alias'
               keyPassword 'your-key-password'
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
           }
       }
   }
   ```

3. **빌드**
   ```bash
   gradlew.bat assembleRelease
   ```

생성 위치: `app/build/outputs/apk/release/app-release.apk`

---

## 문제 해결

### adb devices 결과가 비어있음

- USB 케이블이 데이터 전송을 지원하는지 확인 (충전 전용 케이블 불가)
- 다른 USB 포트 시도
- 기기 제조사 USB 드라이버 설치

### Gradle 빌드 실패

Android Studio에서:
1. File → Sync Project with Gradle Files
2. Build → Clean Project
3. Build → Rebuild Project

### 에뮬레이터가 느림

- Android Studio → SDK Manager → SDK Tools
- Intel HAXM 또는 Android Emulator Hypervisor Driver 설치
- Windows: Hyper-V 활성화 확인

### 앱이 흰 화면만 표시

- `pnpm build` 후 `npx cap sync android` 실행했는지 확인
- Android Studio에서 Logcat으로 에러 로그 확인

### 네트워크 요청 실패 (라이브 리로드 시)

- PC와 기기가 같은 WiFi 네트워크에 있는지 확인
- 방화벽에서 3000 포트 허용
- `cleartext: true` 설정 확인

---

## 유용한 명령어

```bash
# Capacitor 동기화
npx cap sync android

# Android Studio 열기
npx cap open android

# 앱 실행
npx cap run android

# 연결된 기기 목록
adb devices

# 앱 로그 확인
adb logcat | grep -i "capacitor"

# 앱 강제 종료
adb shell am force-stop com.aff.corporate

# 앱 삭제
adb uninstall com.aff.corporate
```
