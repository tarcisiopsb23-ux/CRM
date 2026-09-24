import { useNavigate } from "react-router-dom";
import { Bell, Flame, TrendingUp, Thermometer, Inbox, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNotifications, type Notification, type NotificationType } from "@/hooks/useNotifications";

// ─── Helpers visuais por tipo ─────────────────────────────────────────────────

function typeConfig(type: NotificationType) {
  switch (type) {
    case "lead_ultra_quente":
      return {
        icon: <Flame className="h-4 w-4" />,
        color: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        label: "Ultra Quente",
      };
    case "lead_quente":
      return {
        icon: <Flame className="h-4 w-4" />,
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
        label: "Lead Quente",
      };
    case "lead_morno":
      return {
        icon: <Thermometer className="h-4 w-4" />,
        color: "text-yellow-400",
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/20",
        label: "Lead Morno",
      };
    case "lead_frio":
      return {
        icon: <TrendingUp className="h-4 w-4" />,
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        label: "Lead Frio",
      };
    default:
      return {
        icon: <Bell className="h-4 w-4" />,
        color: "text-muted-foreground",
        bg: "bg-muted/30",
        border: "border-border",
        label: "Sistema",
      };
  }
}

// ─── Item de notificação ──────────────────────────────────────────────────────

function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onNavigate: (url: string | null) => void;
}) {
  const cfg = typeConfig(notification.type);
  const isUnread = !notification.read_at;

  const handleClick = () => {
    if (isUnread) onRead(notification.id);
    if (notification.action_url) onNavigate(notification.action_url);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-lg transition-colors",
        "hover:bg-accent/50",
        isUnread && "bg-accent/20"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Ícone */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border mt-0.5",
            cfg.bg,
            cfg.border,
            cfg.color
          )}
        >
          {cfg.icon}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm font-semibold truncate", isUnread ? "text-foreground" : "text-muted-foreground")}>
              {notification.title}
            </p>
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
          {notification.body && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {notification.body}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {formatDistanceToNow(parseISO(notification.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications();

  const handleNavigate = (url: string | null) => {
    if (url) navigate(url);
  };

  // Separa as 20 mais recentes para exibição
  const recent = notifications.slice(0, 20);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label={`Notificações${unreadCount > 0 ? ` — ${unreadCount} não lidas` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notificações</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas lidas
            </Button>
          )}
        </div>

        {/* Lista */}
        <div className="max-h-[400px] overflow-y-auto p-1.5 space-y-0.5">
          {loading && recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-xs text-muted-foreground">Carregando...</p>
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
              <div className="h-10 w-10 rounded-full bg-muted/30 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
            </div>
          ) : (
            recent.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={markRead}
                onNavigate={handleNavigate}
              />
            ))
          )}
        </div>

        {/* Footer — link para ver todos os leads do formulário */}
        {notifications.length > 0 && (
          <div className="border-t border-border px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/kanban?tab=formulario")}
            >
              Ver todos os leads do formulário
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
