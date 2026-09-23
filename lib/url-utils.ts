/**
 * Normalizes input value to a valid URL string or returns null if invalid.
 */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;

  // If missing protocol, prepend https:// if it looks like a domain/path (supports optional port)
  if (!/^https?:\/\//i.test(trimmed)) {
    // Check if it looks like a domain / path
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?[/#?]?/i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Cleans up raw extracted textContent by stripping common HTML entities,
 * normalizing redundant spaces and newlines, and trimming ends.
 */
export function sanitizeExtractedText(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";

  const cleaned = raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

/**
 * Calculates estimated time remaining in seconds.
 */
export function calculateETA(startTime: number, processed: number, total: number): number {
  if (processed <= 0 || processed >= total) return 0;
  const elapsedMs = Date.now() - startTime;
  const msPerItem = elapsedMs / processed;
  const remainingItems = total - processed;
  return Math.max(0, Math.round((msPerItem * remainingItems) / 1000));
}
