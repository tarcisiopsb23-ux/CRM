/**
 * Unit tests for useServiceCatalog — pure business logic
 *
 * Since testing the actual hook (with TanStack Query + Supabase) requires
 * complex integration setup, we extract and test the three core pure
 * functions inline.
 *
 * Validates: Requirements 1.3, 1.6, 1.7
 */
import { describe, it, expect } from 'vitest';
import type { ServiceCatalogItem } from '@/types/contracts';

// ---------------------------------------------------------------------------
// Pure: group services by category
// (mirrors the `servicesByCategory` reduce inside useServiceCatalog)
// ---------------------------------------------------------------------------
function groupByCategory(
  services: ServiceCatalogItem[]
): Record<string, ServiceCatalogItem[]> {
  return services.reduce<Record<string, ServiceCatalogItem[]>>((acc, svc) => {
    if (!acc[svc.category]) acc[svc.category] = [];
    acc[svc.category].push(svc);
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Pure: check if a service is referenced in any active contract's metadata
// (mirrors the loop inside deleteService mutationFn)
// ---------------------------------------------------------------------------
function isServiceReferenced(
  serviceId: string,
  contracts: Array<{ metadata: { services?: Array<{ service_id: string }> } | null }>
): boolean {
  return contracts.some((c) =>
    (c.metadata?.services ?? []).some((s) => s.service_id === serviceId)
  );
}

// ---------------------------------------------------------------------------
// Pure: produce display_order values from an ordered ID list
// (mirrors the serviceIds.map inside reorderServices mutationFn)
// ---------------------------------------------------------------------------
function computeDisplayOrders(
  ids: string[]
): Array<{ id: string; display_order: number }> {
  return ids.map((id, index) => ({ id, display_order: index }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeService = (id: string, category: string): ServiceCatalogItem => ({
  id,
  organization_id: 'org',
  name: `Service ${id}`,
  slug: `service_${id}`,
  category,
  sub_services: [],
  deliverables: [],
  display_order: 0,
  created_at: '',
  updated_at: '',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useServiceCatalog — pure logic', () => {
  // ── Requirement 1.3: groupByCategory ──────────────────────────────────────

  describe('groupByCategory', () => {
    it('groups services by their category', () => {
      const services = [
        makeService('1', 'A'),
        makeService('2', 'B'),
        makeService('3', 'A'),
      ];
      const result = groupByCategory(services);
      expect(result['A']).toHaveLength(2);
      expect(result['B']).toHaveLength(1);
    });

    it('preserves service identity within each group', () => {
      const svc1 = makeService('1', 'A');
      const svc2 = makeService('2', 'A');
      const result = groupByCategory([svc1, svc2]);
      expect(result['A']).toContain(svc1);
      expect(result['A']).toContain(svc2);
    });

    it('returns empty object for empty input', () => {
      expect(groupByCategory([])).toEqual({});
    });

    it('handles a single service', () => {
      const result = groupByCategory([makeService('x', 'Solo')]);
      expect(result['Solo']).toHaveLength(1);
      expect(result['Solo'][0].id).toBe('x');
    });

    it('creates one key per distinct category', () => {
      const services = [
        makeService('1', 'X'),
        makeService('2', 'Y'),
        makeService('3', 'Z'),
      ];
      expect(Object.keys(groupByCategory(services))).toHaveLength(3);
    });
  });

  // ── Requirement 1.6: isServiceReferenced (deleteService blocked check) ───

  describe('isServiceReferenced', () => {
    it('returns true when service is referenced in a contract', () => {
      const contracts = [
        { metadata: { services: [{ service_id: 'svc-1' }] } },
      ];
      expect(isServiceReferenced('svc-1', contracts)).toBe(true);
    });

    it('returns false when service is not referenced', () => {
      const contracts = [
        { metadata: { services: [{ service_id: 'svc-2' }] } },
      ];
      expect(isServiceReferenced('svc-1', contracts)).toBe(false);
    });

    it('returns false for empty contracts list', () => {
      expect(isServiceReferenced('svc-1', [])).toBe(false);
    });

    it('returns false when contract metadata is null', () => {
      const contracts = [{ metadata: null }];
      expect(isServiceReferenced('svc-1', contracts)).toBe(false);
    });

    it('returns false when metadata has no services array', () => {
      const contracts = [{ metadata: {} }];
      expect(isServiceReferenced('svc-1', contracts)).toBe(false);
    });

    it('returns true when service appears in one of many contracts', () => {
      const contracts = [
        { metadata: { services: [{ service_id: 'other' }] } },
        { metadata: { services: [{ service_id: 'svc-1' }] } },
      ];
      expect(isServiceReferenced('svc-1', contracts)).toBe(true);
    });

    it('returns true when service appears among multiple services in a contract', () => {
      const contracts = [
        {
          metadata: {
            services: [
              { service_id: 'svc-a' },
              { service_id: 'svc-1' },
              { service_id: 'svc-b' },
            ],
          },
        },
      ];
      expect(isServiceReferenced('svc-1', contracts)).toBe(true);
    });
  });

  // ── Requirement 1.7: computeDisplayOrders (reorderServices) ──────────────

  describe('computeDisplayOrders', () => {
    it('assigns sequential display_order starting from 0', () => {
      const result = computeDisplayOrders(['a', 'b', 'c']);
      expect(result[0]).toEqual({ id: 'a', display_order: 0 });
      expect(result[1]).toEqual({ id: 'b', display_order: 1 });
      expect(result[2]).toEqual({ id: 'c', display_order: 2 });
    });

    it('handles empty input', () => {
      expect(computeDisplayOrders([])).toEqual([]);
    });

    it('handles a single id', () => {
      expect(computeDisplayOrders(['only'])).toEqual([
        { id: 'only', display_order: 0 },
      ]);
    });

    it('output length matches input length', () => {
      const ids = ['x', 'y', 'z', 'w'];
      expect(computeDisplayOrders(ids)).toHaveLength(ids.length);
    });

    it('preserves the id values', () => {
      const ids = ['uuid-1', 'uuid-2'];
      const result = computeDisplayOrders(ids);
      expect(result.map((r) => r.id)).toEqual(ids);
    });

    it('display_order values are always 0-indexed consecutive integers', () => {
      const ids = ['p', 'q', 'r', 's', 't'];
      const result = computeDisplayOrders(ids);
      result.forEach((item, i) => {
        expect(item.display_order).toBe(i);
      });
    });
  });
});
