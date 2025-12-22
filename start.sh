#!/bin/bash

echo "========================================"
echo "  기업 계열사 시각화 서비스 시작"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.service.pid"

# 백엔드 실행
echo ""
echo "[1/2] 백엔드 서버 시작 중..."
cd "$SCRIPT_DIR/packages/api"

# 가상환경이 없으면 생성
if [ ! -d ".venv" ]; then
    echo "가상환경 생성 중..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e ".[dev]"
else
    source .venv/bin/activate
fi

# 백엔드 백그라운드 실행
uvicorn affiliate_api.main:app --reload --port 8000 &
API_PID=$!
echo "API_PID=$API_PID" > "$PID_FILE"

# 프론트엔드 실행
echo ""
echo "[2/2] 프론트엔드 서버 시작 중..."
cd "$SCRIPT_DIR/packages/web"

# node_modules가 없으면 설치
if [ ! -d "node_modules" ]; then
    echo "의존성 설치 중..."
    pnpm install
fi

# 프론트엔드 백그라운드 실행
pnpm dev &
WEB_PID=$!
echo "WEB_PID=$WEB_PID" >> "$PID_FILE"

echo ""
echo "========================================"
echo "  서비스가 시작되었습니다!"
echo "========================================"
echo ""
echo "  - API 서버: http://localhost:8000"
echo "  - API 문서: http://localhost:8000/docs"
echo "  - 웹 서버:  http://localhost:3000"
echo ""
echo "  종료하려면 ./stop.sh 를 실행하세요."
echo "========================================"
