"use client";

import React, { useMemo } from "react";
import {
  Play,
  Square,
  Download,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Activity,
  Globe,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import type { CrawlRowResult, CrawlJobSummary, CrawlStatus } from "@/types/crawler";

export interface LiveProgressDashboardProps {
  isRunning: boolean;
  progressPercent: number;
  processedCount: number;
  totalCount: number;
  etaSeconds: number;
  logs: CrawlRowResult[];
  summary: CrawlJobSummary | null;
  downloadId: string | null;
  downloadUrl?: string | null;
  downloadFilename?: string | null;
  onStart: () => void;
  onAbort: () => void;
  canStart: boolean;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function LiveProgressDashboard({
  isRunning,
  progressPercent,
  processedCount,
  totalCount,
  etaSeconds,
  logs,
  summary,
  downloadId,
  downloadUrl,
  downloadFilename,
  onStart,
  onAbort,
  canStart,
}: LiveProgressDashboardProps) {
  // Metrics calculation
  const total = summary ? summary.total : totalCount;
  const succeeded = summary
    ? summary.succeeded
    : logs.filter((l) => l.status === "success").length;
  const failed = summary
    ? summary.failed
    : logs.filter((l) => l.status === "failed").length;
  const skipped = summary
    ? summary.skipped
    : logs.filter((l) => l.status === "skipped").length;

  const safePercent = Math.min(100, Math.max(0, Math.round(progressPercent)));

  // Show up to the 100 most recent logs, latest on top
  const recentLogs = useMemo(() => {
    return logs.slice(-100).reverse();
  }, [logs]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>Bước 3: Tiến trình Cào dữ liệu &amp; Kết quả</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi tiến độ xử lý song song và tải file Excel kết quả đã điền dữ liệu
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || isRunning}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm ${
              canStart && !isRunning
                ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-[0.99]"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Bắt đầu xử lý</span>
          </button>

          {isRunning && (
            <button
              type="button"
              onClick={onAbort}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm transition-all active:scale-[0.99]"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Dừng lại</span>
            </button>
          )}

          {(downloadUrl || downloadId) && (
            <a
              href={downloadUrl || `/api/download/${downloadId}`}
              download={downloadFilename || true}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm transition-all active:scale-[0.99]"
            >
              <Download className="w-4 h-4" />
              <span>Tải file Excel kết quả (.xlsx)</span>
            </a>
          )}
        </div>
      </div>

      {/* Progress Bar & ETA */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2 font-medium">
            <span>Tiến độ:</span>
            <span className="text-slate-800 font-bold">{safePercent}%</span>
            <span className="text-slate-400">
              ({processedCount} / {totalCount} URL)
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Thời gian còn lại (ETA): ~{formatEta(etaSeconds)}</span>
          </div>
        </div>

        {/* Bar */}
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              isRunning
                ? "bg-emerald-500"
                : safePercent === 100
                ? "bg-emerald-600"
                : "bg-slate-300"
            }`}
            style={{ width: `${safePercent}%` }}
          />
        </div>

        {summary && (
          <div className="text-right text-[11px] text-slate-400">
            Tổng thời gian hoàn tất: {(summary.durationMs / 1000).toFixed(1)}s
          </div>
        )}
      </div>

      {/* 4 Metric Counter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total URLs */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600">Tổng số URL</span>
            <Globe className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{total}</div>
        </div>

        {/* Succeeded */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-emerald-700">Thành công</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{succeeded}</div>
        </div>

        {/* Failed */}
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-rose-700">Thất bại</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-700">{failed}</div>
        </div>

        {/* Skipped */}
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-700">Bỏ qua/Trống</span>
            <MinusCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700">{skipped}</div>
        </div>
      </div>

      {/* Real-time Log Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Nhật ký xử lý trực tiếp ({logs.length > 100 ? "100 dòng gần nhất" : `${logs.length} dòng`})
          </span>
          {isRunning && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Đang cào dữ liệu...
            </span>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr className="text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 w-16 text-center">Dòng</th>
                  <th className="py-2.5 px-3 w-32">Trạng thái</th>
                  <th className="py-2.5 px-3 min-w-[180px]">URL</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Selector khớp</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Nội dung / Lỗi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Chưa có dữ liệu xử lý. Bấm &quot;Bắt đầu xử lý&quot; để tiến hành cào dữ liệu.
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((log) => {
                    const rowStatus = log.status as CrawlStatus;
                    return (
                      <tr
                        key={`${log.rowIndex}-${log.url}`}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        {/* Row index */}
                        <td className="py-2 px-3 text-center font-mono text-slate-500 font-medium">
                          #{log.rowIndex}
                        </td>

                        {/* Status badge with icon */}
                        <td className="py-2 px-3">
                          {rowStatus === "success" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              Thành công
                            </span>
                          )}
                          {rowStatus === "failed" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800">
                              <XCircle className="w-3 h-3" />
                              Thất bại
                            </span>
                          )}
                          {rowStatus === "skipped" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                              <MinusCircle className="w-3 h-3" />
                              Bỏ qua
                            </span>
                          )}
                        </td>

                        {/* URL */}
                        <td className="py-2 px-3 font-mono text-slate-700">
                          {log.url ? (
                            <a
                              href={log.url.startsWith("http") ? log.url : `https://${log.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-slate-700 hover:text-emerald-700 hover:underline max-w-[220px] truncate"
                              title={log.url}
                            >
                              <span className="truncate">{log.url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">(Trống)</span>
                          )}
                        </td>

                        {/* Matched selector */}
                        <td className="py-2 px-3 font-mono text-slate-700">
                          {log.matchedSelector ? (
                            <code className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] text-slate-700">
                              {log.matchedSelector}
                            </code>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Extracted text / error */}
                        <td className="py-2 px-3">
                          {log.text ? (
                            <span
                              className="text-slate-800 font-mono text-xs line-clamp-2"
                              title={log.text}
                            >
                              {log.text}
                            </span>
                          ) : log.error ? (
                            <span
                              className="text-rose-600 text-xs line-clamp-2"
                              title={log.error}
                            >
                              {log.error}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
