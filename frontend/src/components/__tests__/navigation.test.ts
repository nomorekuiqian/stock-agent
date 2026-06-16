import { describe, expect, it } from 'vitest';

import { getMainNavSections, isNavHrefActive } from '../navigation';

describe('navigation helpers', () => {
  it('keeps exact child nav items from matching nested routes', () => {
    expect(isNavHrefActive('/for-you/monitor', '/for-you', true)).toBe(false);
    expect(isNavHrefActive('/for-you', '/for-you', true)).toBe(true);
  });

  it('keeps non-exact parent nav items active for nested routes', () => {
    expect(isNavHrefActive('/for-you/monitor', '/for-you')).toBe(true);
  });

  it('includes AI monitor as an exact For You child route', () => {
    const sections = getMainNavSections({
      forYouV2: true,
      watchlistExtended: true,
      isAdmin: false,
    });
    const mySection = sections.find((section) => section.href === '/for-you');
    const monitorChild = mySection?.children?.find(
      (child) => child.href === '/for-you/monitor',
    );

    expect(monitorChild).toEqual({
      href: '/for-you/monitor',
      label: 'AI 监控台',
      exact: true,
    });
  });
});
