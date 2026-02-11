import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeList } from "@/components/team/EmployeeList";
import { PayrollView } from "@/components/team/PayrollView";
import { MOCK_EMPLOYEES, MOCK_PAYROLL } from "@/components/team/mockData";
import { Employee, PayrollEntry } from "@/components/team/types";
import { Users, DollarSign } from "lucide-react";

export default function TeamPage() {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [payroll, setPayroll] = useState<PayrollEntry[]>(MOCK_PAYROLL);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Equipe & Colaboradores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastro, níveis de acesso e gestão de folha de pagamento.
        </p>
      </div>

      <Tabs defaultValue="employees" className="w-full">
        <TabsList>
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" /> Colaboradores
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5">
            <DollarSign className="h-4 w-4" /> Folha de Pagamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeeList employees={employees} onUpdate={setEmployees} payrollData={payroll} />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollView employees={employees} payroll={payroll} onPayrollUpdate={setPayroll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
