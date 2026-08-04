"use client";

// FilterSelect — dropdown แบบ custom (Radix, ไม่ใช่ native <select>) เข้าธีม Metronic
// API เหมือน native select: value/onChange(string)/options — จัดการ sentinel ให้ (Radix ห้าม value="")
// ใช้แทน <select> ได้เลย เช่น:
//   <FilterSelect value={fCat} onChange={setFCat}
//     options={[{ value: "", label: "ทุกประเภท" }, ...cats.map(c => ({ value: c, label: c }))]} />

import type { ReactNode } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ALL = "__all__"; // แทน "" เพราะ Radix Select ห้าม value ว่าง

export type FilterOption = { value: string; label: ReactNode };

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  size,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  return (
    <Select
      value={value === "" ? ALL : value}
      onValueChange={(v) => onChange(v === ALL ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || ALL} value={o.value === "" ? ALL : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
