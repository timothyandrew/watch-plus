export interface WatchOptions {
  command: string[];
  interval: number; // seconds
  differences: boolean | "permanent";
  errexit: boolean;
  chgexit: boolean;
  color: boolean;
  noColor: boolean;
  noTitle: boolean;
  noWrap: boolean;
  exec: boolean;
  precise: boolean;
  beep: boolean;

  // Email extensions
  email?: string;
  from?: string;
  cooldown: number; // ms
  subject?: string;
  resendApiKey?: string;
}

export interface Config {
  resendApiKey?: string;
  defaultTo?: string;
  defaultFrom?: string;
  defaultCooldown?: string;
  defaultInterval?: number;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}
