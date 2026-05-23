export type MoisesJobStatus =
  | 'picking'      // local — user choosing a file
  | 'uploading'    // PUT in flight
  | 'queued'       // Moises has the file but hasn't started processing
  | 'processing'   // Moises is working
  | 'succeeded'
  | 'failed';

export interface MoisesStem {
  /** "vocals", "drums", "bass", "other", … */
  name: string;
  /** Signed download URL Moises returns when the job finishes. */
  url: string;
}

export interface MoisesBeat {
  /** Time of the beat in seconds. */
  time: number;
  /** Position within the bar (1, 2, 3, 4 in 4/4). */
  position: number;
}

export interface MoisesTempoPoint {
  /** Time of the tempo sample in seconds. */
  time: number;
  /** Beats per minute at that moment. */
  bpm: number;
}

export interface MoisesJobResult {
  stems: MoisesStem[];
  beats: MoisesBeat[];
  tempoMap: MoisesTempoPoint[];
  /** Single overall BPM, when Moises returns one. */
  bpm?: number;
}

export interface MoisesJobSnapshot {
  status: MoisesJobStatus;
  /** 0–100 during 'uploading'; undefined otherwise. */
  uploadPercent?: number;
  error?: string;
  result?: MoisesJobResult;
}
