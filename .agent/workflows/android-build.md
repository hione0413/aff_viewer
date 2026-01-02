---
description: 안드로이드 앱 빌드 및 업데이트 방법
---

# 안드로이드 앱 빌드 가이드

이 문서는 광고 ID 변경이나 코드 수정 후 안드로이드 출시 파일(.aab)을 다시 만드는 과정을 설명합니다.

> [!IMPORTANT]
> 모든 터미널 명령어는 **`packages/web`** 폴더에서 시작해야 합니다.

## 1단계: 환경 설정 (최초 1회 또는 터미널 재시작 시)

JAVA_HOME이 설정되어 있지 않다면 아래 명령어를 입력하여 안드로이드 스튜디오의 자바를 사용하도록 설정합니다.

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

## 2단계: 웹 빌드 및 동기화

수정된 웹 코드와 설정을 안드로이드 프로젝트로 복사합니다.

```bash
# 1. packages/web 폴더로 이동 (이미 있다면 생략)
cd packages/web

# 2. 웹 프로젝트 빌드
npm run build

# 3. 안드로이드 프로젝트와 동기화
npx cap sync android
```

## 3단계: 안드로이드 앱 번들(AAB) 생성

구글 플레이 콘솔에 올릴 최종 파일을 만듭니다.

```bash
# 4. android 폴더로 이동
cd android

# 5. AAB 파일 빌드
.\gradlew bundleRelease
```

## 4단계: 결과물 확인

빌드가 완료되면 아래 경로에서 파일을 찾을 수 있습니다:
`packages/web/android/app/build/outputs/bundle/release/app-release.aab`

---

## 자주 발생하는 문제 해결

### 1. `npx cap sync android` 에러
- 반드시 `packages/web` 폴더에서 실행해야 합니다. `packages/web/android` 폴더에서 실행하면 에러가 납니다.

### 2. `JAVA_HOME` 관련 에러
- 1단계의 환경 설정 명령어를 다시 실행해 주세요.

### 3. 비밀번호 관련 에러
- `packages/web/android/local.properties` 파일에 비밀번호가 올바르게 입력되어 있는지 확인해 주세요.
