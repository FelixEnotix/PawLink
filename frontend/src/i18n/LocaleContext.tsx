import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { catalogs, type Locale, type Messages } from './messages';

const STORAGE_KEY = 'pawlink.locale';

type LocaleContextValue = {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isLocale(raw)) return raw;
  } catch {
    // ignore
  }
  return 'ru';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    let cancelled = false;
    void window.pawlink?.getPreferences?.().then((prefs) => {
      if (cancelled) return;
      if (isLocale(prefs.language) && prefs.language !== locale) {
        setLocaleState(prefs.language);
        try {
          localStorage.setItem(STORAGE_KEY, prefs.language);
        } catch {
          // ignore
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // Only sync once from desktop preferences on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    document.documentElement.lang = next === 'ru' ? 'ru' : 'en';
    if (window.pawlink?.setPreferences) {
      await window.pawlink.setPreferences({ language: next });
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'ru' ? 'ru' : 'en';
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: catalogs[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useI18n must be used within LocaleProvider');
  }
  return ctx;
}
