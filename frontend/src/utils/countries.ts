import type { Locale } from '../i18n/messages';

export type RegionId = 'EU' | 'US' | 'ASIA' | 'ME' | 'CIS' | 'RU';

export interface CountryOption {
  code: string;
  flag: string;
  nameRu: string;
  nameEn: string;
  regions: RegionId[];
}

export const COUNTRY_CATALOG: CountryOption[] = [
  { code: 'DE', flag: '🇩🇪', nameRu: 'Германия', nameEn: 'Germany', regions: ['EU'] },
  { code: 'FR', flag: '🇫🇷', nameRu: 'Франция', nameEn: 'France', regions: ['EU'] },
  { code: 'NL', flag: '🇳🇱', nameRu: 'Нидерланды', nameEn: 'Netherlands', regions: ['EU'] },
  { code: 'GB', flag: '🇬🇧', nameRu: 'Великобритания', nameEn: 'United Kingdom', regions: ['EU'] },
  { code: 'FI', flag: '🇫🇮', nameRu: 'Финляндия', nameEn: 'Finland', regions: ['EU'] },
  { code: 'SE', flag: '🇸🇪', nameRu: 'Швеция', nameEn: 'Sweden', regions: ['EU'] },
  { code: 'PL', flag: '🇵🇱', nameRu: 'Польша', nameEn: 'Poland', regions: ['EU'] },
  { code: 'IT', flag: '🇮🇹', nameRu: 'Италия', nameEn: 'Italy', regions: ['EU'] },
  { code: 'ES', flag: '🇪🇸', nameRu: 'Испания', nameEn: 'Spain', regions: ['EU'] },
  { code: 'CZ', flag: '🇨🇿', nameRu: 'Чехия', nameEn: 'Czechia', regions: ['EU'] },
  { code: 'AT', flag: '🇦🇹', nameRu: 'Австрия', nameEn: 'Austria', regions: ['EU'] },
  { code: 'BE', flag: '🇧🇪', nameRu: 'Бельгия', nameEn: 'Belgium', regions: ['EU'] },
  { code: 'DK', flag: '🇩🇰', nameRu: 'Дания', nameEn: 'Denmark', regions: ['EU'] },
  { code: 'NO', flag: '🇳🇴', nameRu: 'Норвегия', nameEn: 'Norway', regions: ['EU'] },
  { code: 'IE', flag: '🇮🇪', nameRu: 'Ирландия', nameEn: 'Ireland', regions: ['EU'] },
  { code: 'PT', flag: '🇵🇹', nameRu: 'Португалия', nameEn: 'Portugal', regions: ['EU'] },
  { code: 'RO', flag: '🇷🇴', nameRu: 'Румыния', nameEn: 'Romania', regions: ['EU'] },
  { code: 'HU', flag: '🇭🇺', nameRu: 'Венгрия', nameEn: 'Hungary', regions: ['EU'] },
  { code: 'GR', flag: '🇬🇷', nameRu: 'Греция', nameEn: 'Greece', regions: ['EU'] },
  { code: 'BG', flag: '🇧🇬', nameRu: 'Болгария', nameEn: 'Bulgaria', regions: ['EU'] },
  { code: 'SK', flag: '🇸🇰', nameRu: 'Словакия', nameEn: 'Slovakia', regions: ['EU'] },
  { code: 'SI', flag: '🇸🇮', nameRu: 'Словения', nameEn: 'Slovenia', regions: ['EU'] },
  { code: 'HR', flag: '🇭🇷', nameRu: 'Хорватия', nameEn: 'Croatia', regions: ['EU'] },
  { code: 'RS', flag: '🇷🇸', nameRu: 'Сербия', nameEn: 'Serbia', regions: ['EU'] },
  { code: 'LU', flag: '🇱🇺', nameRu: 'Люксембург', nameEn: 'Luxembourg', regions: ['EU'] },
  { code: 'LV', flag: '🇱🇻', nameRu: 'Латвия', nameEn: 'Latvia', regions: ['EU'] },
  { code: 'LT', flag: '🇱🇹', nameRu: 'Литва', nameEn: 'Lithuania', regions: ['EU'] },
  { code: 'EE', flag: '🇪🇪', nameRu: 'Эстония', nameEn: 'Estonia', regions: ['EU'] },
  { code: 'IS', flag: '🇮🇸', nameRu: 'Исландия', nameEn: 'Iceland', regions: ['EU'] },
  { code: 'CH', flag: '🇨🇭', nameRu: 'Швейцария', nameEn: 'Switzerland', regions: ['EU'] },
  { code: 'US', flag: '🇺🇸', nameRu: 'США', nameEn: 'United States', regions: ['US'] },
  { code: 'CA', flag: '🇨🇦', nameRu: 'Канада', nameEn: 'Canada', regions: ['US'] },
  { code: 'JP', flag: '🇯🇵', nameRu: 'Япония', nameEn: 'Japan', regions: ['ASIA'] },
  { code: 'SG', flag: '🇸🇬', nameRu: 'Сингапур', nameEn: 'Singapore', regions: ['ASIA'] },
  { code: 'HK', flag: '🇭🇰', nameRu: 'Гонконг', nameEn: 'Hong Kong', regions: ['ASIA'] },
  { code: 'KR', flag: '🇰🇷', nameRu: 'Корея', nameEn: 'South Korea', regions: ['ASIA'] },
  { code: 'TW', flag: '🇹🇼', nameRu: 'Тайвань', nameEn: 'Taiwan', regions: ['ASIA'] },
  { code: 'TH', flag: '🇹🇭', nameRu: 'Таиланд', nameEn: 'Thailand', regions: ['ASIA'] },
  { code: 'VN', flag: '🇻🇳', nameRu: 'Вьетнам', nameEn: 'Vietnam', regions: ['ASIA'] },
  { code: 'MY', flag: '🇲🇾', nameRu: 'Малайзия', nameEn: 'Malaysia', regions: ['ASIA'] },
  { code: 'ID', flag: '🇮🇩', nameRu: 'Индонезия', nameEn: 'Indonesia', regions: ['ASIA'] },
  { code: 'PH', flag: '🇵🇭', nameRu: 'Филиппины', nameEn: 'Philippines', regions: ['ASIA'] },
  { code: 'IN', flag: '🇮🇳', nameRu: 'Индия', nameEn: 'India', regions: ['ASIA'] },
  { code: 'AE', flag: '🇦🇪', nameRu: 'ОАЭ', nameEn: 'UAE', regions: ['ME'] },
  { code: 'TR', flag: '🇹🇷', nameRu: 'Турция', nameEn: 'Turkey', regions: ['ME'] },
  { code: 'IL', flag: '🇮🇱', nameRu: 'Израиль', nameEn: 'Israel', regions: ['ME'] },
  { code: 'SA', flag: '🇸🇦', nameRu: 'Саудовская Аравия', nameEn: 'Saudi Arabia', regions: ['ME'] },
  { code: 'QA', flag: '🇶🇦', nameRu: 'Катар', nameEn: 'Qatar', regions: ['ME'] },
  { code: 'KW', flag: '🇰🇼', nameRu: 'Кувейт', nameEn: 'Kuwait', regions: ['ME'] },
  { code: 'IR', flag: '🇮🇷', nameRu: 'Иран', nameEn: 'Iran', regions: ['ME'] },
  { code: 'IQ', flag: '🇮🇶', nameRu: 'Ирак', nameEn: 'Iraq', regions: ['ME'] },
  { code: 'UA', flag: '🇺🇦', nameRu: 'Украина', nameEn: 'Ukraine', regions: ['CIS'] },
  { code: 'BY', flag: '🇧🇾', nameRu: 'Беларусь', nameEn: 'Belarus', regions: ['CIS'] },
  { code: 'KZ', flag: '🇰🇿', nameRu: 'Казахстан', nameEn: 'Kazakhstan', regions: ['CIS'] },
  { code: 'AM', flag: '🇦🇲', nameRu: 'Армения', nameEn: 'Armenia', regions: ['CIS'] },
  { code: 'AZ', flag: '🇦🇿', nameRu: 'Азербайджан', nameEn: 'Azerbaijan', regions: ['CIS'] },
  { code: 'GE', flag: '🇬🇪', nameRu: 'Грузия', nameEn: 'Georgia', regions: ['CIS'] },
  { code: 'MD', flag: '🇲🇩', nameRu: 'Молдова', nameEn: 'Moldova', regions: ['CIS'] },
  { code: 'KG', flag: '🇰🇬', nameRu: 'Кыргызстан', nameEn: 'Kyrgyzstan', regions: ['CIS'] },
  { code: 'TJ', flag: '🇹🇯', nameRu: 'Таджикистан', nameEn: 'Tajikistan', regions: ['CIS'] },
  { code: 'TM', flag: '🇹🇲', nameRu: 'Туркменистан', nameEn: 'Turkmenistan', regions: ['CIS'] },
  { code: 'UZ', flag: '🇺🇿', nameRu: 'Узбекистан', nameEn: 'Uzbekistan', regions: ['CIS'] },
  { code: 'RU', flag: '🇷🇺', nameRu: 'Россия', nameEn: 'Russia', regions: ['RU'] },
  { code: 'AU', flag: '🇦🇺', nameRu: 'Австралия', nameEn: 'Australia', regions: [] },
  { code: 'BR', flag: '🇧🇷', nameRu: 'Бразилия', nameEn: 'Brazil', regions: [] },
];

