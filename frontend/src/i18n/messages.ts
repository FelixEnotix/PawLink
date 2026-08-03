export type Locale = 'ru' | 'en';

export type Messages = {
  nav: {
    home: string;
    nodes: string;
    routing: string;
    import: string;
    logs: string;
    settings: string;
    aria: string;
  };
  layout: {
    connected: string;
    disconnected: string;
    wait: string;
    clickDisconnect: string;
    clickConnect: string;
    vpnOn: string;
    vpnOff: string;
    connecting: string;
    reconnecting: string;
    noLink: string;
    noLinkHint: string;
    disconnectVpn: string;
    connectVpn: string;
    cancelConnect: string;
    updateAvailable: (version: string) => string;
    updateTapForDetails: string;
    updateReadyToInstall: string;
    updateDownloading: (percent: number) => string;
    updateDownload: string;
    updateInstall: string;
  };
  app: {
    starting: string;
    startFailed: string;
    retry: string;
    startingBusy: string;
    noNodes: string;
    rulesModeNeedsAdmin: string;
    coreToggleFailed: string;
    restartBackendFailed: string;
    restartAdminOnly: string;
    restartAdminFailed: string;
  };
  connect: {
    notifyTitle: string;
    stageLabel: string;
    failedAt: (stage: string, message: string) => string;
    stages: Record<
      | 'precheck'
      | 'binaries'
      | 'ports'
      | 'config'
      | 'mihomo_start'
      | 'mihomo_ready'
      | 'capture'
      | 'unknown',
      string
    >;
  };
  home: {
    connected: string;
    disconnected: string;
    reconnecting: string;
    reconnectingHint: string;
    noLink: string;
    noLinkHint: string;
    noServers: string;
    serversCount: (n: number) => string;
    connect: string;
    disconnect: string;
    connecting: string;
    connectingHint: string;
    cancelConnect: string;
    wait: string;
    addServerFirst: string;
    connectVpn: string;
    disconnectVpn: string;
    session: string;
    total: string;
    ping: string;
    refreshPing: string;
    checking: string;
    refresh: string;
    server: string;
    start: string;
    addServer: string;
    addServerMeta: string;
    pickServer: string;
    byPing: string;
    smartRoute: string;
    smartRouteHint: string;
    smartRouteFallback: string;
    fallbackPromptTitle: string;
    fallbackPromptBody: string;
    fallbackPromptConfirm: string;
    fallbackPromptCancel: string;
    autoSelectMatched: (name: string) => string;
    autoSelectFallbackMatched: (name: string) => string;
    autoSelectNoMatch: string;
    autoSelectNoCriteria: string;
    autoSelectToggle: string;
    autoSelectSettings: string;
    autoSelectPickOnce: string;
    autoSelectPicking: string;
    vpnMode: string;
    servers: string;
    rules: string;
    noSubscription: string;
    needImport: string;
    toggleFailed: string;
    modeFailed: string;
    autoSelectFailed: string;
    pingFailed: string;
  };
  modes: {
    rule: string;
    ruleHint: string;
    ruleHintNoAdmin: string;
    global: string;
    globalHint: string;
    direct: string;
    directHint: string;
  };
  settings: {
    loading: string;
    language: string;
    languageDesc: string;
    languageRu: string;
    languageEn: string;
    app: string;
    appDesc: string;
    autostart: string;
    autostartDesc: string;
    closeToTray: string;
    closeToTrayDesc: string;
    minimizeToTray: string;
    minimizeToTrayDesc: string;
    startMinimized: string;
    startMinimizedDesc: string;
    autostartInfraTitle: string;
    autostartInfraDesc: string;
    autostartInfraReady: string;
    autostartInfraPartial: string;
    autostartInfraMissing: string;
    autostartInfraUnsupported: string;
    removeAutostartInfra: string;
    removingAutostartInfra: string;
    restoreAutostartInfra: string;
    restoringAutostartInfra: string;
    autostartInfraAlreadyExists: string;
    autostartInfraNothingToRemove: string;
    autostartInfraRemoved: string;
    autostartInfraRestored: string;
    autostartInfraRestoreFailed: string;
    desktopOnly: string;
    updatesTitle: string;
    updatesDesc: string;
    updatesCurrentVersion: (version: string) => string;
    updatesAutoCheck: string;
    updatesAutoCheckDesc: string;
    updatesInterval: string;
    updatesIntervalDesc: string;
    updatesIntervalOption: (hours: number) => string;
    updatesCheckNow: string;
    updatesChecking: string;
    updatesDownload: string;
    updatesDownloading: string;
    updatesInstall: string;
    updatesInstalling: string;
    updatesOpenFolder: string;
    updatesUpToDate: string;
    updatesAvailable: (version: string) => string;
    updatesReady: (version: string) => string;
    updatesDevHint: string;
    updatesFailed: string;
    subsAutoRefresh: string;
    subsAutoRefreshDesc: string;
    subsRefreshInterval: string;
    subsRefreshIntervalDesc: string;
    vpn: string;
    vpnDesc: string;
    connectOnStartup: string;
    connectOnStartupDesc: string;
    killSwitch: string;
    killSwitchDesc: string;
    autoSelectTitle: string;
    autoSelectDesc: string;
    autoSelectEnabledTitle: string;
    autoSelectEnabledDesc: string;
    autoSelectPingMin: string;
    autoSelectPingMax: string;
    autoSelectPingHint: string;
    autoSelectRegionLabels: Record<'EU' | 'US' | 'ASIA' | 'ME' | 'CIS' | 'RU', string>;
    autoSelectCountriesTitle: string;
    autoSelectCountriesAny: string;
    autoSelectCountriesSelected: (n: number) => string;
    autoSelectCountriesSearch: string;
    autoSelectCountriesHint: string;
    autoSelectRemoveCountry: string;
    blockedServersTitle: string;
    blockedServersHint: string;
    blockedServersEmpty: string;
    blockedServersSaved: string;
    blockedServersRemove: string;
    autoSelectAllowFallback: string;
    autoSelectAllowFallbackDesc: string;
    autoSelectAutoReturn: string;
    autoSelectAutoReturnDesc: string;
    autoSelectReset: string;
    backup: string;
    backupDesc: string;
    importRules: string;
    importRulesDesc: string;
    importServers: string;
    importServersDesc: string;
    importSettings: string;
    importSettingsDesc: string;
    export: string;
    exporting: string;
    import: string;
    importing: string;
    quit: string;
    quitDesc: string;
    quitBtn: string;
    aboutTitle: string;
    aboutDesc: string;
    aboutGithub: string;
    aboutGithubHint: string;
    saveFailed: string;
    exportSaved: (path: string) => string;
    exportDownloaded: string;
    exportFailed: string;
    importNeedOne: string;
    importDone: (parts: string) => string;
    importFailed: string;
    settingsPart: string;
    serversPart: (n: number) => string;
    rulesPart: (n: number) => string;
    appsPart: (n: number) => string;
    helpLabel: string;
    helpAutostart: string;
    helpCloseToTray: string;
    helpMinimizeToTray: string;
    helpStartMinimized: string;
    helpAutostartInfra: string;
    helpUpdatesAutoCheck: string;
    helpSubsAutoRefresh: string;
    helpConnectOnStartup: string;
    helpKillSwitch: string;
    helpAutoSelect: string;
    helpBackup: string;
    setupGuideTitle: string;
    setupGuideDesc: string;
    setupGuideStart: string;
    resetTitle: string;
    resetDesc: string;
    resetSettingsBtn: string;
    resetFactoryBtn: string;
    resetSettingsTitle: string;
    resetSettingsBody: string;
    resetFactoryTitle: string;
    resetFactoryBody: string;
    resetFactoryWarn: string;
    resetBackupFirst: string;
    resetCancel: string;
    resetConfirm: string;
    resetting: string;
    resetSettingsDone: string;
    resetFactoryDone: string;
    resetFailed: string;
  };
  setup: {
    welcomeTitle: string;
    welcomeBody: string;
    helpMe: string;
    myself: string;
    skip: string;
    next: string;
    back: string;
    done: string;
    stepOf: (current: number, total: number) => string;
    steps: Record<
      | 'import'
      | 'routing'
      | 'ruleLists'
      | 'autostart'
      | 'connectOnStartup'
      | 'killSwitch'
      | 'autoSelect'
      | 'updates'
      | 'connect'
      | 'done',
      { title: string; body: string }
    >;
  };
  help: {
    importSubscription: string;
    importFile: string;
    routingMode: string;
    ruleLists: string;
    connectButton: string;
  };
  import: {
    subtitle: string;
    nodesBadge: (n: number) => string;
    subscription: string;
    subscriptionHint: string;
    file: string;
    fileHint: string;
    noFile: string;
    browse: string;
    raw: string;
    rawPlaceholder: string;
    importBtn: string;
    importing: string;
    needInput: string;
    noneFound: string;
    imported: (n: number) => string;
    importError: string;
    pickDesktopOnly: string;
    readFailed: string;
  };
  logs: {
    hint: string;
    autoscroll: string;
    copy: string;
    clear: string;
    desktopOnly: string;
    empty: string;
    autoTrim: string;
  };
  nodes: {
    subtitle: string;
    asInSubscription: string;
    noSubscription: string;
    pickServerOrSub: string;
    refreshSubs: string;
    subs: string;
    goImport: string;
    refreshFailed: string;
  };
  routing: {
    rulesMode: string;
    rulesModeHint: string;
    searchPlaceholder: string;
    deleteAllTitle: string;
    deleteAllConfirm: (n: number) => string;
    deleteAllFailed: string;
    deleting: string;
    deleteAll: string;
    ruleListPreset: string;
    ruleListPresetHint: string;
    emptyRulesHint: string;
    viaVpn: string;
    bypassVpn: string;
    subtitle: string;
    vpnModeTitle: string;
    modeHint: string;
    sitesTab: string;
    appsTab: string;
    addRule: string;
    rulePlaceholder: string;
    pickExe: string;
    add: string;
    noRulesYet: string;
    nothingFound: string;
    changeSearch: string;
    remove: string;
    truncated: (shown: number, total: number) => string;
    searchApps: string;
    appsSelectedHint: (n: number) => string;
    loadingApps: string;
    noAppsFound: string;
    changeSearchOrRefresh: string;
    viaVpnShort: string;
    bypassVpnShort: string;
    removeApp: string;
    showMore: (n: number) => string;
    loadAppsFailed: string;
    removeRuleFailed: string;
    addRuleFailed: string;
    pickDesktopOnly: string;
    modeFailed: string;
    addAppFailed: string;
    removeAppFailed: string;
    switchServerFailed: string;
    deleteServerFailed: string;
  };
  ruleLists: {
    subtitle: string;
    close: string;
    howTitle: string;
    howStep1: string;
    howStep2: string;
    howStep3: string;
    examples: string;
    actionHint: string;
    currentFolder: string;
    openFolder: string;
    folder: string;
    byUrl: string;
    refreshFiles: string;
    refresh: string;
    namePlaceholder: string;
    download: string;
    loading: string;
    emptyTitle: string;
    emptyHint: string;
    rulesCount: (n: number) => string;
    bundled: string;
    add: string;
    replace: string;
    replaceTitle: string;
    deleteFileTitle: string;
    loadFailed: string;
    appliedReplace: (name: string, total: number) => string;
    appliedMerge: (name: string, added: number, updated: number, total: number) => string;
    applyFailed: string;
    folderOpened: string;
    openFolderFailed: string;
    downloaded: (name: string, count: number) => string;
    downloadFailed: string;
    deleteConfirm: (name: string) => string;
    deleteFailed: string;
  };
  system: {
    captureOff: string;
    captureOffTitle: string;
    tunProxy: (port: number) => string;
    tunProxyTitle: string;
    tunAll: string;
    tunAllTitle: string;
    sysProxy: (port: number) => string;
    sysProxyTitle: string;
    tunLoading: string;
    tunLoadingTitle: string;
    captureInactive: string;
    captureInactiveTitle: string;
    adminOk: string;
    adminWarn: string;
    restartAdmin: string;
    restarting: string;
    adminBadge: string;
    noAdminBadge: string;
    tunReady: string;
    tunReadyTitle: string;
    altPorts: (mixedPort: number) => string;
    altPortsTitle: (mixedPort: number, controllerPort: number) => string;
    recoveryPaused: string;
    recoveryPausedTitle: string;
    adminNote: string;
  };
  nodesExtra: {
    sort: string;
    byPing: string;
    byName: string;
    refreshPing: string;
    checking: string;
    refreshPingBtn: string;
    pick: string;
    picking: string;
    noServers: string;
    expand: string;
    collapse: string;
    refreshSubsTitle: string;
    refreshAllSubs: string;
    refreshingSubs: string;
    refreshGroup: string;
    deleteGroup: string;
    deleteGroupConfirm: (title: string, count: number) => string;
    deleteGroupFailed: string;
    groupDeleted: (count: number) => string;
    groupRefreshed: (count: number) => string;
    deleteServer: string;
    pickFastest: string;
    refreshed: (sources: number, profiles: number, failed: number) => string;
  };
};

