/**
 * Unit tests for fireConversionEvents
 *
 * Validates: Requirements 9.2, 9.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireConversionEvents } from './conversionEvents';

describe('fireConversionEvents', () => {
  let dataLayerPush: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset dataLayer and fbq before each test
    dataLayerPush = vi.fn();
    Object.defineProperty(window, 'dataLayer', {
      value: { push: dataLayerPush },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'fbq', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // GTM — Requirement 9.2
  // ---------------------------------------------------------------------------

  describe('GTM dataLayer.push (Requirement 9.2)', () => {
    it('calls dataLayer.push({ event: "conversion" }) when gtm_id is valid', () => {
      fireConversionEvents({ gtm_id: 'GTM-ABC123' });
      expect(dataLayerPush).toHaveBeenCalledOnce();
      expect(dataLayerPush).toHaveBeenCalledWith({ event: 'conversion' });
    });

    it('does not call dataLayer.push when gtm_id is null', () => {
      fireConversionEvents({ gtm_id: null });
      expect(dataLayerPush).not.toHaveBeenCalled();
    });

    it('does not call dataLayer.push when gtm_id is undefined', () => {
      fireConversionEvents({ gtm_id: undefined });
      expect(dataLayerPush).not.toHaveBeenCalled();
    });

    it('does not call dataLayer.push when gtm_id is empty string', () => {
      fireConversionEvents({ gtm_id: '' });
      expect(dataLayerPush).not.toHaveBeenCalled();
    });

    it('does not call dataLayer.push when gtm_id has invalid format (lowercase)', () => {
      fireConversionEvents({ gtm_id: 'GTM-abc123' });
      expect(dataLayerPush).not.toHaveBeenCalled();
    });

    it('does not call dataLayer.push when gtm_id has wrong prefix', () => {
      fireConversionEvents({ gtm_id: 'GA-ABC123' });
      expect(dataLayerPush).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Meta Pixel — Requirement 9.3
  // ---------------------------------------------------------------------------

  describe('Meta Pixel fbq (Requirement 9.3)', () => {
    let fbqMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fbqMock = vi.fn();
      Object.defineProperty(window, 'fbq', {
        value: fbqMock,
        writable: true,
        configurable: true,
      });
    });

    it('calls fbq("track", "Purchase") when meta_pixel_id is a valid 15-digit ID', () => {
      fireConversionEvents({ meta_pixel_id: '123456789012345' });
      expect(fbqMock).toHaveBeenCalledOnce();
      expect(fbqMock).toHaveBeenCalledWith('track', 'Purchase');
    });

    it('calls fbq("track", "Purchase") when meta_pixel_id is a valid 16-digit ID', () => {
      fireConversionEvents({ meta_pixel_id: '1234567890123456' });
      expect(fbqMock).toHaveBeenCalledOnce();
      expect(fbqMock).toHaveBeenCalledWith('track', 'Purchase');
    });

    it('does not call fbq when meta_pixel_id is null', () => {
      fireConversionEvents({ meta_pixel_id: null });
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('does not call fbq when meta_pixel_id is undefined', () => {
      fireConversionEvents({ meta_pixel_id: undefined });
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('does not call fbq when meta_pixel_id is empty string', () => {
      fireConversionEvents({ meta_pixel_id: '' });
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('does not call fbq when meta_pixel_id has too few digits (14)', () => {
      fireConversionEvents({ meta_pixel_id: '12345678901234' });
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('does not call fbq when meta_pixel_id has too many digits (17)', () => {
      fireConversionEvents({ meta_pixel_id: '12345678901234567' });
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('does not call fbq when meta_pixel_id contains non-digit characters', () => {
      fireConversionEvents({ meta_pixel_id: '12345678901234X' });
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('does not call fbq when window.fbq is not defined', () => {
      Object.defineProperty(window, 'fbq', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      // Should not throw
      expect(() =>
        fireConversionEvents({ meta_pixel_id: '123456789012345' }),
      ).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Independence — both trackers are independent
  // ---------------------------------------------------------------------------

  describe('independence between GTM and Meta Pixel', () => {
    let fbqMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fbqMock = vi.fn();
      Object.defineProperty(window, 'fbq', {
        value: fbqMock,
        writable: true,
        configurable: true,
      });
    });

    it('fires both when both IDs are valid', () => {
      fireConversionEvents({
        gtm_id: 'GTM-ABC123',
        meta_pixel_id: '123456789012345',
      });
      expect(dataLayerPush).toHaveBeenCalledOnce();
      expect(fbqMock).toHaveBeenCalledOnce();
    });

    it('fires only GTM when meta_pixel_id is absent', () => {
      fireConversionEvents({ gtm_id: 'GTM-ABC123', meta_pixel_id: null });
      expect(dataLayerPush).toHaveBeenCalledOnce();
      expect(fbqMock).not.toHaveBeenCalled();
    });

    it('fires only Meta Pixel when gtm_id is absent', () => {
      fireConversionEvents({ gtm_id: null, meta_pixel_id: '123456789012345' });
      expect(dataLayerPush).not.toHaveBeenCalled();
      expect(fbqMock).toHaveBeenCalledOnce();
    });

    it('fires neither when both IDs are absent', () => {
      fireConversionEvents({ gtm_id: null, meta_pixel_id: null });
      expect(dataLayerPush).not.toHaveBeenCalled();
      expect(fbqMock).not.toHaveBeenCalled();
    });
  });
});
