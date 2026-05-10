import i18next from 'i18next';
import es from '../locales/es.json';

export const defaultNS = 'translation';
export const resources = {
  es: { translation: es },
} as const;

export type Resources = typeof resources;

export function createI18nInstance() {
  const instance = i18next.createInstance();
  instance.init({
    lng: 'es',
    fallbackLng: 'es',
    defaultNS,
    resources,
    compatibilityJSON: 'v3',
    interpolation: {
      escapeValue: false,
    },
  });
  return instance;
}

export default createI18nInstance();
