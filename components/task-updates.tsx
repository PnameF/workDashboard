"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  FiBold,
  FiItalic,
  FiList,
  FiLink,
  FiSmile,
  FiSend,
  FiEdit2,
  FiTrash2,
  FiMessageSquare,
  FiShield,
  FiImage,
  FiX,
} from "react-icons/fi";
import type { TaskUpdate } from "@/lib/task-updates";
import { nameInitials } from "@/lib/auth-types";
import UpdateMarkdown from "./update-markdown";
import ImageViewer from "./image-viewer";
import type { Attachment } from "@/lib/types";
import {
  MAX_UPDATE_IMAGES,
  updateImageTypes,
  validUpdateImage,
} from "@/lib/update-images";
export default function TaskUpdates({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<TaskUpdate[]>([]),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [body, setBody] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [confirm, setConfirm] = useState<string | null>(null),
    [next, setNext] = useState<string | null>(null),
    [emoji, setEmoji] = useState(false),
    [retry, setRetry] = useState(0),
    area = useRef<HTMLTextAreaElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    urls = useRef(new Set<string>()),
    [images, setImages] = useState<{ file: File; url: string; id: string }[]>(
      [],
    ),
    [preview, setPreview] = useState<Attachment | null>(null);
  useEffect(() => {
    const current = urls.current;
    return () => {
      for (const url of current) URL.revokeObjectURL(url);
    };
  }, []);
  function clearImages() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setImages([]);
  }
  const endpoint = "/api/tasks/" + encodeURIComponent(taskId) + "/updates";
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, {
            signal: controller.signal,
            cache: "no-store",
          }),
          data = await response.json();
        if (!response.ok) throw Error(data.error || "โหลดอัปเดตไม่สำเร็จ");
        setItems(data.items);
        setError("");
        setNext(data.nextCursor);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "โหลดอัปเดตไม่สำเร็จ",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, taskId, retry]);
  async function request(method: string, payload?: unknown, url = endpoint) {
    const response = await fetch(url, {
        method,
        headers:
          payload && !(payload instanceof FormData)
            ? { "Content-Type": "application/json" }
            : undefined,
        body:
          payload instanceof FormData
            ? payload
            : payload
              ? JSON.stringify(payload)
              : undefined,
        cache: "no-store",
      }),
      data = await response.json();
    if (!response.ok) throw Error(data.error || "ดำเนินการไม่สำเร็จ");
    return data;
  }
  async function send() {
    if (
      (!body.trim() &&
        !images.length &&
        !(
          editing && items.find((item) => item.id === editing)?.images?.length
        )) ||
      pending ||
      loading
    )
      return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("body", body);
      for (const image of images) form.append("images", image.file);
      const item: TaskUpdate = await request(
        editing ? "PATCH" : "POST",
        editing ? { body, updateId: editing } : images.length ? form : { body },
      );
      setItems((current) =>
        editing
          ? current.map((c) => (c.id === item.id ? item : c))
          : [item, ...current.filter((c) => c.id !== item.id)],
      );
      setBody("");
      setEditing(null);
      clearImages();
    } catch (error) {
      setError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }
  function insert(before: string, after = "", placeholder = "") {
    const input = area.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd,
      text = body.slice(start, end) || placeholder,
      next = body.slice(0, start) + before + text + after + body.slice(end);
    if (next.length > 10000) return;
    setBody(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        start + before.length,
        start + before.length + text.length,
      );
    });
  }
  if (!taskId)
    return (
      <div className="updates-empty">
        <FiMessageSquare />
        <p>บันทึกงานก่อนเพื่อเริ่มเขียนอัปเดต</p>
      </div>
    );
  return (
    <section className="task-updates" aria-label="อัปเดตงาน">
      <div className="update-composer">
        <div
          className="update-toolbar"
          role="toolbar"
          aria-label="จัดรูปแบบข้อความ"
        >
          <button
            type="button"
            aria-label="ตัวหนา"
            title="ตัวหนา"
            onClick={() => insert("**", "**", "ข้อความ")}
          >
            <FiBold />
          </button>
          <button
            type="button"
            aria-label="ตัวเอียง"
            title="ตัวเอียง"
            onClick={() => insert("*", "*", "ข้อความ")}
          >
            <FiItalic />
          </button>
          <button
            type="button"
            aria-label="รายการหัวข้อ"
            title="รายการหัวข้อ"
            onClick={() => insert("\n- ", "", "รายการ")}
          >
            <FiList />
          </button>
          <button
            type="button"
            aria-label="แทรกลิงก์"
            title="แทรกลิงก์"
            onClick={() =>
              insert("[", "](https://example.com)", "ข้อความลิงก์")
            }
          >
            <FiLink />
          </button>
          <span>รองรับตัวหนา ตัวเอียง รายการ และลิงก์</span>
        </div>
        <textarea
          ref={area}
          aria-label="เขียนอัปเดต"
          placeholder="แชร์ความคืบหน้า หรือพูดคุยเกี่ยวกับงานนี้…"
          maxLength={10000}
          value={body}
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
        />
        {emoji && (
          <div className="update-emojis">
            {["😀", "🎉", "👍", "✅", "🔥", "🙏", "💡", "🚀"].map((char) => (
              <button
                type="button"
                key={char}
                aria-label={`เพิ่ม ${char}`}
                onClick={() => {
                  insert(char);
                  setEmoji(false);
                }}
              >
                {char}
              </button>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="update-draft-images">
            {images.map((image) => (
              <div key={image.id}>
                <button
                  type="button"
                  aria-label={`ดูรูปที่แนบ ${image.file.name}`}
                  onClick={() =>
                    setPreview({
                      id: image.id,
                      task_id: taskId,
                      url: image.url,
                      name: image.file.name,
                      size: image.file.size,
                      content_type: image.file.type,
                    })
                  }
                >
                  <Image
                    src={image.url}
                    alt={image.file.name}
                    width={90}
                    height={75}
                    unoptimized
                  />
                </button>
                <button
                  type="button"
                  className="remove-update-image"
                  aria-label={`นำรูป ${image.file.name} ออก`}
                  disabled={pending}
                  onClick={() => {
                    URL.revokeObjectURL(image.url);
                    urls.current.delete(image.url);
                    setImages((current) =>
                      current.filter((file) => file.id !== image.id),
                    );
                  }}
                >
                  <FiX size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={updateImageTypes.join(",")}
          multiple
          hidden
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            e.target.value = "";
            if (
              images.length + selected.length > MAX_UPDATE_IMAGES ||
              selected.some((file) => !validUpdateImage(file))
            ) {
              setError(
                "แนบได้สูงสุด 6 รูป รองรับ JPG, PNG, WebP, GIF รูปละไม่เกิน 2MB",
              );
              return;
            }
            setError("");
            setImages((current) => [
              ...current,
              ...selected.map((file) => {
                const url = URL.createObjectURL(file);
                urls.current.add(url);
                return { file, url, id: crypto.randomUUID() };
              }),
            ]);
          }}
        />
        <div className="update-composer-footer">
          <button
            type="button"
            aria-label="แนบรูปในอัปเดต"
            title={
              editing ? "แนบรูปในอัปเดตใหม่" : "แนบรูป · ไม่เกิน 2MB ต่อรูป"
            }
            disabled={pending || !!editing}
            onClick={() => fileInput.current?.click()}
          >
            <FiImage size={19} />
          </button>
          <button
            type="button"
            aria-label="เลือกอีโมจิ"
            aria-expanded={emoji}
            onClick={() => setEmoji(!emoji)}
          >
            <FiSmile size={19} />
          </button>
          <small>{body.length.toLocaleString()} / 10,000</small>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setBody("");
              }}
            >
              ยกเลิกแก้ไข
            </button>
          )}
          <button
            type="button"
            className="update-send"
            disabled={
              loading ||
              pending ||
              (!body.trim() &&
                !images.length &&
                !(
                  editing &&
                  items.find((item) => item.id === editing)?.images?.length
                ))
            }
            onClick={() => void send()}
          >
            <FiSend />
            {pending ? "กำลังบันทึก…" : editing ? "บันทึกแก้ไข" : "อัปเดต"}
          </button>
        </div>
      </div>
      {error && (
        <div className="updates-error" role="alert">
          {error}
          {loading === false && items.length === 0 && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setLoading(true);
                setRetry((n) => n + 1);
              }}
            >
              ลองใหม่
            </button>
          )}
        </div>
      )}
      {loading ? (
        <p className="updates-loading" role="status">
          กำลังโหลดอัปเดต…
        </p>
      ) : !items.length ? (
        <div className="updates-empty">
          <FiMessageSquare />
          <strong>เริ่มการอัปเดตแรกของงานนี้</strong>
          <p>เก็บความคืบหน้าและบทสนทนาไว้ในที่เดียว</p>
        </div>
      ) : (
        <div className="update-feed">
          {items.map((item) => (
            <article className="update-card" key={item.id}>
              <header>
                <span className="update-author-avatar">
                  {item.avatarUrl ? (
                    <Image
                      src={item.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                    />
                  ) : item.isAdmin ? (
                    <FiShield />
                  ) : (
                    nameInitials(item.authorName)
                  )}
                </span>
                <div>
                  <strong>{item.authorName}</strong>
                  <time dateTime={new Date(item.created_at).toISOString()}>
                    {new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Bangkok",
                    }).format(new Date(item.created_at))}
                    {item.updated_at > item.created_at ? " · แก้ไขแล้ว" : ""}
                  </time>
                </div>
                {item.canEdit && (
                  <div className="update-card-actions">
                    <button
                      type="button"
                      aria-label={`แก้ไขอัปเดตของ ${item.authorName}`}
                      disabled={pending}
                      onClick={() => {
                        setEditing(item.id);
                        clearImages();
                        setBody(item.body);
                        area.current?.focus();
                        area.current?.scrollIntoView({
                          block: "nearest",
                          behavior: "smooth",
                        });
                      }}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      aria-label={`ลบอัปเดตของ ${item.authorName}`}
                      disabled={pending}
                      onClick={() => setConfirm(item.id)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                )}
              </header>
              <UpdateMarkdown text={item.body} />
              {!!item.images?.length && (
                <div className="update-post-images">
                  {item.images.map((file) => (
                    <button
                      type="button"
                      key={file.id}
                      aria-label={`ดูรูป ${file.name}`}
                      onClick={() => setPreview(file)}
                    >
                      <Image
                        src={file.url || `/api/files/${file.id}`}
                        alt={file.name}
                        width={160}
                        height={120}
                        unoptimized
                      />
                    </button>
                  ))}
                </div>
              )}
              {confirm === item.id && (
                <div className="update-delete-confirm">
                  <span>ลบอัปเดตนี้หรือไม่?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirm(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={async () => {
                      setPending(true);
                      setError("");
                      try {
                        await request("DELETE", { updateId: item.id });
                        setItems((current) =>
                          current.filter((c) => c.id !== item.id),
                        );
                        if (editing === item.id) {
                          setEditing(null);
                          setBody("");
                        }
                        setConfirm(null);
                      } catch (error) {
                        setError(
                          error instanceof Error
                            ? error.message
                            : "ลบไม่สำเร็จ",
                        );
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    ลบ
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {next && !loading && (
        <button
          type="button"
          className="updates-more"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              const data = await request(
                "GET",
                undefined,
                endpoint + "?before=" + encodeURIComponent(next),
              );
              setItems((current) => [
                ...current,
                ...data.items.filter(
                  (item: TaskUpdate) =>
                    !current.some((old) => old.id === item.id),
                ),
              ]);
              setNext(data.nextCursor);
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "โหลดไม่สำเร็จ",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          โหลดอัปเดตก่อนหน้า
        </button>
      )}
      {preview && (
        <ImageViewer file={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
