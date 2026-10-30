"use client";
import { useId, useRef, useState } from "react";
import { FiFilter, FiPlus, FiX, FiTrash2, FiChevronDown } from "react-icons/fi";
import QuickFilters from "./quick-filters";
import AppSelect from "./app-select";
import DatePicker from "./date-picker";
import { useFloatingPanel } from "./floating-panel";
import {
  emptyFilters,
  filterOperators,
  completeRule,
  matchesAdvanced,
  type TaskFilters,
  type FilterRule,
  type FilterGroup,
  type FilterField,
  type FilterContext,
} from "@/lib/advanced-filters";
import type { Task } from "@/lib/types";
const newRule = (): FilterRule => ({
  id: crypto.randomUUID(),
  column: "",
  operator: "",
  value: "",
  to: "",
});
const newGroup = (): FilterGroup => ({
  id: crypto.randomUUID(),
  match: "all",
  rules: [newRule()],
});
export default function AdvancedFilters({
  value,
  onChange,
  fields,
  tasks,
  context,
  disabled,
  currentUser,
}: {
  value: TaskFilters;
  onChange: (value: TaskFilters) => void;
  fields: FilterField[];
  tasks: Task[];
  context: FilterContext;
  disabled: boolean;
  currentUser: number;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLButtonElement | null>(null),
    [draft, setDraft] = useState(value.advanced),
    [quick, setQuick] = useState(value.quick),
    [mode, setMode] = useState<"quick" | "advanced">("quick"),
    { popup, position, place, open, onToggle } = useFloatingPanel(850),
    count = [...value.advanced.groups, ...value.quick.groups].reduce(
      (sum, g) => sum + g.rules.length,
      0,
    ),
    rules = draft.groups.flatMap((g) => g.rules),
    invalid =
      mode === "advanced" && rules.some((r) => !completeRule(r, fields)),
    shown = tasks.filter(
      (t) =>
        matchesAdvanced(
          t,
          mode === "quick" ? value.advanced : draft,
          fields,
          context,
        ) && matchesAdvanced(t, quick, fields, context),
    ).length;
  function groupChange(id: string, change: Partial<FilterGroup>) {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((g) =>
        g.id === id ? { ...g, ...change } : g,
      ),
    }));
  }
  function ruleChange(group: string, id: string, change: Partial<FilterRule>) {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((g) =>
        g.id === group
          ? {
              ...g,
              rules: g.rules.map((r) =>
                r.id === id ? { ...r, ...change } : r,
              ),
            }
          : g,
      ),
    }));
  }
  function close() {
    popup.current?.hidePopover();
    (opener.current || trigger.current)?.focus({ preventScroll: true });
  }
  function prepare(next: "quick" | "advanced") {
    setMode(next);
    setDraft(
      value.advanced.groups.length
        ? structuredClone(value.advanced)
        : next === "advanced"
          ? { match: "all", groups: [newGroup()] }
          : emptyFilters,
    );
    setQuick(structuredClone(value.quick));
  }
  function switchMode(next: "quick" | "advanced") {
    setMode(next);
    if (next === "quick") setQuick(value.quick);
    if (next === "advanced" && !draft.groups.length)
      setDraft({ match: "all", groups: [newGroup()] });
  }
  return (
    <>
      <div className="filter-split">
        <button
          type="button"
          ref={trigger}
          className={`advanced-filter-trigger ${count ? "has-filters" : ""}`}
          aria-label="ตัวกรอง"
          aria-haspopup="dialog"
          aria-expanded={open && mode === "quick"}
          aria-controls={id}
          popoverTarget={id}
          popoverTargetAction="show"
          disabled={disabled}
          onClick={(e) => {
            if (open && mode === "quick") {
              e.preventDefault();
              close();
              return;
            }
            opener.current = e.currentTarget;
            prepare("quick");
            place(e.currentTarget, Math.min(innerHeight - 16, 490));
          }}
        >
          <FiFilter />
          <span>ตัวกรอง</span>
          {count > 0 && <b>{count}</b>}
        </button>
        <button
          type="button"
          className="filter-mode-trigger"
          disabled={disabled}
          aria-label="ตัวกรองขั้นสูง"
          aria-haspopup="dialog"
          aria-expanded={open && mode === "advanced"}
          aria-controls={id}
          popoverTarget={id}
          popoverTargetAction="show"
          onClick={(e) => {
            if (open && mode === "advanced") {
              e.preventDefault();
              close();
              return;
            }
            opener.current = e.currentTarget;
            prepare("advanced");
            place(e.currentTarget, Math.min(innerHeight - 16, 490));
          }}
        >
          <FiChevronDown size={15} />
        </button>
      </div>
      <div
        id={id}
        ref={popup}
        popover="auto"
        className="advanced-filter-panel"
        role="dialog"
        aria-label={mode === "quick" ? "ตัวกรองแบบรวดเร็ว" : "ตัวกรองขั้นสูง"}
        style={position}
        onToggle={onToggle}
        data-pdf-exclude="true"
      >
        <header>
          <div>
            <h3>
              <FiFilter />
              {mode === "quick" ? "ตัวกรองแบบรวดเร็ว" : "ตัวกรองขั้นสูง"}
            </h3>
            <p>
              แสดง {shown} จาก {tasks.length} งาน
              {invalid ? " · ยังมีเงื่อนไขที่ไม่ครบ" : ""}
            </p>
          </div>
          <div className="advanced-header-actions">
            <button
              type="button"
              onClick={() => {
                setDraft(emptyFilters);
                setQuick(emptyFilters);
                if (mode === "quick")
                  onChange({ advanced: emptyFilters, quick: emptyFilters });
              }}
            >
              ล้างทั้งหมด
            </button>
            <button type="button" aria-label="ปิดตัวกรอง" onClick={close}>
              <FiX size={19} />
            </button>
          </div>
        </header>
        <div
          className="filter-mode-tabs"
          role="tablist"
          aria-label="รูปแบบตัวกรอง"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "quick"}
            onClick={() => switchMode("quick")}
          >
            แบบรวดเร็ว
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "advanced"}
            onClick={() => switchMode("advanced")}
          >
            ขั้นสูง
          </button>
        </div>
        <div className="advanced-filter-body">
          {mode === "quick" ? (
            <QuickFilters
              value={quick}
              onChange={(next) => {
                setQuick(next);
                onChange({ advanced: value.advanced, quick: next });
              }}
              advanced={value.advanced}
              fields={fields}
              tasks={tasks}
              context={context}
              currentUser={currentUser}
            />
          ) : (
            <>
              {draft.groups.length > 1 && (
                <div className="advanced-combine">
                  <span>รวมผลแต่ละกลุ่มแบบ</span>
                  <AppSelect
                    aria-label="วิธีรวมกลุ่มตัวกรอง"
                    value={draft.match}
                    onChange={(match) =>
                      setDraft((current) => ({
                        ...current,
                        match: match as "all" | "any",
                      }))
                    }
                  >
                    <option value="all">ทั้งหมด (AND)</option>
                    <option value="any">อย่างใดอย่างหนึ่ง (OR)</option>
                  </AppSelect>
                </div>
              )}
              {draft.groups.map((group, index) => (
                <section
                  key={group.id}
                  className="advanced-filter-group"
                  aria-label={`กลุ่มตัวกรอง ${index + 1}`}
                >
                  <div className="advanced-group-heading">
                    <strong>กลุ่ม {index + 1}</strong>
                    <AppSelect
                      aria-label={`วิธีรวมเงื่อนไข กลุ่ม ${index + 1}`}
                      value={group.match}
                      onChange={(match) =>
                        groupChange(group.id, { match: match as "all" | "any" })
                      }
                    >
                      <option value="all">ตรงกับทุกเงื่อนไข (AND)</option>
                      <option value="any">ตรงกับเงื่อนไขใดก็ได้ (OR)</option>
                    </AppSelect>
                    <button
                      type="button"
                      className="advanced-remove"
                      aria-label={`ลบกลุ่มตัวกรอง ${index + 1}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          groups: current.groups.filter(
                            (g) => g.id !== group.id,
                          ),
                        }))
                      }
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                  {group.rules.map((rule, row) => {
                    const field = fields.find((f) => f.id === rule.column),
                      noValue = ["empty", "not_empty"].includes(rule.operator),
                      range = ["between", "overlaps"].includes(rule.operator);
                    return (
                      <div className="advanced-filter-rule" key={rule.id}>
                        <AppSelect
                          aria-label={`คอลัมน์ กลุ่ม ${index + 1} เงื่อนไข ${row + 1}`}
                          value={rule.column}
                          onChange={(column) => {
                            const field = fields.find((f) => f.id === column);
                            ruleChange(group.id, rule.id, {
                              column,
                              operator: field
                                ? filterOperators(field.type)[0].value
                                : "",
                              value: "",
                              to: "",
                            });
                          }}
                        >
                          <option value="">เลือกคอลัมน์</option>
                          {fields.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </AppSelect>
                        <AppSelect
                          aria-label={`เงื่อนไข กลุ่ม ${index + 1} แถว ${row + 1}`}
                          disabled={!field}
                          value={rule.operator}
                          onChange={(operator) =>
                            ruleChange(group.id, rule.id, { operator })
                          }
                        >
                          {!field && <option value="">เลือกเงื่อนไข</option>}
                          {field &&
                            filterOperators(field.type).map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                        </AppSelect>
                        <div className="advanced-rule-value">
                          {noValue ? (
                            <span className="advanced-no-value">
                              ไม่ต้องระบุค่า
                            </span>
                          ) : field &&
                            ["date", "timeline"].includes(field.type) ? (
                            <>
                              <DatePicker
                                aria-label={`วันที่เริ่ม กลุ่ม ${index + 1} แถว ${row + 1}`}
                                value={rule.value}
                                max={range && rule.to ? rule.to : undefined}
                                onChange={(value) =>
                                  ruleChange(group.id, rule.id, { value })
                                }
                              />
                              {range && (
                                <>
                                  <span>ถึง</span>
                                  <DatePicker
                                    aria-label={`วันที่สิ้นสุด กลุ่ม ${index + 1} แถว ${row + 1}`}
                                    value={rule.to}
                                    min={rule.value || undefined}
                                    onChange={(to) =>
                                      ruleChange(group.id, rule.id, { to })
                                    }
                                  />
                                </>
                              )}
                            </>
                          ) : field &&
                            [
                              "people",
                              "status",
                              "select",
                              "multiselect",
                              "checkbox",
                            ].includes(field.type) ? (
                            <AppSelect
                              aria-label={`ค่า กลุ่ม ${index + 1} แถว ${row + 1}`}
                              value={rule.value}
                              onChange={(value) =>
                                ruleChange(group.id, rule.id, { value })
                              }
                            >
                              <option value="">เลือกค่า</option>
                              {field.options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </AppSelect>
                          ) : (
                            <>
                              <input
                                aria-label={`ค่า กลุ่ม ${index + 1} แถว ${row + 1}`}
                                type="text"
                                inputMode={
                                  field?.type === "number" ? "decimal" : "text"
                                }
                                placeholder={
                                  field?.type === "number"
                                    ? "ระบุตัวเลข"
                                    : "พิมพ์ค่าที่ต้องการ"
                                }
                                disabled={!field}
                                value={rule.value}
                                onChange={(e) =>
                                  ruleChange(group.id, rule.id, {
                                    value: e.target.value,
                                  })
                                }
                              />
                              {range && (
                                <>
                                  <span>ถึง</span>
                                  <input
                                    aria-label={`ค่าสิ้นสุด กลุ่ม ${index + 1} แถว ${row + 1}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={rule.to}
                                    placeholder="ค่าสิ้นสุด"
                                    onChange={(e) =>
                                      ruleChange(group.id, rule.id, {
                                        to: e.target.value,
                                      })
                                    }
                                  />
                                </>
                              )}
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          className="advanced-remove"
                          aria-label={`ลบเงื่อนไข ${row + 1} กลุ่ม ${index + 1}`}
                          onClick={() =>
                            groupChange(group.id, {
                              rules: group.rules.filter(
                                (r) => r.id !== rule.id,
                              ),
                            })
                          }
                        >
                          <FiX />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="advanced-add"
                    onClick={() =>
                      groupChange(group.id, {
                        rules: [...group.rules, newRule()],
                      })
                    }
                  >
                    <FiPlus />
                    เพิ่มเงื่อนไข
                  </button>
                </section>
              ))}
              <button
                type="button"
                className="advanced-add"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    groups: [...current.groups, newGroup()],
                  }))
                }
              >
                <FiPlus />
                เพิ่มกลุ่มเงื่อนไข
              </button>
            </>
          )}
        </div>
        <footer>
          <span>
            {invalid
              ? "เลือกคอลัมน์ เงื่อนไข และค่าให้ครบก่อนนำไปใช้"
              : mode === "quick"
                ? "ตัวกรองแบบรวดเร็วมีผลทันที · ใช้ร่วมกับตัวกรองขั้นสูงได้"
                : "เงื่อนไขจะมีผลเมื่อกดนำไปใช้"}
          </span>
          {mode === "advanced" && (
            <button type="button" onClick={close}>
              ยกเลิก
            </button>
          )}
          <button
            type="button"
            className="advanced-apply"
            disabled={invalid}
            onClick={() => {
              if (mode === "quick") {
                close();
                return;
              }
              onChange(
                structuredClone({
                  advanced: {
                    ...draft,
                    groups: draft.groups
                      .map((g) => ({
                        ...g,
                        rules: g.rules.filter((r) => completeRule(r, fields)),
                      }))
                      .filter((g) => g.rules.length),
                  },
                  quick,
                }),
              );
              close();
            }}
          >
            {mode === "quick" ? "เสร็จสิ้น" : "นำไปใช้"}
          </button>
        </footer>
      </div>
    </>
  );
}
