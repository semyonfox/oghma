#!/usr/bin/env node
/**
 * Comprehensive Marker diagnostic + pending_retry requeue script
 * 1. Diagnoses Marker 502 issue (EC2, ALB, health checks)
 * 2. Filters valid pending_retry items (note exists, extraction incomplete)
 * 3. Creates fresh canvas_import_job and requeues valid items
 * 4. Reports metrics
 */

import { createClient } from '@supabase/supabase-js';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { ELBv2Client, DescribeTargetHealthCommand, DescribeTargetGroupsCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { CloudWatchLogsClient, TailLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import axios from 'axios';
import 'dotenv/config';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.magenta}══ ${msg} ══${colors.reset}`),
  debug: (msg) => console.log(`${colors.cyan}◆${colors.reset} ${msg}`),
};

const supabase = createClient(
  process.env.DATABASE_URL.replace(/postgresql:\/\//, 'https://').split('/')[0],
  process.env.SUPABASE_ANON_KEY || 'fake-key'
);

const sqsClient = new SQSClient({ region: 'eu-west-1' });
const ec2Client = new EC2Client({ region: process.env.MARKER_ASG_REGION || 'eu-west-1' });
const elbv2Client = new ELBv2Client({ region: process.env.MARKER_ASG_REGION || 'eu-west-1' });
const logsClient = new CloudWatchLogsClient({ region: process.env.MARKER_ASG_REGION || 'eu-west-1' });

// ============================================================================
// 1. MARKER DIAGNOSTICS
// ============================================================================

async function diagnoseMarker() {
  log.section('MARKER DIAGNOSTICS');

  const markerUrl = process.env.MARKER_API_URL;
  if (!markerUrl) {
    log.warn('MARKER_API_URL not set');
    return null;
  }

  log.info(`Testing Marker endpoint: ${markerUrl}`);

  try {
    const response = await axios.get(`${markerUrl}/`, { timeout: 5000 });
    log.success(`Marker / endpoint returned ${response.status}`);
    return { healthy: true, status: response.status };
  } catch (error) {
    if (error.response?.status === 502) {
      log.error(`Marker / endpoint returned 502 (Bad Gateway)`);
      return { healthy: false, status: 502, error: 'Bad Gateway' };
    } else if (error.code === 'ECONNREFUSED') {
      log.error(`Marker endpoint connection refused`);
      return { healthy: false, status: 'ECONNREFUSED', error: 'Connection Refused' };
    } else if (error.code === 'ENOTFOUND') {
      log.error(`Marker endpoint DNS resolution failed`);
      return { healthy: false, status: 'ENOTFOUND', error: 'DNS Failed' };
    } else {
      log.error(`Marker endpoint error: ${error.message}`);
      return { healthy: false, status: error.code, error: error.message };
    }
  }
}

async function checkEC2Status() {
  log.section('EC2 INSTANCE STATUS');

  const asgName = process.env.MARKER_ASG_NAME;
  if (!asgName) {
    log.warn('MARKER_ASG_NAME not set, skipping EC2 check');
    return null;
  }

  try {
    const command = new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:aws:autoscaling:groupName', Values: [asgName] },
        { Name: 'instance-state-name', Values: ['running', 'pending', 'stopping', 'stopped'] },
      ],
    });
    const response = await ec2Client.send(command);

    if (response.Reservations.length === 0) {
      log.warn(`No EC2 instances found in ASG: ${asgName}`);
      return null;
    }

    const instances = response.Reservations.flatMap((r) => r.Instances);
    log.info(`Found ${instances.length} EC2 instance(s)`);

    instances.forEach((instance) => {
      log.debug(
        `Instance ${instance.InstanceId}: State=${instance.State.Name}, ` +
        `InstanceStatus=${instance.InstanceStatus?.Status || 'N/A'}, ` +
        `SystemStatus=${instance.SystemStatus?.Status || 'N/A'}`
      );
    });

    return instances;
  } catch (error) {
    log.error(`Failed to query EC2: ${error.message}`);
    return null;
  }
}

async function checkALBHealth() {
  log.section('ALB TARGET HEALTH');

  const asgName = process.env.MARKER_ASG_NAME;
  if (!asgName) {
    log.warn('MARKER_ASG_NAME not set, skipping ALB check');
    return null;
  }

  try {
    const tgCommand = new DescribeTargetGroupsCommand({
      Names: [`marker-tg-${asgName.replace('marker-asg-', '')}`],
    });
    const tgResponse = await elbv2Client.send(tgCommand);

    if (tgResponse.TargetGroups.length === 0) {
      log.warn(`No target group found for ${asgName}`);
      return null;
    }

    const targetGroupArn = tgResponse.TargetGroups[0].TargetGroupArn;
    log.info(`Target Group ARN: ${targetGroupArn}`);

    const healthCommand = new DescribeTargetHealthCommand({ TargetGroupArn: targetGroupArn });
    const healthResponse = await elbv2Client.send(healthCommand);

    healthResponse.TargetHealthDescriptions.forEach((target) => {
      const state = target.TargetHealth.State;
      const reason = target.TargetHealth.Reason || 'N/A';
      const color = state === 'healthy' ? colors.green : colors.red;
      log.debug(`${color}Target ${target.Target.Id}: ${state} (${reason})${colors.reset}`);
    });

    return healthResponse.TargetHealthDescriptions;
  } catch (error) {
    log.warn(`Failed to query ALB: ${error.message}`);
    return null;
  }
}

// ============================================================================
// 2. DATABASE FILTERING - IDENTIFY VALID PENDING_RETRY ITEMS
// ============================================================================

async function filterValidPendingRetries() {
  log.section('FILTERING PENDING_RETRY ITEMS');

  try {
    // Load all pending_retry items with related data
    const result = await fetch(
      `${process.env.DATABASE_URL.split('?')[0].replace('postgresql://', 'http://localhost:3000/api/db/')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            SELECT 
              ci.id, 
              ci.note_id, 
              ci.filename, 
              ci.attempt_number,
              ci.error_message,
              n.deleted,
              (SELECT COUNT(*) FROM app.chunks WHERE document_id = ci.note_id) AS chunks_for_note,
              (SELECT COUNT(*) FROM app.embeddings e 
               JOIN app.chunks c ON c.id = e.chunk_id 
               WHERE c.document_id = ci.note_id) AS embeddings_for_note
            FROM app.canvas_imports ci
            LEFT JOIN app.notes n ON n.note_id = ci.note_id
            WHERE ci.status = 'pending_retry'
            ORDER BY ci.updated_at DESC
          `,
        }),
      }
    );

    // Fallback: use direct psql if available
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(
        `psql "${process.env.DATABASE_URL}" -t -A -F, -c "
          SELECT 
            ci.id, 
            ci.note_id, 
            ci.filename, 
            ci.attempt_number,
            ci.error_message,
            COALESCE(n.deleted, false) as deleted,
            (SELECT COUNT(*) FROM app.chunks WHERE document_id = ci.note_id) AS chunks_for_note,
            (SELECT COUNT(*) FROM app.embeddings e 
             JOIN app.chunks c ON c.id = e.chunk_id 
             WHERE c.document_id = ci.note_id) AS embeddings_for_note
          FROM app.canvas_imports ci
          LEFT JOIN app.notes n ON n.note_id = ci.note_id
          WHERE ci.status = 'pending_retry'
          ORDER BY ci.updated_at DESC;
        "`
      );

      const items = stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [id, note_id, filename, attempt_number, error_message, deleted, chunks_for_note, embeddings_for_note] = line.split(',');
          return {
            id: parseInt(id),
            note_id,
            filename,
            attempt_number: parseInt(attempt_number),
            error_message: error_message || 'N/A',
            deleted: deleted === 'true',
            chunks_for_note: parseInt(chunks_for_note),
            embeddings_for_note: parseInt(embeddings_for_note),
          };
        });

      log.success(`Loaded ${items.length} pending_retry items`);

      // Filter valid items
      const valid = items.filter((item) => !item.deleted && item.embeddings_for_note < item.chunks_for_note);
      const invalid = items.filter((item) => item.deleted || item.embeddings_for_note >= item.chunks_for_note);

      log.success(`Valid for requeue: ${valid.length}`);
      log.warn(`Invalid (skip): ${invalid.length}`);

      if (invalid.length > 0) {
        log.debug(`\nInvalid items breakdown:`);
        const deleted = invalid.filter((i) => i.deleted);
        const complete = invalid.filter((i) => !i.deleted && i.embeddings_for_note >= i.chunks_for_note);
        log.debug(`  - Note deleted: ${deleted.length}`);
        log.debug(`  - Extraction already complete: ${complete.length}`);
      }

      return { valid, invalid };
    } catch (error) {
      log.error(`Database query failed: ${error.message}`);
      throw error;
    }
  } catch (error) {
    log.error(`Failed to filter pending_retry items: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// 3. CREATE FRESH JOB + REQUEUE
// ============================================================================

async function createFreshJobAndRequeue(validItems) {
  log.section('CREATING FRESH JOB + REQUEUING');

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // 1. Insert fresh canvas_import_job
    const { stdout: jobResult } = await execAsync(
      `psql "${process.env.DATABASE_URL}" -t -A -c "
        INSERT INTO app.canvas_import_jobs (status, created_at, updated_at)
        VALUES ('queued', NOW(), NOW())
        RETURNING id;
      "`
    );

    const newJobId = parseInt(jobResult.trim());
    log.success(`Created fresh canvas_import_job: ${newJobId}`);

    // 2. Prepare SQS messages
    const queueUrl = process.env.SQS_QUEUE_URL;
    if (!queueUrl) {
      log.error('SQS_QUEUE_URL not set');
      throw new Error('Missing SQS_QUEUE_URL');
    }

    const entries = validItems.map((item, idx) => ({
      Id: `${idx}`,
      MessageBody: JSON.stringify({
        job_id: newJobId,
        note_id: item.note_id,
        filename: item.filename,
        import_id: item.id,
        attempt_number: 1, // Reset attempt counter
        retry: true,
      }),
      DelaySeconds: 0,
    }));

    // 3. Send in batches (SQS max 10 per request)
    let sent = 0;
    for (let i = 0; i < entries.length; i += 10) {
      const batch = entries.slice(i, i + 10);
      try {
        await sqsClient.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: batch }));
        sent += batch.length;
        log.debug(`Sent batch of ${batch.length} to SQS (total: ${sent})`);
      } catch (error) {
        log.error(`Failed to send SQS batch: ${error.message}`);
        throw error;
      }
    }

    log.success(`Queued ${sent}/${validItems.length} items to SQS`);

    // 4. Update canvas_imports to assign to new job
    const itemIds = validItems.map((i) => i.id).join(',');
    await execAsync(
      `psql "${process.env.DATABASE_URL}" -c "
        UPDATE app.canvas_imports 
        SET job_id = ${newJobId}, status = 'queued', attempt_number = 1, updated_at = NOW()
        WHERE id IN (${itemIds});
      "`
    );

    log.success(`Updated canvas_imports records: assigned to job ${newJobId}`);

    return { newJobId, queued: sent };
  } catch (error) {
    log.error(`Failed to create job and requeue: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// 4. FINAL REPORT
// ============================================================================

async function generateReport(markerStatus, validItems, invalidItems, queueResult) {
  log.section('FINAL REPORT');

  log.info(`\nMarker Status:`);
  if (markerStatus?.healthy) {
    log.success(`  ✓ Marker API is healthy (HTTP ${markerStatus.status})`);
  } else {
    log.error(`  ✗ Marker API is unhealthy: ${markerStatus?.error || 'Unknown'}`);
  }

  log.info(`\nPending Retry Analysis:`);
  log.info(`  Total pending_retry items: ${validItems.length + invalidItems.length}`);
  log.success(`  Valid (requeued): ${validItems.length}`);
  log.warn(`  Invalid (skipped): ${invalidItems.length}`);

  if (queueResult) {
    log.info(`\nRequeue Result:`);
    log.success(`  New job ID: ${queueResult.newJobId}`);
    log.success(`  Messages sent to SQS: ${queueResult.queued}`);
    log.info(`  Monitor SQS queue depth and check extraction logs`);
  }

  log.info(`\nNext Steps:`);
  if (!markerStatus?.healthy) {
    log.warn(`  1. Investigate Marker 502 error:
    - Check EC2 instance logs: CloudWatch Logs group for Marker app
    - Check ALB target health: Are instances in 'healthy' state?
    - Manually restart Marker if needed
    - Once fixed, retries will begin draining SQS queue
  `);
  } else {
    log.success(`  1. Marker is healthy, requeue complete`);
    log.info(`  2. Monitor SQS queue: messages should drain as extraction proceeds`);
    log.info(`  3. Check embeddings: verify chunks receive embeddings`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    log.section('RAG PIPELINE DIAGNOSTIC & REQUEUE');
    log.info('Starting comprehensive Marker diagnostics and pending_retry requeue...\n');

    // 1. Diagnose Marker
    const markerStatus = await diagnoseMarker();
    await checkEC2Status();
    await checkALBHealth();

    // 2. Filter valid pending_retry items
    const { valid: validItems, invalid: invalidItems } = await filterValidPendingRetries();

    // 3. Create fresh job and requeue
    let queueResult = null;
    if (validItems.length > 0) {
      queueResult = await createFreshJobAndRequeue(validItems);
    } else {
      log.warn('No valid items to requeue');
    }

    // 4. Report
    await generateReport(markerStatus, validItems, invalidItems, queueResult);

    log.success('\n✓ Diagnostic and requeue complete!');
    process.exit(0);
  } catch (error) {
    log.error(`\nFatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