export const AUTO_SELECT_REGIONS: RegionId[] = ['EU', 'US', 'ASIA', 'ME', 'CIS', 'RU'];

export function countryLabel(option: CountryOption, locale: Locale): string {
  return locale === 'en' ? option.nameEn : option.nameRu;
}

export function regionCountryCodes(region: RegionId): string[] {
  return COUNTRY_CATALOG.filter((item) => item.regions.includes(region)).map((item) => item.code);
}

export function isRegionFullySelected(region: RegionId, selected: string[]): boolean {
  const codes = regionCountryCodes(region);
  return codes.length > 0 && codes.every((code) => selected.includes(code));
}

export function toggleRegionCountries(region: RegionId, selected: string[]): string[] {
  const codes = regionCountryCodes(region);
  if (isRegionFullySelected(region, selected)) {
    return selected.filter((code) => !codes.includes(code));
  }
  return [...new Set([...selected, ...codes])];
}

export function formatCountriesSummary(selected: string[], locale: Locale): string {
  if (selected.length === 0) return locale === 'en' ? 'Any country' : 'Любая страна';
  if (selected.length <= 3) {
    return selected
      .map((code) => {
        const row = COUNTRY_CATALOG.find((item) => item.code === code);
        return row ? `${row.flag} ${countryLabel(row, locale)}` : code;
      })
      .join(', ');
  }
  return locale === 'en' ? `${selected.length} countries` : `${selected.length} стран`;
}
