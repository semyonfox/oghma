# S3 Integration Guide

Complete documentation for SocsBoard AWS S3 file storage integration.

## Overview

SocsBoard now supports uploading and retrieving files directly to AWS S3. Files are stored with a consistent path structure (`notes/{noteId}/{fileName}`) and can be accessed via signed URLs.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Frontend (React Component)                      │
│ - /test-upload (test UI)                        │
│ - Editor (image uploads)                        │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ API Endpoints                                   │
│ - POST   /api/upload     (upload file)          │
│ - GET    /api/upload     (retrieve file)        │
│ - DELETE /api/upload     (not yet implemented)  │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ Storage Layer (/src/lib/storage/)               │
│ - StoreS3 (S3 provider)                         │
│ - Storage abstraction (putObject, getObject)    │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ AWS S3 Bucket                                   │
│ - our-chum-bucket                               │
│ - Region: eu-north-1                            │
└─────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Environment Configuration (`.env`)

Add the following S3 configuration to your `.env` file:

```bash
# AWS S3 Storage Configuration
STORAGE_BUCKET=<redacted>STORAGE_ACCESS_KEY=<redacted>STORAGE_SECRET_KEY=<redacted>STORAGE_REGION=<redacted>STORAGE_ENDPOINT=<redacted>STORAGE_PATH_STYLE=<redacted>STORAGE_PREFIX=<redacted>MAX_FILE_SIZE=104857600
ALLOWED_FILE_TYPES=md,pdf,jpg,jpeg,png,gif,zip,docx,doc,txt
PRESIGNED_URL_EXPIRY=86400
```

**Required variables:**
- `STORAGE_BUCKET` - S3 bucket name (required, will error if missing)
- `STORAGE_ACCESS_KEY` - AWS Access Key ID
- `STORAGE_SECRET_KEY` - AWS Secret Access Key

**Optional variables:**
- `STORAGE_REGION` - AWS region (default: `us-east-1`)
- `STORAGE_ENDPOINT` - Custom S3 endpoint URL (use AWS default if not specified)
- `STORAGE_PATH_STYLE` - Use path-style URLs instead of virtual-hosted (default: `false`)
- `STORAGE_PREFIX` - Path prefix for all objects (default: `oghma`)

### 2. AWS S3 Bucket Setup

1. **Create S3 Bucket** (or use existing)
   - Bucket name: `our-chum-bucket`
   - Region: `eu-north-1`
   - Block public access: ON (recommended)

2. **Create IAM User** with S3 permissions
   - Create programmatic access credentials
   - Attach policy: `AmazonS3FullAccess` (or custom policy for specific bucket)
   - Copy Access Key ID and Secret Access Key
   - Store in `.env` as `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`

3. **Test Connection**
   ```bash
   node test-s3.js  # runs S3 connection test
   ```

### 3. Start Development Server

```bash
npm run dev
```

Server will start at `http://localhost:3000`

## API Endpoints

### POST `/api/upload` - Upload File

Upload a file to S3.

**Request:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/file.txt" \
  -F "noteId=my-note-123"
```

**Form Parameters:**
- `file` (required) - File to upload
- `noteId` (optional) - Note ID for organization (default: `test`)

**Response:**
```json
{
  "success": true,
  "fileName": "file.txt",
  "path": "notes/my-note-123/file.txt",
  "url": "https://our-chum-bucket.s3.eu-north-1.amazonaws.com/oghma/notes/my-note-123/file.txt?X-Amz-Algorithm=...",
  "size": 1024,
  "type": "text/plain"
}
```

**Response Fields:**
- `path` - Storage path in S3
- `url` - Signed URL (valid for 1 hour, configurable)
- `size` - File size in bytes
- `type` - MIME type

### GET `/api/upload?path=...` - Retrieve File

Retrieve file content from S3.

**Request:**
```bash
curl "http://localhost:3000/api/upload?path=notes/my-note-123/file.txt"
```

**Query Parameters:**
- `path` (required) - Full storage path to file

**Response:**
```json
{
  "success": true,
  "path": "notes/my-note-123/file.txt",
  "content": "file contents here",
  "size": 1024
}
```

## Testing

### Using Test UI

1. **Open browser**: `http://localhost:3000/test-upload`
2. **Choose a file** and click "Upload to S3"
3. **Verify**:
   - See file metadata in response
   - Click "Download" link to verify signed URL works
   - Click "Test Retrieve" to fetch content back

### Using curl

**Upload:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test-file.txt" \
  -F "noteId=test-123"
```

**Retrieve:**
```bash
curl "http://localhost:3000/api/upload?path=notes/test-123/test-file.txt"
```

### Verify in AWS Console

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com)
2. Open bucket: `our-chum-bucket`
3. Navigate to: `oghma/notes/`
4. Find your uploaded files

## Storage Path Structure

All files are stored under the following hierarchy:

```
s3://our-chum-bucket/
└── oghma/                    (STORAGE_PREFIX)
    └── notes/
        └── {noteId}/
            ├── file1.txt
            ├── file2.pdf
            └── image.png
