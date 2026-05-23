import type { MoisesClient } from './MoisesClient';
import type { MoisesJobResult, MoisesJobSnapshot, MoisesJobStatus } from './types';

const POLL_INITIAL_MS = 3_000;
const POLL_MAX_MS = 10_000;
const POLL_TIMEOUT_MS = 5 * 60_000; // give up after 5 minutes

type Listener = (snapshot: MoisesJobSnapshot) => void;

/**
 * MoisesJob — per-upload state machine the UI subscribes to.
 *
 *   picking → uploading (0–100%) → queued → processing → succeeded | failed
 *
 * Create with `MoisesJob.start(client, file)`; subscribe via `onProgress`.
 * The job auto-cancels if 5 min elapse without a terminal status.
 */
export class MoisesJob {
  private snapshot: MoisesJobSnapshot = { status: 'picking' };
  private listeners = new Set<Listener>();
  private aborted = false;
  private pollDelay = POLL_INITIAL_MS;
  private startedAt = 0;
  private pollTimer: number | null = null;

  private constructor(private client: MoisesClient, private file: File) {}

  static start(client: MoisesClient, file: File): MoisesJob {
    const job = new MoisesJob(client, file);
    void job.run();
    return job;
  }

  onProgress(cb: Listener): () => void {
    this.listeners.add(cb);
    try {
      cb(this.snapshot);
    } catch (err) {
      console.error('[MoisesJob] listener error', err);
    }
    return () => {
      this.listeners.delete(cb);
    };
  }

  cancel(): void {
    this.aborted = true;
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getSnapshot(): MoisesJobSnapshot {
    return this.snapshot;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async run(): Promise<void> {
    this.startedAt = Date.now();
    try {
      this.update({ status: 'uploading', uploadPercent: 0 });
      const { signedUrl, downloadUrl } = await this.client.requestUploadUrl(this.file.name);
      if (this.aborted) return;

      await this.client.uploadFile(signedUrl, this.file, (percent) => {
        if (this.aborted) return;
        this.update({ status: 'uploading', uploadPercent: percent });
      });
      if (this.aborted) return;

      const job = await this.client.createJob(downloadUrl);
      if (this.aborted) return;
      this.update({ status: 'queued' });

      await this.pollUntilDone(job.id);
    } catch (err) {
      if (this.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      this.update({ status: 'failed', error: message });
    }
  }

  private async pollUntilDone(jobId: string): Promise<void> {
    while (!this.aborted) {
      if (Date.now() - this.startedAt > POLL_TIMEOUT_MS) {
        this.update({ status: 'failed', error: 'job timed out (>5 min)' });
        return;
      }

      let resp;
      try {
        resp = await this.client.getJob(jobId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.update({ status: 'failed', error: message });
        return;
      }
      if (this.aborted) return;

      const status = this.normaliseStatus(resp.status);

      if (status === 'succeeded') {
        const result: MoisesJobResult = this.client.parseResult(resp.result);
        this.update({ status: 'succeeded', result });
        return;
      }
      if (status === 'failed') {
        this.update({
          status: 'failed',
          error: resp.failureReason ?? 'unknown failure'
        });
        return;
      }

      this.update({ status });
      await this.sleep(this.pollDelay);
      this.pollDelay = Math.min(POLL_MAX_MS, Math.round(this.pollDelay * 1.5));
    }
  }

  private normaliseStatus(raw: string): MoisesJobStatus {
    const v = (raw || '').toUpperCase();
    if (v === 'QUEUED') return 'queued';
    if (v === 'STARTED' || v === 'PROCESSING' || v === 'RUNNING') return 'processing';
    if (v === 'SUCCEEDED' || v === 'COMPLETED' || v === 'SUCCESS') return 'succeeded';
    if (v === 'FAILED' || v === 'ERROR') return 'failed';
    return 'processing';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.pollTimer = window.setTimeout(() => {
        this.pollTimer = null;
        resolve();
      }, ms);
    });
  }

  private update(partial: Partial<MoisesJobSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.listeners.forEach((cb) => {
      try {
        cb(this.snapshot);
      } catch (err) {
        console.error('[MoisesJob] listener error', err);
      }
    });
  }
}
