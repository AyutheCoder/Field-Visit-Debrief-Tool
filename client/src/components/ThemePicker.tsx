import { useState, useEffect } from 'react';

const THEMES = [
  { id: 'default', label: 'Teal (Default)', icon: '💧' },
  { id: 'sunset', label: 'Sunset', icon: '🌅' },
  { id: 'blue', label: 'Ocean Blue', icon: '🌊' },
  { id: 'metallic', label: 'Metallic', icon: '⚙️' },
  { id: 'forest', label: 'Forest', icon: '🌲' },
  { id: 'dark', label: 'Dark Mode', icon: '🌙' },
];

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('default');

  useEffect(() => {
    const saved = localStorage.getItem('app-theme') || 'default';
    setCurrentTheme(saved);
    if (saved !== 'default') {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, []);

  const selectTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    localStorage.setItem('app-theme', themeId);
    if (themeId !== 'default') {
      document.documentElement.setAttribute('data-theme', themeId);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    setOpen(false);
  };

  const active = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm ring-1 ring-gray-200 hover:bg-gray-200"
        title={`Theme: ${active.label}`}
      >
        {active.icon}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Choose Theme</p>
            </div>
            <div className="py-1">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTheme(t.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    currentTheme === t.id
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
