import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useActiveTurn, useKingdom } from '../hooks/useRecords';
import { useSse } from '../hooks/useSse';

const NAV = [
  { to: '/kingdom', label: 'Kingdom' },
  { to: '/skills', label: 'Skills' },
  { to: '/leaders', label: 'Leaders' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem('km-theme') === 'light' ? 'light' : 'dark',
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('km-theme', next);
    } catch {
      /* private mode */
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
  };
  return (
    <button
      className="btn-ghost px-2"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

export function Layout() {
  useSse();
  const { data: kingdom } = useKingdom();
  const { data: turn } = useActiveTurn();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="text-lg">🏰</span>
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Kingdom Manager
            </h1>
            {kingdom?.data.name && (
              <span className="truncate text-base font-bold">{kingdom.data.name}</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {turn ? (
              <span className="rounded-full bg-amber-600/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                Turn {turn.data.number}
                {turn.data.inGameDate ? ` · ${turn.data.inGameDate}` : ''}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                No active turn
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-44 shrink-0 border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-amber-600/15 text-amber-700 dark:text-amber-400'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}