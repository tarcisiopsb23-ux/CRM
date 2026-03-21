import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950";

export function SettingsSection({
  title,
  description,
  children,
  className,
  icon,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon && <div className="text-primary">{icon}</div>}
          <h3 className="text-base font-semibold text-gray-dark">{title}</h3>
        </div>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function SettingsInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  mask,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mask?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        type={mask ? "password" : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        autoComplete="off"
        {...props}
      />
    </div>
  );
}
