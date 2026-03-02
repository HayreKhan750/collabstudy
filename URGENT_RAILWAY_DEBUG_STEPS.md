# 🚨 URGENT: Railway Upload Debug Steps

## Changes Pushed (Commit: 9506926)

I've added **comprehensive logging** to track exactly what's happening with file uploads in production. The code now logs every step of the upload and static file serving process.

---

## IMMEDIATE ACTIONS REQUIRED

### Step 1: Check Railway Deployment Logs

1. **Go to Railway Dashboard** → Your API Service
2. **Click "Deployments"** → Select the latest deployment
3. **View Logs** and look for these sections:

#### A. Startup Logs (when the server boots):
```
[UPLOAD CONFIG] Static file serving:
[UPLOAD CONFIG]   - Root path: /app/uploads
[UPLOAD CONFIG]   - Serve route: /uploads
[UPLOAD CONFIG]   - Example: GET /uploads/file.png serves /app/uploads/file.png

[UPLOAD CONFIG] API_URL: NOT SET
[UPLOAD CONFIG] ⚠️  API_URL not set! File URLs will default to http://localhost:4000

[UPLOAD CONFIG] S3/R2 Storage: ❌ DISABLED (using local disk)
[UPLOAD CONFIG] ⚠️⚠️⚠️  WARNING: Local disk storage is EPHEMERAL on Railway!
```

#### B. Upload Logs (when you upload a file):
```
[UPLOAD] Received file: image.png (image/png, 12345 bytes)
[UPLOAD] S3 Enabled: false
[UPLOAD] API_URL env var: NOT SET
[UPLOAD] Current working directory: /app
[UPLOAD] S3 NOT configured — using local disk storage (NOT RECOMMENDED FOR PRODUCTION)
[UPLOAD] Creating uploads directory if it doesn't exist: /app/uploads
[UPLOAD] Writing file to disk: /app/uploads/abc-123-def.png
[UPLOAD] File written successfully to: /app/uploads/abc-123-def.png
[UPLOAD] Generated file URL: http://localhost:4000/uploads/abc-123-def.png
[UPLOAD] File should be accessible at: GET http://localhost:4000/uploads/abc-123-def.png
```

---

## What the Logs Will Tell You

### ❌ Problem 1: API_URL Not Set (Most Likely Cause)

**Symptom in logs:**
```
[UPLOAD CONFIG] API_URL: NOT SET
[UPLOAD] Generated file URL: http://localhost:4000/uploads/abc-123-def.png
```

**What this means:**
- Files ARE being saved to disk at `/app/uploads/abc-123-def.png`
- But the URL returned to frontend is `http://localhost:4000/uploads/...`
- Frontend then tries to load from the wrong domain → 404

**FIX:**
1. Go to Railway → Your API Service → "Variables"
2. Add:
   ```
   API_URL=https://[your-api-domain].railway.app
   ```
   Replace `[your-api-domain]` with your actual Railway API URL
3. Redeploy
4. Upload a new image
5. Check that the URL is now: `https://[your-api-domain].railway.app/uploads/...`

---

### ❌ Problem 2: Static File Middleware Not Working

**Symptom in logs:**
```
[UPLOAD] File written successfully to: /app/uploads/abc-123-def.png
[UPLOAD] Generated file URL: https://your-api.railway.app/uploads/abc-123-def.png
```
Then you try to access the URL and get 404.

**What this means:**
- File is saved correctly
- URL is correct
- But the static file middleware isn't serving it

**FIX:**
Check if there are any errors in Railway logs about:
- `ServeStaticModule`
- `/uploads` route conflicts
- Permission errors accessing `/app/uploads`

If you see these, the issue is with NestJS static file serving on Railway.

---

### ❌ Problem 3: Files Being Deleted Immediately (Ephemeral Storage)

**Symptom:**
- Upload succeeds initially
- After a few minutes or after any deploy, images return 404
- Logs show files were saved successfully

**What this means:**
- Railway's ephemeral filesystem is deleting files
- This is EXPECTED behavior without persistent storage

**FIX:**
You MUST use S3/R2 storage. See "Permanent Solution" below.

---

## Permanent Solution: Configure Cloudflare R2

Local disk storage on Railway is **temporary**. Files are deleted on every redeploy.

### Quick R2 Setup (10 minutes):

1. **Create Cloudflare R2 Bucket** (FREE 10GB):
   - Go to https://dash.cloudflare.com
   - R2 → Create bucket → Name it `collabstudy-uploads`

2. **Get API Credentials**:
   - R2 Dashboard → "Manage R2 API Tokens"
   - Create API Token
   - Permissions: "Object Read & Write"
   - Copy the credentials

3. **Add to Railway Variables**:
   ```
   AWS_ACCESS_KEY_ID=your_r2_access_key_id
   AWS_SECRET_ACCESS_KEY=your_r2_secret_access_key
   AWS_S3_BUCKET_NAME=collabstudy-uploads
   AWS_S3_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
   S3_REGION=auto
   ```
   
   (Get the endpoint URL from your R2 bucket details)

4. **Redeploy** - that's it! Files now persist forever.

After R2 is configured, the logs will show:
```
[UPLOAD CONFIG] S3/R2 Storage: ✅ ENABLED
[UPLOAD CONFIG]   - Bucket: collabstudy-uploads
[UPLOAD CONFIG]   - Endpoint: https://[account-id].r2.cloudflarestorage.com
[UPLOAD] Using S3/R2 storage path
[UPLOAD] S3 upload successful. Key: uploads/abc-123-def.png
```

---

## Testing After Fix

1. **Upload a test image** in production chat
2. **Check Railway logs** for the `[UPLOAD]` messages
3. **Verify the URL** in the logs matches what you see in browser DevTools
4. **Click the image** - it should load without 404

---

## If It's Still Not Working

**Send me the Railway logs** showing:
1. The startup `[UPLOAD CONFIG]` section
2. The `[UPLOAD]` logs from when you upload a file
3. The HTTP request logs for the `GET /uploads/[filename]` request

With those logs, I can tell you exactly what's wrong.

---

## Summary

**Root Cause Analysis:**
The logging will reveal whether:
- ❌ API_URL is not set (most likely)
- ❌ Static file serving is broken
- ❌ Files are being deleted by ephemeral storage

**Quick Fix (Temporary):**
- Add `API_URL` environment variable to Railway

**Permanent Fix (Required for Production):**
- Configure Cloudflare R2 storage (see steps above)

**Current Status:**
✅ Code pushed with full debugging
✅ Logs will now show exactly what's happening
⏳ Waiting for you to check Railway logs and apply fix

---

## Questions?

After checking the logs, if you're still stuck:
1. Copy the `[UPLOAD CONFIG]` and `[UPLOAD]` log sections
2. Send them to me
3. I'll identify the exact issue and provide the fix