```

**Path Format:** `notes/{noteId}/{fileName}`

- `noteId`: Unique identifier for the note (provided during upload)
- `fileName`: Original file name (preserved from upload)

## Signed URLs

Signed URLs provide temporary access to files without requiring AWS credentials.

**Features:**
- Valid for configurable duration (default: 1 hour)
- Can be shared with others for temporary access
- Automatically generated on upload
- Re-generated on retrieve

**Configuration:**
```env
PRESIGNED_URL_EXPIRY=86400  # 24 hours in seconds
```

## Implementation Details

### Storage Layer (`/src/lib/storage/`)

The storage layer provides an abstraction over S3:

```typescript
const storage = getStorageProvider();

// Upload
await storage.putObject(path, buffer);

// Retrieve
const content = await storage.getObject(path);

// Generate signed URL
const url = await storage.getSignUrl(path, expirySeconds);

// Check existence
const exists = await storage.hasObject(path);

// Delete
await storage.deleteObject(path);
```

### API Route (`/src/app/api/upload/route.ts`)

Handles HTTP requests and delegates to storage layer:

```typescript
export async function POST(request: NextRequest) {
  // 1. Parse multipart form data
  // 2. Validate file
  // 3. Upload to S3 via storage layer
  // 4. Generate signed URL
  // 5. Return metadata
}

export async function GET(request: NextRequest) {
  // 1. Get path from query param
  // 2. Retrieve from S3 via storage layer
  // 3. Return content
}
```

## Common Issues

### "No such bucket" error
- Verify `STORAGE_BUCKET` value matches actual S3 bucket name
- Check bucket exists in AWS console
- Verify credentials have access to bucket

### "Access Denied" error
- Check AWS credentials in `.env`
- Verify IAM user has S3 permissions
- Rotate credentials if expired

### Signed URL not working
- Check URL expiry hasn't passed (default: 1 hour)
- Verify bucket is not blocking public access
- Check AWS credentials in URL are still valid

### File not appearing in AWS
- Verify upload response shows `success: true`
- Check S3 console in correct region (`eu-north-1`)
- Look in correct path: `oghma/notes/{noteId}/`

## Advanced Configuration

### Custom S3-Compatible Service (MinIO)

To use MinIO or other S3-compatible services:

```env
STORAGE_ENDPOINT=<redacted>STORAGE_PATH_STYLE=<redacted>STORAGE_ACCESS_KEY=<redacted>STORAGE_SECRET_KEY=<redacted>```

### File Size Limits

```env
MAX_FILE_SIZE=104857600  # 100MB in bytes
```

### Allowed File Types

```env
ALLOWED_FILE_TYPES=md,pdf,jpg,jpeg,png,gif,zip,docx,doc,txt
```

(Currently not enforced in API - can be added if needed)

## Next Steps

### Integrate with Editor

The editor already supports image uploads. To enable:

```typescript
// In your editor component
const onUploadImage = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('noteId', currentNoteId);
  
  const res = await fetch('/api/upload', { 
    method: 'POST', 
    body: formData 
  });
  const data = await res.json();
  return data.url;  // Use signed URL for image src
};
```

### Add Delete Endpoint

```typescript
export async function DELETE(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');
  const storage = getStorageProvider();
  await storage.deleteObject(path);
  return NextResponse.json({ success: true });
}
```

### Add Bulk Import/Export

- Create `/api/import` endpoint to extract and restore zip files
- Create `/api/export` endpoint to zip all notes and download

### Setup Redis Cache (ElastiCache)

Configure ElastiCache Redis in `.env`:

```env
REDIS_HOST=<redacted>REDIS_PORT=<redacted>REDIS_PASSWORD=<redacted>```

### Database Migration

Update `.env` with RDS endpoint:

```env
DATABASE_URL=<redacted>```

## Troubleshooting

### Server not running

```bash
npm run dev
```

Check logs in `/tmp/oghma.log`:

tail -f /tmp/oghma.log
```

### Clear and restart

```bash
# Kill existing server
kill $(cat /tmp/oghma.pid)

rm /tmp/oghma.log

# Restart
npm run dev
```

### Test endpoint directly

```bash
# Check server is running
curl http://localhost:3000/

# Test upload
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test.txt"
```

## File Locations

- **Environment config:** `.env`
- **Storage layer:** `src/lib/storage/`
- **Upload API:** `src/app/api/upload/route.ts`
- **Test UI:** `src/app/test-upload/page.tsx`
- **Documentation:** `S3_INTEGRATION.md` (this file)

## References

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)
- [Signed URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
