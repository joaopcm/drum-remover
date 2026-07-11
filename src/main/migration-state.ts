/**
 * Process-wide flag tracking whether a data-directory migration is running.
 * Add-song / processing paths consult `isMigrating()` and refuse to start new
 * work while a move is in flight. The job queue (issue #3) can respect the
 * same hook once it lands.
 */
let migrating = false;

export function isMigrating(): boolean {
  return migrating;
}

export function setMigrating(value: boolean): void {
  migrating = value;
}
