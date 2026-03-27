/**
 * Property-based tests for useTrackingInjection
 *
 * Validates: Requirements 7.4, 7.5, 8.4, 8.5
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useTrackingInjection } from './useTrackingInjection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasGtmSnippet(): boolean {
  return !!(
    document.getElementById('gtm-script') ||
    document.getElementById('gtm-noscript')
  );
}

function hasMetaPixelSnippet(): boolean {
  return !!(
    document.getElementById('meta-pixel-script') ||
    document.getElementById('meta-pixel-noscript')
  );
}

function cleanDom() {
  document.getElementById('gtm-script')?.remove();
  document.getElementById('gtm-noscript')?.remove();
  document.getElementById('meta-pixel-script')?.remove();
  document.getElementById('meta-pixel-noscript')?.remove();
}

/** Render the hook, check DOM, then unmount and clean up. Returns DOM state while mounted. */
function renderAndCheck(
  gtmId: string | null | undefined,
  metaPixelId: string | null | undefined,
): { gtm: boolean; pixel: boolean } {
  cleanDom();
  const { unmount } = renderHook(() =>
    useTrackingInjection({ gtmId, metaPixelId }),
  );
  const result = {
    gtm: hasGtmSnippet(),
    pixel: hasMetaPixelSnippet(),
  };
  act(() => { unmount(); });
  cleanDom();
  return result;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Valid GTM IDs: GTM- followed by 1+ uppercase letters/digits */
const validGtmId = fc.stringMatching(/^GTM-[A-Z0-9]{1,12}$/);

/**
 * Invalid GTM IDs — strings that do NOT match ^GTM-[A-Z0-9]+$
 */
const invalidGtmId = fc.oneof(
  // lowercase letters after GTM-
  fc.stringMatching(/^GTM-[a-z]{1,8}$/),
  // no prefix at all — just uppercase alphanumeric (not starting with GTM-)
  fc.stringMatching(/^[A-Z]{1,3}[0-9]{1,8}$/).filter((s) => !s.startsWith('GTM-')),
  // wrong prefix (e.g. "GA-", "UA-")
  fc.stringMatching(/^(GA|UA|AW)-[A-Z0-9]{1,8}$/),
  // GTM- with special characters appended
  fc.stringMatching(/^GTM-[A-Z0-9]{1,6}[!@#$%]{1}$/),
);

/** Valid Meta Pixel IDs: exactly 15 or 16 numeric digits */
const validMetaPixelId = fc.oneof(
  fc.stringMatching(/^\d{15}$/),
  fc.stringMatching(/^\d{16}$/),
);

/**
 * Invalid Meta Pixel IDs — strings that do NOT match ^\d{15,16}$
 */
const invalidMetaPixelId = fc.oneof(
  // too short: 1-14 digits
  fc.stringMatching(/^\d{1,14}$/),
  // too long: 17-20 digits
  fc.stringMatching(/^\d{17,20}$/),
  // 15 chars but contains a letter
  fc.stringMatching(/^\d{14}[a-zA-Z]$/),
  // 16 chars but contains a letter
  fc.stringMatching(/^\d{15}[a-zA-Z]$/),
);

/** Absent/empty values */
const absentValues = fc.oneof(
  fc.constant(null as null),
  fc.constant(undefined as undefined),
  fc.constant(''),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTrackingInjection — property-based tests', () => {
  beforeEach(() => { cleanDom(); });
  afterEach(() => { cleanDom(); });

  /**
   * Property: GTM só é injetado para IDs no formato GTM-[A-Z0-9]+
   * Validates: Requirements 7.5
   */
  describe('GTM injection', () => {
    it('injects GTM snippet for every valid GTM-[A-Z0-9]+ ID', () => {
      fc.assert(
        fc.property(validGtmId, (gtmId) => {
          const { gtm } = renderAndCheck(gtmId, null);
          return gtm;
        }),
        { numRuns: 50 },
      );
    });

    it('never injects GTM snippet for IDs that do not match GTM-[A-Z0-9]+', () => {
      fc.assert(
        fc.property(invalidGtmId, (gtmId) => {
          const { gtm } = renderAndCheck(gtmId, null);
          return !gtm;
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property: Meta Pixel só é injetado para IDs numéricos de 15-16 dígitos
   * Validates: Requirements 8.5
   */
  describe('Meta Pixel injection', () => {
    it('injects Meta Pixel snippet for every valid 15-16 digit numeric ID', () => {
      fc.assert(
        fc.property(validMetaPixelId, (metaPixelId) => {
          const { pixel } = renderAndCheck(null, metaPixelId);
          return pixel;
        }),
        { numRuns: 50 },
      );
    });

    it('never injects Meta Pixel snippet for IDs that are not 15-16 numeric digits', () => {
      fc.assert(
        fc.property(invalidMetaPixelId, (metaPixelId) => {
          const { pixel } = renderAndCheck(null, metaPixelId);
          return !pixel;
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property: IDs ausentes/vazios nunca injetam snippets
   * Validates: Requirements 7.4, 8.4
   */
  describe('absent/empty IDs', () => {
    it('never injects GTM snippet when gtmId is null, undefined, or empty string', () => {
      fc.assert(
        fc.property(absentValues, (gtmId) => {
          const { gtm } = renderAndCheck(gtmId, null);
          return !gtm;
        }),
        { numRuns: 20 },
      );
    });

    it('never injects Meta Pixel snippet when metaPixelId is null, undefined, or empty string', () => {
      fc.assert(
        fc.property(absentValues, (metaPixelId) => {
          const { pixel } = renderAndCheck(null, metaPixelId);
          return !pixel;
        }),
        { numRuns: 20 },
      );
    });

    it('never injects any snippet when both gtmId and metaPixelId are absent/empty', () => {
      fc.assert(
        fc.property(absentValues, absentValues, (gtmId, metaPixelId) => {
          const { gtm, pixel } = renderAndCheck(gtmId, metaPixelId);
          return !gtm && !pixel;
        }),
        { numRuns: 20 },
      );
    });
  });
});
