import { Trophy } from "lucide-react";

const teams = [
  { name: "Equipe Alpha", value: "R$ 125.000", pct: 82 },
  { name: "Equipe Beta", value: "R$ 98.000", pct: 65 },
  { name: "Equipe Gamma", value: "R$ 72.000", pct: 48 },
  { name: "Equipe Delta", value: "R$ 45.000", pct: 30 },
];

export function TeamRanking() {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-5 w-5 text-warning" />
        <h3 className="font-display text-lg font-semibold text-foreground">Ranking Equipes</h3>
      </div>
      <div className="space-y-3">
        {teams.map((t, i) => (
          <div key={t.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">
                {i + 1}. {t.name}
              </span>
              <span className="text-sm text-muted-foreground">{t.value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full gradient-primary transition-all"
                style={{ width: `${t.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
