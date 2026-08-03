import { useMemo } from 'react';
import type { BlockedServer, EndpointProfile } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';
import { getFlag, stripLeadingFlag } from '../utils/format';
import { isProfileBlocked } from '../utils/blockedServers';

interface BlockedServersPanelProps {
  profiles: EndpointProfile[];
  blocked: BlockedServer[];
  disabled?: boolean;
  onChange: (blocked: BlockedServer[]) => void | Promise<void>;
}

export function BlockedServersPanel({
  profiles,
  blocked,
  disabled,
  onChange,
}: BlockedServersPanelProps) {
  const { t } = useI18n();

  const orphaned = useMemo(
    () =>
      blocked.filter(
        (entry) =>
          !profiles.some(
            (profile) =>
              profile.id === entry.profile_id ||
              (profile.host === entry.host && profile.port === entry.port),
          ),
      ),
    [blocked, profiles],
  );

  const toggleProfile = (profile: EndpointProfile) => {
    if (isProfileBlocked(profile, blocked)) {
      void onChange(
        blocked.filter(
          (entry) =>
            entry.profile_id !== profile.id &&
            !(entry.host === profile.host && entry.port === profile.port),
        ),
      );
      return;
    }

    void onChange([
      ...blocked,
      {
        id: crypto.randomUUID(),
        name: profile.name,
        host: profile.host,
        port: profile.port,
        profile_id: profile.id,
        added_at: Date.now() / 1000,
      },
    ]);
  };

  const removeOrphan = (id: string) => {
    void onChange(blocked.filter((entry) => entry.id !== id));
  };

  return (
    <div className="blocked-servers-panel">
      <p className="settings-hint">{t.settings.blockedServersHint}</p>

      {profiles.length === 0 && orphaned.length === 0 && (
        <p className="blocked-servers-empty">{t.settings.blockedServersEmpty}</p>
      )}

      {profiles.length > 0 && (
        <div className="blocked-servers-list">
          {profiles.map((profile) => {
            const active = isProfileBlocked(profile, blocked);
            return (
              <label
                key={profile.id}
                className={`blocked-server-row ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={disabled}
                  onChange={() => toggleProfile(profile)}
                />
                <span className="blocked-server-flag">{getFlag(profile.name)}</span>
                <span className="blocked-server-copy">
                  <strong>{stripLeadingFlag(profile.name)}</strong>
                  <small>
                    {profile.host}:{profile.port}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {orphaned.length > 0 && (
        <div className="blocked-servers-orphans">
          <strong>{t.settings.blockedServersSaved}</strong>
          {orphaned.map((entry) => (
            <div key={entry.id} className="blocked-server-orphan">
              <span>{stripLeadingFlag(entry.name)}</span>
              <small>
                {entry.host}:{entry.port}
              </small>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled}
                onClick={() => removeOrphan(entry.id)}
              >
                {t.settings.blockedServersRemove}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
