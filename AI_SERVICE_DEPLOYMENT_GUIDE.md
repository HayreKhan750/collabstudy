# 🤖 AI Summary Service Deployment Guide

## Why AI Summary Is Failing

The AI Summary feature requires a **Python microservice** to be running. Currently, it's failing because:

1. ❌ The Python AI service is NOT deployed on Railway
2. ❌ OR the `AI_SERVICE_URL` environment variable is not set

---

## 🎯 Two Options to Fix

### Option A: Deploy Python AI Service to Railway (Recommended)

#### Step 1: Deploy AI Service

1. **Go to Railway Dashboard**
2. **Click "New Project"** or use existing project
3. **Add New Service:**
   - Click "+ New"
   - Select "GitHub Repo"
   - Choose your repository
   - Set **Root Directory:** `apps/ai`
4. **Railway will auto-detect** the Python service

#### Step 2: Configure Environment Variables (AI Service)

In the **AI Service** (Python), add these variables:

```
GEMINI_API_KEY=your_google_gemini_api_key
```

**How to get Gemini API Key:**
1. Go to: https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key
4. Add to Railway

#### Step 3: Get AI Service URL

After the AI service deploys:
1. Click on the AI service in Railway
2. Go to "Settings" → "Domains"
3. Copy the Railway-provided URL (e.g., `https://ai-service-production.up.railway.app`)

#### Step 4: Configure API Service

In your **API Service** (Node.js), add this variable:

```
AI_SERVICE_URL=https://ai-service-production.up.railway.app
```

(Use the URL from Step 3)

---

### Option B: Disable AI Summary Feature (Quick Fix)

If you don't want to deploy the Python service right now, you can disable the feature:

#### Step 1: Hide the AI Summary Button

Edit `apps/web/src/components/chat/ChatArea.tsx`:

Find the AI Summary button and add a condition:

```tsx
{process.env.NEXT_PUBLIC_AI_ENABLED === 'true' && (
  <button onClick={handleSummary}>
    AI Summary
  </button>
)}
```

#### Step 2: Add Environment Variable (Web Service)

In Railway **Web Service**, add:

```
NEXT_PUBLIC_AI_ENABLED=false
```

This will hide the button so users don't see the error.

---

## 🚀 Recommended: Option A (Full Deployment)

Here's the complete Railway setup:

### Services You Should Have:

1. **API Service** (apps/api)
   - Node.js / NestJS
   - Handles main backend
   - **Needs:** `AI_SERVICE_URL`

2. **Web Service** (apps/web)
   - Next.js frontend
   - User interface

3. **AI Service** (apps/ai) ← **MISSING - DEPLOY THIS**
   - Python / FastAPI
   - Handles AI summarization
   - **Needs:** `GEMINI_API_KEY`

4. **Database**
   - PostgreSQL
   - Already configured ✅

---

## 📋 Environment Variables Checklist

### API Service (apps/api):
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
AI_SERVICE_URL=https://your-ai-service.up.railway.app  ← ADD THIS
R2_PUBLIC_URL=https://pub-xxx.r2.dev  ← ALSO NEED THIS (images)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET_NAME=collabstudy-uploads
AWS_S3_ENDPOINT=https://...r2.cloudflarestorage.com
S3_REGION=auto
```

### AI Service (apps/ai):
```
GEMINI_API_KEY=your_gemini_api_key  ← ADD THIS
```

### Web Service (apps/web):
```
NEXT_PUBLIC_API_URL=https://your-api.up.railway.app
```

---

## 🧪 Testing After Deployment

### Step 1: Check AI Service Logs

After deploying the Python AI service, check its logs for:

```
INFO:     Started server process
INFO:     Application startup complete
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 2: Check API Service Logs

When API starts, you should see:

```
[AI SERVICE] 🔗 Connecting to AI microservice at: https://your-ai-service.up.railway.app
```

NOT:

```
[AI SERVICE] ❌ AI_SERVICE_URL environment variable is NOT SET!
```

### Step 3: Test AI Summary

1. Go to a channel with messages
2. Click "AI Summary"
3. Check API logs for:

```
[AI SUMMARY] ✨ Job started — type=channel attempt=1/3
[AI SUMMARY] 📥 Fetching message history for channel abc-123
[AI SUMMARY] 📊 Fetched 25 messages from channel
[AI SUMMARY] 🤖 Calling AI service for job xyz-456
[AI SERVICE] 🔗 Connecting to AI microservice at: https://...
[AI SERVICE] 📤 Sending request to POST https://.../summarise
[AI SERVICE] ✅ Summary received successfully in 2341ms
[AI SUMMARY] ✅ Job completed successfully
```

---

## 🆘 Troubleshooting

### Error: "AI_SERVICE_URL is NOT SET"

**Fix:** Add `AI_SERVICE_URL` environment variable to API Service in Railway

### Error: "CONNECTION REFUSED"

**Fix:** Deploy the Python AI service to Railway

### Error: "REQUEST TIMED OUT"

**Possible causes:**
1. Gemini API key is invalid
2. Gemini API quota exceeded
3. Network issues

**Fix:** Check Python AI service logs for errors

### Error: "GEMINI_API_KEY not found"

**Fix:** Add `GEMINI_API_KEY` to AI Service environment variables

---

## 💡 Quick Start Guide

**If you want AI Summary working in 10 minutes:**

1. **Get Gemini API Key** (2 min)
   - https://makersuite.google.com/app/apikey
   - Free tier available

2. **Deploy AI Service to Railway** (3 min)
   - New Service → GitHub Repo → Root: `apps/ai`
   - Add `GEMINI_API_KEY` variable

3. **Configure API Service** (2 min)
   - Get AI service URL from Railway
   - Add `AI_SERVICE_URL` to API service variables

4. **Test** (1 min)
   - Click AI Summary button
   - Should work! ✅

---

## 📊 Architecture

```
User clicks "AI Summary"
  ↓
Frontend → API Service (Node.js)
  ↓
API Service → Queue Job (BullMQ/Redis)
  ↓
Background Worker picks up job
  ↓
Worker → AI Service (Python/FastAPI)
  ↓
AI Service → Google Gemini API
  ↓
Gemini returns summary
  ↓
AI Service → Worker
  ↓
Worker → WebSocket → Frontend
  ↓
User sees summary! ✅
```

**Missing link:** The Python AI Service deployment!

---

## 🎯 Summary

**Current Issue:** Python AI service not deployed

**Solution 1 (Recommended):** Deploy Python AI service to Railway with Gemini API key

**Solution 2 (Quick Fix):** Disable AI Summary button temporarily

**Time to fix:** 10 minutes for full deployment

**Result:** AI Summary feature works perfectly! 🚀
