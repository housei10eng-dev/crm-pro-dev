import { BadRequestException } from "@nestjs/common";

export type NormalizedEntityType = "company" | "employee" | "audit";

export function normalizeEntityType(input: string): NormalizedEntityType {
  const value = (input ?? "").toLowerCase().trim();

  if (value === "company" || value === "companies") return "company";
  if (value === "employee" || value === "employees") return "employee";
  if (value === "audit" || value === "audits") return "audit";

  throw new BadRequestException("Invalid entityType. Use: company, employee, audit");
}