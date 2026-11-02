"use client";
import {
  Children,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type SelectHTMLAttributes,
} from "react";
import { FiCheck, FiChevronDown, FiEdit2, FiPlus, FiX } from "react-icons/fi";
import { optionColor } from "@/lib/option-colors";
import { useFloatingPanel } from "./floating-panel";
type Props = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "multiple" | "size"
> & {
  onChange?: (value: string) => void;
  colors?: Record<string, string>;
  onEditOption?: (value: string) => void;
  onAddOption?: () => void;
};
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      isValidElement<{ children?: ReactNode }>(n)
        ? text(n.props.children)
        : String(n),
    )
    .join("");
}
export default function AppSelect({
  children,
  value,
  defaultValue,
  onChange,
  colors,
  onEditOption,
  onAddOption,
  disabled,
  name,
  id: providedId,
  className = "",
  required,
  ...props
}: Props) {
  const generated = useId(),
    id = providedId || generated,
    popupId = useId(),
    trigger = useRef<HTMLButtonElement>(null);
  const options = Children.toArray(children).flatMap((node) => {
    if (
      !isValidElement<{
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      }>(node)
    )
      return [];
    return [
      {
        value: String(node.props.value ?? text(node.props.children)),
        label: text(node.props.children),
        disabled: node.props.disabled,
      },
    ];
  });
  const [internal, setInternal] = useState(
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const selected = String(value ?? internal),
    current = options.find((o) => o.value === selected),
    blank = options.find((o) => !o.label.trim());
  const { popup, position, open, place, onToggle } = useFloatingPanel(280);
  function choose(next: string) {
    setInternal(next);
    onChange?.(next);
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  function move(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const all = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role="option"]:not(:disabled),.menu-clear:not(:disabled),.menu-add:not(:disabled)',
        ),
      ],
      at = all.indexOf(document.activeElement as HTMLButtonElement),
      next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? all.length - 1
            : event.key === "ArrowDown"
              ? (at + 1) % all.length
              : (at - 1 + all.length) % all.length;
    all[next]?.focus();
  }
  return (
    <>
      <input type="hidden" name={name} value={selected} disabled={disabled} />
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`app-select ${colors ? "has-option-colors" : ""} ${className}`}
        disabled={disabled}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-required={required}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popupId}
        popoverTarget={popupId}
        title={props.title}
        onClick={(e) =>
          place(e.currentTarget, Math.min(320, options.length * 40 + 55), true)
        }
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            place(
              e.currentTarget,
              Math.min(320, options.length * 40 + 55),
              true,
            );
            popup.current?.showPopover();
          }
        }}
      >
        <span
          style={
            optionColor(colors, selected)
              ? { background: optionColor(colors, selected), color: "#fff" }
              : undefined
          }
        >
          {current?.label || "\u00a0"}
        </span>
        <FiChevronDown size={14} />
      </button>
      <div
        ref={popup}
        id={popupId}
        popover="auto"
        className={`app-menu app-select-menu ${className.includes("badge") || colors ? "is-status" : ""}`}
        style={position}
        onToggle={(e) => {
          onToggle(e);
          if (e.newState === "open")
            requestAnimationFrame(() =>
              popup.current
                ?.querySelector<HTMLButtonElement>(
                  '[aria-selected="true"]:not(:disabled),[role="option"]:not(:disabled)',
                )
                ?.focus({ preventScroll: true }),
            );
        }}
        onKeyDown={move}
      >
        <div role="listbox" aria-label={props["aria-label"] || text(children)}>
          {options
            .filter((o) => o.label.trim())
            .map((o) => (
              <div className="app-select-option-row" key={o.value}>
                <button
                  type="button"
                  role="option"
                  data-value={o.value}
                  aria-selected={selected === o.value}
                  disabled={o.disabled}
                  style={
                    {
                      "--option-color": optionColor(colors, o.value),
                    } as CSSProperties
                  }
                  onClick={() => choose(o.value)}
                >
                  <span>{o.label}</span>
                  {selected === o.value && <FiCheck />}
                </button>
                {onEditOption && o.value !== "" && (
                  <button
                    type="button"
                    className="app-select-edit"
                    aria-label={`แก้ไข ${o.label}`}
                    title="แก้ไขชื่อและสี"
                    disabled={o.disabled}
                    onClick={() => {
                      popup.current?.hidePopover();
                      trigger.current?.focus({ preventScroll: true });
                      onEditOption(o.value);
                    }}
                  >
                    <FiEdit2 size={15} />
                  </button>
                )}
              </div>
            ))}
        </div>
        {onAddOption && (
          <button
            type="button"
            className="menu-clear menu-add"
            disabled={disabled}
            onClick={() => {
              popup.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
              onAddOption();
            }}
          >
            <FiPlus />
            เพิ่มสถานะ
          </button>
        )}
        {blank && (
          <button
            type="button"
            className="menu-clear"
            onClick={() => choose(blank.value)}
          >
            <FiX />
            ล้างค่า
          </button>
        )}
      </div>
    </>
  );
}
