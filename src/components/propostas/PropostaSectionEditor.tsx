import { useState } from "react";
import { Eye, EyeOff, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProposalSection, SectionKey } from "@/types/proposals";
import { SECTION_LABELS } from "@/types/proposals";

interface Props {
  section: Partial<ProposalSection> & { section_key: SectionKey };
  onChange: (content: string) => void;
  onToggleVisibility: (visible: boolean) => void;
  onGenerateAI?: () => void;
  isGeneratingAI?: boolean;
}

export function PropostaSectionEditor({ section, onChange, onToggleVisibility, onGenerateAI, isGeneratingAI }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const label = SECTION_LABELS[section.section_key];
  const isVisible = section.is_visible ?? true;

  return (
    <Card className={!isVisible ? "opacity-50" : ""}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(c => !c)} className="text-muted-foreground hover:text-foreground transition">
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            <span className="font-semibold text-sm">{label}</span>
          </div>
          <div className="flex items-center gap-3">
            {onGenerateAI && (
              <Button variant="ghost" size="sm" onClick={onGenerateAI} disabled={isGeneratingAI} className="text-xs gap-1.5 h-7 px-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {isGeneratingAI ? "Gerando..." : "IA"}
              </Button>
            )}
            <div className="flex items-center gap-1.5">
              {isVisible ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              <Switch
                checked={isVisible}
                onCheckedChange={onToggleVisibility}
                id={`vis-${section.section_key}`}
              />
              <Label htmlFor={`vis-${section.section_key}`} className="text-xs text-muted-foreground cursor-pointer">
                {isVisible ? "Visível" : "Oculta"}
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0 px-4 pb-4">
          <Textarea
            rows={6}
            placeholder={`Conteúdo da seção ${label}...`}
            value={section.content ?? ""}
            onChange={e => onChange(e.target.value)}
            disabled={!isVisible}
            className="resize-none text-sm font-mono"
          />
        </CardContent>
      )}
    </Card>
  );
}
