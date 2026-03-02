import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.STORAGE_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.STORAGE_SECRET_KEY,
  },
});

async function testS3Connection() {
  try {
    console.log('Testing S3 connection...');
    
    // Test bucket access
    const headBucketCommand = new HeadBucketCommand({
      Bucket: process.env.STORAGE_BUCKET,
    });
    await s3Client.send(headBucketCommand);
    console.log('✅ Bucket connection successful');
    
    // List objects in the bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.STORAGE_BUCKET,
      Prefix: 'notes/',
      MaxKeys: 20,
    });
    const listResult = await s3Client.send(listCommand);
    
    console.log('\n📁 Objects in notes/ prefix:');
    if (listResult.Contents && listResult.Contents.length > 0) {
      listResult.Contents.forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
      });
    } else {
      console.log('  (none found)');
    }
    
    // List tree objects
    const treeCommand = new ListObjectsV2Command({
      Bucket: process.env.STORAGE_BUCKET,
      Prefix: 'tree/',
      MaxKeys: 20,
    });
    const treeResult = await s3Client.send(treeCommand);
    
    console.log('\n📁 Objects in tree/ prefix:');
    if (treeResult.Contents && treeResult.Contents.length > 0) {
      treeResult.Contents.forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
      });
    } else {
      console.log('  (none found)');
    }
    
  } catch (error) {
    console.error('❌ S3 Connection Failed:', error.message);
    process.exit(1);
  }
}

testS3Connection();
