import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Constants from "expo-constants";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";
import { Alert } from "../components/LocalizedText";
import { openGooglePlayDetails } from "../../modules/edgeever-app-store";
import { pickMobileCopy } from "./mobile-copy";
import { useMobileLocale } from "./mobile-locale";
import {
  ANDROID_INSTALL_UPDATE_SOURCES,
  findNewerMobileRelease,
  type MobileInstallUpdateSource,
  type MobileRelease,
} from "./mobile-release";
import { openMobileInstallUpdateSource } from "./mobile-update-destination";

const FOREGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type MobileUpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready";
export type MobileUpdateKind = "install" | "ota";

type MobileUpdateContextValue = {
  checkForUpdate: () => Promise<void>;
  hasUpdate: boolean;
  installedVersion: string | null;
  isSupported: boolean;
  openUpdate: () => Promise<void>;
  status: MobileUpdateStatus;
  updateKind: MobileUpdateKind | null;
};

const MobileUpdateContext = createContext<MobileUpdateContextValue>({
  checkForUpdate: async () => undefined,
  hasUpdate: false,
  installedVersion: null,
  isSupported: false,
  openUpdate: async () => undefined,
  status: "idle",
  updateKind: null,
});
const MobileUpdateAvailableContext = createContext(false);

export const MobileUpdateProvider = ({ children }: { children: ReactNode }) => {
  const { resolvedLocale } = useMobileLocale();
  const [installRelease, setInstallRelease] = useState<MobileRelease | null>(null);
  const [status, setStatus] = useState<MobileUpdateStatus>("idle");
  const [updateKind, setUpdateKind] = useState<MobileUpdateKind | null>(null);
  const activeCheckRef = useRef<Promise<void> | null>(null);
  const lastAutomaticCheckRef = useRef(0);
  const isSupported = !__DEV__ && Updates.isEnabled;
  const installedVersion = Updates.runtimeVersion ?? Constants.expoConfig?.version ?? null;

  const showLinkError = useCallback(() => {
    Alert.alert(
      pickMobileCopy(resolvedLocale, { zh: "无法打开链接", en: "Could not open link", pl: "Nie można otworzyć linku" }),
      pickMobileCopy(resolvedLocale, { zh: "请检查浏览器设置后重试。", en: "Check your browser settings and try again.", pl: "Sprawdź ustawienia przeglądarki i spróbuj ponownie." })
    );
  }, [resolvedLocale]);

  const openManualUpdateSource = useCallback((source: MobileInstallUpdateSource) => {
    void openMobileInstallUpdateSource(source, {
      linking: Linking,
      openGooglePlayDetails,
    }).then((result) => {
      if (result.status !== "google-play-unavailable") {
        return;
      }
      if (result.reason === "not-installed") {
        Alert.alert(
          pickMobileCopy(resolvedLocale, { zh: "未安装 Google Play", en: "Google Play is not installed", pl: "Brak Google Play" }),
          pickMobileCopy(resolvedLocale, {
            zh: "这台设备未安装 Google Play 商店，无法通过该渠道更新。",
            en: "Google Play Store is not installed on this device, so this update channel is unavailable.",
            pl: "Na tym urządzeniu nie ma Sklepu Google Play, więc ten kanał aktualizacji jest niedostępny.",
          })
        );
        return;
      }
      const { fallbackUrl, reason } = result;
      const copy = reason === "disabled"
        ? {
          message: pickMobileCopy(resolvedLocale, {
            zh: "Google Play 商店已被停用，请先在系统设置中启用，或改用网页版。",
            en: "Google Play Store is disabled. Enable it in system settings, or open the web listing instead.",
            pl: "Sklep Google Play jest wyłączony. Włącz go w ustawieniach systemu lub otwórz stronę w przeglądarce.",
          }),
          title: pickMobileCopy(resolvedLocale, { zh: "Google Play 已停用", en: "Google Play is disabled", pl: "Google Play jest wyłączony" }),
        }
        : {
          message: pickMobileCopy(resolvedLocale, {
            zh: "Google Play 商店无法处理这个更新链接，请稍后重试，或改用网页版。",
            en: "Google Play Store could not handle this update link. Try again later, or open the web listing instead.",
            pl: "Sklep Google Play nie obsłużył tego linku aktualizacji. Spróbuj ponownie później lub otwórz stronę w przeglądarce.",
          }),
          title: pickMobileCopy(resolvedLocale, { zh: "无法打开 Google Play", en: "Could not open Google Play", pl: "Nie można otworzyć Google Play" }),
        };
      Alert.alert(copy.title, copy.message, [
        {
          text: pickMobileCopy(resolvedLocale, { zh: "取消", en: "Cancel", pl: "Anuluj" }),
          style: "cancel",
        },
        {
          text: pickMobileCopy(resolvedLocale, { zh: "打开网页版", en: "Open web listing", pl: "Otwórz w przeglądarce" }),
          onPress: () => {
            void Linking.openURL(fallbackUrl).catch(showLinkError);
          },
        },
      ]);
    }).catch(() => {
      showLinkError();
    });
  }, [resolvedLocale, showLinkError]);

  const openInstallUpdateOptions = useCallback((release: MobileRelease) => {
    const googlePlay = ANDROID_INSTALL_UPDATE_SOURCES.find((source) => source.id === "google-play");
    const github = ANDROID_INSTALL_UPDATE_SOURCES.find((source) => source.id === "github");
    if (!googlePlay || !github) {
      return;
    }
    Alert.alert(
      pickMobileCopy(resolvedLocale, { zh: "发现新版本", en: "Update available", pl: "Dostępna aktualizacja" }),
      pickMobileCopy(resolvedLocale, {
        zh: `EdgeEver ${release.version} 已发布，请选择更新渠道。`,
        en: `EdgeEver ${release.version} is available. Choose where to update.`,
        pl: `EdgeEver ${release.version} jest dostępny. Wybierz źródło aktualizacji.`,
      }),
      [
        {
          text: pickMobileCopy(resolvedLocale, { zh: "稍后", en: "Later", pl: "Później" }),
          style: "cancel",
        },
        {
          icon: "github",
          text: pickMobileCopy(resolvedLocale, github.label),
          onPress: () => openManualUpdateSource(github),
        },
        {
          icon: "google-play",
          text: pickMobileCopy(resolvedLocale, googlePlay.label),
          onPress: () => openManualUpdateSource(googlePlay),
        },
      ]
    );
  }, [resolvedLocale, openManualUpdateSource]);

  const runCheck = useCallback((userInitiated: boolean) => {
    if (activeCheckRef.current) {
      return activeCheckRef.current;
    }

    if (!isSupported) {
      if (userInitiated) {
        Alert.alert(
          pickMobileCopy(resolvedLocale, { zh: "暂无法检查更新", en: "Updates unavailable", pl: "Aktualizacje niedostępne" }),
          pickMobileCopy(resolvedLocale, {
            zh: "检查更新仅适用于已安装的正式版，Expo Go 和开发版暂不支持。",
            en: "Update checks are available in installed release builds, not Expo Go or development builds.",
            pl: "Sprawdzanie aktualizacji działa w zainstalowanych wersjach wydania, nie w Expo Go ani wersjach deweloperskich.",
          })
        );
      }
      return Promise.resolve();
    }

    const check = (async () => {
      try {
        setStatus("checking");

        if (Platform.OS === "android") {
          try {
            if (!installedVersion) {
              throw new Error("Installed app version is unavailable");
            }
            const release = await findNewerMobileRelease(installedVersion);
            if (release) {
              setInstallRelease(release);
              setUpdateKind("install");
              setStatus("available");
              return;
            }
          } catch {
            // Fall back to Expo's in-app update check when the release API is unavailable.
          }
        }

        const result = await Updates.checkForUpdateAsync();

        if (!result.isAvailable) {
          setInstallRelease(null);
          setUpdateKind(null);
          setStatus("idle");
          return;
        }

        setUpdateKind("ota");
        setStatus("available");
      } catch {
        setInstallRelease(null);
        setUpdateKind(null);
        setStatus("idle");
      }
    })();

    activeCheckRef.current = check;
    void check.finally(() => {
      activeCheckRef.current = null;
    });
    return check;
  }, [resolvedLocale, installedVersion, isSupported]);

  useEffect(() => {
    const attemptAutomaticCheck = () => {
      if (Date.now() - lastAutomaticCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) {
        return;
      }
      lastAutomaticCheckRef.current = Date.now();
      void runCheck(false);
    };
    const timer = setTimeout(attemptAutomaticCheck, 1_500);
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        attemptAutomaticCheck();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [runCheck]);

  const openUpdate = useCallback(async () => {
    if (updateKind === "install") {
      if (Platform.OS !== "android" || !installRelease) {
        return;
      }
      openInstallUpdateOptions(installRelease);
      return;
    }

    if (updateKind !== "ota" || !isSupported) {
      return;
    }

    try {
      if (status === "ready") {
        await Updates.reloadAsync();
        return;
      }

      setStatus("downloading");
      const result = await Updates.fetchUpdateAsync();
      if (!result.isNew) {
        setUpdateKind(null);
        setStatus("idle");
        Alert.alert(
          pickMobileCopy(resolvedLocale, { zh: "暂无更新", en: "No update", pl: "Brak aktualizacji" }),
          pickMobileCopy(resolvedLocale, {
            zh: "没有可下载的应用内更新。",
            en: "No downloadable in-app update was found.",
            pl: "Nie znaleziono aktualizacji w aplikacji do pobrania.",
          }),
        );
        return;
      }

      setStatus("ready");
      Alert.alert(
        pickMobileCopy(resolvedLocale, { zh: "更新已就绪", en: "Update ready", pl: "Aktualizacja gotowa" }),
        pickMobileCopy(resolvedLocale, { zh: "重启后即可应用更新。", en: "Restart now to apply the update.", pl: "Uruchom ponownie, aby zastosować aktualizację." }),
        [
          {
            text: pickMobileCopy(resolvedLocale, { zh: "稍后", en: "Later", pl: "Później" }),
            style: "cancel",
          },
          {
            text: pickMobileCopy(resolvedLocale, { zh: "立即重启", en: "Restart", pl: "Uruchom ponownie" }),
            onPress: () => {
              void Updates.reloadAsync();
            },
          },
        ]
      );
    } catch {
      setStatus("available");
      Alert.alert(
        pickMobileCopy(resolvedLocale, { zh: "更新失败", en: "Update failed", pl: "Aktualizacja nie powiodła się" }),
        pickMobileCopy(resolvedLocale, {
          zh: "无法下载应用内更新，请稍后再试。",
          en: "Could not download the in-app update. Try again later.",
          pl: "Nie udało się pobrać aktualizacji w aplikacji. Spróbuj ponownie później.",
        })
      );
    }
  }, [resolvedLocale, installRelease, isSupported, openInstallUpdateOptions, status, updateKind]);

  const hasUpdate = status === "available" || status === "ready" || status === "downloading";
  const value = useMemo<MobileUpdateContextValue>(
    () => ({
      checkForUpdate: () => {
        return runCheck(true);
      },
      hasUpdate,
      installedVersion,
      isSupported,
      openUpdate,
      status,
      updateKind,
    }),
    [hasUpdate, installedVersion, isSupported, openUpdate, runCheck, status, updateKind]
  );

  return (
    <MobileUpdateAvailableContext.Provider value={hasUpdate}>
      <MobileUpdateContext.Provider value={value}>{children}</MobileUpdateContext.Provider>
    </MobileUpdateAvailableContext.Provider>
  );
};

export const useMobileUpdate = () => useContext(MobileUpdateContext);
export const useMobileUpdateAvailable = () => useContext(MobileUpdateAvailableContext);
