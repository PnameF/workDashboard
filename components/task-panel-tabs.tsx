"use client";
import { FiList, FiMessageSquare } from "react-icons/fi";
export default function TaskPanelTabs({
  active,
  onChange,
  id,
}: {
  active: "details" | "updates";
  onChange: (tab: "details" | "updates") => void;
  id: string;
}) {
  return (
    <div
      className="task-panel-tabs"
      role="tablist"
      aria-label="ข้อมูลงาน"
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const next =
          e.key === "Home"
            ? "details"
            : e.key === "End"
              ? "updates"
              : active === "details"
                ? "updates"
                : "details";
        onChange(next);
        e.currentTarget
          .querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
          ?.focus();
      }}
    >
      {(["details", "updates"] as const).map((tab) => (
        <button
          type="button"
          key={tab}
          data-tab={tab}
          role="tab"
          id={`${id}-${tab}`}
          aria-controls={`${id}-panel`}
          aria-selected={active === tab}
          tabIndex={active === tab ? 0 : -1}
          onClick={() => onChange(tab)}
        >
          {tab === "details" ? <FiList /> : <FiMessageSquare />}
          {tab === "details" ? "รายละเอียด" : "อัปเดต"}
        </button>
      ))}
    </div>
  );
}
