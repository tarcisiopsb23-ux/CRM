export type AccessLevel = "none" | "operational" | "administrative" | "complete";

export interface Team {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  fullName: string;
  displayName: string;
  cpf: string;
  rg: string;
  address: string;
  education: string;
  role: string;
  teamId: string;
  teamName: string;
  baseSalary: number;
  commissionPercent: number;
  overtimeFactor: number;
  accessLevel: AccessLevel;
  email: string;
  phone: string;
  hireDate: string;
  notes: string;
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  month: string; // "2026-01"
  baseSalary: number;
  commission: number;
  bonus: number;
  overtime: number;
  deductions: number;
  total: number;
  paid: boolean;
}

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "Nenhum",
  operational: "Operacional",
  administrative: "Administrativo",
  complete: "Completo",
};

export const ACCESS_LEVEL_COLORS: Record<AccessLevel, string> = {
  none: "bg-muted text-muted-foreground",
  operational: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  administrative: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};
