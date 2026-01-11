#!/bin/bash

# Script to start both backend and frontend servers
# Usage: ./start.sh

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${GREEN}Starting Delta Architecture 3D Generation Server...${NC}"
echo ""

# Check if venv exists
if [ ! -d "server/venv" ]; then
    echo -e "${RED}Error: Virtual environment not found at server/venv${NC}"
    echo "Please create it first with: cd server && python -m venv venv"
    exit 1
fi

# Check if venv is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo -e "${YELLOW}Activating virtual environment...${NC}"
    source server/venv/bin/activate
else
    echo -e "${GREEN}Virtual environment already activated${NC}"
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Servers stopped${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend server
echo -e "${GREEN}Starting backend server on http://localhost:8000...${NC}"
cd server
python server.py > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}Backend server failed to start${NC}"
    exit 1
fi

# Start frontend server
echo -e "${GREEN}Starting frontend server on http://localhost:3000...${NC}"
cd client
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${GREEN}✓ Backend running on http://localhost:8000 (PID: $BACKEND_PID)${NC}"
echo -e "${GREEN}✓ Frontend running on http://localhost:3000 (PID: $FRONTEND_PID)${NC}"
echo ""
echo -e "${YELLOW}Backend logs: tail -f backend.log${NC}"
echo -e "${YELLOW}Frontend logs: tail -f frontend.log${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"
echo ""

# Wait for both processes
wait
