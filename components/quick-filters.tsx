"use client";
import { useState } from "react";
import { FiSearch, FiCheck } from "react-icons/fi";
import { quickOptions } from "@/lib/quick-filters";
import {
  matchesAdvanced,
  matchesRule,
  type AdvancedFilter,
  type FilterField,
  type FilterContext,
} from "@/lib/advanced-filters";
import type { Task } from "@/lib/types";
export default function QuickFilters({
  value,
  onChange,
  advanced,
  fields,
  tasks,
  context,
  currentUser,
}: {
  value: AdvancedFilter;
  onChange: (value: AdvancedFilter) => void;
  advanced: AdvancedFilter;
  fields: FilterField[];
  tasks: Task[];
  context: FilterContext;
  currentUser: number;
}) {
  const [query, setQuery] = useState("");
  return (
    <>
      <div className="quick-filter-heading">
        <strong>ทุกคอลัมน์</strong>
        <label>
          <FiSearch />
          <input
            aria-label="ค้นหาคอลัมน์ตัวกรอง"
            placeholder="ค้นหาคอลัมน์..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="quick-filter-hint">
        เลือกหลายค่าในคอลัมน์เดียวกันเป็น OR · ต่างคอลัมน์เป็น AND
      </p>
      <div className="quick-filter-columns">
        {fields
          .filter((field) =>
            field.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          .map((field) => {
            const groupId = "quick:" + field.id,
              group = value.groups.find((g) => g.id === groupId),
              other = {
                ...value,
                groups: value.groups.filter((g) => g.id !== groupId),
              },
              available = tasks.filter(
                (t) =>
                  matchesAdvanced(t, advanced, fields, context) &&
                  matchesAdvanced(t, other, fields, context),
              );
            return (
              <section
                className="quick-filter-column"
                key={field.id}
                aria-label={`กรอง ${field.name}`}
              >
                <h4>{field.name}</h4>
                <div>
                  {quickOptions(
                    field,
                    tasks,
                    context,
                    undefined,
                    currentUser,
                  ).map((option) => {
                    const selected = !!group?.rules.some(
                        (r) => r.id === option.id,
                      ),
                      count = available.filter((t) =>
                        matchesRule(t, option, field, context),
                      ).length;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        aria-pressed={selected}
                        onClick={() => {
                          const rules = selected
                            ? (group?.rules || []).filter(
                                (r) => r.id !== option.id,
                              )
                            : [...(group?.rules || []), option];
                          onChange({
                            match: "all",
                            groups: [
                              ...value.groups.filter((g) => g.id !== groupId),
                              ...(rules.length
                                ? [
                                    {
                                      id: groupId,
                                      match: "any" as const,
                                      rules,
                                    },
                                  ]
                                : []),
                            ],
                          });
                        }}
                      >
                        <span>{option.label}</span>
                        <small>{count}</small>
                        {selected && <FiCheck size={12} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </>
  );
}
