import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PersonaSelector from '../PersonaSelector';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    kolResearch: {
      personas: vi.fn(),
    },
  },
}));

const mockPersonas = vi.mocked(api.kolResearch.personas);

describe('PersonaSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows fallback personas when persona API fails', async () => {
    mockPersonas.mockRejectedValue(new Error('offline'));
    const onChange = vi.fn();

    render(
      <PersonaSelector
        agentKind="research"
        personaUsername={null}
        onChange={onChange}
        requireConfirmBeforeSwitch={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /默认助手/i }));

    expect(await screen.findByText('@Frank')).toBeInTheDocument();
    expect(screen.getByText('@Serenity')).toBeInTheDocument();

    fireEvent.click(screen.getByText('@Serenity'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        agentKind: 'kol_research',
        personaUsername: 'aleabitoreddit',
      });
    });
  });

  it('can switch an active persona back to the default assistant', async () => {
    mockPersonas.mockResolvedValue({
      personas: [
        {
          username: 'qinbafrank',
          display_name: 'Frank',
          description: 'Frank lens',
          lenses_available: ['stock'],
          last_indexed_at: null,
        },
      ],
    });
    const onChange = vi.fn();

    render(
      <PersonaSelector
        agentKind="kol_research"
        personaUsername="qinbafrank"
        onChange={onChange}
        requireConfirmBeforeSwitch={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /qinbafrank/i }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /默认投研助手/i }));

    expect(onChange).toHaveBeenCalledWith({
      agentKind: 'research',
      personaUsername: null,
    });
  });
});
