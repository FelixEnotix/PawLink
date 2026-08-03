import { useCallback, useEffect, useState } from 'react';
import type { UpdateStatusPayload } from '../types/global';

const DEFAULT_STATUS: UpdateStatusPayload = {
  phase: 'idle',
  currentVersion: '…',
  isPackaged: false,
};

export function useAppUpdater() {
  const [status, setStatus] = useState<UpdateStatusPayload>(DEFAULT_STATUS);
  const isDesktop = Boolean(window.pawlink?.getUpdateStatus);

  useEffect(() => {
    if (!window.pawlink?.getUpdateStatus) return;

    void window.pawlink.getUpdateStatus().then(setStatus);
    const unsubscribe = window.pawlink.onUpdateStatus(setStatus);
    return unsubscribe;
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!window.pawlink?.checkForUpdates) return status;
    const next = await window.pawlink.checkForUpdates();
    setStatus(next);
    return next;
  }, [status]);

  const downloadUpdate = useCallback(async () => {
    if (!window.pawlink?.downloadUpdate) return status;
    const next = await window.pawlink.downloadUpdate();
    setStatus(next);
    return next;
  }, [status]);

  const installUpdate = useCallback(async () => {
    if (!window.pawlink?.installUpdate) return;
    await window.pawlink.installUpdate();
  }, []);

  const openUpdateFolder = useCallback(async () => {
    if (!window.pawlink?.openUpdateFolder) return;
    await window.pawlink.openUpdateFolder();
  }, []);

  const hasUpdate =
    status.phase === 'available' ||
    status.phase === 'downloading' ||
    status.phase === 'downloaded' ||
    status.phase === 'installing';

  return {
    status,
    isDesktop,
    hasUpdate,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    openUpdateFolder,
  };
}
