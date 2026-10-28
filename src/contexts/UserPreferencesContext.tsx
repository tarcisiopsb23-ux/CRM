import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type FontSize = 'sm' | 'base' | 'lg' | 'xl';
type SidebarColor = 'default' | 'indigo' | 'blue' | 'slate' | 'zinc';

interface UserPreferencesContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  sidebarColor: SidebarColor;
  setSidebarColor: (color: SidebarColor) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

/** Retorna true se a rota atual é do dashboard do cliente C8 Control (nunca deve ter tema do CRM aplicado) */
function isPublicDashboardRoute() {
  const path = window.location.pathname;
  // Rotas do CRM interno (Maestr.IA)
  if (path.startsWith('/public/dashboard/') || path.startsWith('/demo/dashboard')) return true;
  // Rotas do C8 Control — /:slug/* onde slug não é uma rota de sistema
  const systemRoutes = ['/login', '/booking', '/form', '/pixel-test', '/r', '/google-calendar-callback', '/oauth', '/meta-review'];
  if (systemRoutes.some(r => path.startsWith(r))) return false;
  // Se tem um segmento de slug seguido de qualquer coisa, é dashboard do cliente
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 1 && !systemRoutes.some(r => path.startsWith(r))) return true;
  return false;
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('maestr-ia-theme');
    return (saved as Theme) || 'system';
  });

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const saved = localStorage.getItem('maestr-ia-font-size');
    return (saved as FontSize) || 'base';
  });

  const [sidebarColor, setSidebarColor] = useState<SidebarColor>(() => {
    const saved = localStorage.getItem('maestr-ia-sidebar-color');
    return (saved as SidebarColor) || 'default';
  });

  // Persistência e aplicação do tema — ignora rotas do dashboard público
  useEffect(() => {
    if (isPublicDashboardRoute()) return;
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem('maestr-ia-theme', theme);
  }, [theme]);

  // Aplicação do tamanho da fonte
  useEffect(() => {
    const root = window.document.documentElement;
    const fontSizes = {
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
    };
    root.style.fontSize = fontSizes[fontSize];
    localStorage.setItem('maestr-ia-font-size', fontSize);
  }, [fontSize]);

  // Aplicação da cor da sidebar — ignora rotas do dashboard público
  useEffect(() => {
    if (isPublicDashboardRoute()) return;
    const root = window.document.documentElement;
    root.setAttribute('data-sidebar-color', sidebarColor);
    localStorage.setItem('maestr-ia-sidebar-color', sidebarColor);
  }, [sidebarColor]);

  // Listener para mudança de tema do sistema — ignora rotas do dashboard público
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (isPublicDashboardRoute()) return;
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(mediaQuery.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <UserPreferencesContext.Provider
      value={{
        theme,
        setTheme,
        fontSize,
        setFontSize,
        sidebarColor,
        setSidebarColor,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
}
