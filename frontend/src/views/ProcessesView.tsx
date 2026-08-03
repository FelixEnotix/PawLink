import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { useBackendState } from '../api/useBackend';
import type { RunningProcess } from '../api/types';
import { SearchIcon, FolderIcon, RefreshIcon, AppsIcon } from '../components/icons';

interface ProcessesViewProps {
  backend: ReturnType<typeof useBackendState>;
}

function basename(fullPath: string): string {
  const parts = fullPath.split(/[\\/]/);
  return parts[parts.length - 1] || fullPath;
}

export function ProcessesView({ backend }: ProcessesViewProps) {
  const { state, addProcessTunnel, removeProcessTunnel } = backend;
  const [processes, setProcesses] = useState<RunningProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'include' | 'exclude'>('include');
  const [error, setError] = useState<string | null>(null);
  const [pendingExecutable, setPendingExecutable] = useState<string | null>(null);

  const tunnels = state?.process_tunnels ?? [];
  const tunnelMap = new Map(tunnels.map((t) => [t.executable, t.mode]));

  const loadProcesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProcesses();
      setProcesses(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить список процессов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  const filtered = processes.filter(
    (p) =>
      p.executable.toLowerCase().includes(filter.toLowerCase()) ||
      p.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const handleAdd = async (executable: string) => {
    setPendingExecutable(executable);
    setError(null);
    try {
      await addProcessTunnel(executable, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка добавления');
    } finally {
      setPendingExecutable(null);
    }
  };

  const handleRemove = async (executable: string) => {
    setPendingExecutable(executable);
    setError(null);
    try {
      await removeProcessTunnel(executable);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setPendingExecutable(null);
    }
  };

  const handlePickFile = async () => {
    if (!window.pawlink?.pickExecutable) {
      setError('Выбор файла доступен только в десктоп-приложении');
      return;
    }
    const filePath = await window.pawlink.pickExecutable();
    if (!filePath) return;
    await handleAdd(basename(filePath));
  };

  return (
    <div className="view processes-view">
      <header className="view-header">
        <div>
          <p className="subtitle">Раздельное туннелирование для конкретных программ</p>
        </div>
        <div className="mode-toggle">
          <button
            className={`btn btn-sm ${mode === 'include' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('include')}
          >
            Включить
          </button>
          <button
            className={`btn btn-sm ${mode === 'exclude' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('exclude')}
          >
            Исключить
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="input-wrap">
          <SearchIcon size={16} />
          <input
            type="text"
            className="input"
            placeholder="Поиск процесса..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost" onClick={handlePickFile}>
          <FolderIcon size={16} />
          Выбрать файл
        </button>
        <button className="btn btn-ghost" onClick={loadProcesses} disabled={loading}>
          <RefreshIcon size={16} className={loading ? 'spin' : undefined} />
          {loading ? 'Загрузка' : 'Обновить'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="process-list">
        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <span className="hint">Загрузка процессов...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <AppsIcon size={26} />
            </div>
            <p className="empty-state-title">Процессы не найдены</p>
            <span className="hint">Попробуйте изменить поисковый запрос</span>
          </div>
        ) : (
          filtered.map((proc) => {
            const existing = tunnelMap.get(proc.executable);
            return (
              <div key={proc.executable} className="process-item">
                <div className="process-icon">{proc.name.charAt(0).toUpperCase()}</div>
                <div className="process-info">
                  <div className="process-name">{proc.name}</div>
                  <div className="process-path">{proc.exe_path ?? '—'}</div>
                </div>
                {existing ? (
                  <button
                    className={`btn btn-sm badge badge-${existing === 'include' ? 'green' : 'red'}`}
                    onClick={() => handleRemove(proc.executable)}
                    disabled={pendingExecutable === proc.executable}
                  >
                    {pendingExecutable === proc.executable
                      ? 'Удаление...'
                      : existing === 'include'
                        ? 'Убрать (включен)'
                        : 'Убрать (исключен)'}
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleAdd(proc.executable)}
                    disabled={pendingExecutable === proc.executable}
                  >
                    {pendingExecutable === proc.executable ? 'Добавление...' : 'Добавить'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {tunnels.length > 0 && (
        <section className="panel tunnel-summary">
          <div className="panel-title">
            <AppsIcon size={15} />
            Активные правила ({tunnels.length})
          </div>
          <div className="tunnel-list">
            {tunnels.map((t) => (
              <span
                key={t.executable}
                className={`tunnel-chip ${t.mode}`}
                onClick={() => handleRemove(t.executable)}
                title="Нажмите, чтобы удалить"
              >
                {t.executable} · {t.mode === 'include' ? 'включен' : 'исключен'}
                <span className="tunnel-chip-remove">×</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
