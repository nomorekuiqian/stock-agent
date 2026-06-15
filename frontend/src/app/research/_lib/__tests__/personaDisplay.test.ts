import { describe, expect, it } from 'vitest';

import {
  getPersonaDisplayLabel,
  getPersonaDisplayName,
  replacePersonaUsernamesForDisplay,
} from '../personaDisplay';

describe('persona display helpers', () => {
  it('shows pandacircle as the circle name without @ prefix', () => {
    expect(getPersonaDisplayName('pandacircle')).toBe('潘大的科技交流圈');
    expect(getPersonaDisplayLabel('pandacircle')).toBe('潘大的科技交流圈');
  });

  it('keeps handle-style labels for regular personas', () => {
    expect(getPersonaDisplayLabel('qinbafrank', 'Frank')).toBe('@Frank');
  });

  it('replaces visible pandacircle mentions without rewriting URLs', () => {
    expect(replacePersonaUsernamesForDisplay('@pandacircle · AMD')).toBe(
      '潘大的科技交流圈 · AMD',
    );
    expect(replacePersonaUsernamesForDisplay('按 pandacircle 方法论')).toBe(
      '按 潘大的科技交流圈 方法论',
    );
    expect(
      replacePersonaUsernamesForDisplay('https://x.com/pandacircle/status/1'),
    ).toBe('https://x.com/pandacircle/status/1');
  });
});
