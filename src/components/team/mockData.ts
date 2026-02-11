import { Employee, PayrollEntry, Team } from "./types";

export const INITIAL_TEAMS: Team[] = [
  { id: "t1", name: "Vendas" },
  { id: "t2", name: "Marketing" },
  { id: "t3", name: "Suporte" },
  { id: "t4", name: "Desenvolvimento" },
];

export const TEAMS = INITIAL_TEAMS;

export const ROLES = [
  "Closer",
  "SDR",
  "Gestor de Tráfego",
  "Designer",
  "Social Media",
  "Atendimento",
  "Desenvolvedor",
  "Gerente",
];

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: "e1", fullName: "Ana Carolina Silva", displayName: "Ana Silva",
    cpf: "123.456.789-00", rg: "12.345.678-9", address: "Rua das Flores, 123, São Paulo - SP",
    education: "Superior Completo", role: "Closer", teamId: "t1", teamName: "Vendas",
    baseSalary: 4500, commissionPercent: 8, overtimeFactor: 1.5,
    accessLevel: "operational", email: "ana@maestria.com", phone: "(11) 99999-1111", hireDate: "2024-03-15", notes: "",
  },
  {
    id: "e2", fullName: "Bruno Oliveira Santos", displayName: "Bruno Oliveira",
    cpf: "987.654.321-00", rg: "98.765.432-1", address: "Av. Paulista, 1000, São Paulo - SP",
    education: "Superior Completo", role: "Gerente", teamId: "t1", teamName: "Vendas",
    baseSalary: 8000, commissionPercent: 5, overtimeFactor: 2.0,
    accessLevel: "complete", email: "bruno@maestria.com", phone: "(11) 99999-2222", hireDate: "2023-01-10", notes: "",
  },
  {
    id: "e3", fullName: "Carla Mendes Ferreira", displayName: "Carla Mendes",
    cpf: "456.789.123-00", rg: "45.678.912-3", address: "Rua Augusta, 500, São Paulo - SP",
    education: "Pós-Graduação", role: "Gestor de Tráfego", teamId: "t2", teamName: "Marketing",
    baseSalary: 5500, commissionPercent: 3, overtimeFactor: 1.5,
    accessLevel: "administrative", email: "carla@maestria.com", phone: "(11) 99999-3333", hireDate: "2024-06-01", notes: "",
  },
  {
    id: "e4", fullName: "Diego Almeida Costa", displayName: "Diego Costa",
    cpf: "321.654.987-00", rg: "32.165.498-7", address: "Rua Oscar Freire, 200, São Paulo - SP",
    education: "Superior Completo", role: "SDR", teamId: "t1", teamName: "Vendas",
    baseSalary: 3200, commissionPercent: 10, overtimeFactor: 1.5,
    accessLevel: "operational", email: "diego@maestria.com", phone: "(11) 99999-4444", hireDate: "2025-01-20", notes: "",
  },
  {
    id: "e5", fullName: "Elisa Rodrigues Lima", displayName: "Elisa Lima",
    cpf: "654.321.987-00", rg: "65.432.198-7", address: "Rua Bela Cintra, 80, São Paulo - SP",
    education: "Ensino Médio", role: "Atendimento", teamId: "t3", teamName: "Suporte",
    baseSalary: 2800, commissionPercent: 0, overtimeFactor: 1.5,
    accessLevel: "none", email: "elisa@maestria.com", phone: "(11) 99999-5555", hireDate: "2025-06-15", notes: "",
  },
  {
    id: "e6", fullName: "Felipe Martins Souza", displayName: "Felipe Martins",
    cpf: "789.123.456-00", rg: "78.912.345-6", address: "Rua Consolação, 300, São Paulo - SP",
    education: "Superior Completo", role: "Desenvolvedor", teamId: "t4", teamName: "Desenvolvimento",
    baseSalary: 7000, commissionPercent: 0, overtimeFactor: 2.0,
    accessLevel: "administrative", email: "felipe@maestria.com", phone: "(11) 99999-6666", hireDate: "2024-09-01", notes: "",
  },
];

function generatePayroll(emp: Employee, months: string[]): PayrollEntry[] {
  return months.map((month, i) => {
    const commission = emp.baseSalary * (emp.commissionPercent / 100) * (0.7 + Math.random() * 0.6);
    const bonus = Math.random() > 0.7 ? Math.round(500 + Math.random() * 1500) : 0;
    const overtime = Math.random() > 0.5 ? Math.round((emp.baseSalary / 220) * emp.overtimeFactor * (2 + Math.random() * 15)) : 0;
    const deductions = Math.round(emp.baseSalary * 0.08 + Math.random() * 200);
    const total = emp.baseSalary + Math.round(commission) + bonus + overtime - deductions;
    return {
      id: `pay-${emp.id}-${month}`,
      employeeId: emp.id,
      month,
      baseSalary: emp.baseSalary,
      commission: Math.round(commission),
      bonus,
      overtime: Math.round(overtime),
      deductions,
      total,
      paid: i < months.length - 1,
    };
  });
}

const MONTHS = ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];

export const MOCK_PAYROLL: PayrollEntry[] = MOCK_EMPLOYEES.flatMap((e) => generatePayroll(e, MONTHS));
