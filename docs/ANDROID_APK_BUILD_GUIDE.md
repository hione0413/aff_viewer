# 안드로이드 APK 빌드 및 설치 가이드 (테스트용)

이 문서는 앱을 구글 플레이 스토어에 올리기 전, 내 핸드폰에 직접 설치해서 테스트하기 위한 **APK 파일**을 만드는 방법을 설명합니다.

---

## 🚀 빠른 빌드 방법 (터미널 사용)

가장 간단한 방법은 미리 만들어둔 통합 명령어를 사용하는 것입니다.

1.  **터미널(PowerShell)**을 엽니다.
2.  프로젝트의 **`packages/web`** 폴더로 이동합니다.
3.  아래 명령어를 복사해서 붙여넣습니다:

```powershell
# 1. 환경 설정 (자바 경로 설정)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

# 2. 통합 빌드 실행 (웹 빌드 + 동기화 + APK 생성)
npm run build:apk
```

---

## 📂 생성된 파일 확인

빌드가 성공하면 아래 경로에 APK 파일이 생깁니다:
`packages/web/android/app/build/outputs/apk/release/app-release.apk`

> [!TIP]
> 이 파일을 카카오톡(나에게 보내기), 이메일, 혹은 USB 연결을 통해 핸드폰으로 옮겨서 설치하시면 됩니다.

---

## 🛠 상세 단계 설명 (수동 빌드)

통합 명령어가 작동하지 않거나 단계를 직접 확인하고 싶을 때 사용하세요.

### 1단계: 웹 코드 빌드
수정된 React 코드를 정적 파일로 변환합니다.
```bash
cd packages/web
npm run build
```

### 2단계: 안드로이드 프로젝트 동기화
빌드된 웹 파일을 안드로이드 프로젝트 내부로 복사합니다.
```bash
npx cap sync android
```

### 3단계: APK 파일 생성
안드로이드 폴더에서 실제 설치 파일을 만듭니다.
```bash
cd android
# (자바 경로 설정 후 실행)
.\gradlew assembleRelease
```

---

## ❓ 자주 묻는 질문

**Q: '출처를 알 수 없는 앱' 경고가 떠요.**
A: 구글 플레이 스토어를 통해 설치한 앱이 아니라서 뜨는 정상적인 보안 경고입니다. 빌드한 본인이 안전함을 알고 있으므로 '허용' 또는 '무시하고 설치'를 눌러주시면 됩니다.

**Q: 이전 버전이 설치되어 있는데 새로 설치가 안 돼요.**
A: 기존에 설치된 앱을 삭제하고 새 APK를 설치해 보세요. (서명이 바뀌었거나 버전 충돌 시 발생할 수 있습니다.)

**Q: 빌드 중에 에러가 나요.**
A: `packages/web/android/local.properties` 파일에 `KEYSTORE_PASSWORD`와 `KEY_PASSWORD`가 올바르게 적혀 있는지 확인해 주세요.
