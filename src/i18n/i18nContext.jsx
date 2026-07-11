import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from './en.json';
import hi from './hi.json';
import db from '../db';

const locales = { en, hi };

const I18nContext = createContext(null);

/**
 * I18nProvider — wraps the app to provide real-time language switching.
 * Language preference is persisted in IndexedDB (dairyConfig.language).
 */
export function I18nProvider({ children }) {
  const [locale, setLocale] = useState('en');

  // Load saved language preference from IndexedDB on mount
  useEffect(() => {
    db.dairyConfig.get(1).then((config) => {
      if (config?.language) {
        setLocale(config.language);
      }
    });
  }, []);

  /**
   * Switch language and persist to IndexedDB.
   * @param {'en' | 'hi'} lang
   */
  const switchLanguage = useCallback(async (lang) => {
    if (locales[lang]) {
      setLocale(lang);
      await db.dairyConfig.update(1, { language: lang });
    }
  }, []);

  /**
   * Translate a key to the current locale string.
   * Falls back to English, then to the raw key if not found.
   * @param {string} key — dot-notation key (e.g. 'purchase.farmerCode')
   * @returns {string}
   */
  const t = useCallback(
    (key) => {
      return locales[locale]?.[key] || locales.en?.[key] || key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t, switchLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Hook to access i18n translation and language switching.
 * @returns {{ locale: string, t: (key: string) => string, switchLanguage: (lang: string) => void }}
 */
export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return ctx;
}
