import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatIconProps {
  unreadCount: number;
  onClick: () => void;
}

export function ChatIcon({ unreadCount, onClick }: ChatIconProps) {
  const badge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <Button variant="ghost" size="icon" onClick={onClick} className="relative" aria-label="Abrir chat">
      <MessageSquare className="h-5 w-5" />
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
          {badge}
        </span>
      )}
    </Button>
  );
}
