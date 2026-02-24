# 🚀 CollabStudy - Quick Start Guide

## Prerequisites
- Node.js 18+ and pnpm installed
- Docker and Docker Compose installed
- PostgreSQL and Redis (via Docker)

## 1. Start Infrastructure

```bash
# Start PostgreSQL and Redis containers
docker compose up -d

# Verify containers are running
docker compose ps
```

## 2. Setup Database

```bash
# Generate Prisma Client
cd packages/db
pnpm prisma generate

# Push schema to database (creates all tables)
pnpm prisma db push

# Optional: Open Prisma Studio to view data
pnpm prisma studio
```

## 3. Start Backend API (NestJS)

```bash
# Terminal 1
cd apps/api
pnpm install  # if not already done
pnpm run start:dev

# You should see:
# 🚀 CollabStudy API is running on: http://localhost:4000
```

## 4. Start Frontend (Next.js)

```bash
# Terminal 2
cd apps/web
pnpm install  # if not already done
pnpm dev

# You should see:
# ▲ Next.js 16.1.6
# - Local: http://localhost:3000
```

## 5. Test Authentication

1. **Open browser**: http://localhost:3000
2. **Register**: Create a new account
3. **Login**: Sign in with your credentials
4. **Dashboard**: View your profile

## Ports Used

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **AI Service** (future): http://localhost:8000

## Troubleshooting

### Database Connection Error
```bash
# Make sure PostgreSQL is running
docker compose ps

# Check logs
docker compose logs postgres
```

### Port Already in Use
```bash
# Change ports in environment files:
# apps/api/.env - change PORT=4000
# apps/web - Next.js will auto-increment
```

### Prisma Client Not Generated
```bash
cd packages/db
pnpm prisma generate
```

## Development Commands

```bash
# Root directory - install all dependencies
pnpm install

# Run all apps with Turbo (future enhancement)
pnpm dev

# Clean everything
pnpm clean

# Database commands
cd packages/db
pnpm prisma studio       # Open GUI
pnpm prisma db push      # Push schema changes
pnpm prisma generate     # Regenerate client
```

## What's Implemented ✅

- ✅ User registration with validation
- ✅ User login with JWT authentication
- ✅ Protected routes and API endpoints
- ✅ Password hashing with bcrypt
- ✅ Token persistence in localStorage
- ✅ User profile dashboard
- ✅ Logout functionality
- ✅ Auto-redirect based on auth state

## Next Steps

Phase 4 will implement:
- Workspaces
- Channels (Text, Voice, Video, AI)
- Real-time messaging with Socket.io
- AI integration with FastAPI service
- File uploads and sharing

---

**Questions or issues?** Check `PHASE3_AUTH_COMPLETE.md` for detailed documentation.
