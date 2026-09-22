import { NextRequest, NextResponse } from "next/server";
import { updateSavedConfig, deleteSavedConfig } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID không hợp lệ." }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, fields } = body || {};

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Tên cấu hình không được để trống." }, { status: 400 });
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ success: false, error: "Cấu hình phải có ít nhất 1 trường bóc tách." }, { status: 400 });
    }

    const updated = await updateSavedConfig(id, name, description, fields);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Không tìm thấy cấu hình để cập nhật." }, { status: 404 });
    }

    return NextResponse.json({ success: true, config: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi cập nhật cấu hình.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID không hợp lệ." }, { status: 400 });
    }

    const success = await deleteSavedConfig(id);
    if (!success) {
      return NextResponse.json({ success: false, error: "Không tìm thấy cấu hình để xóa." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi xóa cấu hình.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
