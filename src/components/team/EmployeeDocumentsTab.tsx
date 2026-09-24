import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/hooks/useProfiles";

interface Props {
  profile: ProfileRow;
}

interface EmployeeDocument {
  name: string;
  id: string;
  created_at: string;
  metadata: { size?: number; mimetype?: string } | null;
}

const BUCKET = "employee-documents";

function useEmployeeDocuments(profileId: string) {
  return useQuery({
    queryKey: ["employee_documents", profileId],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).list(profileId, {
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) throw error;
      return (data ?? []) as EmployeeDocument[];
    },
    enabled: !!profileId,
  });
}

export function EmployeeDocumentsTab({ profile }: Props) {
  const qc = useQueryClient();
  const { data: docs = [], isLoading } = useEmployeeDocuments(profile.id);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${profile.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      toast.success("Documento enviado");
      qc.invalidateQueries({ queryKey: ["employee_documents", profile.id] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (name: string) => {
    const { error } = await supabase.storage.from(BUCKET).remove([`${profile.id}/${name}`]);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Documento removido");
    qc.invalidateQueries({ queryKey: ["employee_documents", profile.id] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Documentos</p>
        <Label className="cursor-pointer">
          <Button size="sm" variant="outline" asChild>
            <span>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Enviar
            </span>
          </Button>
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </Label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum documento enviado</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data Upload</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate max-w-[200px]">{d.name}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.metadata?.mimetype ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(d.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.name)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
