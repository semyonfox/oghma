import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';

export interface CanvasImportJobData {
  jobId: string;   // app.canvas_import_jobs primary key
  userId: string;
}

// one queue, one job type — Canvas imports are long-running and low-frequency
export const canvasImportQueue = new Queue<CanvasImportJobData>('canvas-import', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,  // keep last 100 completed for debugging
    removeOnFail: 200,
  },
});
