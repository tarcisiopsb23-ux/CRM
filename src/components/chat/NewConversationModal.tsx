import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDirect: (userId: string) => Promise<void>;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
}

export function NewConversationModal({
  open,
  onOpenChange,
  onCreateDirect,
  onCreateGroup,
}: NewConversationModalProps) {
  const { profile } = useAuth();
  const organizationId = useOrganization();
  const { data: allProfiles = [] } = useProfiles(organizationId);

  const [directSearch, setDirectSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const canCreateGroup = ["owner", "admin"].includes(profile?.role ?? "");

  const otherProfiles = allProfiles.filter((p) => p.id !== profile?.id);
  const directFiltered = otherProfiles.filter((p) =>
    p.full_name.toLowerCase().includes(directSearch.toLowerCase())
  );
  const groupFiltered = otherProfiles.filter((p) =>
    p.full_name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleDirect = async (userId: string) => {
    setLoading(true);
    try {
      await onCreateDirect(userId);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleGroup = async () => {
    if (!groupName.trim() || selectedMembers.length < 2) return;
    setLoading(true);
    try {
      await onCreateGroup(groupName.trim(), selectedMembers);
      setGroupName("");
      setSelectedMembers([]);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="direct">
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1">Conversa Direta</TabsTrigger>
            <TabsTrigger value="group" className="flex-1" disabled={!canCreateGroup}>
              Novo Grupo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="space-y-3 mt-3">
            <Input
              placeholder="Buscar colaborador..."
              value={directSearch}
              onChange={(e) => setDirectSearch(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {directFiltered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum colaborador encontrado.</p>
              ) : (
                directFiltered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleDirect(p.id)}
                    disabled={loading}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{p.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.role}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="group" className="space-y-3 mt-3">
            {!canCreateGroup ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Apenas owner e admin podem criar grupos.
              </p>
            ) : (
              <>
                <Input
                  placeholder="Nome do grupo"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <Input
                  placeholder="Buscar membros..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {groupFiltered.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(p.id)}
                        onCheckedChange={() => toggleMember(p.id)}
                      />
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={p.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">{p.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <Label className="text-sm cursor-pointer">{p.full_name}</Label>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedMembers.length} membro(s) selecionado(s) — mínimo 2
                </p>
                <Button
                  onClick={handleGroup}
                  disabled={!groupName.trim() || selectedMembers.length < 2 || loading}
                  className="w-full"
                  size="sm"
                >
                  {loading ? "Criando..." : "Criar Grupo"}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
