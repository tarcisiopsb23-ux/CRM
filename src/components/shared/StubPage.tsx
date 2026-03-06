import { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function StubPage({ title, description, icon: Icon = Construction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent mb-4">
        <Icon className="h-8 w-8 text-accent-foreground" />
      </div>
      <h1 className="font-display text-2xl font-bold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}
