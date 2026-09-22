"use client";

import React, { useEffect, useState } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Database,
  BookmarkPlus,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import type {
  ExcelColumnInfo,
  ExtractionFieldConfig,
  SavedConfigRecord,
  TargetColumnConfig,
} from "@/types/crawler";

export interface SelectorConfigProps {
  columns: ExcelColumnInfo[];
  totalRows: number;
  urlColIndex: number | null;
  onUrlColChange: (idx: number) => void;
  fields?: ExtractionFieldConfig[];
  onFieldsChange?: (fields: ExtractionFieldConfig[]) => void;
  // Legacy props for backward compatibility
  selectors?: string[];
  onSelectorsChange?: (selectors: string[]) => void;
  targetConfig?: TargetColumnConfig;
  onTargetConfigChange?: (config: TargetColumnConfig) => void;
  rowRange: { startRow: number; endRow: number };
  onRowRangeChange: (range: { startRow: number; endRow: number }) => void;
  onTestRequested: () => void;
  skipExistingData?: boolean;
  onSkipExistingDataChange?: (skip: boolean) => void;
  preClickSelector?: string;
  onPreClickSelectorChange?: (selector: string) => void;
  initialSaveModalOpen?: boolean;
  initialModalError?: string | null;
}

export function createDefaultField(index: number): ExtractionFieldConfig {
  return {
    id: `field_${Date.now()}_${index}`,
    name: `Trường ${index}`,
    selectors: [],
    targetColumn: {
      mode: "new",
      colName: `Truong_${index}`,
    },
  };
}

