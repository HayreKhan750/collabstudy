# 🚨 URGENT: Your Images Are Still Breaking!

## What Your Logs Show

```
R2 Public URL NOT configured — using presigned URLs (expire after 1 hour, may cause 404s)
```

**This means:** You have NOT completed the R2 public URL setup yet!

---

## ⚡ 2-Minute Fix (Do This NOW)

### Step 1: Make R2 Bucket Public (30 seconds)

1. Go to: https://dash.cloudflare.com
2. Click **R2** in sidebar
3. Click bucket: **`collabstudy-uploads`**
4. Click **Settings** tab
5. Find **"Public Access"** section
6. Click **"Allow Access"** button
7. **COPY** the URL that appears: `https://pub-xxxxxxxxxxxxx.r2.dev`

---

### Step 2: Add to Railway (30 seconds)

1. Go to Railway Dashboard
2. Select **API service** (apps/api)
3. Click **"Variables"** tab
4. Click **"New Variable"**
5. Enter:
   - **Name:** `R2_PUBLIC_URL`
   - **Value:** `https://pub-xxxxxxxxxxxxx.r2.dev` (paste from Step 1)
6. Click **"Add"**

Railway will auto-redeploy in ~2 minutes.

---

### Step 3: Verify It Worked (30 seconds)

After Railway redeploys, check the logs. You should now see:

```
✅ R2 Public URL configured: https://pub-xxxxxxxxxxxxx.r2.dev (images will use permanent public URLs)
```

Instead of:

```
❌ R2 Public URL NOT configured — using presigned URLs (expire after 1 hour, may cause 404s)
```

---

## 🎯 Why This Matters

**Right now:**
- Images upload ✅
- Images work for 1 hour ✅
- After 1 hour → **404 errors** ❌

**After the fix:**
- Images upload ✅
- Images work **forever** ✅
- No more 404 errors ✅

---

## 📝 Summary

**The code fix is already deployed.** You just need to:
1. Enable public access on R2 bucket
2. Add `R2_PUBLIC_URL` environment variable to Railway

That's it! Takes 2 minutes total.

---

## ✅ Complete Guides

For detailed instructions, see:
- `FINAL_FIX_INSTRUCTIONS.md` - Complete step-by-step guide
- `FIX_R2_PUBLIC_ACCESS.md` - Detailed R2 setup
- `RAILWAY_UPLOAD_FIX.md` - Alternative solutions

**But honestly, just follow the 2-minute fix above!** 🚀