export const ru: Messages = {
  nav: {
    home: 'Главная',
    nodes: 'Серверы',
    routing: 'Маршруты',
    import: 'Импорт',
    logs: 'Логи',
    settings: 'Настройки',
    aria: 'Основная навигация',
  },
  layout: {
    connected: 'Подключено',
    disconnected: 'Отключено',
    wait: 'Подождите…',
    clickDisconnect: 'Нажмите, чтобы отключить',
    clickConnect: 'Нажмите, чтобы подключить',
    vpnOn: 'VPN включён',
    vpnOff: 'VPN выключен',
    connecting: 'Подключение…',
    reconnecting: 'Переподключение…',
    noLink: 'Пропало соединение',
    noLinkHint: 'Нет связи с сервером',
    disconnectVpn: 'Отключить VPN',
    connectVpn: 'Подключить VPN',
    cancelConnect: 'Отменить подключение',
    updateAvailable: (version) => `Доступна версия ${version}`,
    updateTapForDetails: 'Подробнее в настройках',
    updateReadyToInstall: 'Готово к установке',
    updateDownloading: (percent) => `Загрузка… ${percent}%`,
    updateDownload: 'Скачать',
    updateInstall: 'Установить',
  },
  app: {
    starting: 'Запуск PawLink…',
    startFailed: 'Не удалось запустить',
    retry: 'Повторить',
    startingBusy: 'Запуск…',
    noNodes: 'Нет узлов для подключения. Сначала импортируйте подписку или добавьте сервер.',
    rulesModeNeedsAdmin:
      'Режим «Правила» работает только от администратора (TUN). Переключитесь на «Глобальный» или перезапустите PawLink от администратора.',
    coreToggleFailed: 'Не удалось изменить состояние ядра',
    restartBackendFailed: 'Не удалось перезапустить бэкенд',
    restartAdminOnly: 'Перезапуск от администратора доступен только в десктоп-приложении',
    restartAdminFailed: 'Не удалось перезапустить приложение',
  },
  connect: {
    notifyTitle: 'Не удалось подключиться к VPN',
    stageLabel: 'Этап',
    failedAt: (stage, message) => `${stage}: ${message}`,
    stages: {
      precheck: 'Проверка перед подключением',
      binaries: 'Загрузка компонентов',
      ports: 'Выбор портов',
      config: 'Сборка конфигурации',
      mihomo_start: 'Запуск ядра mihomo',
      mihomo_ready: 'Ожидание готовности ядра',
      capture: 'Настройка перехвата трафика',
      unknown: 'Неизвестная ошибка',
    },
  },
  home: {
    connected: 'Подключено',
    disconnected: 'Отключено',
    reconnecting: 'Переподключение…',
    reconnectingHint: 'Восстанавливаем соединение…',
    noLink: 'Пропало соединение',
    noLinkHint: 'Нет связи с сервером',
    noServers: 'Нет серверов',
    serversCount: (n) => `${n} серверов`,
    connect: 'Подключить',
    disconnect: 'Отключить',
    connecting: 'Подключение…',
    connectingHint: 'Настраиваем VPN, подождите',
    cancelConnect: 'Отменить',
    wait: 'Подождите…',
    addServerFirst: 'Сначала добавьте сервер',
    connectVpn: 'Подключить VPN',
    disconnectVpn: 'Отключить VPN',
    session: 'За сессию',
    total: 'всего',
    ping: 'Пинг',
    refreshPing: 'Обновить пинг всех серверов',
    checking: 'Проверка…',
    refresh: 'Обновить',
    server: 'Сервер',
    start: 'Старт',
    addServer: 'Добавить сервер',
    addServerMeta: 'Подписка, файл или ссылка',
    pickServer: 'Умный подбор',
    byPing: 'По пингу',
    smartRoute: 'Умный подбор',
    smartRouteHint: 'Европа · 60–110 ms',
    smartRouteFallback: 'Резервный режим',
    fallbackPromptTitle: 'Нет серверов по критериям',
    fallbackPromptBody:
      'Не найдено серверов с заданным пингом и регионом. Подключить ближайший доступный?',
    fallbackPromptConfirm: 'Подключить',
    fallbackPromptCancel: 'Отмена',
    autoSelectMatched: (name) => `Выбран сервер: ${name}`,
    autoSelectFallbackMatched: (name) => `Подключён резервный сервер: ${name}`,
    autoSelectNoMatch: 'Нет доступных серверов',
    autoSelectNoCriteria: 'Нет серверов по вашим критериям. Измените настройки или включите резервный сервер.',
    autoSelectToggle: 'Автоподбор',
    autoSelectSettings: 'Настройки умного подбора',
    autoSelectPickOnce: 'Подобрать сейчас',
    autoSelectPicking: 'Подбор…',
    vpnMode: 'Режим VPN',
    servers: 'Серверов',
    rules: 'Правил',
    noSubscription: 'Без подписки',
    needImport: 'Сначала добавьте подписку или сервер в разделе «Импорт»',
    toggleFailed: 'Не удалось изменить состояние VPN',
    modeFailed: 'Не удалось сменить режим',
    autoSelectFailed: 'Не удалось выбрать сервер',
    pingFailed: 'Не удалось проверить пинг',
  },
  modes: {
    rule: 'Правила',
    ruleHint: 'Только выбранные сайты и приложения через VPN',
    ruleHintNoAdmin: 'Только с правами администратора (TUN). Без админа используйте «Глобальный».',
    global: 'Весь VPN',
    globalHint: 'Весь трафик через VPN',
    direct: 'Без VPN',
    directHint: 'VPN не используется',
  },
  settings: {
    loading: 'Загрузка настроек…',
    language: 'Язык',
    languageDesc: 'Интерфейс приложения на русском или английском.',
    languageRu: 'Русский',
    languageEn: 'English',
    app: 'Приложение',
    appDesc: 'Работа PawLink в Windows — трей, автозапуск и поведение окна.',
    autostart: 'Автозапуск с Windows',
    autostartDesc:
      'Запускать PawLink при входе в Windows (планировщик + тихий запуск, без консоли).',
    closeToTray: 'Сворачивать в трей при закрытии',
    closeToTrayDesc: 'Крестик прячет окно — VPN продолжает работать в фоне.',
    minimizeToTray: 'Сворачивать в трей при минимизации',
    minimizeToTrayDesc: 'Кнопка «свернуть» прячет окно в область уведомлений.',
    startMinimized: 'Запускать свёрнутым',
    startMinimizedDesc: 'При старте окно не показывается — только иконка в трее.',
    autostartInfraTitle: 'Компоненты автозапуска',
    autostartInfraDesc:
      'Задача в планировщике Windows и тихий launcher. Путь к программе берётся из текущей установки — неважно, куда вы её поставили.',
    autostartInfraReady: 'Компоненты установлены для этой копии PawLink.',
    autostartInfraPartial: 'Компоненты найдены, но указывают на другую папку — нажмите «Восстановить».',
    autostartInfraMissing: 'Компоненты автозапуска не установлены.',
    autostartInfraUnsupported: 'Управление компонентами доступно только в установленной Windows-версии.',
    removeAutostartInfra: 'Удалить фоновые процессы (нужны для автозапуска)',
    removingAutostartInfra: 'Удаление…',
    restoreAutostartInfra: 'Восстановить',
    restoringAutostartInfra: 'Восстановление…',
    autostartInfraAlreadyExists: 'Компоненты уже установлены — повторное восстановление не требуется.',
    autostartInfraNothingToRemove: 'Удалять нечего — компоненты уже отсутствуют.',
    autostartInfraRemoved: 'Фоновые компоненты автозапуска удалены.',
    autostartInfraRestored: 'Компоненты автозапуска восстановлены для текущей папки установки.',
    autostartInfraRestoreFailed: 'Не удалось восстановить компоненты автозапуска',
    desktopOnly: 'Настройки окна доступны только в десктоп-приложении.',
    updatesTitle: 'Обновления',
    updatesDesc: 'Лёгкая фоновая проверка на GitHub. Скачивание и установка — только по вашей кнопке.',
    updatesCurrentVersion: (version) => `Текущая версия: ${version}`,
    updatesAutoCheck: 'Автоматически проверять обновления',
    updatesAutoCheckDesc: 'Каждый запуск приложения + по таймеру, пока оно открыто. Файл сам не скачивается.',
    updatesInterval: 'Как часто проверять в фоне',
    updatesIntervalDesc: 'Таймер работает только пока PawLink запущен. Если выключен — проверка будет при следующем запуске.',
    updatesIntervalOption: (hours) => {
      if (hours === 168) return 'Раз в неделю';
      if (hours === 24) return 'Раз в сутки';
      if (hours === 48) return 'Раз в 2 дня';
      if (hours === 6) return 'Каждые 6 часов';
      return `Каждые ${hours} ч`;
    },
    updatesCheckNow: 'Проверить обновления приложения',
    updatesChecking: 'Проверка…',
    updatesDownload: 'Скачать обновление',
    updatesDownloading: 'Загрузка…',
    updatesInstall: 'Установить',
    updatesInstalling: 'Запуск установщика…',
    updatesOpenFolder: 'Открыть папку с файлом',
    updatesUpToDate: 'У вас установлена последняя версия.',
    updatesAvailable: (version) => `Доступна новая версия ${version}.`,
    updatesReady: (version) => `Версия ${version} загружена — можно установить.`,
    updatesDevHint: 'Автообновление работает только в установленной версии приложения.',
    updatesFailed: 'Не удалось проверить обновления',
    subsAutoRefresh: 'Автообновление подписок',
    subsAutoRefreshDesc: 'При каждом запуске и по таймеру, пока приложение открыто. По умолчанию выключено.',
    subsRefreshInterval: 'Как часто обновлять подписки в фоне',
    subsRefreshIntervalDesc: 'Таймер только пока PawLink запущен. Если выключен — обновление при следующем запуске.',
    vpn: 'VPN',
    vpnDesc: 'Автоподключение VPN при запуске приложения.',
    connectOnStartup: 'Подключаться при запуске',
    connectOnStartupDesc: 'Автоматически включать VPN, если есть сохранённые серверы.',
    killSwitch: 'Kill Switch',
    killSwitchDesc:
      'Умная блокировка: в режиме «Правила» режется только PROXY-трафик, в «Глобальном» — весь интернет кроме LAN. DIRECT продолжает работать.',
    autoSelectTitle: 'Умный подбор сервера',
    autoSelectDesc: 'Пинг, страны и запрещённые серверы для подбора и автопереключения.',
    autoSelectEnabledTitle: 'Автоподбор включён',
    autoSelectEnabledDesc:
      'При сбое сервера автоматически переключаться по этим правилам.',
    autoSelectPingMin: 'Мин. пинг (ms)',
    autoSelectPingMax: 'Макс. пинг (ms)',
    autoSelectPingHint:
      'Диапазон 60–110 ms — оптимально. Пустой список стран = любая страна. Сервер не меняется из‑за краткого скачка пинга.',
    autoSelectRegionLabels: {
      EU: 'Европа',
      US: 'США / Канада',
      ASIA: 'Азия',
      ME: 'Ближний Восток',
      CIS: 'СНГ (без РФ)',
      RU: 'Россия',
    },
    autoSelectCountriesTitle: 'Разрешённые страны',
    autoSelectCountriesAny: 'Любая страна',
    autoSelectCountriesSelected: (n) => `Выбрано: ${n}`,
    autoSelectCountriesSearch: 'Поиск страны…',
    autoSelectCountriesHint:
      'Можно выбрать страны вручную без региона. Регионы — быстрые пресеты.',
    autoSelectRemoveCountry: 'Убрать из списка',
    blockedServersTitle: 'Запрещённые серверы',
    blockedServersHint:
      'Выбранные серверы не будут использоваться. Список сохраняется даже после удаления подписки.',
    blockedServersEmpty: 'Нет серверов для выбора — сначала импортируйте подписку.',
    blockedServersSaved: 'Сохранённые блокировки (сервер удалён из подписок):',
    blockedServersRemove: 'Убрать',
    autoSelectAllowFallback: 'Резервный сервер',
    autoSelectAllowFallbackDesc:
      'Если нет совпадений — предложить любой доступный сервер.',
    autoSelectAutoReturn: 'Возврат к критериям',
    autoSelectAutoReturnDesc:
      'Когда появится подходящий сервер — вернуться автоматически.',
    autoSelectReset: 'Сбросить по умолчанию',
    backup: 'Резервная копия',
    backupDesc:
      'Экспорт v2: серверы, маршруты, VPN и умный подбор. Галочки ниже влияют только на импорт.',
    importRules: 'Импортировать правила',
    importRulesDesc: 'Режим VPN, правила маршрутизации и приложения.',
    importServers: 'Импортировать серверы',
    importServersDesc: 'Подписки, узлы и статистика трафика.',
    importSettings: 'Импортировать настройки',
    importSettingsDesc:
      'Автоподключение, автопереключение, умный подбор и настройки приложения (язык, трей).',
    export: 'Экспорт',
    exporting: 'Экспорт…',
    import: 'Импорт',
    importing: 'Импорт…',
    quit: 'Выход',
    quitDesc: 'Полностью закрыть PawLink и остановить VPN.',
    quitBtn: 'Выйти из PawLink',
    aboutTitle: 'О проекте',
    aboutDesc: 'Исходный код, релизы и обсуждения — на GitHub.',
    aboutGithub: 'Открыть GitHub',
    aboutGithubHint: 'github.com/FelixEnotix/PawLink',
    saveFailed: 'Не удалось сохранить настройку',
    exportSaved: (path) => `Экспорт сохранён: ${path}`,
    exportDownloaded: 'Резервная копия скачана',
    exportFailed: 'Не удалось экспортировать',
    importNeedOne: 'Включите хотя бы одну галочку: серверы, правила или настройки',
    importDone: (parts) => `Импорт выполнен (${parts})`,
    importFailed: 'Не удалось импортировать',
    settingsPart: 'настройки',
    serversPart: (n) => `серверов: ${n}`,
    rulesPart: (n) => `правил: ${n}`,
    appsPart: (n) => `приложений: ${n}`,

    helpLabel: 'Справка',
    helpAutostart: 'Запускает PawLink вместе с Windows через Планировщик заданий с правами администратора — без лишнего UAC при каждом входе.',
    helpCloseToTray: 'Крестик не завершает программу, а прячет окно в трей. VPN и фоновые проверки продолжают работать.',
    helpMinimizeToTray: 'Сворачивание убирает окно в трей вместо панели задач — удобно, если пользуетесь чаще через иконку.',
    helpStartMinimized: 'При старте (в том числе с автозапуском) окно сразу скрыто в трее, без всплытия на рабочий стол.',
    helpAutostartInfra: 'Фоновые файлы и задача в Планировщике, без которых автозапуск с правами администратора ненадёжен. «Восстановить» привязывает их к текущей папке установки.',
    helpUpdatesAutoCheck: 'Только лёгкая проверка на GitHub. Файл обновления не скачивается сам — установка только по вашей кнопке.',
    helpSubsAutoRefresh: 'Периодически обновляет списки серверов из сохранённых ссылок подписок, пока приложение запущено.',
    helpConnectOnStartup: 'После запуска PawLink сам включает VPN, если уже есть импортированные серверы. Удобно вместе с автозапуском.',
    helpKillSwitch: 'Если узел упал, режет трафик через PROXY (или весь интернет в глобальном режиме), чтобы данные не ушли мимо VPN. LAN и DIRECT остаются.',
    helpAutoSelect: 'По пингу и странам выбирает лучший сервер и может переключаться при сбое. Запрещённые серверы в подбор не попадают.',
    helpBackup: 'Снимок серверов, правил и настроек в JSON. Перед полным сбросом лучше сделать экспорт.',
    setupGuideTitle: 'Помощник настройки',
    setupGuideDesc: 'Повторный тур по важным пунктам: подписки, маршруты, автозапуск, VPN и умный подбор — с пояснениями.',
    setupGuideStart: 'Пройти настройку заново',
    resetTitle: 'Сброс',
    resetDesc: 'Вернуть настройки по умолчанию. Подписки и правила можно оставить или стереть всё целиком.',
    resetSettingsBtn: 'Сбросить настройки',
    resetFactoryBtn: 'Сбросить всё',
    resetSettingsTitle: 'Сбросить настройки?',
    resetSettingsBody: 'Будут сброшены язык окна, трей, автозапуск, обновления, автоподключение, Kill Switch и умный подбор. Подписки, серверы и правила маршрутизации останутся.',
    resetFactoryTitle: 'Сбросить всё?',
    resetFactoryBody: 'Будут удалены подписки, серверы, правила, приложения и все настройки. Это действие необратимо без резервной копии.',
    resetFactoryWarn: 'Рекомендуем сначала сделать резервную копию.',
    resetBackupFirst: 'Сделать бэкап',
    resetCancel: 'Отмена',
    resetConfirm: 'Сбросить',
    resetting: 'Сброс…',
    resetSettingsDone: 'Настройки сброшены.',
    resetFactoryDone: 'Все данные и настройки сброшены.',
    resetFailed: 'Не удалось выполнить сброс',
  },
  setup: {
    welcomeTitle: 'Добро пожаловать в PawLink',
    welcomeBody: 'Можем пройтись по главным настройкам с подсказками — или вы разберётесь сами. Тур можно повторить позже в Настройках.',
    helpMe: 'Помочь с настройкой',
    myself: 'Справлюсь сам',
    skip: 'Пропустить',
    next: 'Далее',
    back: 'Назад',
    done: 'Готово',
    stepOf: (current, total) => `Шаг ${current} из ${total}`,
    steps: {
      import: {
        title: 'Добавьте подписку',
        body: 'Вставьте ссылку на подписку VPN или импортируйте файл — появятся серверы для подключения. Без этого VPN включить нельзя.',
      },
      routing: {
        title: 'Режим маршрутизации',
        body: '«Правила» — только нужный трафик через VPN (нужен админ). «Глобальный» — почти всё через VPN. «Без VPN» — прямое соединение.',
      },
      ruleLists: {
        title: 'Готовые списки правил',
        body: 'Можно одним кликом подключить готовый набор доменов и приложений, вместо ручного ввода.',
      },
      autostart: {
        title: 'Автозапуск с Windows',
        body: 'Если включите — PawLink будет стартовать вместе с системой. Для стабильной работы с правами администратора нужны компоненты автозапуска ниже.',
      },
      connectOnStartup: {
        title: 'Подключаться при запуске',
        body: 'После старта приложения VPN включится сам, если серверы уже есть. Удобно не нажимать кнопку каждый раз.',
      },
      killSwitch: {
        title: 'Kill Switch',
        body: 'Защита от дыр: если узел VPN упал, трафик не уйдёт в открытый интернет мимо туннеля. Рекомендуем оставить включённым.',
      },
      autoSelect: {
        title: 'Умный подбор сервера',
        body: 'Задайте пинг и страны — PawLink сам выберет подходящий узел и сможет переключиться при сбое.',
      },
      updates: {
        title: 'Обновления приложения',
        body: 'Фоновая проверка на GitHub лёгкая. Скачивание и установка — только когда вы нажмёте кнопку.',
      },
      connect: {
        title: 'Кнопка подключения',
        body: 'Здесь включается и выключается VPN. Статус рядом показывает: подключено, нет связи или идёт переподключение.',
      },
      done: {
        title: 'Готово!',
        body: 'Основные места вы уже видели. Если что-то забудете — откройте Настройки и повторите настройку, или нажмите ? у пунктов.',
      },
    },
  },
  help: {
    importSubscription: 'Ссылка от провайдера (обычно https://… или ssconf://…). PawLink скачает список серверов и сохранит подписку для обновлений.',
    importFile: 'Локальный файл конфигурации или экспорта подписки — если ссылки нет, а файл уже скачан.',
    routingMode: 'Определяет, какой трафик идёт через VPN. Режим «Правила» требует права администратора для TUN.',
    ruleLists: 'Готовые наборы правил (домены/приложения). Можно применить поверх текущих или заменить их.',
    connectButton: 'Включает или отключает VPN-ядро. Во время подключения можно нажать ещё раз, чтобы отменить.',
  },
  import: {
    subtitle: 'Clash YAML, JSON, Base64, vless://, ss://, trojan://, vmess://, hysteria2://',
    nodesBadge: (n) => `${n} узлов`,
    subscription: 'Подписка',
    subscriptionHint: 'URL удаленной подписки — узлы загрузятся автоматически',
    file: 'Файл',
    fileHint: 'Файл читается локально и передаётся бэкенду как текст',
    noFile: 'Файл не выбран',
    browse: 'Обзор...',
    raw: 'Сырой текст',
    rawPlaceholder:
      'Вставьте Clash YAML, JSON, Base64 или список ссылок (vless://, ss://, trojan://, vmess://, hysteria2://) — можно несколько строк сразу',
    importBtn: 'Импортировать',
    importing: 'Импорт...',
    needInput: 'Укажите конфигурацию, подписку или путь к файлу',
    noneFound: 'Новых узлов не найдено: формат не распознан или узлы уже импортированы',
    imported: (n) => `Импортировано узлов: ${n}`,
    importError: 'Ошибка импорта',
    pickDesktopOnly: 'Выбор файла доступен только в десктоп-приложении',
    readFailed: 'Не удалось прочитать файл',
  },
  logs: {
    hint: 'Вывод бэкенда и Electron. В памяти держится ограниченный хвост; на диск логи не пишутся.',
    autoscroll: 'Автопрокрутка',
    copy: 'Копировать',
    clear: 'Очистить',
    desktopOnly: 'Логи доступны только в десктоп-приложении PawLink.',
    empty: 'Пока нет записей.',
    autoTrim: 'Старые строки удаляются автоматически, чтобы не перегружать приложение.',
  },
  nodes: {
    subtitle: 'Выберите сервер или подписку',
    asInSubscription: 'Как в подписке',
    noSubscription: 'Без подписки',
    pickServerOrSub: 'Выберите сервер или подписку',
    refreshSubs: 'Подписки',
    subs: '…',
    goImport: 'Перейдите в «Импорт» и добавьте подписку или ссылку',
    refreshFailed: 'Не удалось обновить подписки',
  },
  routing: {
    rulesMode: 'Правила',
    rulesModeHint: 'Через VPN только сайты и .exe из списка (нужен TUN / админ).',
    searchPlaceholder: 'Поиск по правилам…',
    deleteAllTitle: 'Удалить все активные правила',
    deleteAllConfirm: (n) =>
      `Удалить все правила (${n})?\n\nЭто действие нельзя отменить. Списки файлов на диске не затрагиваются.`,
    deleteAllFailed: 'Не удалось удалить все правила',
    deleting: 'Удаление…',
    deleteAll: 'Удалить все',
    ruleListPreset: 'Готовый список правил',
    ruleListPresetHint: 'Импорт готовых списков доменов и приложений',
    emptyRulesHint: 'Добавьте домен вручную или откройте «Готовый список правил» → RU',
    viaVpn: 'Через VPN',
    bypassVpn: 'Мимо VPN',
    subtitle: 'Режим VPN, исключения по сайтам и приложениям',
    vpnModeTitle: 'Режим VPN',
    modeHint:
      '«Правила» — через VPN только сайты и .exe из списка (нужен TUN / админ). «Весь VPN» — весь трафик через TUN, включая игры и приложения. «Без VPN» — туннель выключен.',
    sitesTab: 'Сайты и домены',
    appsTab: 'Приложения',
    addRule: 'Добавить правило',
    rulePlaceholder: 'example.com или chrome.exe',
    pickExe: 'Выбрать .exe',
    add: 'Добавить',
    noRulesYet: 'Правил пока нет',
    nothingFound: 'Ничего не найдено',
    changeSearch: 'Измените поисковый запрос',
    remove: 'Удалить',
    truncated: (shown, total) => `Показаны первые ${shown} из ${total}. Уточните поиск.`,
    searchApps: 'Поиск приложения…',
    appsSelectedHint: (n) =>
      `Выбрано: ${n}. Они отмечены в списке ниже — нажмите «Убрать», чтобы снять.`,
    loadingApps: 'Загрузка установленных программ…',
    noAppsFound: 'Приложения не найдены',
    changeSearchOrRefresh: 'Измените поиск или обновите список',
    viaVpnShort: 'через VPN',
    bypassVpnShort: 'мимо VPN',
    removeApp: 'Убрать',
    showMore: (n) => `Показать ещё (${n})`,
    loadAppsFailed: 'Не удалось загрузить приложения',
    removeRuleFailed: 'Не удалось удалить правило',
    addRuleFailed: 'Не удалось добавить правило',
    pickDesktopOnly: 'Выбор файла доступен только в приложении PawLink',
    modeFailed: 'Не удалось сменить режим',
    addAppFailed: 'Не удалось добавить приложение',
    removeAppFailed: 'Не удалось убрать приложение',
    switchServerFailed: 'Не удалось переключить сервер',
    deleteServerFailed: 'Не удалось удалить сервер',
  },
  ruleLists: {
    subtitle: 'Готовые наборы доменов и процессов. Имя файла = название списка.',
    close: 'Закрыть',
    howTitle: 'Как создать свой список',
    howStep1:
      'Нажмите «Папка» — откроется каталог правил PawLink (рядом с данными приложения, не зависит от места установки).',
    howStep2: 'Создайте файл Имя.txt или Имя.yaml (например Work.txt).',
    howStep3: 'По одной строке в формате Clash: TYPE,value,ACTION',
    examples: 'Примеры:',
    actionHint:
      'ACTION: VPN/PROXY — через VPN, DIRECT — мимо. После сохранения вернитесь в окно и нажмите «Добавить» у списка.',
    currentFolder: 'Текущая папка:',
    openFolder: 'Открыть папку со списками правил',
    folder: 'Папка',
    byUrl: 'По URL',
    refreshFiles: 'Обновить список файлов',
    refresh: 'Обновить',
    namePlaceholder: 'Имя (EU)',
    download: 'Скачать',
    loading: 'Загрузка списков…',
    emptyTitle: 'Списков пока нет',
    emptyHint: 'Откройте папку и добавьте .txt / .yaml файл',
    rulesCount: (n) => `${n} правил`,
    bundled: ' · встроенный',
    add: 'Добавить',
    replace: 'Заменить',
    replaceTitle: 'Заменить все текущие правила этим списком',
    deleteFileTitle: 'Удалить файл списка',
    loadFailed: 'Не удалось загрузить списки',
    appliedReplace: (name, total) => `Список «${name}» загружен: ${total} правил`,
    appliedMerge: (name, added, updated, total) =>
      `«${name}»: +${added}, обновлено ${updated}, всего ${total}`,
    applyFailed: 'Не удалось применить список',
    folderOpened: 'Открыта папка со списками. После правок вернитесь сюда — список обновится сам.',
    openFolderFailed: 'Не удалось открыть папку',
    downloaded: (name, count) => `Скачан список «${name}» (${count} правил)`,
    downloadFailed: 'Не удалось скачать список',
    deleteConfirm: (name) =>
      `Удалить список «${name}» с диска? Активные правила в приложении не изменятся.`,
    deleteFailed: 'Не удалось удалить',
  },
  system: {
    captureOff: 'Захват трафика выключен',
    captureOffTitle: 'Подключитесь — PawLink включит TUN или системный прокси автоматически.',
    tunProxy: (port) => `TUN + прокси :${port}`,
    tunProxyTitle: 'TUN перехватывает трафик (без системного прокси). Выбранные сайты и .exe — в VPN.',
    tunAll: 'TUN — весь трафик',
    tunAllTitle:
      'Wintun — драйвер виртуальной сети. Через него mihomo перехватывает весь трафик системы, не только браузер.',
    sysProxy: (port) => `Системный прокси :${port}`,
    sysProxyTitle: 'Браузер и приложения Windows направляются на локальный прокси mihomo.',
    tunLoading: 'TUN: загрузка Wintun…',
    tunLoadingTitle:
      'Wintun.dll скачивается автоматически. Это не отдельная программа — файл драйвера для виртуального адаптера.',
    captureInactive: 'Захват не активен',
    captureInactiveTitle: 'Ядро запущено, но перехват трафика не включился. Попробуйте переподключиться.',
    adminOk: 'Права администратора — TUN-режим доступен',
    adminWarn: 'Без прав администратора используется системный прокси вместо TUN',
    restartAdmin: 'Перезапустить от администратора',
    restarting: 'Перезапуск…',
    adminBadge: 'Админ',
    noAdminBadge: 'Без админа',
    tunReady: 'TUN готов',
    tunReadyTitle: 'Wintun готов — при подключении включится полный захват трафика',
    altPorts: (port) => `Порт :${port}`,
    altPortsTitle: (mixed, ctrl) =>
      `Стандартные порты 7890/9090 заняты другой программой. PawLink использует :${mixed} и :${ctrl}.`,
    recoveryPaused: 'Восстановление на паузе',
    recoveryPausedTitle:
      'Автоперезапуск ядра временно отключён после нескольких неудачных попыток. Отключите и включите VPN вручную.',
    adminNote:
      'Без администратора работает системный прокси. Для TUN (игры и все приложения) нажмите кнопку ниже.',
  },
  nodesExtra: {
    sort: 'Сортировка',
    byPing: 'По пингу',
    byName: 'По алфавиту',
    refreshPing: 'Проверить пинг всех серверов в списке',
    checking: 'Проверка…',
    refreshPingBtn: 'Пинг всех',
    pick: 'Подобрать',
    picking: 'Подбор…',
    noServers: 'Серверов пока нет',
    expand: 'Развернуть',
    collapse: 'Свернуть',
    refreshSubsTitle: 'Обновить все подписки',
    refreshAllSubs: 'Обновить подписки',
    refreshingSubs: 'Обновление…',
    refreshGroup: 'Обновить подписку',
    deleteGroup: 'Удалить группу',
    deleteGroupConfirm: (title, count) =>
      `Удалить группу «${title}» и все её серверы (${count})?\n\nЭто действие нельзя отменить.`,
    deleteGroupFailed: 'Не удалось удалить группу',
    groupDeleted: (count) => `Удалено серверов: ${count}`,
    groupRefreshed: (count) => `Подписка обновлена, серверов: ${count}`,
    deleteServer: 'Удалить сервер',
    pickFastest: 'Подобрать самый быстрый сервер',
    refreshed: (sources, profiles, failed) =>
      `Обновлено подписок: ${sources}, серверов: ${profiles}` +
      (failed > 0 ? `, ошибок: ${failed}` : ''),
  },
};

