import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, RefreshCw } from "./icons";
import { Pressable, Text } from "./LocalizedText";
import { pickMobileCopy } from "../lib/mobile-copy";
import { useMobileLocale } from "../lib/mobile-locale";
import { useMobileUpdate } from "../lib/mobile-update";
import { useMobileTheme, resolveMobileThemeStyles } from "../lib/mobile-theme";

export const MobileUpdateCard = () => {
  const { resolvedLocale } = useMobileLocale();
  const { resolvedTheme } = useMobileTheme();
  const { checkForUpdate, hasUpdate, isSupported, openUpdate, status, updateKind } = useMobileUpdate();
  const busy = status === "checking" || status === "downloading";
  const styles = resolveMobileThemeStyles(baseStyles, resolvedTheme);
  const checkLabel = status === "checking"
    ? pickMobileCopy(resolvedLocale, { zh: "正在检查…", en: "Checking…", pl: "Sprawdzanie…" })
    : pickMobileCopy(resolvedLocale, { zh: "检查更新", en: "Check for updates", pl: "Sprawdź aktualizacje" });
  const openLabel = status === "downloading"
    ? pickMobileCopy(resolvedLocale, { zh: "正在下载更新…", en: "Downloading update…", pl: "Pobieranie aktualizacji…" })
    : status === "ready"
      ? pickMobileCopy(resolvedLocale, { zh: "重启以应用", en: "Restart to apply", pl: "Uruchom ponownie, aby zastosować" })
      : updateKind === "ota"
        ? pickMobileCopy(resolvedLocale, { zh: "下载更新", en: "Download update", pl: "Pobierz aktualizację" })
        : pickMobileCopy(resolvedLocale, { zh: "选择更新渠道", en: "Choose update source", pl: "Wybierz źródło aktualizacji" });

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.title}>{pickMobileCopy(resolvedLocale, { zh: "应用更新", en: "App updates", pl: "Aktualizacje aplikacji" })}</Text>
        <Text style={styles.description}>
          {pickMobileCopy(resolvedLocale, {
            zh: "EdgeEver 会自动检查兼容的应用内热更新和新版应用。",
            en: "EdgeEver automatically checks for compatible in-app updates and newer app versions.",
            pl: "EdgeEver automatycznie sprawdza zgodne aktualizacje w aplikacji i nowsze wersje aplikacji.",
          })}
        </Text>
        <Text style={styles.version}>
          {pickMobileCopy(resolvedLocale, { zh: "当前版本", en: "Current version", pl: "Bieżąca wersja" })}: v{Updates.runtimeVersion ?? Constants.expoConfig?.version ?? "unknown"}
        </Text>
      </View>
      {hasUpdate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => void openUpdate()}
          style={[styles.button, busy && styles.buttonDisabled]}
        >
          {status === "downloading" ? <ActivityIndicator color="#047857" size="small" /> : <RefreshCw color="#047857" size={16} />}
          <Text style={styles.buttonText}>{openLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => void checkForUpdate()}
        style={[styles.button, busy && styles.buttonDisabled]}
      >
        {status === "checking" ? <ActivityIndicator color="#047857" size="small" /> : <RefreshCw color="#047857" size={16} />}
        <Text style={styles.buttonText}>{checkLabel}</Text>
      </Pressable>
      {!isSupported ? (
        <Text style={styles.hint}>
          {pickMobileCopy(resolvedLocale, { zh: "此功能会在已安装的正式版中启用。", en: "Available in installed release builds.", pl: "Dostępne w zainstalowanych wersjach wydania." })}
        </Text>
      ) : null}
    </View>
  );
};

const baseStyles = StyleSheet.create({
  card: {
    borderTopColor: "#f1f5f9",
    borderTopWidth: 1,
    gap: 12,
    padding: 16,
  },
  copy: {
    gap: 4,
  },
  title: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  description: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
  },
  version: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "700",
  },
  hint: {
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 16,
  },
});
