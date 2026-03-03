# ✅ Step-by-Step: Enable R2 Public URL

## Current Status

Looking at your Cloudflare R2 bucket settings, I can see:

```
Public Access: Disabled
Public Development URL: The public development URL is disabled for this bucket.
```

**This is why images are breaking!** Let me show you exactly how to fix it.

---

## 🎯 Enable Public Development URL

### Step 1: Click on "Public Development URL" Section

In your R2 bucket settings page, you should see:

```
Public Development URL
Expose the contents of this R2 bucket to the internet through the Public Development URL when enabled.

The public development URL is disabled for this bucket.
```

There should be a button or toggle to **enable** it.

---

### Step 2: Enable the Public URL

Look for one of these:
- **"Enable"** button
- **Toggle switch** to turn it on
- **"Allow Access"** button

Click it to enable public access.

---

### Step 3: Copy the Public URL

After enabling, you'll see something like:

```
Public Development URL: https://pub-xxxxxxxxxxxxx.r2.dev
```

**Copy this URL!** You'll need it for the next step.

---

## Alternative: Use Custom Domain (Recommended for Production)

If you want a branded URL instead of `pub-xxx.r2.dev`, you can use a custom domain:

### Step 1: Click "Custom Domains" Section

```
Custom Domains
Expose the contents of this R2 bucket to the internet through a custom domain.
Recommended for production use.

There is no custom domain assigned to this bucket.
```

### Step 2: Add Custom Domain

1. Click **"Add Domain"** or **"Connect Domain"**
2. Enter your domain: `cdn.yourdomain.com` (or any subdomain)
3. Cloudflare will auto-configure DNS
4. Copy the custom domain URL

---

## 🚂 Add to Railway

Once you have the public URL (either `pub-xxx.r2.dev` or your custom domain):

### Step 1: Go to Railway

1. Open Railway Dashboard
2. Select your **API service** (apps/api)
3. Click **"Variables"** tab

### Step 2: Add Environment Variable

4. Click **"New Variable"**
5. Enter:
   - **Variable:** `R2_PUBLIC_URL`
   - **Value:** `https://pub-xxxxxxxxxxxxx.r2.dev` (or your custom domain)
6. Click **"Add"**

Railway will automatically redeploy your API service.

---

## ✅ Verify It Worked

### Check Railway Logs

After the redeploy completes (~2 minutes), check your Railway API logs.

**Before (current):**
```
❌ R2 Public URL NOT configured — using presigned URLs (expire after 1 hour, may cause 404s)
```

**After (fixed):**
```
✅ R2 Public URL configured: https://pub-xxxxxxxxxxxxx.r2.dev (images will use permanent public URLs)
```

### Test Upload

1. Upload a new image (profile picture or chat attachment)
2. Check the image URL in browser DevTools
3. Should be: `https://pub-xxxxxxxxxxxxx.r2.dev/uploads/filename.png`
4. NOT: `https://...r2.cloudflarestorage.com/...?X-Amz-Signature=...`

---

## 🔐 Security Note

**Q: Is it safe to enable public access?**

**A: Yes, for user-uploaded content!**

What becomes public:
- ✅ Read-only access to uploaded files (images, PDFs, etc.)
- ✅ Users can VIEW files

What stays private:
- 🔒 Your R2 credentials (access keys)
- 🔒 Write/delete permissions (only your API can upload/delete)
- 🔒 Your API authentication (JWT tokens still required to upload)

**Best practice:** Never upload sensitive documents without encryption.

---

## 📊 What This Fixes

### Before:
```
User uploads image
  ↓
Saved to R2 ✅
  ↓
Return URL: https://...?X-Amz-Signature=xxx&Expires=3600
  ↓
After 1 hour: URL expires → 404 ❌
```

### After:
```
User uploads image
  ↓
Saved to R2 ✅
  ↓
Return URL: https://pub-xxx.r2.dev/uploads/filename.png
  ↓
Forever: Works permanently ✅
```

---

## 🆘 Troubleshooting

### Can't Find Enable Button?

Try these steps:
1. **Refresh the page** - Sometimes Cloudflare UI is slow
2. **Check account verification** - Might need verified payment method
3. **Try different section** - Look under "Settings" → "Public Access"

### Public URL Already Enabled?

If you already see a public URL but didn't add it to Railway:
1. Just copy the URL
2. Add to Railway as `R2_PUBLIC_URL`
3. Done!

---

## 🎉 Summary

**What you need to do:**

1. ✅ Enable Public Development URL in Cloudflare R2 settings
2. ✅ Copy the public URL (`https://pub-xxx.r2.dev`)
3. ✅ Add `R2_PUBLIC_URL` variable to Railway
4. ✅ Wait for Railway to redeploy
5. ✅ Check logs for confirmation
6. ✅ Test upload - images now work forever!

**Time required:** 2 minutes  
**Result:** No more 404 errors, ever! 🚀
