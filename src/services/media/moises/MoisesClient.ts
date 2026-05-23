import type { MoisesJobResult } from './types';

const API_BASE = 'https://developer-api.moises.ai/api';
const STORAGE_KEY = 'smartmaps.moises.apiKey';

/**
 * Default workflow id. Moises lets you stack pipelines under a single
 * workflow ID; we pick the "stems + beat detection + tempo" combo. Swap
 * this for your workflow ID once registered.
 *
 * TODO: verify against the current Moises Developer API spec — exact
 * workflow ids change across the platform.
 */
export const MOISES_WORKFLOW_ID = 'moises/stems-vocals-accompaniment';

interface UploadUrlResponse {
  signedUrl: string;
  downloadUrl: string;
}

interface JobResponse {
  id: string;
  status: 'QUEUED' | 'STARTED' | 'SUCCEEDED' | 'FAILED' | string;
  result?: unknown;
  failureReason?: string;
}

/**
 * MoisesClient — thin wrapper over the Moises Developer REST API.
 *
 * Auth is a developer key the user pastes into the Moises settings screen
 * (`setApiKey` / `getApiKey`). It's persisted in localStorage; no hard-coded
 * key, no env-var injection.
 *
 * The endpoint paths here follow the publicly documented Developer API
 * shape (POST /upload, POST /job, GET /job/{id}). If your account's actual
 * API contract differs, the surface stays the same — just adjust the URLs
 * and the JSON shapes inside this file.
 */
export class MoisesClient {
  // ─── API-key plumbing ─────────────────────────────────────────────────────

  getApiKey(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  setApiKey(key: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (key.trim()) localStorage.setItem(STORAGE_KEY, key.trim());
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  clearApiKey(): void {
    this.setApiKey('');
  }

  hasApiKey(): boolean {
    return !!this.getApiKey();
  }

  // ─── upload ───────────────────────────────────────────────────────────────

  /** Step 1 — ask Moises for a signed PUT URL. */
  async requestUploadUrl(filename: string): Promise<UploadUrlResponse> {
    return this.json<UploadUrlResponse>('/upload', {
      method: 'POST',
      body: { filename }
    });
  }

  /**
   * Step 2 — PUT the audio file at the signed URL. Uses XHR (not fetch) so
   * the UI can render upload progress; the Fetch API doesn't expose upload
   * progress events.
   */
  uploadFile(
    signedUrl: string,
    file: Blob,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error('upload network error'));
      xhr.onabort = () => reject(new Error('upload aborted'));
      xhr.send(file);
    });
  }

  // ─── jobs ─────────────────────────────────────────────────────────────────

  /** Step 3 — create a job pointing at the just-uploaded file. */
  async createJob(downloadUrl: string, workflow: string = MOISES_WORKFLOW_ID): Promise<JobResponse> {
    return this.json<JobResponse>('/job', {
      method: 'POST',
      body: {
        name: 'Smart Maps OS upload',
        workflow,
        params: { inputUrl: downloadUrl }
      }
    });
  }

  /** Step 4 — poll until terminal. Returns the raw response. */
  async getJob(jobId: string): Promise<JobResponse> {
    return this.json<JobResponse>(`/job/${encodeURIComponent(jobId)}`);
  }

  /**
   * Normalise the Moises job result into the shape our UI consumes. The
   * exact field names depend on the workflow; this maps the canonical
   * "stems + beats + tempo" shape into MoisesJobResult.
   */
  parseResult(raw: unknown): MoisesJobResult {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const stemsRaw = (obj.stems as Array<Record<string, string>>) ?? [];
    const beatsRaw =
      (obj.beats as Array<{ time: number; position?: number }>) ??
      (obj.beat as Array<{ time: number; position?: number }>) ??
      [];
    const tempoRaw =
      (obj.tempoMap as Array<{ time: number; bpm: number }>) ??
      (obj.tempo_map as Array<{ time: number; bpm: number }>) ??
      [];

    return {
      stems: stemsRaw.map((s) => ({
        name: s.name ?? s.label ?? 'stem',
        url: s.url ?? s.downloadUrl ?? ''
      })),
      beats: beatsRaw.map((b, i) => ({
        time: b.time,
        position: b.position ?? ((i % 4) + 1)
      })),
      tempoMap: tempoRaw.map((t) => ({ time: t.time, bpm: t.bpm })),
      bpm: typeof obj.bpm === 'number' ? (obj.bpm as number) : undefined
    };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async json<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('Moises API key not set');
    const res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`moises ${res.status}: ${text || res.statusText}`);
    }
    return (await res.json()) as T;
  }
}
