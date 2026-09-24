// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SetupSection } from '../SetupSection';

// Wrapper to handle controlled state
function SetupSectionWrapper(props: Partial<Parameters<typeof SetupSection>[0]> = {}) {
  const [enabled, setEnabled] = useState(props.enabled ?? false);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const handleFieldChange = (field: string, value: unknown) => {
    setFields(prev => ({ ...prev, [field]: value }));
  };
  return (
    <SetupSection
      enabled={enabled}
      onEnabledChange={(v) => { setEnabled(v); props.onEnabledChange?.(v); }}
      setupValue={fields['setup_value'] as number | undefined}
      setupInstallments={fields['setup_installments'] as number | undefined}
      setupFees={fields['setup_fees'] as number | undefined}
      minDurationMonths={props.minDurationMonths ?? 0}
      onFieldChange={handleFieldChange}
      {...(({ enabled: _e, onEnabledChange: _oe, setupValue: _sv, setupInstallments: _si, setupFees: _sf, minDurationMonths: _md, onFieldChange: _ofc, ...rest }) => rest)(props)}
    />
  );
}

/**
 * Validates: Requirements 6.3, 6.4
 * Property 15: SetupSection interaction tests
 */
describe('SetupSection — interaction tests', () => {
  it('setup fields are hidden when toggle is off', () => {
    render(<SetupSectionWrapper />);
    expect(screen.queryByLabelText(/valor total do setup/i)).not.toBeInTheDocument();
  });

  it('setup fields appear when toggle is enabled', () => {
    render(<SetupSectionWrapper enabled={true} onFieldChange={vi.fn()} />);
    expect(screen.getByLabelText(/valor total do setup/i)).toBeInTheDocument();
  });

  it('cross-validation warning appears when min_duration < setup_installments > 1', () => {
    render(
      <SetupSection
        enabled={true}
        onEnabledChange={vi.fn()}
        setupInstallments={6}
        minDurationMonths={3}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.getByText(/prazo mínimo de permanência não pode ser menor/i)).toBeInTheDocument();
  });

  it('no warning when min_duration >= setup_installments', () => {
    render(
      <SetupSection
        enabled={true}
        onEnabledChange={vi.fn()}
        setupInstallments={6}
        minDurationMonths={6}
        onFieldChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/prazo mínimo de permanência não pode ser menor/i)).not.toBeInTheDocument();
  });
});
