import '@testing-library/jest-dom'

// jsdom has no ResizeObserver; ScaleWrapper (and any resize-aware component)
// needs it. A no-op mock is enough for rendering — layout math isn't exercised
// under jsdom (elements have no real size there).
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
