// @vitest-environment jsdom
/**
 * Interaction Tests — ClauseFormDialog
 * Task 10.5: Testar interações principais do dialog de cláusulas
 * Validates: Requirements 2.2
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClauseFormDialog } from '../ClauseFormDialog';
import type { ContractClause } from '@/types/contracts';

// ── Global polyfills required by Radix UI in jsdom ───────────────────────────
beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Radix Select uses scrollIntoView when opening dropdown
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  // Radix Select also uses hasPointerCapture / setPointerCapture
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
});

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock heavy dependencies that require DB / TipTap DOM setup
vi.mock('@/hooks/useContractClauses', () => ({
  useContractClauses: () => ({
    createClause: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    updateClause: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    clauses: [],
    isLoading: false,
    deleteClause: { mutateAsync: vi.fn() },
    reorderClauses: vi.fn(),
  }),
}));

// Mock TipTap-based ClauseEditor — avoids TipTap DOM setup complexity
vi.mock('../ClauseEditor', () => ({
  ClauseEditor: ({
    onEmptyChange,
  }: {
    onEmptyChange?: (empty: boolean) => void;
    value?: unknown;
    onChange?: (v: unknown) => void;
    disabled?: boolean;
  }) => {
    // Default state: editor is empty (matches component initial state)
    return <div data-testid="clause-editor">Editor</div>;
  },
  isClauseContentEmpty: (content: unknown) => {
    // If content has text, treat as non-empty
    if (!content) return true;
    const doc = content as { type?: string; content?: Array<{ type?: string; content?: unknown[] }> };
    if (doc.type !== 'doc') return false;
    const nodes = doc.content ?? [];
    if (nodes.length === 0) return true;
    if (nodes.length === 1) {
      const node = nodes[0];
      return node.type === 'paragraph' && (!node.content || node.content.length === 0);
    }
    return false;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderDialog(props: Partial<React.ComponentProps<typeof ClauseFormDialog>> = {}) {
  return render(
    <ClauseFormDialog
      open={true}
      onOpenChange={vi.fn()}
      organizationId="org-1"
      availableServices={[]}
      {...props}
    />,
    { wrapper: createWrapper() }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClauseFormDialog — interaction tests (Req 2.2)', () => {
  describe('Create mode', () => {
    it('renders "Nova Cláusula" title in create mode', () => {
      renderDialog();
      expect(screen.getByText(/nova cláusula/i)).toBeInTheDocument();
    });

    it('renders the title input field', () => {
      renderDialog();
      expect(
        screen.getByPlaceholderText(/confidencialidade/i)
      ).toBeInTheDocument();
    });

    it('Save button is disabled when dialog opens (editor starts empty)', () => {
      renderDialog();
      const saveBtn = screen.getByRole('button', { name: /salvar/i });
      // isContentEmpty starts as true → Save is disabled
      expect(saveBtn).toBeDisabled();
    });

    it('renders the clause editor', () => {
      renderDialog();
      expect(screen.getByTestId('clause-editor')).toBeInTheDocument();
    });

    it('renders Cancel button', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    });

    it('Cancel button closes dialog', () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });
      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('condition_type defaults to "Sempre exibir"', () => {
      renderDialog();
      // The Select combobox button should display the current value
      const combobox = screen.getByRole('combobox', { name: /tipo de condição/i });
      expect(combobox).toHaveTextContent(/sempre exibir/i);
    });

    it('service selector is NOT shown when condition_type is "always"', () => {
      renderDialog();
      expect(screen.queryByText(/serviço vinculado/i)).not.toBeInTheDocument();
    });
  });

  describe('Edit mode', () => {
    const existingClause: ContractClause = {
      id: 'clause-1',
      organization_id: 'org-1',
      title: 'Cláusula de Confidencialidade',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto existente' }] }],
      },
      condition_type: 'always',
      condition_value: null,
      is_editable: false,
      display_order: 0,
      service_id: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    it('renders "Editar Cláusula" title in edit mode', () => {
      renderDialog({ clause: existingClause });
      expect(screen.getByText(/editar cláusula/i)).toBeInTheDocument();
    });

    it('pre-fills the title field with existing clause title', () => {
      renderDialog({ clause: existingClause });
      const titleInput = screen.getByPlaceholderText(/confidencialidade/i) as HTMLInputElement;
      expect(titleInput.value).toBe('Cláusula de Confidencialidade');
    });

    it('Save button is enabled when editing existing clause (content is non-empty)', () => {
      renderDialog({ clause: existingClause });
      const saveBtn = screen.getByRole('button', { name: /salvar/i });
      // isClauseContentEmpty returns false for the existing non-empty content
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe('condition_type — has_service', () => {
    it('shows service selector when condition_type is "has_service"', () => {
      // Render in edit mode with an existing clause that has condition_type = 'has_service'
      // This exercises the same code path as changing the select value
      const clauseWithService: ContractClause = {
        id: 'clause-svc',
        organization_id: 'org-1',
        title: 'Cláusula com serviço',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Conteúdo' }] }],
        },
        condition_type: 'has_service',
        condition_value: null,
        is_editable: false,
        display_order: 0,
        service_id: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      renderDialog({
        clause: clauseWithService,
        availableServices: [
          { id: 'svc-1', name: 'SEO', category: 'Marketing', deliverables: [], sub_services: [], display_order: 0, organization_id: 'org-1', created_at: '', updated_at: '' },
        ],
      });

      expect(screen.getByText(/serviço vinculado/i)).toBeInTheDocument();
    });

    it('Save button is enabled when has_service clause has non-empty content', () => {
      // When editing a clause with has_service condition type and existing content,
      // the Save button should be enabled
      const clauseWithService: ContractClause = {
        id: 'clause-svc',
        organization_id: 'org-1',
        title: 'Cláusula com serviço',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Conteúdo' }] }],
        },
        condition_type: 'has_service',
        condition_value: null,
        is_editable: false,
        display_order: 0,
        service_id: 'svc-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      renderDialog({
        clause: clauseWithService,
        availableServices: [
          { id: 'svc-1', name: 'SEO', category: 'Marketing', deliverables: [], sub_services: [], display_order: 0, organization_id: 'org-1', created_at: '', updated_at: '' },
        ],
      });

      // isClauseContentEmpty returns false for the non-empty content → Save enabled
      const saveBtn = screen.getByRole('button', { name: /salvar/i });
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe('Empty content guard', () => {
    it('Save button title hints to add content when editor is empty', () => {
      renderDialog();
      const saveBtn = screen.getByRole('button', { name: /salvar/i });
      expect(saveBtn).toHaveAttribute('title', expect.stringMatching(/adicione conteúdo/i));
    });
  });
});
