/**
 * Telemetry — analytics seam (spec §17). The game only fires through this
 * interface; NEVER bundles a third-party SDK.
 */

export type TelemetryEvent =
  | 'session_start'
  | 'run_start'
  | 'run_end'
  | 'powerup_used'
  | 'near_miss'
  | 'crash'
  | 'revive'
  | 'mission_complete'
  | 'settings_changed'
  | 'fps_sample';

export interface Telemetry {
  track(event: TelemetryEvent, data?: Record<string, unknown>): void;
}

export class NoopTelemetry implements Telemetry {
  track(): void {}
}

export class ConsoleTelemetry implements Telemetry {
  track(event: TelemetryEvent, data?: Record<string, unknown>): void {
    console.info(`[Telemetry] ${event}`, data ?? {});
  }
}