export const en: Messages = {
  nav: {
    home: 'Home',
    nodes: 'Servers',
    routing: 'Routing',
    import: 'Import',
    logs: 'Logs',
    settings: 'Settings',
    aria: 'Main navigation',
  },
  layout: {
    connected: 'Connected',
    disconnected: 'Disconnected',
    wait: 'Please wait…',
    clickDisconnect: 'Click to disconnect',
    clickConnect: 'Click to connect',
    vpnOn: 'VPN on',
    vpnOff: 'VPN off',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    noLink: 'Connection lost',
    noLinkHint: 'No link to the server',
    disconnectVpn: 'Disconnect VPN',
    connectVpn: 'Connect VPN',
    cancelConnect: 'Cancel connecting',
    updateAvailable: (version) => `Version ${version} available`,
    updateTapForDetails: 'See settings for details',
    updateReadyToInstall: 'Ready to install',
    updateDownloading: (percent) => `Downloading… ${percent}%`,
    updateDownload: 'Download',
    updateInstall: 'Install',
  },
  app: {
    starting: 'Starting PawLink…',
    startFailed: 'Failed to start',
    retry: 'Retry',
    startingBusy: 'Starting…',
    noNodes: 'No nodes to connect. Import a subscription or add a server first.',
    rulesModeNeedsAdmin:
      'Rules mode requires administrator rights (TUN). Switch to Global or restart PawLink as administrator.',
    coreToggleFailed: 'Failed to change core state',
    restartBackendFailed: 'Failed to restart backend',
    restartAdminOnly: 'Restart as administrator is only available in the desktop app',
    restartAdminFailed: 'Failed to restart the app',
  },
  connect: {
    notifyTitle: 'Failed to connect VPN',
    stageLabel: 'Stage',
    failedAt: (stage, message) => `${stage}: ${message}`,
    stages: {
      precheck: 'Pre-connection checks',
      binaries: 'Downloading components',
      ports: 'Port allocation',
      config: 'Building configuration',
      mihomo_start: 'Starting mihomo core',
      mihomo_ready: 'Waiting for core readiness',
      capture: 'Traffic capture setup',
      unknown: 'Unknown error',
    },
  },
  home: {
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting…',
    reconnectingHint: 'Restoring the connection…',
    noLink: 'Connection lost',
    noLinkHint: 'No link to the server',
    noServers: 'No servers',
    serversCount: (n) => `${n} servers`,
    connect: 'Connect',
    disconnect: 'Disconnect',
    connecting: 'Connecting…',
    connectingHint: 'Setting up VPN, please wait',
    cancelConnect: 'Cancel',
    wait: 'Please wait…',
    addServerFirst: 'Add a server first',
    connectVpn: 'Connect VPN',
    disconnectVpn: 'Disconnect VPN',
    session: 'Session',
    total: 'total',
    ping: 'Ping',
    refreshPing: 'Refresh ping for all servers',
    checking: 'Checking…',
    refresh: 'Refresh',
    server: 'Server',
    start: 'Start',
    addServer: 'Add a server',
    addServerMeta: 'Subscription, file, or link',
    pickServer: 'Smart route',
    byPing: 'By ping',
    smartRoute: 'Smart route',
    smartRouteHint: 'Europe · 60–110 ms',
    smartRouteFallback: 'Fallback mode',
    fallbackPromptTitle: 'No servers match your criteria',
    fallbackPromptBody:
      'No servers found with the configured ping and region. Connect to the best available server?',
    fallbackPromptConfirm: 'Connect',
    fallbackPromptCancel: 'Cancel',
    autoSelectMatched: (name) => `Selected server: ${name}`,
    autoSelectFallbackMatched: (name) => `Fallback server selected: ${name}`,
    autoSelectNoMatch: 'No available servers',
    autoSelectNoCriteria: 'No servers match your criteria. Adjust settings or enable fallback.',
    autoSelectToggle: 'Auto-select',
    autoSelectSettings: 'Smart route settings',
    autoSelectPickOnce: 'Pick now',
    autoSelectPicking: 'Selecting…',
    vpnMode: 'VPN mode',
    servers: 'Servers',
    rules: 'Rules',
    noSubscription: 'No subscription',
    needImport: 'Add a subscription or server in Import first',
    toggleFailed: 'Failed to change VPN state',
    modeFailed: 'Failed to change mode',
    autoSelectFailed: 'Failed to select a server',
    pingFailed: 'Failed to check ping',
  },
  modes: {
    rule: 'Rules',
    ruleHint: 'Only selected sites and apps go through VPN',
    ruleHintNoAdmin: 'Requires administrator (TUN). Without admin, use Global mode.',
    global: 'Full VPN',
    globalHint: 'All traffic through VPN',
    direct: 'No VPN',
    directHint: 'VPN is not used',
  },
  settings: {
    loading: 'Loading settings…',
    language: 'Language',
    languageDesc: 'Switch the app interface between Russian and English.',
    languageRu: 'Русский',
    languageEn: 'English',
    app: 'Application',
    appDesc: 'How PawLink works in Windows — tray, autostart, and window behavior.',
    autostart: 'Start with Windows',
    autostartDesc:
      'Launch PawLink when you sign in (Task Scheduler + silent launcher, no console).',
    closeToTray: 'Minimize to tray on close',
    closeToTrayDesc: 'The close button hides the window — VPN keeps running in the background.',
    minimizeToTray: 'Minimize to tray',
    minimizeToTrayDesc: 'The minimize button hides the window in the notification area.',
    startMinimized: 'Start minimized',
    startMinimizedDesc: 'On launch, only the tray icon is shown.',
    autostartInfraTitle: 'Autostart components',
    autostartInfraDesc:
      'A Windows Task Scheduler job and silent launcher. Uses this install location — works no matter where PawLink is installed.',
    autostartInfraReady: 'Components are set up for this PawLink install.',
    autostartInfraPartial: 'Components point to another folder — click Restore.',
    autostartInfraMissing: 'Autostart components are not installed.',
    autostartInfraUnsupported: 'Component management is only available in the installed Windows app.',
    removeAutostartInfra: 'Remove background processes (required for autostart)',
    removingAutostartInfra: 'Removing…',
    restoreAutostartInfra: 'Restore',
    restoringAutostartInfra: 'Restoring…',
    autostartInfraAlreadyExists: 'Components are already installed — restore is not needed.',
    autostartInfraNothingToRemove: 'Nothing to remove — components are already absent.',
    autostartInfraRemoved: 'Autostart background components removed.',
    autostartInfraRestored: 'Autostart components restored for the current install path.',
    autostartInfraRestoreFailed: 'Failed to restore autostart components',
    desktopOnly: 'Window settings are available only in the desktop app.',
    updatesTitle: 'Updates',
    updatesDesc: 'Lightweight GitHub checks. Download and install only when you choose.',
    updatesCurrentVersion: (version) => `Current version: ${version}`,
    updatesAutoCheck: 'Automatically check for updates',
    updatesAutoCheckDesc: 'Every app launch + on a timer while open. Never downloads by itself.',
    updatesInterval: 'Background check interval',
    updatesIntervalDesc: 'Timer runs only while PawLink is open. If closed — next check is on the next launch.',
    updatesIntervalOption: (hours) => {
      if (hours === 168) return 'Once a week';
      if (hours === 24) return 'Once a day';
      if (hours === 48) return 'Every 2 days';
      if (hours === 6) return 'Every 6 hours';
      return `Every ${hours} h`;
    },
    updatesCheckNow: 'Check for app updates',
    updatesChecking: 'Checking…',
    updatesDownload: 'Download update',
    updatesDownloading: 'Downloading…',
    updatesInstall: 'Install',
    updatesInstalling: 'Starting installer…',
    updatesOpenFolder: 'Open download folder',
    updatesUpToDate: 'You are on the latest version.',
    updatesAvailable: (version) => `Version ${version} is available.`,
    updatesReady: (version) => `Version ${version} downloaded — ready to install.`,
    updatesDevHint: 'Auto-update works only in the installed desktop app.',
    updatesFailed: 'Failed to check for updates',
    subsAutoRefresh: 'Auto-refresh subscriptions',
    subsAutoRefreshDesc: 'On every launch and on a timer while open. Off by default.',
    subsRefreshInterval: 'Background subscription refresh interval',
    subsRefreshIntervalDesc: 'Timer runs only while PawLink is open. If closed — refresh on the next launch.',
    vpn: 'VPN',
    vpnDesc: 'Auto-connect VPN when the app starts.',
    connectOnStartup: 'Connect on startup',
    connectOnStartupDesc: 'Automatically enable VPN if servers are saved.',
    killSwitch: 'Kill Switch',
    killSwitchDesc:
      'Smart block: in Rules mode only PROXY traffic is cut; in Global mode all internet except LAN. DIRECT keeps working.',
    autoSelectTitle: 'Smart server selection',
    autoSelectDesc: 'Ping, countries and blocked servers for pick and auto-switch.',
    autoSelectEnabledTitle: 'Auto-select enabled',
    autoSelectEnabledDesc: 'Automatically switch servers on failure using these rules.',
    autoSelectPingMin: 'Min ping (ms)',
    autoSelectPingMax: 'Max ping (ms)',
    autoSelectPingHint:
      '60–110 ms is optimal. Empty country list = any country. Brief ping spikes do not trigger a switch.',
    autoSelectRegionLabels: {
      EU: 'Europe',
      US: 'US / Canada',
      ASIA: 'Asia',
      ME: 'Middle East',
      CIS: 'CIS (ex-Russia)',
      RU: 'Russia',
    },
    autoSelectCountriesTitle: 'Allowed countries',
    autoSelectCountriesAny: 'Any country',
    autoSelectCountriesSelected: (n) => `Selected: ${n}`,
    autoSelectCountriesSearch: 'Search country…',
    autoSelectCountriesHint:
      'Pick countries manually without a region. Regions are quick presets.',
    autoSelectRemoveCountry: 'Remove from list',
    blockedServersTitle: 'Blocked servers',
    blockedServersHint:
      'Selected servers will never be used. The list persists after subscription removal.',
    blockedServersEmpty: 'No servers to choose — import a subscription first.',
    blockedServersSaved: 'Saved blocks (server removed from subscriptions):',
    blockedServersRemove: 'Remove',
    autoSelectAllowFallback: 'Fallback server',
    autoSelectAllowFallbackDesc:
      'If nothing matches — offer any available server.',
    autoSelectAutoReturn: 'Return to criteria',
    autoSelectAutoReturnDesc:
      'When a matching server appears — switch back automatically.',
    autoSelectReset: 'Reset to defaults',
    backup: 'Backup',
    backupDesc:
      'Export v2: servers, routing, VPN and smart-route settings. Checkboxes affect import only.',
    importRules: 'Import rules',
    importRulesDesc: 'VPN mode, routing rules and per-app tunnels.',
    importServers: 'Import servers',
    importServersDesc: 'Subscriptions, nodes and traffic stats.',
    importSettings: 'Import settings',
    importSettingsDesc:
      'Auto-connect, auto-failover, smart-route criteria and app prefs (language, tray).',
    export: 'Export',
    exporting: 'Exporting…',
    import: 'Import',
    importing: 'Importing…',
    quit: 'Quit',
    quitDesc: 'Fully close PawLink and stop VPN.',
    quitBtn: 'Quit PawLink',
    aboutTitle: 'About',
    aboutDesc: 'Source code, releases and discussion are on GitHub.',
    aboutGithub: 'Open GitHub',
    aboutGithubHint: 'github.com/FelixEnotix/PawLink',
    saveFailed: 'Failed to save setting',
    exportSaved: (path) => `Export saved: ${path}`,
    exportDownloaded: 'Backup downloaded',
    exportFailed: 'Failed to export',
    importNeedOne: 'Enable at least one option: servers, rules or settings',
    importDone: (parts) => `Import complete (${parts})`,
    importFailed: 'Failed to import',
    settingsPart: 'settings',
    serversPart: (n) => `servers: ${n}`,
    rulesPart: (n) => `rules: ${n}`,
    appsPart: (n) => `apps: ${n}`,

    helpLabel: 'Help',
    helpAutostart: 'Starts PawLink with Windows via Task Scheduler at highest privileges — no UAC prompt on every login.',
    helpCloseToTray: 'The close button hides the window to the tray instead of quitting. VPN and background checks keep running.',
    helpMinimizeToTray: 'Minimize sends the window to the tray instead of the taskbar — handy if you mostly use the tray icon.',
    helpStartMinimized: 'On launch (including autostart) the window stays in the tray and does not pop up on the desktop.',
    helpAutostartInfra: 'Background launcher files and the scheduled task required for reliable elevated autostart. Restore rebinds them to this install folder.',
    helpUpdatesAutoCheck: 'Lightweight GitHub check only. The installer is never downloaded automatically — you choose when to install.',
    helpSubsAutoRefresh: 'Periodically refreshes server lists from saved subscription URLs while the app is open.',
    helpConnectOnStartup: 'After PawLink starts it turns VPN on automatically if servers are already imported. Pairs well with autostart.',
    helpKillSwitch: 'If the node fails, blocks PROXY traffic (or all internet in Global mode) so data does not leak outside the VPN. LAN/DIRECT stay available.',
    helpAutoSelect: 'Picks the best server by ping and country and can fail over on outages. Blocked servers are never chosen.',
    helpBackup: 'JSON snapshot of servers, rules and settings. Export a backup before a full reset.',
    setupGuideTitle: 'Setup guide',
    setupGuideDesc: 'Replay the guided tour: subscriptions, routing, autostart, VPN and smart select — with explanations.',
    setupGuideStart: 'Run setup again',
    resetTitle: 'Reset',
    resetDesc: 'Restore defaults. You can keep subscriptions and rules, or wipe everything.',
    resetSettingsBtn: 'Reset settings',
    resetFactoryBtn: 'Reset everything',
    resetSettingsTitle: 'Reset settings?',
    resetSettingsBody: 'Window language, tray, autostart, updates, connect-on-startup, Kill Switch and smart select will reset. Subscriptions, servers and routing rules stay.',
    resetFactoryTitle: 'Reset everything?',
    resetFactoryBody: 'Deletes subscriptions, servers, rules, app tunnels and all settings. This cannot be undone without a backup.',
    resetFactoryWarn: 'We recommend making a backup first.',
    resetBackupFirst: 'Make a backup',
    resetCancel: 'Cancel',
    resetConfirm: 'Reset',
    resetting: 'Resetting…',
    resetSettingsDone: 'Settings were reset.',
    resetFactoryDone: 'All data and settings were reset.',
    resetFailed: 'Reset failed',
  },
  setup: {
    welcomeTitle: 'Welcome to PawLink',
    welcomeBody: 'We can walk through the important settings with tips — or you can explore on your own. You can replay the tour later in Settings.',
    helpMe: 'Help me set up',
    myself: "I'll figure it out",
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    done: 'Done',
    stepOf: (current, total) => `Step ${current} of ${total}`,
    steps: {
      import: {
        title: 'Add a subscription',
        body: 'Paste your VPN subscription URL or import a file to get servers. Without servers you cannot connect.',
      },
      routing: {
        title: 'Routing mode',
        body: 'Rules = only selected traffic via VPN (needs admin). Global = almost everything via VPN. Direct = no VPN.',
      },
      ruleLists: {
        title: 'Ready-made rule lists',
        body: 'Apply a prepared set of domains/apps in one click instead of typing rules by hand.',
      },
      autostart: {
        title: 'Start with Windows',
        body: 'If enabled, PawLink starts with the system. Elevated autostart needs the autostart components below.',
      },
      connectOnStartup: {
        title: 'Connect on launch',
        body: 'After the app starts, VPN turns on by itself when servers already exist.',
      },
      killSwitch: {
        title: 'Kill Switch',
        body: 'If the VPN node drops, traffic will not leak to the open internet. Keeping it on is recommended.',
      },
      autoSelect: {
        title: 'Smart server select',
        body: 'Set ping range and countries — PawLink picks a matching node and can switch on failure.',
      },
      updates: {
        title: 'App updates',
        body: 'Background GitHub checks are lightweight. Download and install happen only when you press the button.',
      },
      connect: {
        title: 'Connect button',
        body: 'Turns the VPN core on or off. Nearby status shows connected, no link, or reconnecting.',
      },
      done: {
        title: "You're set!",
        body: 'You have seen the key places. Replay anytime via Settings, or tap ? on individual options.',
      },
    },
  },
  help: {
    importSubscription: 'Provider URL (usually https://… or ssconf://…). PawLink downloads the server list and keeps the subscription for refreshes.',
    importFile: 'A local config/export file when you have no URL but already downloaded a file.',
    routingMode: 'Controls which traffic goes through the VPN. Rules mode needs administrator rights for TUN.',
    ruleLists: 'Prepared rule packs (domains/apps). Apply on top of current rules or replace them.',
    connectButton: 'Starts or stops the VPN core. While connecting you can press again to cancel.',
  },
  import: {
    subtitle: 'Clash YAML, JSON, Base64, vless://, ss://, trojan://, vmess://, hysteria2://',
    nodesBadge: (n) => `${n} nodes`,
    subscription: 'Subscription',
    subscriptionHint: 'Remote subscription URL — nodes load automatically',
    file: 'File',
    fileHint: 'The file is read locally and sent to the backend as text',
    noFile: 'No file selected',
    browse: 'Browse...',
    raw: 'Raw text',
    rawPlaceholder:
      'Paste Clash YAML, JSON, Base64, or a list of links (vless://, ss://, trojan://, vmess://, hysteria2://) — multiple lines allowed',
    importBtn: 'Import',
    importing: 'Importing...',
    needInput: 'Provide a config, subscription, or file path',
    noneFound: 'No new nodes found: format not recognized or nodes already imported',
    imported: (n) => `Imported nodes: ${n}`,
    importError: 'Import error',
    pickDesktopOnly: 'File picker is available only in the desktop app',
    readFailed: 'Failed to read file',
  },
  logs: {
    hint: 'Backend and Electron output. Only a bounded in-memory tail is kept; nothing is written to disk.',
    autoscroll: 'Auto-scroll',
    copy: 'Copy',
    clear: 'Clear',
    desktopOnly: 'Logs are available only in the PawLink desktop app.',
    empty: 'No log entries yet.',
    autoTrim: 'Older lines are trimmed automatically so the app stays light during long sessions.',
  },
  nodes: {
    subtitle: 'Choose a server or subscription',
    asInSubscription: 'As in subscription',
    noSubscription: 'No subscription',
    pickServerOrSub: 'Choose a server or subscription',
    refreshSubs: 'Subscriptions',
    subs: '…',
    goImport: 'Go to Import and add a subscription or link',
    refreshFailed: 'Failed to refresh subscriptions',
  },
  routing: {
    rulesMode: 'Rules',
    rulesModeHint: 'Only listed sites and .exe go through VPN (needs TUN / admin).',
    searchPlaceholder: 'Search rules…',
    deleteAllTitle: 'Delete all active rules',
    deleteAllConfirm: (n) =>
      `Delete all rules (${n})?\n\nThis cannot be undone. Rule list files on disk are not affected.`,
    deleteAllFailed: 'Failed to delete all rules',
    deleting: 'Deleting…',
    deleteAll: 'Delete all',
    ruleListPreset: 'Ready-made rule list',
    ruleListPresetHint: 'Import bundled domain and app rule lists',
    emptyRulesHint: 'Add a domain manually or open Ready-made rule list → RU',
    viaVpn: 'Via VPN',
    bypassVpn: 'Bypass VPN',
    subtitle: 'VPN mode, site and app exceptions',
    vpnModeTitle: 'VPN mode',
    modeHint:
      '“Rules” — only listed sites and .exe via VPN (needs TUN / admin). “Full VPN” — all traffic via TUN, including games and apps. “No VPN” — tunnel off.',
    sitesTab: 'Sites & domains',
    appsTab: 'Apps',
    addRule: 'Add rule',
    rulePlaceholder: 'example.com or chrome.exe',
    pickExe: 'Pick .exe',
    add: 'Add',
    noRulesYet: 'No rules yet',
    nothingFound: 'Nothing found',
    changeSearch: 'Try a different search',
    remove: 'Remove',
    truncated: (shown, total) => `Showing first ${shown} of ${total}. Narrow your search.`,
    searchApps: 'Search apps…',
    appsSelectedHint: (n) =>
      `Selected: ${n}. Marked below — press Remove to clear.`,
    loadingApps: 'Loading installed apps…',
    noAppsFound: 'No apps found',
    changeSearchOrRefresh: 'Change search or refresh the list',
    viaVpnShort: 'via VPN',
    bypassVpnShort: 'bypass VPN',
    removeApp: 'Remove',
    showMore: (n) => `Show more (${n})`,
    loadAppsFailed: 'Failed to load apps',
    removeRuleFailed: 'Failed to remove rule',
    addRuleFailed: 'Failed to add rule',
    pickDesktopOnly: 'File picker is available only in the PawLink app',
    modeFailed: 'Failed to change mode',
    addAppFailed: 'Failed to add app',
    removeAppFailed: 'Failed to remove app',
    switchServerFailed: 'Failed to switch server',
    deleteServerFailed: 'Failed to delete server',
  },
  ruleLists: {
    subtitle: 'Ready-made domain and process sets. File name = list name.',
    close: 'Close',
    howTitle: 'How to make your own list',
    howStep1:
      'Press “Folder” — opens the PawLink rules directory (next to app data, independent of install path).',
    howStep2: 'Create Name.txt or Name.yaml (e.g. Work.txt).',
    howStep3: 'One Clash rule per line: TYPE,value,ACTION',
    examples: 'Examples:',
    actionHint:
      'ACTION: VPN/PROXY — via VPN, DIRECT — bypass. After saving, return here and press Add on the list.',
    currentFolder: 'Current folder:',
    openFolder: 'Open rule lists folder',
    folder: 'Folder',
    byUrl: 'From URL',
    refreshFiles: 'Refresh file list',
    refresh: 'Refresh',
    namePlaceholder: 'Name (EU)',
    download: 'Download',
    loading: 'Loading lists…',
    emptyTitle: 'No lists yet',
    emptyHint: 'Open the folder and add a .txt / .yaml file',
    rulesCount: (n) => `${n} rules`,
    bundled: ' · built-in',
    add: 'Add',
    replace: 'Replace',
    replaceTitle: 'Replace all current rules with this list',
    deleteFileTitle: 'Delete list file',
    loadFailed: 'Failed to load lists',
    appliedReplace: (name, total) => `List “${name}” loaded: ${total} rules`,
    appliedMerge: (name, added, updated, total) =>
      `“${name}”: +${added}, updated ${updated}, total ${total}`,
    applyFailed: 'Failed to apply list',
    folderOpened: 'Folder opened. After edits, return here — the list refreshes automatically.',
    openFolderFailed: 'Failed to open folder',
    downloaded: (name, count) => `Downloaded list “${name}” (${count} rules)`,
    downloadFailed: 'Failed to download list',
    deleteConfirm: (name) =>
      `Delete list “${name}” from disk? Active rules in the app will not change.`,
    deleteFailed: 'Failed to delete',
  },
  system: {
    captureOff: 'Traffic capture off',
    captureOffTitle: 'Connect — PawLink will enable TUN or system proxy automatically.',
    tunProxy: (port) => `TUN + proxy :${port}`,
    tunProxyTitle: 'TUN captures traffic. Selected sites and .exe go through VPN.',
    tunAll: 'TUN — all traffic',
    tunAllTitle:
      'Wintun is a virtual network driver. Mihomo uses it to capture all system traffic, not only the browser.',
    sysProxy: (port) => `System proxy :${port}`,
    sysProxyTitle: 'Browser and Windows apps are directed to the local mihomo proxy.',
    tunLoading: 'TUN: loading Wintun…',
    tunLoadingTitle:
      'Wintun.dll downloads automatically. It is a driver file for the virtual adapter, not a separate program.',
    captureInactive: 'Capture inactive',
    captureInactiveTitle: 'Core is running, but traffic capture did not start. Try reconnecting.',
    adminOk: 'Administrator rights — TUN mode available',
    adminWarn: 'Without administrator rights, system proxy is used instead of TUN',
    restartAdmin: 'Restart as administrator',
    restarting: 'Restarting…',
    adminBadge: 'Admin',
    noAdminBadge: 'No admin',
    tunReady: 'TUN ready',
    tunReadyTitle: 'Wintun is ready — full traffic capture will start on connect',
    altPorts: (port) => `Port :${port}`,
    altPortsTitle: (mixed, ctrl) =>
      `Default ports 7890/9090 are used by another app. PawLink uses :${mixed} and :${ctrl}.`,
    recoveryPaused: 'Recovery paused',
    recoveryPausedTitle:
      'Core auto-restart paused after several failed attempts. Toggle VPN off and on manually.',
    adminNote:
      'Without administrator rights, system proxy mode is used. For TUN (games and all apps), use the button below.',
  },
  nodesExtra: {
    sort: 'Sort',
    byPing: 'By ping',
    byName: 'A–Z',
    refreshPing: 'Check ping for every server in the list',
    checking: 'Checking…',
    refreshPingBtn: 'Ping all',
    pick: 'Auto-select',
    picking: 'Selecting…',
    noServers: 'No servers yet',
    expand: 'Expand',
    collapse: 'Collapse',
    refreshSubsTitle: 'Refresh all subscriptions',
    refreshAllSubs: 'Refresh subscriptions',
    refreshingSubs: 'Refreshing…',
    refreshGroup: 'Refresh subscription',
    deleteGroup: 'Delete group',
    deleteGroupConfirm: (title, count) =>
      `Delete group “${title}” and all its servers (${count})?\n\nThis cannot be undone.`,
    deleteGroupFailed: 'Failed to delete group',
    groupDeleted: (count) => `Servers removed: ${count}`,
    groupRefreshed: (count) => `Subscription updated, servers: ${count}`,
    deleteServer: 'Delete server',
    pickFastest: 'Pick the fastest server',
    refreshed: (sources, profiles, failed) =>
      `Updated subscriptions: ${sources}, servers: ${profiles}` +
      (failed > 0 ? `, errors: ${failed}` : ''),
  },
};

export const catalogs: Record<Locale, Messages> = { ru, en };
