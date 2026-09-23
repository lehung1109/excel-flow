import { NextRequest, NextResponse } from "next/server";
import { getTempFile } from "@/lib/temp-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = getTempFile(id);

  if (!file) {
    return NextResponse.json(
      { error: "File not found or expired" },
      { status: 404 }
    );
  }

  const cleanFilename = file.filename.replace(/[\r\n"]/g, "_");
  const encodedFilename = encodeURIComponent(cleanFilename);

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${cleanFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": file.buffer.length.toString(),
    },
  });
}
