import { useMemo } from "react";
import { LogOut, Search, UsersRound, Lock, Sun, Moon, Monitor, Type, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatIcon } from "@/components/chat/ChatIcon";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChatContext } from "@/contexts/ChatContext";

export function AppHeader() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme, fontSize, setFontSize, sidebarColor, setSidebarColor } = useUserPreferences();
  const navigate = useNavigate();
  const chat = useChatContext();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const initials = profile?.full_name
    ?.split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  const avatarUrl = useMemo(() => {
    if (!profile?.avatar_url) return null;
    return profile.avatar_url;
  }, [profile?.avatar_url]);

  return (
    <>
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar leads, clientes, projetos..."
          className="border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        {!chat.isOpen && (
          <ChatIcon unreadCount={chat.totalUnread} onClick={chat.openPanel} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full overflow-hidden">
              <Avatar className="h-9 w-9">
                <AvatarImage src={avatarUrl || ""} alt={profile?.full_name} />
                <AvatarFallback className="gradient-primary text-primary-foreground font-medium text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{profile?.full_name ?? "Usuário"}</p>
              <p className="text-xs text-muted-foreground">{profile?.role}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/team/me")}>
              <UsersRound className="h-4 w-4 mr-2" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/team/me?tab=senha")}>
              <Lock className="h-4 w-4 mr-2" />
              Alterar Senha
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground px-2 py-1">
              Preferências
            </DropdownMenuLabel>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="h-4 w-4 mr-2" />
                Tema
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
                  <Sun className="h-4 w-4" /> Claro {theme === "light" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
                  <Moon className="h-4 w-4" /> Escuro {theme === "dark" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
                  <Monitor className="h-4 w-4" /> Sistema {theme === "system" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Type className="h-4 w-4 mr-2" />
                Fonte
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setFontSize("sm")}>Pequeno {fontSize === "sm" && "✓"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFontSize("base")}>Padrão {fontSize === "base" && "✓"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFontSize("lg")}>Grande {fontSize === "lg" && "✓"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFontSize("xl")}>Extra Grande {fontSize === "xl" && "✓"}</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="h-4 w-4 mr-2" />
                Cor do Menu
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setSidebarColor("default")} className="gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#2d1a4d]" /> Roxo {sidebarColor === "default" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSidebarColor("indigo")} className="gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#1e2a4d]" /> Índigo {sidebarColor === "indigo" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSidebarColor("blue")} className="gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#1a2d4d]" /> Azul {sidebarColor === "blue" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSidebarColor("slate")} className="gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#1e293b]" /> Ardósia {sidebarColor === "slate" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSidebarColor("zinc")} className="gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#27272a]" /> Zinco {sidebarColor === "zinc" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); handleSignOut(); }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    {chat.isOpen && <ChatPanel chat={chat} onClose={chat.closePanel} />}
    </>
  );
}
