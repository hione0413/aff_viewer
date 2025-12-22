#!/bin/bash

echo "========================================"
echo "  기업 계열사 시각화 서비스 종료"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.service.pid"

# PID 파일에서 프로세스 종료
if [ -f "$PID_FILE" ]; then
    echo ""
    echo "저장된 프로세스 종료 중..."
    source "$PID_FILE"

    if [ -n "$API_PID" ]; then
        kill $API_PID 2>/dev/null && echo "  - API 서버 종료 (PID: $API_PID)"
    fi

    if [ -n "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null && echo "  - 웹 서버 종료 (PID: $WEB_PID)"
    fi

    rm "$PID_FILE"
fi

# 포트로 프로세스 찾아서 종료
echo ""
echo "포트 사용 프로세스 정리 중..."

# 8000 포트 (API)
API_PORT_PID=$(lsof -ti:8000 2>/dev/null)
if [ -n "$API_PORT_PID" ]; then
    kill $API_PORT_PID 2>/dev/null && echo "  - 포트 8000 프로세스 종료"
fi

# 3000 포트 (Web)
WEB_PORT_PID=$(lsof -ti:3000 2>/dev/null)
if [ -n "$WEB_PORT_PID" ]; then
    kill $WEB_PORT_PID 2>/dev/null && echo "  - 포트 3000 프로세스 종료"
fi

echo ""
echo "========================================"
echo "  서비스가 종료되었습니다."
echo "========================================"
