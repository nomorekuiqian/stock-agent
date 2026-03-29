import '@testing-library/jest-dom/vitest';

process.env.NEXT_PUBLIC_INSFORGE_URL ??= 'https://example.insforge.app';
process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??= 'test-anon-key';

// cmdk uses ResizeObserver and scrollIntoView which jsdom does not provide
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

Element.prototype.scrollIntoView ??= function () {};

