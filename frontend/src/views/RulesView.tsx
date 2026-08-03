import { useState } from 'react';
import type { useBackendState } from '../api/useBackend';
import type { RoutingMode } from '../api/types';
import { RoutingModeSelector } from '../components/RoutingModeSelector';
import { ShieldIcon, PlusIcon, FolderIcon } from '../components/icons';

interface RulesViewProps {
  backend: ReturnType<typeof useBackendState>;
}

function ruleActionLabel(action: string): string {
  if (action === 'PROXY') return 'ТУННЕЛЬ';
  if (action === 'DIRECT') return 'НАПРЯМУЮ';
  return action;
}

export function RulesView({ backend }: RulesViewProps) {
  const { state, addRule, removeRule, setRoutingMode } = backend;
  const [input, setInput] = useState('');
  const [action, setAction] = useState<'PROXY' | 'DIRECT'>('PROXY');
  const [submitting, setSubmitting] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rules = state?.custom_rules ?? [];
  const routingMode: RoutingMode = state?.routing_mode ?? 'rule';

  const handleRemove = async (index: number) => {
    setRemovingIdx(index);
    setError(null);
    try {
      await removeRule(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить правило');
    } finally {
      setRemovingIdx(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addRule(input.trim(), action);
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить правило');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickExe = async () => {
    setError(null);
    if (!window.pawlink?.pickExecutable) {
      setError('Выбор .exe доступен только в десктоп-приложении');
      return;
    }
    const filePath = await window.pawlink.pickExecutable();
    if (!filePath) return;
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    setInput(name);
  };

  const handleRoutingMode = async (mode: RoutingMode) => {
    if (mode === routingMode) return;
    setModeBusy(true);
    setError(null);
    try {
      await setRoutingMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить режим');
    } finally {
      setModeBusy(false);
    }
  };

  return (
    <div className="view rules-view">
      <header className="view-header">
        <p className="subtitle">
          Домены, ключевые слова или приложения (.exe) — глобальный режим ниже
        </p>
      </header>

      <div className="panel routing-panel">
        <div className="panel-title">
          <ShieldIcon size={15} />
          Глобальный режим
        </div>
        <RoutingModeSelector
          value={routingMode}
          disabled={modeBusy}
          onChange={handleRoutingMode}
        />
        <p className="hint" style={{ marginTop: 10 }}>
          «По правилам» — умная маршрутизация. «Весь трафик» — всё через VPN. «Напрямую» — без
          туннеля. Исключения ниже работают только в режиме «По правилам».
        </p>
      </div>

      <div className="panel">
        <div className="panel-title">
          <PlusIcon size={15} />
          Новое правило
        </div>
        <form className="rule-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="input"
            placeholder="example.com, chrome.exe или путь к .exe"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="button" className="btn btn-ghost" onClick={handlePickExe} title="Выбрать .exe">
            <FolderIcon size={16} />
          </button>
          <select
            className="input select"
            value={action}
            onChange={(e) => setAction(e.target.value as 'PROXY' | 'DIRECT')}
          >
            <option value="PROXY">Через туннель</option>
            <option value="DIRECT">Напрямую</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={submitting || !input.trim()}>
            {submitting ? '...' : 'Добавить'}
          </button>
        </form>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      <div className="rules-list" style={{ marginTop: 14 }}>
        {rules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShieldIcon size={26} />
            </div>
            <p className="empty-state-title">Правила не добавлены</p>
            <span className="hint">
              URL преобразуются в домены, chrome.exe — в правило PROCESS-NAME для приложения
            </span>
          </div>
        ) : (
          rules.map((rule, idx) => (
            <div key={`${rule.value}-${idx}`} className="rule-item">
              <span className={`rule-type type-${rule.rule_type}`}>{rule.rule_type}</span>
              <span className="rule-value">{rule.value}</span>
              <span className={`rule-action action-${rule.action.toLowerCase()}`}>
                {ruleActionLabel(rule.action)}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost rule-remove"
                title="Удалить правило"
                onClick={() => handleRemove(idx)}
                disabled={removingIdx !== null}
              >
                {removingIdx === idx ? '...' : '×'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
