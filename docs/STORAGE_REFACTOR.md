# Storage System Refactor Summary

## What Changed

The S3 storage layer has been modernized with improved code quality, better TypeScript practices, and clearer documentation.

### Improvements

#### 1. **Modern TypeScript**
- ✅ Proper use of `readonly` for immutable properties
- ✅ Better type annotations (strict mode ready)
- ✅ Proper generic typing with `ObjectMetadata` interface
- ✅ Const assertion patterns for client config
- ✅ Better error type guards with `isNoSuchKeyError` predicate

#### 2. **Better Error Handling**
- ✅ Type-safe error detection
- ✅ Detailed error logging with context
- ✅ Proper error messages for debugging
- ✅ Graceful fallback for MinIO presigning

#### 3. **Code Organization**
- ✅ Private methods for internal logic (`createS3Client`, `getSignUrlFromMinio`)
- ✅ Extracted magic numbers to constants (600 = default expiry)
- ✅ Clear separation of concerns
- ✅ Protected constructor for inheritance readiness

#### 4. **Documentation**
- ✅ JSDoc comments on all public methods
- ✅ Inline comments explaining workarounds
- ✅ Better config interface documentation
- ✅ Setup guide for team collaboration

#### 5. **New Initialization Module**
- ✅ Centralized environment configuration
- ✅ Singleton pattern for storage provider
- ✅ Config validation with clear error messages
- ✅ Easy to test (resetStorageProvider for testing)

---

## File Structure

```
src/lib/storage/
├── base.ts        # Abstract provider interface (updated with JSDoc)
├── s3.ts          # S3 implementation (fully refactored)
├── init.ts        # Storage initialization (NEW)
├── str.ts         # String utilities (improved error handling)
├── utils.ts       # Stream utilities (better documentation)
├── logger.ts      # Logger (stricter types)
└── index.ts       # Exports (updated with comments)
```

---

## How to Use

### For Developers

#### Option 1: Simple Upload (Recommended for Now)

```typescript
import { getStorageProvider } from '@/lib/storage/init';

export async function uploadFile(file: File): Promise<string> {
  const storage = getStorageProvider();
  const key = `uploads/${Date.now()}-${file.name}`;
  
  await storage.putObject(key, await file.arrayBuffer(), {
    contentType: file.type,
    meta: { originalName: file.name },
  });
  
  return await storage.getSignUrl(key);
}
```

#### Option 2: Check if File Exists

```typescript
const storage = getStorageProvider();
const exists = await storage.hasObject('path/to/file.txt');
```

#### Option 3: Get File with Metadata

```typescript
const storage = getStorageProvider();
const result = await storage.getObjectAndMeta('path/to/file.txt');
console.log(result.content);    // File content
console.log(result.meta);       // Custom metadata
console.log(result.contentType); // MIME type
```

### Configuration

Create `.env.local` with:

```bash
STORAGE_BUCKET=your-bucket-name
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_PATH_STYLE=false
STORAGE_PREFIX=socsboard
```

---

## API Reference

### `getStorageProvider(): StoreS3`

Get the global storage instance (creates on first call).

```typescript
const storage = getStorageProvider();
```

### `putObject(path, data, options?): Promise<void>`

Upload a file.

```typescript
await storage.putObject('files/document.pdf', pdfBuffer, {
  contentType: 'application/pdf',
  meta: {
    userId: '123',
    uploadedBy: 'user@example.com',
  },
});
```

### `getSignUrl(path, expiresIn?): Promise<string>`

Generate a temporary download URL (default 10 minutes).

```typescript
const url = await storage.getSignUrl('files/document.pdf', 3600); // 1 hour
window.location.href = url; // Download
```

### `hasObject(path): Promise<boolean>`

Check if a file exists.

```typescript
const exists = await storage.hasObject('files/document.pdf');
```

### `getObject(path, isCompressed?): Promise<string | undefined>`

Retrieve file content as string.

```typescript
const content = await storage.getObject('files/notes.md');
```

### `getObjectMeta(path): Promise<Record<string, string> | undefined>`

Get only metadata (faster than getting full content).

```typescript
const meta = await storage.getObjectMeta('files/document.pdf');
console.log(meta.userId); // Custom metadata
```

### `deleteObject(path): Promise<void>`

Delete a file.

```typescript
await storage.deleteObject('files/old-document.pdf');
```

### `copyObject(from, to, options): Promise<void>`

Copy a file (useful for backups or moving).

```typescript
await storage.copyObject(
  'files/original.pdf',
  'archive/original-backup.pdf',
  { meta: { archivedAt: new Date().toISOString() } }
);
```

---

## Backwards Compatibility

✅ **No breaking changes** - all existing APIs work the same way.

The refactor is entirely internal:
- Same method signatures
- Same return types
- Same error handling behavior
- Just better code quality and documentation

---

## Testing

### Unit Tests (Ready to Add)

```typescript
describe('S3 Storage', () => {
  let storage: StoreS3;

  beforeEach(() => {
    resetStorageProvider();
    storage = getStorageProvider();
  });

  it('should upload and retrieve files', async () => {
    await storage.putObject('test.txt', 'hello world');
    const content = await storage.getObject('test.txt');
    expect(content).toBe('hello world');
  });

  it('should generate signed URLs', async () => {
    const url = await storage.getSignUrl('test.txt');
    expect(url).toContain('X-Amz-Signature');
  });
});
```

---

## Performance Notes

- **Presigned URLs**: Generated on-demand, not stored (reduces DB calls)
- **Metadata**: Separate HEAD requests (can be optimized with caching)
- **MinIO workaround**: Uses MinioClient only for custom ports (most AWS S3 calls use SDK)
- **Compression**: Optional per-object (useful for text, not binary)

---

## Migration Path

Future enhancements are now easier to add:

1. **Database tracking** - Store file metadata in DB
2. **Sharing** - Use file_permissions table
3. **Versioning** - Leverage S3 versioning + version table
4. **Live collaboration** - Presigned URLs + WebSocket sync
5. **Multiple backends** - Add AzureBlob, GCS by extending `StoreProvider`

---

## Common Issues

### "Cannot find module '@/lib/storage/init'"

Make sure the file exists:
```bash
ls src/lib/storage/init.ts
```

If missing, the file wasn't created. Verify your file system.

### TypeError: getStorageProvider is not a function

Import should be:
```typescript
import { getStorageProvider } from '@/lib/storage/init';
// NOT from @/lib/storage (the index doesn't export it)
```

### "Environment variables are missing"

Check your `.env.local` file has `STORAGE_BUCKET` set.

---

**See [S3_SETUP.md](./S3_SETUP.md) for team setup instructions.**
