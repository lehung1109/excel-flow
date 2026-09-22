import { randomUUID } from "node:crypto";

export interface TempFileEntry {
  buffer: Buffer;
  filename: string;
  createdAt: number;
}

export const ONE_HOUR_MS = 60 * 60 * 1000;

const tempStore = new Map<string, TempFileEntry>();

/**
 * Remove any expired entries from the in-memory store.
 * Returns the number of expired entries removed.
 */
export function cleanupExpiredFiles(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, entry] of tempStore.entries()) {
    if (now - entry.createdAt > ONE_HOUR_MS) {
      tempStore.delete(id);
      removed++;
    }
  }
  return removed;
}

/**
 * Save a buffer to temporary in-memory store and return a unique downloadId.
 */
export function saveTempFile(buffer: Buffer, filename: string): string {
  cleanupExpiredFiles();
  const downloadId = randomUUID();
  tempStore.set(downloadId, {
    buffer,
    filename,
    createdAt: Date.now(),
  });
  return downloadId;
}

/**
 * Retrieve a temporary file by downloadId.
 * Returns null if the file does not exist or has expired.
 */
export function getTempFile(
  downloadId: string
): { buffer: Buffer; filename: string } | null {
  const entry = tempStore.get(downloadId);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > ONE_HOUR_MS) {
    tempStore.delete(downloadId);
    return null;
  }

  return {
    buffer: entry.buffer,
    filename: entry.filename,
  };
}

/**
 * Reset/clear the in-memory store. Useful for testing.
 */
export function clearTempStore(): void {
  tempStore.clear();
}
