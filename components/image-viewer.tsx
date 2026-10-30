"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FiDownload, FiMinus, FiPlus, FiX } from "react-icons/fi";
import type { Attachment } from "@/lib/types";
export default function ImageViewer({
  file,
  onClose,
}: {
  file: Attachment;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function zoomTo(value: number) {
    const next = Math.max(0.25, Math.min(4, value)),
      element = stage.current;
    const centerX = element
        ? (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth
        : 0.5,
      centerY = element
        ? (element.scrollTop + element.clientHeight / 2) / element.scrollHeight
        : 0.5;
    setZoom(next);
    requestAnimationFrame(() => {
      if (element) {
        element.scrollLeft =
          centerX * element.scrollWidth - element.clientWidth / 2;
        element.scrollTop =
          centerY * element.scrollHeight - element.clientHeight / 2;
      }
    });
  }
  return (
    <dialog
      ref={dialog}
      className="image-lightbox"
      aria-label={`ดูรูป ${file.name}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <header className="lightbox-header">
        <div>
          <strong>{file.name}</strong>
          <small>{(file.size / 1024).toFixed(0)} KB</small>
        </div>
        <button type="button" aria-label="ปิดรูปภาพ" onClick={onClose}>
          <FiX size={22} />
        </button>
      </header>
      <div className="lightbox-stage" ref={stage}>
        <div
          className="lightbox-canvas"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
          onDoubleClick={() => zoomTo(zoom === 1 ? 2 : 1)}
        >
          <Image
            src={file.url || `/api/files/${file.id}`}
            alt={file.name}
            fill
            unoptimized
            sizes="94vw"
            style={{ objectFit: "contain" }}
            draggable={false}
          />
        </div>
      </div>
      <footer className="lightbox-controls">
        <button
          type="button"
          aria-label="ซูมออก"
          disabled={zoom <= 0.25}
          onClick={() => zoomTo(zoom - 0.25)}
        >
          <FiMinus />
        </button>
        <input
          type="range"
          min="25"
          max="400"
          step="25"
          value={Math.round(zoom * 100)}
          aria-label="ระดับซูม"
          onChange={(e) => zoomTo(Number(e.target.value) / 100)}
        />
        <button
          type="button"
          aria-label="ซูมเข้า"
          disabled={zoom >= 4}
          onClick={() => zoomTo(zoom + 0.25)}
        >
          <FiPlus />
        </button>
        <button
          type="button"
          className="zoom-percent"
          onClick={() => zoomTo(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <a
          href={`/api/files/${file.id}`}
          download={file.name}
          aria-label="ดาวน์โหลดรูปภาพ"
        >
          <FiDownload />
        </a>
      </footer>
    </dialog>
  );
}
