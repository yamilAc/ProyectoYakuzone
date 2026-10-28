import { render, screen } from '@testing-library/react';

jest.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };

  return {
    __esModule: true,
    default: { create: jest.fn(() => instance) },
  };
});

import App from './App';

test('renders the login screen when unauthenticated', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
});
