// Polyfill requestAnimationFrame and cancelAnimationFrame for jsdom
if (typeof window !== "undefined") {
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16);
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
}

// Mock localStorage
const localStorageStore: Record<string, string> = {};
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, value: string) => {
        localStorageStore[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageStore[key];
      },
      clear: () => {
        for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
      },
      get length() {
        return Object.keys(localStorageStore).length;
      },
      key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
    },
    writable: true,
  });
}
