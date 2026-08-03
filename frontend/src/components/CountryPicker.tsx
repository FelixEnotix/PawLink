import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext';
import {
  AUTO_SELECT_REGIONS,
  COUNTRY_CATALOG,
  countryLabel,
  isRegionFullySelected,
  toggleRegionCountries,
  type RegionId,
} from '../utils/countries';

interface CountryPickerProps {
  selected: string[];
  disabled?: boolean;
  onChange: (countries: string[]) => void | Promise<void>;
}

export function CountryPicker({ selected, disabled, onChange }: CountryPickerProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CATALOG;
    return COUNTRY_CATALOG.filter((item) => {
      const label = countryLabel(item, locale).toLowerCase();
      return item.code.toLowerCase().includes(q) || label.includes(q);
    });
  }, [query, locale]);

  const toggleCountry = (code: string) => {
    const next = selected.includes(code)
      ? selected.filter((item) => item !== code)
      : [...selected, code];
    void onChange(next);
  };

  const toggleRegion = (region: RegionId) => {
    void onChange(toggleRegionCountries(region, selected));
  };

  return (
    <div className="country-picker" ref={rootRef}>
      <div className="country-picker-regions">
        {AUTO_SELECT_REGIONS.map((region) => (
          <button
            key={region}
            type="button"
            className={`auto-select-chip ${isRegionFullySelected(region, selected) ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => toggleRegion(region)}
          >
            {t.settings.autoSelectRegionLabels[region]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="country-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {selected.length === 0
            ? t.settings.autoSelectCountriesAny
            : t.settings.autoSelectCountriesSelected(selected.length)}
        </span>
        <span className="country-picker-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {selected.length > 0 && (
        <div className="country-picker-selected">
          {selected.map((code) => {
            const row = COUNTRY_CATALOG.find((item) => item.code === code);
            if (!row) return null;
            return (
              <button
                key={code}
                type="button"
                className="country-picker-tag"
                disabled={disabled}
                onClick={() => toggleCountry(code)}
                title={t.settings.autoSelectRemoveCountry}
              >
                <span>{row.flag}</span>
                <span>{countryLabel(row, locale)}</span>
                <span aria-hidden="true">×</span>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="country-picker-menu">
          <input
            type="search"
            className="country-picker-search"
            placeholder={t.settings.autoSelectCountriesSearch}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="country-picker-list">
            {filtered.map((item) => {
              const active = selected.includes(item.code);
              return (
                <button
                  key={item.code}
                  type="button"
                  className={`country-picker-option ${active ? 'active' : ''}`}
                  onClick={() => toggleCountry(item.code)}
                >
                  <span className="country-picker-option-flag">{item.flag}</span>
                  <span className="country-picker-option-name">{countryLabel(item, locale)}</span>
                  <span className="country-picker-option-code">{item.code}</span>
                  {active && <span className="country-picker-check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="settings-hint">{t.settings.autoSelectCountriesHint}</p>
    </div>
  );
}
