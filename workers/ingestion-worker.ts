/**
 * Ingestion worker — runs on EC2, not inside Next.js
 *
 * Start with:
 *   npx ts-node --project tsconfig.worker.json workers/ingestion-worker.ts
 * or compile and run:
 *   node dist/workers/ingestion-worker.js
 *
 * The worker polls app.ingestion_jobs, processes one job at a time,
 * and updates status. FOR UPDATE SKIP LOCKED ensures safe parallel
 * workers if you ever need to scale horizontally.
 */

import sql from "../src/database/pgsql.js";
import { runExtraction } from "@/app/api/extract/route";
import logger from "../src/lib/logger";

const POLL_INTERVAL_MS = 2_000;   // how often to check for new jobs when idle
const MAX_RETRIES = 3;             // how many times to retry a failed job

async function claimNextJob() {
    // atomically claim one pending job — SKIP LOCKED means parallel workers
    // won't fight over the same row
    const [job] = await sql`
        UPDATE app.ingestion_jobs
        SET status     = 'processing',
            updated_at = NOW()
        WHERE id = (
            SELECT id
            FROM app.ingestion_jobs
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, note_id, user_id, s3_key, mime_type
    `;
    return job ?? null;
}

async function processJob(job: {
    id: string;
    note_id: string;
    user_id: string;
    s3_key: string;
    mime_type: string;
}) {
    logger.info("ingestion-worker: processing job", {
        jobId: job.id,
        noteId: job.note_id,
    });

    const { chunksStored } = await runExtraction(
        job.note_id,
        job.user_id,
        job.s3_key,
        job.mime_type,
    );

    await sql`
        UPDATE app.ingestion_jobs
        SET status        = 'done',
            chunks_stored = ${chunksStored},
            updated_at    = NOW()
        WHERE id = ${job.id}
    `;

    logger.info("ingestion-worker: job complete", {
        jobId: job.id,
        chunksStored,
    });
}

async function failJob(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("ingestion-worker: job failed", { jobId, error: message });

    await sql`
        UPDATE app.ingestion_jobs
        SET status     = 'failed',
            error      = ${message},
            updated_at = NOW()
        WHERE id = ${jobId}
    `.catch(() => {}); // don't throw if DB is also broken
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
    logger.info("ingestion-worker: started");

    while (true) {
        try {
            const job = await claimNextJob();

            if (!job) {
                // nothing to do — wait before polling again
                await sleep(POLL_INTERVAL_MS);
                continue;
            }

            try {
                await processJob(job);
            } catch (err) {
                await failJob(job.id, err);
            }
        } catch (err) {
            // DB connection error or similar — log and keep polling
            logger.error("ingestion-worker: unexpected error in poll loop", { error: err });
            await sleep(POLL_INTERVAL_MS);
        }
    }
}

// graceful shutdown
process.on("SIGTERM", () => {
    logger.info("ingestion-worker: shutting down");
    process.exit(0);
});

run().catch((err) => {
    logger.error("ingestion-worker: fatal error", { error: err });
    process.exit(1);
});
