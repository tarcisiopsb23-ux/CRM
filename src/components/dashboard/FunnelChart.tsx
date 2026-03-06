const data = [
  { stage: "Recebidos", value: 142 },
  { stage: "Qualificados", value: 87 },
  { stage: "Reunião", value: 34 },
  { stage: "Contrato", value: 21 },
  { stage: "Fechados", value: 14 },
];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(265, 62%, 52%)",
  "hsl(265, 62%, 58%)",
  "hsl(265, 62%, 64%)",
  "hsl(152, 60%, 42%)",
];

export function FunnelChart() {
  const maxValue = data[0].value;

  return (
    <div className="stat-card">
      <h3 className="font-display text-lg font-semibold text-foreground mb-6">Funil de Vendas</h3>
      <div className="flex flex-col items-center gap-1 py-2">
        {data.map((item, i) => {
          const widthPercent = 30 + (item.value / maxValue) * 70;
          const nextWidthPercent =
            i < data.length - 1 ? 30 + (data[i + 1].value / maxValue) * 70 : widthPercent * 0.7;

          return (
            <div key={item.stage} className="relative group w-full flex justify-center">
              <svg
                width="100%"
                height="56"
                viewBox="0 0 400 56"
                preserveAspectRatio="none"
                className="max-w-[400px]"
              >
                <defs>
                  <linearGradient id={`funnel-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[i]} stopOpacity={1} />
                    <stop offset="100%" stopColor={COLORS[i]} stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                {/* Main trapezoid shape */}
                <path
                  d={`
                    M ${200 - (widthPercent / 100) * 200} 0
                    L ${200 + (widthPercent / 100) * 200} 0
                    L ${200 + (nextWidthPercent / 100) * 200} 56
                    L ${200 - (nextWidthPercent / 100) * 200} 56
                    Z
                  `}
                  fill={`url(#funnel-grad-${i})`}
                />
                {/* 3D top ellipse effect */}
                {i === 0 && (
                  <ellipse
                    cx="200"
                    cy="4"
                    rx={(widthPercent / 100) * 200}
                    ry="4"
                    fill={COLORS[i]}
                    opacity={0.6}
                  />
                )}
              </svg>
              {/* Label overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-white text-sm font-semibold drop-shadow-sm">
                  {item.stage} — {item.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
