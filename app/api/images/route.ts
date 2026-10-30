import { checkAccess } from "@/lib/auth";
import { getDb, getBucket, getPublicFileUrl } from "@/lib/db";
import { allowedFileTypes, MAX_FILE_SIZE } from "@/lib/files";
export async function POST(request: Request) {
  const authError = await checkAccess(request);
  if (authError) return authError;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const taskId = form.get("taskId");
    const columnId = form.get("columnId") ?? "images";
    if (
      !(file instanceof File) ||
      typeof taskId !== "string" ||
      typeof columnId !== "string" ||
      columnId.length > 100 ||
      !allowedFileTypes.includes(file.type) ||
      file.size > MAX_FILE_SIZE ||
      file.size === 0
    )
      return Response.json(
        {
          error:
            "รองรับรูปภาพ PDF, TXT และไฟล์ Office ขนาดไม่เกิน 2 MB ต่อไฟล์",
        },
        { status: 400 },
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = Array.from(bytes.slice(0, 12));
    const isPng =
      signature.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
    const isJpg =
      signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    const isGif = new TextDecoder()
      .decode(bytes.slice(0, 6))
      .match(/^GIF8[79]a$/);
    const isWebp =
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    const isOffice = file.type.startsWith("application/vnd.openxmlformats");
    if (
      isImage &&
      !{
        "image/png": isPng,
        "image/jpeg": isJpg,
        "image/gif": !!isGif,
        "image/webp": isWebp,
      }[file.type]
    )
      return Response.json(
        { error: "เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพ" },
        { status: 400 },
      );
    if (
      (isPdf && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") ||
      (isOffice &&
        !(
          bytes[0] === 80 &&
          bytes[1] === 75 &&
          bytes[2] === 3 &&
          bytes[3] === 4
        ))
    )
      return Response.json(
        { error: "เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์" },
        { status: 400 },
      );
    const [db, bucket] = await Promise.all([getDb(), getBucket()]);
    const task = await db
      .prepare("SELECT id FROM tasks WHERE id=?")
      .bind(taskId)
      .first();
    if (!task) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
    if (columnId !== "images") {
      const custom = await db
        .prepare("SELECT type FROM custom_columns WHERE id=?")
        .bind(columnId)
        .first<{ type: string }>();
      const settings = await db
        .prepare("SELECT layout FROM board_settings WHERE id=1")
        .first<{ layout: string }>();
      const override = settings
        ? JSON.parse(settings.layout).overrides?.[columnId]
        : null;
      if (custom?.type !== "files" && override?.type !== "files")
        return Response.json(
          { error: "คอลัมน์นี้ไม่ใช่ไทป์ Files" },
          { status: 400 },
        );
    }
    const id = crypto.randomUUID();
    const url = await getPublicFileUrl(id);
    await bucket.put(id, bytes, {
      httpMetadata: { contentType: file.type },
    });
    try {
      await db
        .prepare(
          "INSERT INTO attachments(id,task_id,name,content_type,size,column_id,url) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          taskId,
          file.name.slice(0, 250),
          file.type,
          file.size,
          columnId,
          url,
        )
        .run();
    } catch (error) {
      await bucket.delete(id);
      throw error;
    }
    return Response.json(
      {
        id,
        task_id: taskId,
        name: file.name,
        content_type: file.type,
        size: file.size,
        column_id: columnId,
        url,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("R2 upload failed", error);
    return Response.json(
      { error: "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง" },
      { status: 500 },
    );
  }
}
