# S3 Bucket Setup Guide

This guide explains how to connect the app to your AWS S3 bucket as a team.

## Quick Start (For Team Members)

### 1. Get Credentials from Your Friend

Ask whoever created the S3 bucket to share:
- **STORAGE_BUCKET** - The bucket name
- **STORAGE_ACCESS_KEY** - IAM user access key ID
- **STORAGE_SECRET_KEY** - IAM user secret access key
- **STORAGE_REGION** - AWS region (e.g., `us-east-1`)

### 2. Create Your Local `.env.local`

```bash
# Copy the template
cp .env.example .env.local

# Edit with your credentials
nano .env.local  # or use your editor
```

### 3. Add These to `.env.local`

Replace with the values from Step 1:

```bash
# S3 Storage Configuration
STORAGE_BUCKET=<redacted>STORAGE_ACCESS_KEY=<redacted>STORAGE_SECRET_KEY=<redacted>STORAGE_REGION=<redacted>STORAGE_ENDPOINT=<redacted>STORAGE_PATH_STYLE=<redacted>STORAGE_PREFIX=<redacted>```

### 4. Test the Connection

```bash
npm run dev
```

Visit http://localhost:3000 and try uploading a file.

---

## For Bucket Owner (Your Friend)

### Create IAM User for App Access

1. **AWS Console** → IAM → Users → "Create user"
2. Name: `socsboard-app-user`
3. Skip "Add user to group"
4. Click "Create user"

### Generate Access Keys

1. Click the new user in the list
2. Security credentials tab → "Create access key"
3. Select "Application running outside AWS"
4. Copy and share with team:
   - **Access Key ID** → STORAGE_ACCESS_KEY
   - **Secret Access Key** → STORAGE_SECRET_KEY

### Create S3 Bucket

1. **S3 Console** → "Create bucket"
2. Name: `your-bucket-name` (or your preference)
3. Region: Pick one close to your deployment (us-east-1 is common)
4. Block public access: **YES** (keep private)
5. Versioning: **Enable** (for future version control)
6. Encryption: **Enable** (AES-256)
7. Create bucket

### Set Up Bucket Policy

1. Go to bucket → Permissions → Bucket policy
2. Click "Edit"
3. Paste this policy (replace `your-bucket-name` and `ACCOUNT_ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:user/socsboard-app-user"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

To find your **ACCOUNT_ID**:
- AWS Console → (click account name, top-right) → My AWS Account
- Copy the 12-digit number

### Set Up CORS (Browser Access)

1. Bucket → Permissions → CORS
2. Edit and add:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-domain.com"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## Team Security Best Practices

### Do NOT:
- ❌ Commit `.env.local` to Git
- ❌ Share secrets in Slack/email unencrypted
- ❌ Use AWS root account credentials
- ❌ Commit to `.env` (use `.env.local` only)

### Do:
- ✅ Use `.gitignore` to exclude `.env.local`
- ✅ Share credentials via secure channels (encrypted, 1-on-1)
- ✅ Use IAM users with minimal permissions
- ✅ Rotate access keys every 90 days
- ✅ Create separate IAM users for dev/prod if possible

### Git Safety Check

Verify your `.env.local` is ignored:

```bash
git status
# Should NOT show .env.local
```

If you see it listed, run:
```bash
git rm --cached .env.local
# Then commit
git commit -m "Remove .env.local from tracking"
```

---

## Troubleshooting

### "Missing STORAGE_BUCKET" Error

Add `STORAGE_BUCKET=your-bucket-name` to `.env.local`

### "Access Denied" When Uploading

Check:
1. IAM user has `s3:PutObject` permission
2. Bucket policy includes the user's ARN
3. Credentials are correct

### CORS Errors in Browser

Add `http://localhost:3000` (or your domain) to bucket CORS allowed origins

### Connection Timeout

Verify:
1. Your internet connection works
2. AWS credentials are valid
3. Bucket exists in the specified region

---

## Production Deployment

When deploying to production:

1. **Create production credentials**: New IAM user specifically for production
2. **Use AWS Secrets Manager** (recommended):
   - Store credentials securely
   - No hardcoding in deployment config
3. **Environment variables**: Set via deployment platform (Amplify, Lambda environment variables, etc.)
4. **CORS**: Add your production domain:

```json
{
  "AllowedOrigins": [
    "https://your-domain.com"
  ],
  ...
}
```

---

## Testing S3 Connection

To verify everything works:

```bash
# Start dev server
npm run dev

# Try uploading a file via the UI
# If it works, you're good!
```

Or test programmatically:

```typescript
import { getStorageProvider } from '@/lib/storage/init';

const store = getStorageProvider();
const exists = await store.hasObject('test.txt');
console.log('Connection working:', exists !== undefined);
```

---

**Questions?** Check the error message in the browser console or server logs.
