// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServiceFormDialog } from '../ServiceFormDialog';

// Polyfills for Radix UI in jsdom
beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

vi.mock('@/hooks/useServiceCatalog', () => ({
  useServiceCatalog: () => ({
    createService: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    updateService: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    services: [],
    servicesByCategory: {},
    isLoading: false,
    deleteService: { mutateAsync: vi.fn() },
    reorderServices: { mutate: vi.fn() },
  }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

describe('ServiceFormDialog — snapshot and interaction tests', () => {
  it('renders in create mode with correct title', () => {
    wrap(<ServiceFormDialog open={true} onOpenChange={vi.fn()} organizationId="org-1" />);
    expect(screen.getByText(/novo serviço/i)).toBeInTheDocument();
  });

  it('renders name and category fields', () => {
    wrap(<ServiceFormDialog open={true} onOpenChange={vi.fn()} organizationId="org-1" />);
    expect(screen.getByPlaceholderText(/gestão de redes/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/marketing digital/i)).toBeInTheDocument();
  });

  it('"Adicionar sub-serviço" button is present', () => {
    wrap(<ServiceFormDialog open={true} onOpenChange={vi.fn()} organizationId="org-1" />);
    expect(screen.getByRole('button', { name: /adicionar sub-serviço/i })).toBeInTheDocument();
  });

  it('clicking "Adicionar sub-serviço" adds a row', () => {
    wrap(<ServiceFormDialog open={true} onOpenChange={vi.fn()} organizationId="org-1" />);
    const addBtn = screen.getByRole('button', { name: /adicionar sub-serviço/i });
    fireEvent.click(addBtn);
    expect(screen.getByPlaceholderText(/nome do sub-serviço/i)).toBeInTheDocument();
  });

  it('renders in edit mode with correct title and pre-filled values', () => {
    const service = {
      id: 'svc-1', name: 'Design', category: 'Marketing',
      organization_id: 'org-1', sub_services: [], display_order: 0,
      created_at: '', updated_at: '',
    };
    wrap(<ServiceFormDialog open={true} onOpenChange={vi.fn()} organizationId="org-1" service={service} />);
    expect(screen.getByText(/editar serviço/i)).toBeInTheDocument();
    const nameInput = screen.getByDisplayValue('Design') as HTMLInputElement;
    expect(nameInput.value).toBe('Design');
  });

  it('shows "Nenhum sub-serviço adicionado." when list is empty', () => {
    wrap(<ServiceFormDialog open={true} onOpenChange={vi.fn()} organizationId="org-1" />);
    expect(screen.getByText(/nenhum sub-serviço adicionado/i)).toBeInTheDocument();
  });
});
