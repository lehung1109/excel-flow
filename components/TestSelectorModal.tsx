"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Code,
  Globe,
  Layers,
} from "lucide-react";
import type { ExtractionFieldConfig, FieldCrawlResult, ScrapeMethod } from "@/types/crawler";

export interface TestResultState {
  success: boolean;
  matchedSelector?: string;
  textContent?: string;
  method?: ScrapeMethod;
  durationMs?: number;
  error?: string;
  fieldResults?: Record<string, FieldCrawlResult>;
}

export interface TestSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleUrl: string;
  fields?: ExtractionFieldConfig[];
  selectors?: string[];
  initialResult?: TestResultState | null;
  preClickSelector?: string;
}

export default function TestSelectorModal({
  isOpen,
  onClose,
  sampleUrl,
  fields,
  selectors,
  initialResult = null,
  preClickSelector,
}: TestSelectorModalProps) {
  const [url, setUrl] = useState(sampleUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestResultState | null>(initialResult || null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const isMultiField = Boolean(fields !== undefined);
  const activeFields = fields || [];
  const activeSelectors = selectors || [];

  // Sync sampleUrl & initialResult when modal opens or props change
  useEffect(() => {
    setUrl(sampleUrl || "");
    setResult(initialResult || null);
    setGeneralError(null);
  }, [sampleUrl, isOpen, initialResult]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleRunTest = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    if (isMultiField ? activeFields.length === 0 : activeSelectors.length === 0) return;

    setIsLoading(true);
    setResult(null);
    setGeneralError(null);

    try {
      const payload: Record<string, any> = isMultiField
        ? { url: trimmedUrl, fields: activeFields }
        : { url: trimmedUrl, selectors: activeSelectors };

      if (preClickSelector && preClickSelector.trim()) {
        payload.preClickSelector = preClickSelector.trim();
      }

      const response = await fetch("/api/test-selector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";
      let data: any = null;

      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          // JSON parse failed
        }
      }

      if (response.ok && data) {
        if (data.results) {
          setResult({
            success: Boolean(data.success),
            fieldResults: data.results,
          });
        } else {
          setResult(data);
        }
      } else if (data?.error) {
        setGeneralError(data.error);
      } else if (response.status === 504) {
        setGeneralError(
          "Yêu cầu quá thời gian chờ (504 Gateway Timeout). Website phản hồi quá chậm hoặc chặn bot từ Vercel."
        );
      } else if (response.status === 500) {
        setGeneralError(
          "Máy chủ gặp sự cố (500 Internal Server Error). Vui lòng kiểm tra log trên Vercel."
        );
      } else {
        setGeneralError(
          `Đã xảy ra lỗi khi kiểm tra selector (HTTP ${response.status}).`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể kết nối đến máy chủ.";
      setGeneralError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const isButtonDisabled =
    isLoading ||
    !url.trim() ||
    (isMultiField ? activeFields.length === 0 : activeSelectors.length === 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-title" className="text-base font-semibold text-slate-800">
                Kiểm tra Thử Selector trên URL Mẫu
              </h3>
              <p className="text-xs text-slate-500">
                Kiểm tra trích xuất dữ liệu trực tiếp trước khi cào hàng loạt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Sample URL input */}
          <div>
            <label
              htmlFor="sample-url-input"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              URL mẫu để kiểm tra
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="sample-url-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/san-pham-mau"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800 bg-white placeholder-slate-400"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Bạn có thể chỉnh sửa URL này để test với trang web cụ thể.
            </p>
          </div>

          {preClickSelector && preClickSelector.trim() && (
            <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-2">
              <span className="font-medium text-amber-800">Click trước khi cào:</span>
              <code className="px-2 py-0.5 bg-white border border-amber-200 rounded text-amber-900 font-mono text-[11px]">
                {preClickSelector}
              </code>
            </div>
          )}

          {/* Active configuration list */}
          {isMultiField ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Danh sách trường bóc tách ({activeFields.length})
                </label>
                <span className="text-[11px] text-slate-400">
                  {activeFields.reduce((acc, f) => acc + f.selectors.length, 0)} selectors tổng cộng
                </span>
              </div>
              {activeFields.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Chưa có trường nào được cấu hình. Vui lòng thêm ít nhất 1 trường.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  {activeFields.map((field, idx) => (
                    <div
                      key={field.id || idx}
                      className="p-2 bg-white border border-slate-200 rounded-md text-xs space-y-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">
                          #{idx + 1} {field.name || field.id}
                        </span>
                        <span className="text-[11px] text-slate-500 font-sans">
                          {field.targetColumn.mode === "new"
                            ? `Cột mới: ${field.targetColumn.colName || "(chưa đặt tên)"}`
                            : `Cột ${field.targetColumn.colIndex}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {field.selectors.map((sel, sIdx) => (
                          <span
                            key={`${sel}-${sIdx}`}
                            className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] font-mono"
                          >
                            {sel}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Danh sách Selector ({activeSelectors.length})
                </label>
                <span className="text-[11px] text-slate-400">Ưu tiên từ trên xuống dưới</span>
              </div>
              {activeSelectors.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Chưa có selector nào được cấu hình. Vui lòng thêm ít nhất 1 selector.</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  {activeSelectors.map((sel, idx) => (
                    <span
                      key={`${sel}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded text-xs font-mono shadow-xs"
                    >
                      <span className="text-[10px] font-sans font-semibold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded">
                        #{idx + 1}
                      </span>
                      {sel}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action button */}
          <div>
            <button
              type="button"
              onClick={handleRunTest}
              disabled={isButtonDisabled}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm transition-all shadow-sm ${
                isButtonDisabled
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-[0.99]"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Bắt đầu Test Thử</span>
                </>
              )}
            </button>
          </div>

          {/* General network / server error */}
          {generalError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <div>
                <p className="font-semibold text-rose-800">Lỗi kiểm tra:</p>
                <p className="mt-0.5 text-xs text-rose-700">{generalError}</p>
              </div>
            </div>
          )}

          {/* Result card */}
          {result && (
            <div className="transition-all duration-200">
              {result.fieldResults ? (
                <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                      {Object.values(result.fieldResults).some((r) => r.text) ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <span className="text-emerald-800">Kết quả kiểm tra đa trường</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-amber-600" />
                          <span className="text-amber-800">Không tìm thấy nội dung khớp</span>
                        </>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 font-medium">
                      Khớp {Object.values(result.fieldResults).filter((r) => r.text).length} /{" "}
                      {Object.keys(result.fieldResults).length} trường
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                          <tr className="text-slate-600 font-semibold">
                            <th className="py-2.5 px-3 w-1/4">Tên trường</th>
                            <th className="py-2.5 px-3 w-1/3">Selector khớp</th>
                            <th className="py-2.5 px-3">Nội dung bóc tách</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(activeFields.length > 0
                            ? activeFields.map((f) => ({
                                id: f.id,
                                name: f.name || f.id,
                                res: result.fieldResults?.[f.id],
                              }))
                            : Object.entries(result.fieldResults).map(([id, res]) => ({
                                id,
                                name: id,
                                res,
                              }))
                          ).map(({ id, name, res }) => {
                            const isMatched = Boolean(res && res.text);
                            return (
                              <tr key={id} className="hover:bg-slate-50/50">
                                <td className="py-2.5 px-3 font-medium text-slate-800 align-top">
                                  <div className="flex items-center gap-1.5">
                                    {isMatched ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    ) : (
                                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span>{name}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] align-top">
                                  {res?.matchedSelector ? (
                                    <code className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-semibold break-all">
                                      {res.matchedSelector}
                                    </code>
                                  ) : (
                                    <span className="text-slate-400 italic">Không khớp</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 align-top">
                                  {res?.text ? (
                                    <div className="max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-800 bg-slate-50 p-2 rounded border border-slate-200 break-words">
                                      {res.text}
                                    </div>
                                  ) : (
                                    <span className="text-rose-600 text-xs italic">
                                      {res?.error || "Không tìm thấy nội dung nào khớp"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : result.success ? (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>Trích xuất thành công!</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      {result.method && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                          <Layers className="w-3 h-3" />
                          {result.method === "static" ? "Static HTML" : "Browser (JS)"}
                        </span>
                      )}
                      {result.durationMs !== undefined && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          {result.durationMs}ms
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Matched selector */}
                  {result.matchedSelector && (
                    <div className="text-xs">
                      <span className="text-slate-500">Selector khớp: </span>
                      <code className="px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded font-mono font-medium">
                        {result.matchedSelector}
                      </code>
                    </div>
                  )}

                  {/* Text preview */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-700 mb-1">
                      Nội dung trích xuất được (Text Content):
                    </span>
                    <div className="p-3 bg-white border border-emerald-200 rounded-lg text-xs font-mono text-slate-800 max-h-36 overflow-y-auto whitespace-pre-wrap break-words">
                      {result.textContent || "(Chuỗi rỗng)"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-semibold">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>Không tìm thấy nội dung khớp</span>
                  </div>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    {result.error ||
                      "Không tìm thấy phần tử nào khớp với danh sách selector trên trang web này. Vui lòng kiểm tra lại cấu trúc HTML của trang."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
