import { db } from '../../../projects/db.js';

export async function updateJobProgress(jobId: bigint, message: string) {
  try {
    await db.exec`
      UPDATE project_generation_jobs
      SET 
        status = 'in_progress',
        progress_message = ${message},
        updated_at = NOW()
      WHERE id = ${jobId}
    `;
  } catch (err) {
    console.error(`[Job ${jobId}] Failed to update progress:`, err);
  }
}
