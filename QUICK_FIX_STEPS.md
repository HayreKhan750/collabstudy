# 🔧 Quick Fix - How to Start CollabStudy

## The Issue
You were getting "Failed to fetch" because the **NestJS backend wasn't running**.

## The Solution - Start These Services in Order:

### 1️⃣ Start Database (Terminal 1)
```bash
docker compose up -d
```

Wait 5 seconds for PostgreSQL to initialize.

### 2️⃣ Setup Database Schema (One-time)
```bash
cd packages/db
pnpm prisma db push
cd ../..
```

### 3️⃣ Start Backend API (Terminal 2)
```bash
cd apps/api
pnpm run start:dev
```

**✅ You should see:** `🚀 CollabStudy API is running on: http://localhost:4000`

### 4️⃣ Start Frontend (Terminal 3)
```bash
cd apps/web
pnpm dev
```

**✅ You should see:** `- Local: http://localhost:3000`

---

## 🎯 Quick Verification

Open **http://localhost:4000** in your browser. You should see:
```json
{"message":"Hello World!"}
```

If you see this, your backend is running! ✅

---

## 📝 What Was Fixed

1. ✅ Added `@prisma/client` as a dependency in `apps/api/package.json`
2. ✅ Verified CORS is properly configured
3. ✅ Verified environment variables are correct
4. ✅ Created startup scripts and documentation

---

## 🚀 Alternative: Use the Startup Script

```bash
chmod +x start-dev.sh
./start-dev.sh
```

This will start everything automatically!

---

## ❓ Troubleshooting

**Port 4000 already in use?**
```bash
lsof -i :4000
kill -9 <PID>
```

**PostgreSQL not starting?**
```bash
docker compose down
docker compose up -d
```

**Still getting "Failed to fetch"?**
1. Check backend is running: http://localhost:4000
2. Check browser console for CORS errors
3. Verify `.env` files are correct
