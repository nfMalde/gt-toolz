// Checks for arguments of calls from the UI (IPC): they are never trusted, in the shell and in every module.

/** An id or a short value. */
export function asString(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid argument');
  return value;
}
