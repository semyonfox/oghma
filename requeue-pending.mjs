import { createClient } from '@supabase/supabase-js';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sqsUrl = process.env.SQS_QUEUE_URL;
const awsRegion = 'eu-north-1';

const supabase = createClient(supabaseUrl, supabaseKey);
const sqs = new SQSClient({ region: awsRegion });

async function requeue() {
  console.log('Fetching pending_retry canvas imports...');
  
  const { data: items, error } = await supabase
    .from('canvas_imports')
    .select('id, note_id, filename, extraction_status')
    .eq('status', 'pending_retry')
    .limit(1000);
  
  if (error) {
    console.error('Query error:', error);
    process.exit(1);
  }
  
  console.log(`Found ${items?.length || 0} pending_retry items`);
  
  if (!items || items.length === 0) {
    console.log('No items to requeue');
    process.exit(0);
  }
  
  let requeued = 0;
  for (const item of items) {
    try {
      const message = {
        canvasImportId: item.id,
        noteId: item.note_id,
        filename: item.filename
      };
      
      await sqs.send(new SendMessageCommand({
        QueueUrl: sqsUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: `retry-${item.id}`
      }));
      
      requeued++;
    } catch (err) {
      console.error(`Failed to requeue ${item.id}:`, err.message);
    }
  }
  
  console.log(`✓ Requeued ${requeued}/${items.length} items to SQS`);
}

requeue().catch(err => {
  console.error(err);
  process.exit(1);
});
