#!/bin/bash

# HumanSign Server Startup Script

echo "🚀 Starting HumanSign API Server..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "Installing dependencies..."
    ./venv/bin/pip install -r requirements.txt
fi

# Activate virtual environment and start server
echo "✅ Starting server on http://localhost:8000"
echo ""
echo "📊 API Documentation: http://localhost:8000/docs"
echo "🏥 Health Check: http://localhost:8000/health"
echo "🔍 Verify Endpoint: http://localhost:8000/verify"
echo ""
echo "Press Ctrl+C to stop"
echo ""

./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
