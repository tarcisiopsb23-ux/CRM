import { Users, UserCheck, CalendarCheck, FileText, CheckCircle } from "lucide-react";

const stats = [
  { label: "Leads Recebidos", value: 142, icon: Users, change: "+12%" },
  { label: "Qualificados", value: 87, icon: UserCheck, change: "+8%" },
  { label: "Reuniões Agendadas", value: 34, icon: CalendarCheck, change: "+15%" },
  { label: "Contratos Enviados", value: 21, icon: FileText, change: "+5%" },
  { label: "Fechados", value: 14, icon: CheckCircle, change: "+22%" },
];

export function StatsRow() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <s.icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <span className="text-xs font-medium text-success">{s.change}</span>
          </div>
          <p className="text-2xl font-bold font-display text-foreground">{s.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
