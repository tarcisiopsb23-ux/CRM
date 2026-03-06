import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardWidgetProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function DashboardWidget({
  title,
  children,
  className,
}: DashboardWidgetProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
