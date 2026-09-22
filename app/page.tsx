"use client";

import React, { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, CheckCircle2 } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import SelectorConfig from "@/components/SelectorConfig";
import TestSelectorModal from "@/components/TestSelectorModal";
import LiveProgressDashboard from "@/components/LiveProgressDashboard";
import type {
  CrawlJobSummary,
  ExcelColumnInfo,
  ExcelSheetSummary,
  ExtractionFieldConfig,
} from "@/types/crawler";
import type { DashboardLogRow } from "@/components/LiveProgressDashboard";

const DEFAULT_FIELDS: ExtractionFieldConfig[] = [
  {
    id: "field_1",
    name: "Trường 1",
    selectors: [
      "h1.product-title",
      "h1.entry-title",
      "h1",
      ".title",
    ],
    targetColumn: {
      mode: "new",
      colName: "Extracted_Content",
    },
  },
];

const URL_COLUMN_KEYWORDS = ["url", "link", "href", "web", "trang"];

function detectUrlColumn(columns: ExcelColumnInfo[]): number | null {
  for (const col of columns) {
    const lower = (col.header || "").toLowerCase();
    if (URL_COLUMN_KEYWORDS.some((kw) => lower.includes(kw))) {
      return col.index;
    }
  }
  return null;
}

export default function Home() {
  // File & sheet state
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ExcelSheetSummary[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  // Crawler configuration state
  const [urlColIndex, setUrlColIndex] = useState<number | null>(null);
  const [fields, setFields] = useState<ExtractionFieldConfig[]>(DEFAULT_FIELDS);
  const [rowRange, setRowRange] = useState<{
    startRow: number;
    endRow: number;
  }>({
    startRow: 2,
    endRow: 2,
  });

  // Crawl execution & streaming state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number>(0);
  const [logs, setLogs] = useState<DashboardLogRow[]>([]);
  const [summary, setSummary] = useState<CrawlJobSummary | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);

  // Test modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);

  // Abort controller ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // Active sheet summary
  const activeSheet = useMemo(() => {
    return (
      sheets.find((s) => s.name === selectedSheet) || sheets[0] || null
    );
  }, [sheets, selectedSheet]);

  const activeColumns = useMemo(() => {
    return activeSheet?.columns ?? [];
  }, [activeSheet]);

  const activeRowCount = useMemo(() => {
    return activeSheet?.rowCount ?? 0;
  }, [activeSheet]);

  // Derive sample URL from active sheet and chosen URL column
  let sampleUrl = "";
  if (activeSheet && urlColIndex !== null && activeSheet.sampleRows) {
    const colPosition = activeSheet.columns.findIndex(
      (c) => c.index === urlColIndex
    );
    if (colPosition !== -1) {
      for (const row of activeSheet.sampleRows) {
        const val = row[colPosition];
        if (typeof val === "string" && val.trim().length > 0) {
          sampleUrl = val.trim();
          break;
        }
      }
    }
  }

  // Handlers for file upload & sheet change
  const handleFileLoaded = (
    loadedFile: File,
    loadedSheets: ExcelSheetSummary[]
  ) => {
    setFile(loadedFile);
    setSheets(loadedSheets);
    setLogs([]);
    setSummary(null);
    setDownloadId(null);
    setDownloadUrl(null);
    setDownloadFilename(null);
    setProgressPercent(0);
    setProcessedCount(0);
    setTotalCount(0);
    setEtaSeconds(0);

    if (loadedSheets.length > 0) {
      const firstSheet = loadedSheets[0];
      setSelectedSheet(firstSheet.name);

      const detected = detectUrlColumn(firstSheet.columns);
      setUrlColIndex(detected);

      setRowRange({
        startRow: 2,
        endRow: Math.max(2, firstSheet.rowCount),
      });
    }
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const targetSheet = sheets.find((s) => s.name === sheetName);
    if (targetSheet) {
      const detected = detectUrlColumn(targetSheet.columns);
      setUrlColIndex(detected);
      setRowRange({
        startRow: 2,
        endRow: Math.max(2, targetSheet.rowCount),
      });
    }
  };

  const handleRowRangeChange = (range: {
    startRow: number;
    endRow: number;
  }) => {
    const safeStartRow = Math.max(2, range.startRow);
    const safeEndRow = Math.max(safeStartRow, range.endRow);
    setRowRange({
      startRow: safeStartRow,
      endRow: safeEndRow,
    });
  };

  const canStart = Boolean(
    file &&
      selectedSheet &&
      urlColIndex !== null &&
      fields.length > 0 &&
      fields.every(
        (f) =>
          f.selectors.length > 0 &&
          (f.targetColumn.mode !== "new" || Boolean(f.targetColumn.colName?.trim()))
      ) &&
      !isRunning
  );

  // SSE Crawl Execution
  const handleStartCrawl = async () => {
    if (!canStart || !file || urlColIndex === null) return;
    if (fields.length === 0) return;
    for (const f of fields) {
      if (f.selectors.length === 0) return;
      if (f.targetColumn.mode === "new" && !f.targetColumn.colName?.trim()) return;
    }

    setIsRunning(true);
    setProgressPercent(0);
    setProcessedCount(0);
    setTotalCount(0);
    setEtaSeconds(0);
    setLogs([]);
    setSummary(null);
    setDownloadId(null);
    setDownloadUrl(null);
    setDownloadFilename(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("urlColIndex", String(urlColIndex));
      formData.append("fields", JSON.stringify(fields));
      formData.append("sheetName", selectedSheet);
      formData.append("rowRange", JSON.stringify(rowRange));

      const response = await fetch("/api/crawl", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = "Đã xảy ra lỗi khi gửi yêu cầu.";
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          try {
            const errJson = await response.json();
            if (errJson?.error) {
              errorMessage = errJson.error;
            }
          } catch {
            // ignore error parsing
          }
        } else {
          if (response.status === 504) {
            errorMessage =
              "Quá thời gian xử lý trên Vercel (504 Gateway Timeout). Vui lòng crawl ít dòng hơn mỗi lần.";
          } else if (response.status === 413) {
            errorMessage =
              "Dung lượng file vượt quá giới hạn 4.5 MB của Vercel Serverless Function.";
          } else if (response.status === 500) {
            errorMessage =
              "Máy chủ Vercel gặp sự cố (500 Internal Server Error). Vui lòng kiểm tra log trên Vercel.";
          } else {
            errorMessage = `Máy chủ phản hồi mã lỗi HTTP ${response.status}.`;
          }
        }

        setLogs((prev) => [
          ...prev,
          {
            rowIndex: 0,
            url: "",
            status: "failed",
            error: errorMessage,
          },
        ]);
        setIsRunning(false);
        return;
      }

      if (!response.body) {
        throw new Error("Phản hồi không có dữ liệu luồng (stream).");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const messages = streamBuffer.split("\n\n");
        streamBuffer = messages.pop() ?? "";

        for (const message of messages) {
          if (!message.trim()) continue;

          let eventType = "message";
          let dataStr = "";

          for (const line of message.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.slice(5).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === "start") {
              setTotalCount(data.totalRows || 0);
            } else if (eventType === "row_progress") {
              setProgressPercent(data.progressPercent ?? 0);
              setProcessedCount(data.processedCount ?? 0);
              setTotalCount(data.totalCount ?? 0);
              setEtaSeconds(data.etaSeconds ?? 0);
              setLogs((prev) => [
                ...prev,
                {
                  rowIndex: data.rowIndex,
                  url: data.url,
                  status: data.status,
                  matchedSelector: data.matchedSelector,
                  text: data.text,
                  fieldResults: data.fieldResults,
                  error: data.error,
                },
              ]);
            } else if (eventType === "complete") {
              setDownloadId(data.downloadId);
              if (data.fileBase64 && typeof window !== "undefined") {
                try {
                  const binaryStr = window.atob(data.fileBase64);
                  const len = binaryStr.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }
                  const blob = new Blob([bytes], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  });
                  const blobUrl = URL.createObjectURL(blob);
                  setDownloadUrl(blobUrl);
                  if (data.filename) {
                    setDownloadFilename(data.filename);
                  }
                } catch {
                  // fallback to downloadId
                }
              }
              setSummary(data.summary);
              setProgressPercent(100);
            } else if (eventType === "error") {
              setLogs((prev) => [
                ...prev,
                {
                  rowIndex: 0,
                  url: "",
                  status: "failed",
                  error: data.message || "Lỗi xử lý cào dữ liệu",
                },
              ]);
            }
          } catch (jsonErr) {
            console.error("Lỗi phân tích cú pháp SSE:", jsonErr);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Cào dữ liệu đã được người dùng dừng.");
      } else {
        const message =
          err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
        setLogs((prev) => [
          ...prev,
          {
            rowIndex: 0,
            url: "",
            status: "failed",
            error: message,
          },
        ]);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbortCrawl = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-800 pb-16">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Excel Web Scraper
                </h1>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Cào dữ liệu website tự động và điền trực tiếp vào file Excel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Đang xử lý...
              </span>
            )}
            {summary && !isRunning && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Hoàn thành
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Step 1: Upload Excel */}
        <section aria-labelledby="step-1-title">
          <FileUploadZone
            onFileLoaded={handleFileLoaded}
            selectedSheet={selectedSheet}
            onSheetChange={handleSheetChange}
          />
        </section>

        {/* Step 2: Configuration */}
        <section aria-labelledby="step-2-title">
          <SelectorConfig
            columns={activeColumns}
            totalRows={activeRowCount}
            urlColIndex={urlColIndex}
            onUrlColChange={setUrlColIndex}
            fields={fields}
            onFieldsChange={setFields}
            rowRange={rowRange}
            onRowRangeChange={handleRowRangeChange}
            onTestRequested={() => setIsTestModalOpen(true)}
          />
        </section>

        {/* Step 3: Real-Time Execution Dashboard */}
        <section aria-labelledby="step-3-title">
          <LiveProgressDashboard
            isRunning={isRunning}
            progressPercent={progressPercent}
            processedCount={processedCount}
            totalCount={totalCount}
            etaSeconds={etaSeconds}
            logs={logs}
            summary={summary}
            downloadId={downloadId}
            downloadUrl={downloadUrl}
            downloadFilename={downloadFilename}
            onStart={handleStartCrawl}
            onAbort={handleAbortCrawl}
            canStart={canStart}
          />
        </section>
      </main>

      {/* Test Selector Modal */}
      <TestSelectorModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        sampleUrl={sampleUrl}
        fields={fields}
      />
    </div>
  );
}
