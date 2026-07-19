import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const accessKeyId = process.env.STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.STORAGE_SECRET_KEY;
const endpoints = [
  'https://17370d8c421910cc2b3ca5469265e37d.eu.r2.cloudflarestorage.com',
  'https://17370d8c421910cc2b3ca5469265e37d.r2.cloudflarestorage.com',
];

for (const endpoint of endpoints) {
  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: 'oghma-notes', MaxKeys: 1 }));
    const headed = await s3.send(new HeadObjectCommand({
      Bucket: 'oghma-notes',
      Key: 'oghma-dev/settings/15f8d645-25b6-4d69-adb9-32b4bc02c88f/settings.json',
    }));
    console.log(JSON.stringify({ endpoint, ok: true, keyCount: listed.KeyCount, sampleSize: headed.ContentLength }));
  } catch (error) {
    console.log(JSON.stringify({ endpoint, ok: false, error: error.name, message: String(error.message).slice(0, 160) }));
  }
}
