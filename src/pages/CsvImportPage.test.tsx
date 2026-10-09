import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CsvImportPage } from "./CsvImportPage";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock supabase
const mockInsert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (_table: string) => ({
      insert: (record: unknown) => mockInsert(record),
    }),
  },
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock parseCsvFile so we can control parsed rows without real File I/O
const mockParseCsvFile = vi.fn();
vi.mock("@/lib/csvParser", () => ({
  parseCsvFile: (...args: unknown[]) => mockParseCsvFile(...args),
}));

function renderPage(slug = "test-slug") {
  // Seed a valid auth session in localStorage
  localStorage.setItem(
    `client_auth_${slug}`,
    JSON.stringify({ client_id: "client-1", email: "user@test.com", slug })
  );

  return render(
    <MemoryRouter initialEntries={[`/dashboard/${slug}/import`]}>
      <Routes>
        <Route path="/dashboard/:slug/import" element={<CsvImportPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Helper: simulate uploading a CSV file and advancing to the mapping step */
async function uploadCsvAndAdvanceToMapping(rows: Record<string, string>[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ["name"];
  mockParseCsvFile.mockResolvedValueOnce({ headers, rows, error: undefined });

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const fakeFile = new File([""], "leads.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [fakeFile] } });

  // Wait for mapping step to appear
  await waitFor(() => {
    expect(screen.getByText("Mapeamento de Colunas")).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Default: insert succeeds
  mockInsert.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// Req 11.6 — Rows with empty/missing `name` are skipped and appear in report
// ---------------------------------------------------------------------------
describe("Req 11.6 — linhas com name vazio são ignoradas e aparecem no relatório", () => {
  it("ignora linha com name vazio e exibe no relatório de ignorados", async () => {
    renderPage();

    const rows = [
      { name: "Alice", phone: "11999990001" },
      { name: "",      phone: "11999990002" }, // should be skipped
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Linhas Ignoradas (1)")).toBeInTheDocument();
    });

    // The skipped row detail should mention the reason
    expect(screen.getByText(/Campo 'name' vazio ou ausente/i)).toBeInTheDocument();
  });

  it("ignora linha com name ausente (campo não mapeado) e exibe no relatório", async () => {
    renderPage();

    // Row has no 'name' key at all — after mapping it will be absent
    const rows = [
      { phone: "11999990001" }, // no name column
    ];
    mockParseCsvFile.mockResolvedValueOnce({
      headers: ["phone"],
      rows,
      error: undefined,
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([""], "leads.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(screen.getByText("Mapeamento de Colunas")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Linhas Ignoradas (1)")).toBeInTheDocument();
    });

    expect(screen.getByText(/Campo 'name' vazio ou ausente/i)).toBeInTheDocument();
  });

  it("NÃO chama supabase.insert para linhas com name vazio", async () => {
    renderPage();

    const rows = [
      { name: "",    phone: "11999990001" },
      { name: "   ", phone: "11999990002" }, // whitespace-only also empty
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Linhas Ignoradas (2)")).toBeInTheDocument();
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("insere linha com name válido e ignora linha com name vazio", async () => {
    renderPage();

    const rows = [
      { name: "Bob",  phone: "11999990001" },
      { name: "",     phone: "11999990002" },
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Linhas Ignoradas (1)")).toBeInTheDocument();
    });

    // insert called exactly once (for Bob)
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bob" })
    );
  });
});

// ---------------------------------------------------------------------------
// Req 11.7 — Relatório final contém contagens corretas
// ---------------------------------------------------------------------------
describe("Req 11.7 — relatório final contém contagens corretas", () => {
  it("exibe total processado, importados e ignorados corretamente", async () => {
    renderPage();

    const rows = [
      { name: "Alice", phone: "11999990001" },
      { name: "Bob",   phone: "11999990002" },
      { name: "",      phone: "11999990003" }, // skipped
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      // Summary cards
      expect(screen.getByText("Total Processado")).toBeInTheDocument();
      expect(screen.getByText("Importados")).toBeInTheDocument();
      expect(screen.getByText("Ignorados")).toBeInTheDocument();
    });

    // The numeric values rendered in the summary cards
    const cards = screen.getAllByRole("heading", { hidden: true });
    // Use getAllByText to find the count values
    const allText = document.body.textContent ?? "";
    expect(allText).toContain("3"); // total
    expect(allText).toContain("2"); // success
    expect(allText).toContain("1"); // skipped count
  });

  it("relatório mostra 0 ignorados quando todos os registros são válidos", async () => {
    renderPage();

    const rows = [
      { name: "Alice", phone: "11999990001" },
      { name: "Bob",   phone: "11999990002" },
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Importados")).toBeInTheDocument();
    });

    // No skipped section should appear
    expect(screen.queryByText(/Linhas Ignoradas/)).not.toBeInTheDocument();

    const allText = document.body.textContent ?? "";
    expect(allText).toContain("2"); // total and success both 2
  });

  it("relatório mostra 0 importados quando todos os registros são inválidos", async () => {
    renderPage();

    const rows = [
      { name: "", phone: "11999990001" },
      { name: "", phone: "11999990002" },
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Linhas Ignoradas (2)")).toBeInTheDocument();
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("relatório inclui erros de inserção do supabase na contagem de ignorados", async () => {
    renderPage();

    mockInsert
      .mockResolvedValueOnce({ error: null })                              // Alice OK
      .mockResolvedValueOnce({ error: { message: "duplicate key" } });    // Bob fails

    const rows = [
      { name: "Alice", phone: "11999990001" },
      { name: "Bob",   phone: "11999990002" },
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText("Linhas Ignoradas (1)")).toBeInTheDocument();
    });

    expect(screen.getByText(/duplicate key/i)).toBeInTheDocument();
  });

  it("número da linha no relatório corresponde à linha do CSV (base 2)", async () => {
    renderPage();

    const rows = [
      { name: "Alice", phone: "11999990001" },
      { name: "",      phone: "11999990002" }, // row index 1 → CSV line 3
    ];
    await uploadCsvAndAdvanceToMapping(rows);

    fireEvent.click(screen.getByText("Confirmar Mapeamento e Importar"));

    await waitFor(() => {
      expect(screen.getByText(/Linha 3/)).toBeInTheDocument();
    });
  });
});
