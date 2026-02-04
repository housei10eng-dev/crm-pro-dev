import { BadRequestException } from "@nestjs/common";

export type NormalizedEntityType =
  | "company"
  | "employee"
  | "audit"
  | "payment"
  | "dre"
  | "dashboard";

export function normalizeEntityType(input: string): NormalizedEntityType {
  const value = (input ?? "").toLowerCase().trim();

  if (value === "company" || value === "companies") return "company";
  if (value === "employee" || value === "employees") return "employee";
  if (value === "audit" || value === "audits") return "audit";
  if (value === "payment" || value === "payments") return "payment";
  if (value === "dre") return "dre";
  if (value === "dashboard") return "dashboard";

  throw new BadRequestException(
    "Invalid entityType. Use: company, employee, audit, payment, dre, dashboard",
  );
}