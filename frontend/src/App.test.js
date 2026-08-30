import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-konva', () => ({
  Stage: ({ children }) => <div data-testid="konva-stage">{children}</div>,
  Layer: ({ children }) => <div>{children}</div>,
  Rect: () => null,
  Line: () => null,
  Circle: () => null,
  Group: ({ children }) => <div>{children}</div>,
  Label: ({ children }) => <div>{children}</div>,
  Tag: () => null,
  Text: () => null,
}));

jest.mock('./api/authApi', () => ({
  getCurrentUser: jest.fn().mockResolvedValue({
    status: 'success',
    data: { roles: ['ROLE_GUEST'], isAuthenticated: false },
  }),
  login: jest.fn(),
  logout: jest.fn(),
}));

test('renders MapForge landing entry points', async () => {
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'MapForge' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Browse a Map/i })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /Admin Sign In/i }).length).toBeGreaterThan(0);
});
