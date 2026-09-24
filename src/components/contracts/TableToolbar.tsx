/**
 * TableToolbar — grupo de botões de tabela para toolbars TipTap.
 * Inclui num grupo separado por dividers: inserir tabela, linhas, colunas,
 * mesclar, dividir e remover.
 */
import { useState, useRef, useEffect } from "react";
import { useEditor } from "@tiptap/react";
import {
  Table, Plus, Minus, Merge, Split,
} from "lucide-react";

interface Props {
  editor: ReturnType<typeof useEditor>;
}

export function TableToolbar({ editor }: Props) {
  const [showGrid, setShowGrid] = useState(false);
  const [hovered, setHovered] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showGrid) return;
    const handler = (e: MouseEvent) => {
      if (!gridRef.current?.contains(e.target as Node)) setShowGrid(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showGrid]);

  if (!editor) return null;

  const btn = (action: () => void, icon: React.ReactNode, label: string, disabled = false) => (
    <button
      type="button"
      onClick={action}
      title={label}
      disabled={disabled}
      className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  );

  const inTable = editor.isActive("table");

  return (
    <>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Inserir tabela — grid picker */}
      <div className="relative">
        <button
          type="button"
          title="Inserir tabela"
          onClick={() => setShowGrid(v => !v)}
          className={`p-1.5 rounded hover:bg-muted transition-colors ${showGrid ? "bg-muted" : ""}`}
        >
          <Table className="h-4 w-4" />
        </button>

        {showGrid && (
          <div
            ref={gridRef}
            className="absolute top-full left-0 mt-1 z-50 bg-background border rounded shadow-md p-2 space-y-1"
          >
            <p className="text-[10px] text-muted-foreground mb-1">
              {hovered.rows > 0 ? `${hovered.rows} × ${hovered.cols}` : "Selecione o tamanho"}
            </p>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
              {Array.from({ length: 6 }, (_, r) =>
                Array.from({ length: 6 }, (_, c) => (
                  <div
                    key={`${r}-${c}`}
                    onMouseEnter={() => setHovered({ rows: r + 1, cols: c + 1 })}
                    onClick={() => {
                      editor.chain().focus().insertTable({
                        rows: r + 1,
                        cols: c + 1,
                        withHeaderRow: true,
                      }).run();
                      setShowGrid(false);
                    }}
                    className={`w-5 h-5 border cursor-pointer rounded-sm ${
                      r < hovered.rows && c < hovered.cols
                        ? "bg-violet-200 border-violet-400"
                        : "bg-muted border-border"
                    }`}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Linha */}
      {inTable && (
        <>
          {btn(() => editor.chain().focus().addRowBefore().run(), <Plus className="h-3.5 w-3.5" />, "Inserir linha acima")}
          {btn(() => editor.chain().focus().addRowAfter().run(),  <Plus className="h-3.5 w-3.5 rotate-180" />, "Inserir linha abaixo")}
          {btn(() => editor.chain().focus().deleteRow().run(),    <Minus className="h-3.5 w-3.5" />, "Remover linha")}
          <div className="w-px h-5 bg-border mx-0.5" />
          {/* Coluna */}
          {btn(() => editor.chain().focus().addColumnBefore().run(), <Plus className="h-3.5 w-3.5 -rotate-90" />, "Inserir coluna à esquerda")}
          {btn(() => editor.chain().focus().addColumnAfter().run(),  <Plus className="h-3.5 w-3.5 rotate-90" />, "Inserir coluna à direita")}
          {btn(() => editor.chain().focus().deleteColumn().run(),    <Minus className="h-3.5 w-3.5 rotate-90" />, "Remover coluna")}
          <div className="w-px h-5 bg-border mx-0.5" />
          {/* Mesclar / dividir */}
          {btn(() => editor.chain().focus().mergeCells().run(),    <Merge className="h-3.5 w-3.5" />, "Mesclar células")}
          {btn(() => editor.chain().focus().splitCell().run(),     <Split className="h-3.5 w-3.5" />, "Dividir célula")}
          {btn(() => editor.chain().focus().deleteTable().run(),   <Table className="h-3.5 w-3.5 text-red-500" />, "Remover tabela")}
        </>
      )}
    </>
  );
}