export default function SelectorConfig({
  columns,
  totalRows,
  urlColIndex,
  onUrlColChange,
  fields,
  onFieldsChange,
  selectors,
  onSelectorsChange,
  targetConfig,
  onTargetConfigChange,
  rowRange,
  onRowRangeChange,
  onTestRequested,
  skipExistingData,
  onSkipExistingDataChange,
  preClickSelector,
  onPreClickSelectorChange,
  initialSaveModalOpen = false,
  initialModalError = null,
}: SelectorConfigProps) {
  const [internalSkipExisting, setInternalSkipExisting] = useState(true);
  const currentSkipExisting =
    skipExistingData !== undefined ? skipExistingData : internalSkipExisting;

  function handleToggleSkipExisting(val: boolean) {
    if (onSkipExistingDataChange) {
      onSkipExistingDataChange(val);
    } else {
      setInternalSkipExisting(val);
    }
  }

  const [internalPreClick, setInternalPreClick] = useState(preClickSelector || "");
  const [internalInteractionEnabled, setInternalInteractionEnabled] = useState(
    Boolean(preClickSelector && preClickSelector.trim().length > 0)
  );

  const currentPreClick =
    preClickSelector !== undefined ? preClickSelector : internalPreClick;
  const interactionEnabled =
    internalInteractionEnabled || Boolean(currentPreClick && currentPreClick.trim().length > 0);

  function handleToggleInteraction(checked: boolean) {
    setInternalInteractionEnabled(checked);
    if (!checked) {
      if (onPreClickSelectorChange) onPreClickSelectorChange("");
      else setInternalPreClick("");
    } else {
      const val = currentPreClick || 'button[type="submit"].btn.btn-primary';
      if (onPreClickSelectorChange) onPreClickSelectorChange(val);
      else setInternalPreClick(val);
    }
  }

  function handlePreClickChange(val: string) {
    if (onPreClickSelectorChange) {
      onPreClickSelectorChange(val);
    } else {
      setInternalPreClick(val);
    }
  }

  // Internal fallback state if uncontrolled
  const [internalFields, setInternalFields] = useState<ExtractionFieldConfig[]>(() => {
    if (fields && fields.length > 0) return fields;
    return [
      {
        id: "field_1",
        name: "Trường 1",
        selectors: selectors || [],
        targetColumn: targetConfig || {
          mode: "new",
          colName: "Extracted_Content",
        },
      },
    ];
  });

  const currentFields = fields ?? internalFields;

  function updateFields(newFields: ExtractionFieldConfig[]) {
    if (onFieldsChange) {
      onFieldsChange(newFields);
    } else {
      setInternalFields(newFields);
    }
    if (onSelectorsChange && newFields[0]) {
      onSelectorsChange(newFields[0].selectors);
    }
    if (onTargetConfigChange && newFields[0]) {
      onTargetConfigChange(newFields[0].targetColumn);
    }
  }

  // Neon DB Config State
  const [savedConfigs, setSavedConfigs] = useState<SavedConfigRecord[]>([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<number | "">("");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(Boolean(initialSaveModalOpen));
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [modalError, setModalError] = useState<string | null>(initialModalError || null);

  // Per-field input state for adding selectors
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});
  const [customRangeEnabled, setCustomRangeEnabled] = useState(false);

  // Fetch saved configs on mount
  async function fetchConfigs() {
    try {
      setIsLoadingConfigs(true);
      const res = await fetch("/api/configs");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.configs)) {
          setSavedConfigs(data.configs);
        }
      }
    } catch {
      // ignore fetch errors during SSR or static testing
    } finally {
      setIsLoadingConfigs(false);
    }
  }

  useEffect(() => {
    fetchConfigs();
  }, []);


  // Neon DB Action Handlers
  function handleSelectConfig(configIdStr: string) {
    if (!configIdStr) {
      setSelectedConfigId("");
      return;
    }
    const id = parseInt(configIdStr, 10);
    setSelectedConfigId(id);
    const found = savedConfigs.find((c) => c.id === id);
    if (found && Array.isArray(found.fields) && found.fields.length > 0) {
      updateFields(found.fields);
      setStatusMessage({
        type: "success",
        text: `Đã nạp cấu hình "${found.name}" (${found.fields.length} trường)`,
      });
      setTimeout(() => setStatusMessage(null), 3500);
    }
  }

  async function handleDeleteConfig() {
    if (!selectedConfigId || isDeleting) return;
    const target = savedConfigs.find((c) => c.id === selectedConfigId);
    const confirmText = target
      ? `Bạn có chắc muốn xóa cấu hình "${target.name}" khỏi cơ sở dữ liệu?`
      : "Bạn có chắc muốn xóa cấu hình này?";

    if (typeof window !== "undefined" && !window.confirm(confirmText)) {
      return;
    }

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/configs/${selectedConfigId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedConfigId("");
        await fetchConfigs();
        setStatusMessage({
          type: "success",
          text: "Đã xóa cấu hình thành công.",
        });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({
          type: "error",
          text: data.error || "Không thể xóa cấu hình.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi khi xóa cấu hình.";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSaveConfigSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setModalError(null);
    const trimmedName = saveName.trim();
    if (!trimmedName) {
      setModalError("Vui lòng nhập tên cấu hình.");
      return;
    }
    if (currentFields.length === 0) {
      setModalError("Cấu hình phải có ít nhất 1 trường bóc tách.");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: saveDescription.trim() || undefined,
          fields: currentFields,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setIsSaveModalOpen(false);
        setSaveName("");
        setSaveDescription("");
        setModalError(null);
        await fetchConfigs();
        setSelectedConfigId(data.config.id);
        setStatusMessage({
          type: "success",
          text: `Đã lưu cấu hình "${data.config.name}" vào Neon DB!`,
        });
        setTimeout(() => setStatusMessage(null), 3500);
      } else {
        setModalError(data.error || "Lỗi khi lưu cấu hình.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi kết nối cơ sở dữ liệu.";
      setModalError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  // Field Manipulation Handlers
  function handleAddField() {
    const nextIndex = currentFields.length + 1;
    const newField = createDefaultField(nextIndex);
    updateFields([...currentFields, newField]);
  }

  function handleRemoveField(fieldIndex: number) {
    if (currentFields.length <= 1) return;
    const updated = currentFields.filter((_, idx) => idx !== fieldIndex);
    updateFields(updated);
  }

  function handleUpdateFieldName(fieldIndex: number, name: string) {
    const updated = currentFields.map((f, idx) =>
      idx === fieldIndex ? { ...f, name } : f
    );
    updateFields(updated);
  }

  function handleAddSelector(fieldIndex: number) {
    const field = currentFields[fieldIndex];
    if (!field) return;
    const inputVal = (fieldInputs[field.id] || "").trim();
    if (!inputVal) return;
    if (field.selectors.includes(inputVal)) return;

    const nextSelectors = [...field.selectors, inputVal];
    const updated = currentFields.map((f, idx) =>
      idx === fieldIndex ? { ...f, selectors: nextSelectors } : f
    );
    updateFields(updated);
    setFieldInputs((prev) => ({ ...prev, [field.id]: "" }));
  }

  function handleRemoveSelector(fieldIndex: number, selectorIndex: number) {
    const field = currentFields[fieldIndex];
    if (!field) return;
    const nextSelectors = field.selectors.filter((_, idx) => idx !== selectorIndex);
    const updated = currentFields.map((f, idx) =>
      idx === fieldIndex ? { ...f, selectors: nextSelectors } : f
    );
    updateFields(updated);
  }

  function handleUpdateTargetMode(
    fieldIndex: number,
    mode: "new" | "existing"
  ) {
    const field = currentFields[fieldIndex];
    if (!field) return;
    let targetColumn: TargetColumnConfig;
    if (mode === "new") {
      targetColumn = {
        mode: "new",
        colName:
          field.targetColumn.mode === "new"
            ? field.targetColumn.colName
            : field.name
            ? field.name.replace(/\s+/g, "_")
            : `Truong_${fieldIndex + 1}`,
      };
    } else {
      targetColumn = {
        mode: "existing",
        colIndex:
          field.targetColumn.mode === "existing"
            ? field.targetColumn.colIndex
            : columns[0]?.index || 1,
      };
    }
    const updated = currentFields.map((f, idx) =>
      idx === fieldIndex ? { ...f, targetColumn } : f
    );
    updateFields(updated);
  }

  function handleUpdateNewColName(fieldIndex: number, colName: string) {
    const updated = currentFields.map((f, idx) =>
      idx === fieldIndex
        ? {
            ...f,
            targetColumn: { mode: "new" as const, colName },
          }
        : f
    );
    updateFields(updated);
  }

  function handleUpdateExistingColIndex(fieldIndex: number, colIndex: number) {
    const updated = currentFields.map((f, idx) =>
      idx === fieldIndex
        ? {
            ...f,
            targetColumn: { mode: "existing" as const, colIndex },
          }
        : f
    );
    updateFields(updated);
  }

  const effectiveTotalRows = Math.max(0, totalRows > 1 ? totalRows - 1 : 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-indigo-600" />
          Bước 2: Cấu hình trích xuất dữ liệu
        </h2>

        {/* Neon DB Config Manager Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
            <Database className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <select
              value={selectedConfigId}
              onChange={(e) => handleSelectConfig(e.target.value)}
              disabled={isLoadingConfigs}
              className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
            >
              <option value="">-- Chọn cấu hình đã lưu --</option>
              {savedConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.name} ({cfg.fields.length} trường)
                </option>
              ))}
            </select>
            {selectedConfigId && (
              <button
                type="button"
                onClick={handleDeleteConfig}
                disabled={isDeleting}
                className="text-slate-400 hover:text-rose-600 transition ml-1 p-0.5"
                title="Xóa cấu hình đang chọn"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setIsSaveModalOpen(true);
            }}
            className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 flex items-center gap-1.5 transition cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-indigo-600" />
            💾 Lưu cấu hình này
          </button>
        </div>
      </div>

      {/* Status Alert Notification */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            statusMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {statusMessage.type === "success" ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* URL Column Selection */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
          1. Chọn Cột chứa URL <span className="text-rose-500">*</span>
        </label>
        <select
          value={urlColIndex || ""}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
              onUrlColChange(val);
            }
          }}
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">-- Bấm để chọn cột URL --</option>
          {columns.map((c) => (
            <option key={c.index} value={c.index}>
              Cột {c.index}: {c.header}
            </option>
          ))}
        </select>
      </div>

      {/* Multi-Field Extraction Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase text-slate-600 flex items-center gap-1.5">
            <span>2. Danh sách các trường cần bóc tách ({currentFields.length})</span>
            <span className="text-rose-500">*</span>
          </label>
          <span className="text-xs text-slate-400">
            Mỗi trường có thể định cấu hình CSS selector và cột đích riêng
          </span>
        </div>

        {currentFields.map((field, fieldIdx) => {
          const targetCol = field.targetColumn;
          const isNewCol = targetCol.mode === "new";
          const colName = targetCol.mode === "new" ? targetCol.colName : "";
          const isColNameEmpty = isNewCol && !colName?.trim();

          return (
            <div
              key={field.id}
              className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4 relative"
            >
              {/* Field Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                    {fieldIdx + 1}
                  </span>
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => handleUpdateFieldName(fieldIdx, e.target.value)}
                    placeholder={`Tên trường (vd: Tiêu đề, Giá, Mô tả)...`}
                    className="font-semibold text-sm text-slate-800 bg-white border border-slate-300 rounded-md px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {currentFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveField(fieldIdx)}
                    className="text-slate-400 hover:text-rose-600 transition flex items-center gap-1 text-xs font-medium cursor-pointer"
                    title="Xóa trường này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa trường
                  </button>
                )}
              </div>

              {/* Selectors List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    3. Danh sách CSS Selector (Fallback theo thứ tự ưu tiên từ trên xuống)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Lấy text của selector đầu tiên khớp
                  </span>
                </div>

                {/* Add selector input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nhập selector mới (vd: h1.title, .price, meta[property='og:title'])..."
                    value={fieldInputs[field.id] || ""}
                    onChange={(e) =>
                      setFieldInputs((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSelector(fieldIdx);
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSelector(fieldIdx)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>

                {/* Chips of active selectors */}
                {field.selectors.length === 0 ? (
                  <p className="text-xs text-amber-600 italic">
                    Chưa có selector nào cho trường này. Vui lòng thêm ít nhất 1 selector.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                    {field.selectors.map((sel, sIdx) => (
                      <div
                        key={sIdx}
                        className="flex items-center justify-between px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-4 h-4 flex items-center justify-center bg-indigo-50 text-indigo-700 font-bold rounded-full text-[10px] shrink-0">
                            {sIdx + 1}
                          </span>
                          <code className="font-mono text-slate-800 truncate">{sel}</code>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelector(fieldIdx, sIdx)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                          title="Xóa selector này"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Target Column Selection */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <span className="text-xs font-medium text-slate-700 block">
                  2. Cột Đích để điền dữ liệu:
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateTargetMode(fieldIdx, "new")}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition cursor-pointer ${
                      isNewCol
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-200/80 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    + Tạo cột mới ở cuối bảng
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateTargetMode(fieldIdx, "existing")}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition cursor-pointer ${
                      !isNewCol
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-200/80 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    Ghi vào cột đã có
                  </button>
                </div>

                {targetCol.mode === "new" ? (
                  <div>
                    <input
                      type="text"
                      placeholder="Nhập tên tiêu đề cột mới (vd: Tieu_De_SP, Gia_Goc)"
                      value={targetCol.colName}
                      onChange={(e) => handleUpdateNewColName(fieldIdx, e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />

                    {/* Informative Callout Text Note */}
                    <div className="mt-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800 flex items-start gap-2">
                      <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>📌 Ghi chú:</strong> Hệ thống sẽ tự động tạo một cột mới có tiêu đề là{" "}
                        <span className="font-semibold underline">
                          {colName?.trim() || "(chưa đặt tên)"}
                        </span>{" "}
                        ở cuối bảng tính Excel để điền nội dung bóc tách được của trường này.
                      </div>
                    </div>

                    {/* Warning if colName is empty */}
                    {isColNameEmpty && (
                      <p className="mt-1 text-xs text-amber-600 font-medium">
                        ⚠️ Vui lòng nhập tên tiêu đề cho cột mới trước khi tiến hành cào.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <select
                      value={targetCol.colIndex}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          handleUpdateExistingColIndex(fieldIdx, val);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {columns.map((c) => (
                        <option key={c.index} value={c.index}>
                          Ghi đè Cột {c.index}: {c.header}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Append New Field Button */}
        <button
          type="button"
          onClick={handleAddField}
          className="w-full py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-indigo-600 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> + Thêm trường cần lấy
        </button>
      </div>

      {/* Row range selection for large files */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-slate-700">Phạm vi dòng cần cào:</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rangeType"
                checked={!customRangeEnabled}
                onChange={() => {
                  setCustomRangeEnabled(false);
                  onRowRangeChange({ startRow: 2, endRow: Math.max(2, totalRows) });
                }}
              />
              <span>Toàn bộ file ({effectiveTotalRows} dòng)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rangeType"
                checked={customRangeEnabled}
                onChange={() => setCustomRangeEnabled(true)}
              />
              <span>Chọn khoảng dòng</span>
            </label>
          </div>
        </div>

        {customRangeEnabled && (
          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-200">
            <span>Từ dòng:</span>
            <input
              type="number"
              min={2}
              max={totalRows}
              value={rowRange.startRow}
              onChange={(e) =>
                onRowRangeChange({
                  ...rowRange,
                  startRow: Math.max(2, parseInt(e.target.value, 10) || 2),
                })
              }
              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span>Đến dòng:</span>
            <input
              type="number"
              min={rowRange.startRow}
              max={totalRows}
              value={rowRange.endRow}
              onChange={(e) =>
                onRowRangeChange({
                  ...rowRange,
                  endRow: Math.min(totalRows, parseInt(e.target.value, 10) || totalRows),
                })
              }
              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-slate-400">
              (Tổng: {Math.max(0, rowRange.endRow - rowRange.startRow + 1)} dòng)
            </span>
          </div>
        )}

        {/* Skip existing data option */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={currentSkipExisting}
              onChange={(e) => handleToggleSkipExisting(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="font-medium text-slate-700">
              Bỏ qua các cột/ô đã có dữ liệu
            </span>
          </label>
          <span className="text-[11px] text-slate-500">
            (Mặc định: không cào lại và không ghi đè nếu cột đích đã có dữ liệu)
          </span>
        </div>

        {/* Pre-interaction click button option */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={interactionEnabled}
                onChange={(e) => handleToggleInteraction(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="font-medium text-slate-700">
                Tương tác trước khi cào dữ liệu
              </span>
            </label>
            <span className="text-[11px] text-slate-500">
              (Bấm nút submit/xem thêm trước khi lấy nội dung, hỗ trợ trang gọi AJAX hoặc reload)
            </span>
          </div>

          {interactionEnabled && (
            <div className="flex items-center gap-2 pl-6">
              <span className="text-xs text-slate-600 whitespace-nowrap">Selector của nút bấm:</span>
              <input
                type="text"
                value={currentPreClick}
                onChange={(e) => handlePreClickChange(e.target.value)}
                placeholder='button[type="submit"].btn.btn-primary'
                className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Test 1 URL button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onTestRequested}
          className="px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1.5 transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          Test thử selector trên 1 URL mẫu
        </button>
      </div>

      {/* Save Config Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-indigo-600" />
                Lưu cấu hình vào Database
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Lưu cấu hình gồm <strong>{currentFields.length} trường</strong> bóc tách vào Neon
              PostgreSQL để tái sử dụng nhanh chóng bất kỳ lúc nào.
            </p>

            {modalError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfigSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên cấu hình <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Shopee - Tên & Giá Sản phẩm"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả (không bắt buộc)
                </label>
                <textarea
                  placeholder="Ghi chú chi tiết về trang web hoặc mục đích cấu hình..."
                  rows={2}
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition flex items-center gap-1.5"
                >
                  {isSaving ? "Đang lưu..." : "Lưu cấu hình"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
