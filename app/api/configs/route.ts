import { NextRequest, NextResponse } from "next/server";
import { getSavedConfigs, createSavedConfig } from "@/lib/db";

export async function GET() {
  try {
    const configs = await getSavedConfigs();
    return NextResponse.json({ success: true, configs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi tải danh sách cấu hình từ database.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Dữ liệu JSON không hợp lệ." },
      { status: 400 }
    );
  }

  try {
    const { name, description, fields } = body || {};

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Tên cấu hình không được để trống." },
        { status: 400 }
      );
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cấu hình phải có ít nhất 1 trường bóc tách." },
        { status: 400 }
      );
    }

    const config = await createSavedConfig(name, description, fields);
    return NextResponse.json({ success: true, config }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi lưu cấu hình vào database.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
