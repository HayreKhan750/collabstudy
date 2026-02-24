#!/bin/bash

# CollabStudy Development Startup Script

echo "🚀 Starting CollabStudy Development Environment"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start database containers
echo "📦 Starting PostgreSQL and Redis..."
docker compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Push Prisma schema to database
echo "🗄️  Setting up database schema..."
cd packages/db
pnpm prisma db push --skip-generate
cd ../..

# Start backend API
echo "🔧 Starting NestJS API (port 4000)..."
cd apps/api
pnpm run start:dev &
API_PID=$!
cd ../..

# Wait a bit for backend to start
sleep 3

# Start frontend
echo "🎨 Starting Next.js frontend (port 3000)..."
cd apps/web
pnpm dev &
WEB_PID=$!
cd ../..

echo ""
echo "✅ CollabStudy is starting!"
echo ""
echo "📍 Services:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend API: http://localhost:4000"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis: localhost:6379"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping services...'; kill $API_PID $WEB_PID; docker compose down; exit" INT
wait
