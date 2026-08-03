import type { UpdateStatusPayload } from '../types/global';
import { useI18n } from '../i18n/LocaleContext';

interface SidebarUpdateBannerProps {
  status: UpdateStatusPayload;
  onOpenSettings: () => void;
  onDownload: () => void;
  onInstall: () => void;
}

export function SidebarUpdateBanner({
  status,
  onOpenSettings,
  onDownload,
  onInstall,
}: SidebarUpdateBannerProps) {
  const { t } = useI18n();

  if (!status.isPackaged) return null;
  if (
    status.phase !== 'available' &&
    status.phase !== 'downloading' &&
    status.phase !== 'downloaded' &&
    status.phase !== 'installing'
  ) {
    return null;
  }

  const version = status.availableVersion ?? '';
  const progress =
    status.phase === 'downloading' && typeof status.progress === 'number'
      ? Math.round(status.progress)
      : null;

  return (
    <div className="sidebar-update-banner">
      <button type="button" className="sidebar-update-copy" onClick={onOpenSettings}>
        <strong>{t.layout.updateAvailable(version)}</strong>
        <span>
          {status.phase === 'installing'
            ? t.settings.updatesInstalling
            : status.phase === 'downloaded'
              ? t.layout.updateReadyToInstall
              : status.phase === 'downloading'
                ? t.layout.updateDownloading(progress ?? 0)
                : t.layout.updateTapForDetails}
        </span>
      </button>
      {status.phase === 'available' && (
        <button type="button" className="btn btn-primary sidebar-update-action" onClick={onDownload}>
          {t.layout.updateDownload}
        </button>
      )}
      {status.phase === 'downloaded' && (
        <button type="button" className="btn btn-primary sidebar-update-action" onClick={onInstall}>
          {t.layout.updateInstall}
        </button>
      )}
    </div>
  );
}
