# Railway Upload/Image Fix - Deployment Guide

## Problem
Images uploaded in production return 404 errors:
```
GET https://collabstudyweb-production.up.railway.app/uploads/[uuid].png 404 (Not Found)
```

## Root Cause
The upload controller was defaulting to `http://localhost:4000` when generating file URLs because the `API_URL` environment variable was not set in Railway.

## Solution Applied

### Code Changes
1. **Updated `apps/api/src/upload/upload.controller.ts`**:
   - Fixed URL construction to use `API_URL` environment variable
   - Added fallback to use the PORT environment variable
   - Added detailed comments

2. **Updated `apps/api/.env.example`**:
   - Added `API_URL` variable with documentation
   - Default value: `http://localhost:4000`

### Static File Serving (Already Configured ✅)
The `ServeStaticModule` is already configured in `apps/api/src/app.module.ts`:
```typescript
ServeStaticModule.forRoot({
  rootPath: join(process.cwd(), 'uploads'),
  serveRoot: '/uploads',
})
```
This serves files from the `uploads/` directory at the `/uploads` route.

## Railway Deployment Steps

### Option 1: Quick Fix (Local Storage - Files Lost on Redeploy)

**⚠️ WARNING: Railway uses ephemeral storage. Files will be DELETED on every redeploy!**

1. Go to Railway Dashboard → Your API Service
2. Click "Variables" tab
3. Add this variable:
   ```
   API_URL=https://[your-api-service].railway.app
   ```
   Replace `[your-api-service]` with your actual Railway API domain.
   
4. Click "Redeploy" to apply changes

### Option 2: Production Solution (Cloudflare R2 - Permanent Storage)

**✅ RECOMMENDED: Files persist across deployments**

Cloudflare R2 offers 10GB free storage with no egress fees and is S3-compatible.

#### Setup Cloudflare R2:

1. **Create R2 Bucket**:
   - Go to https://dash.cloudflare.com
   - Select "R2" from sidebar
   - Click "Create bucket"
   - Name it (e.g., `collabstudy-uploads`)

2. **Get API Credentials**:
   - In R2 dashboard, click "Manage R2 API Tokens"
   - Click "Create API Token"
   - Permissions: "Object Read & Write"
   - Copy the Access Key ID and Secret Access Key

3. **Add to Railway Variables**:
   ```
   AWS_ACCESS_KEY_ID=your_r2_access_key_id
   AWS_SECRET_ACCESS_KEY=your_r2_secret_access_key
   AWS_S3_BUCKET_NAME=collabstudy-uploads
   AWS_S3_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
   S3_REGION=auto
   ```
   
   The endpoint URL format is shown in your R2 dashboard under "Bucket details".

4. **Optional - Make Bucket Public**:
   - In R2 bucket settings → "Settings" → "Public Access"
   - Click "Allow Access"
   - Copy the public bucket URL
   - This allows direct image access without pre-signed URLs

5. **Redeploy Railway Service**

#### How It Works:
- When S3 credentials are set, the upload service automatically uses R2
- Files are stored permanently in your R2 bucket
- URLs are generated as pre-signed URLs (1 hour expiry by default)
- No files are stored on Railway's ephemeral filesystem

### Option 3: Railway Volume (Persistent Local Storage)

If you prefer to keep files on Railway but need persistence:

1. In Railway Dashboard → Your API Service
2. Click "Volumes" tab
3. Click "Add Volume"
4. Mount path: `/app/uploads`
5. Size: 1GB (adjust as needed)
6. Add the `API_URL` variable as in Option 1
7. Redeploy

**Note**: Volumes are slower than R2 and have size limits. R2 is recommended for production.

## Testing

### After deploying, test file uploads:

1. Upload an image in your chat
2. Check the network tab - the returned URL should be:
   - **Option 1**: `https://[your-api-domain].railway.app/uploads/[uuid].png`
   - **Option 2**: `https://[account-id].r2.cloudflarestorage.com/[bucket]/uploads/[uuid].png` (or pre-signed URL)
3. Verify the image loads without 404 errors

### Verify in Railway Logs:

```bash
# Look for this log on startup:
S3 storage enabled → bucket: "your-bucket" region: "auto" endpoint: "https://..."

# OR (if using local storage):
S3 credentials not configured — falling back to local disk storage.
```

## Migration from Local to R2

If you already have files in local storage and switch to R2:

1. Old files remain on the ephemeral filesystem until next deploy (then lost)
2. New uploads go to R2
3. No automatic migration - old image URLs will break after redeploy
4. Users will need to re-upload images

## Summary

| Option | Persistence | Speed | Cost | Complexity |
|--------|-------------|-------|------|------------|
| Local (API_URL only) | ❌ Lost on redeploy | Fast | Free | Easy |
| Railway Volume | ✅ Persistent | Medium | ~$0.25/GB/mo | Easy |
| Cloudflare R2 | ✅ Persistent | Fast (CDN) | 10GB free | Medium |

**Recommendation**: Use Cloudflare R2 (Option 2) for production deployments.
