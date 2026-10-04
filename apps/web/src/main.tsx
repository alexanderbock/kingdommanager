import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The dev server can still be booting when the page first loads;
      // back off and retry instead of surfacing an error.
      retry: 6,
      retryDelay: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 8000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// Vite's BASE_URL is "/" or "/kingdom/"; the router wants no trailing slash.
const base = import.meta.env.BASE_URL;
const basename = base === '/' ? '/' : base.replace(/\/+$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);