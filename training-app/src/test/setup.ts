import '@testing-library/jest-dom';

globalThis.URL.createObjectURL = vi.fn(() => 'blob://test-url');
globalThis.URL.revokeObjectURL = vi.fn();