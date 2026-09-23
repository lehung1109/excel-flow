export type ScrapeMethod = "static" | "browser";

export interface SelectorMatch {
  text: string;
  selector: string;
  method: ScrapeMethod;
  durationMs?: number;
}

export interface ScrapeOptions {
  preClickSelector?: string;
  timeoutMs?: number;
}

export type CrawlStatus = "success" | "failed" | "skipped";

export interface CrawlRowResult {
  rowIndex: number;
  url: string;
  status: CrawlStatus;
  matchedSelector?: string;
  text?: string;
  error?: string;
}

export type TargetColumnConfig =
  | { mode: "existing"; colIndex: number }
  | { mode: "new"; colName: string };

export interface ExtractionFieldConfig {
  id: string;
  name: string;
  selectors: string[];
  targetColumn: TargetColumnConfig;
}

export interface SavedConfigRecord {
  id: number;
  name: string;
  description?: string | null;
  fields: ExtractionFieldConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface FieldCrawlResult {
  text: string;
  matchedSelector?: string;
  error?: string;
  fieldName?: string;
}

export interface MultiFieldRowResult {
  rowIndex: number;
  url: string;
  status: CrawlStatus;
  fieldResults: Record<string, FieldCrawlResult>;
  error?: string;
}

export interface ExcelColumnInfo {
  index: number; // 1-indexed
  header: string;
}

export interface ExcelSheetSummary {
  name: string;
  rowCount: number;
  columns: ExcelColumnInfo[];
  sampleRows: (string | number | null)[][];
}

export interface CrawlJobSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export type CrawlProgressEvent =
  | { type: "start"; totalRows: number }
  | {
      type: "row_progress";
      rowIndex: number;
      url: string;
      status: CrawlStatus;
      matchedSelector?: string;
      text?: string;
      fieldResults?: Record<string, FieldCrawlResult>;
      error?: string;
      progressPercent: number;
      processedCount: number;
      totalCount: number;
      etaSeconds: number;
    }
  | {
      type: "complete";
      success: boolean;
      downloadId: string;
      filename?: string;
      fileBase64?: string;
      summary: CrawlJobSummary;
    }
  | { type: "error"; message: string };
