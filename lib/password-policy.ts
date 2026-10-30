export const passwordRequirements = [
  { label: "อย่างน้อย 8 ตัวอักษร", test: (s: string) => s.length >= 8 },
  { label: "ตัวพิมพ์ใหญ่ A–Z", test: (s: string) => /[A-Z]/.test(s) },
  { label: "ตัวพิมพ์เล็ก a–z", test: (s: string) => /[a-z]/.test(s) },
  { label: "ตัวเลข 0–9", test: (s: string) => /[0-9]/.test(s) },
  {
    label: "อักขระพิเศษ เช่น ! @ #",
    test: (s: string) => /[\p{P}\p{S}]/u.test(s),
  },
];
export function validPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    passwordRequirements.every((r) => r.test(value))
  );
}
export function validRecoveryCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}
export const passwordHint =
  "รหัสผ่านอย่างน้อย 8 ตัวอักษร มีตัวใหญ่ ตัวเล็ก ตัวเลข และอักขระพิเศษ อย่างละ 1 ตัว";
export function roleForEmail(email: string): "admin" | "member" {
  return email.trim().toLowerCase() === "admin@gmail.com" ? "admin" : "member";
}
