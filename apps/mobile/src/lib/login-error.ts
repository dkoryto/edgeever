import { ApiRequestError } from "@edgeever/client";
import { pickMobileCopy } from "./mobile-copy";
import { translateMobileText } from "./mobile-locale";

export type MobileLoginLocale = "zh-CN" | "en-US" | "ja" | "pl";

export const MISSING_MOBILE_SESSION_MESSAGE = "登录成功但服务端没有返回移动端会话。请确认服务端已更新到支持 App 登录的版本。";

const appendDiagnostics = (
  message: string,
  diagnosticCode: string,
  rayId?: string,
) => `${message}\n${diagnosticCode}${rayId ? ` · Ray ID: ${rayId}` : ""}`;

export const formatMobileLoginError = (error: unknown, locale: MobileLoginLocale) => {
  if (error instanceof ApiRequestError) {
    const rayId = error.responseDiagnostics?.rayId;

    if (error.responseDiagnostics?.cloudflareMitigated) {
      return appendDiagnostics(
        pickMobileCopy(locale, {
          zh: "Cloudflare 人机验证拦截了登录接口。请实例管理员调整针对 API 的 WAF Challenge 规则。",
          en: "A Cloudflare browser challenge intercepted the login API. Ask the instance administrator to adjust the WAF Challenge rule for the API.",
          pl: "Weryfikacja przeglądarki Cloudflare zablokowała API logowania. Poproś administratora instancji o dostosowanie reguły WAF Challenge dla API.",
        }),
        "cloudflare_challenge",
        rayId,
      );
    }
    if (error.code === "auth_not_configured") {
      return appendDiagnostics(
        pickMobileCopy(locale, { zh: "这个实例还没有配置登录功能。", en: "Sign-in is not configured for this instance.", pl: "Logowanie nie jest skonfigurowane w tej instancji." }),
        "auth_not_configured",
        rayId,
      );
    }
    if (error.code === "database_not_ready") {
      return appendDiagnostics(
        pickMobileCopy(locale, { zh: "实例数据库尚未就绪。", en: "The instance database is not ready.", pl: "Baza danych instancji nie jest gotowa." }),
        "database_not_ready",
        rayId,
      );
    }
    if (error.code === "password_hash_invalid") {
      return appendDiagnostics(
        pickMobileCopy(locale, { zh: "实例的密码配置无效。", en: "The instance password configuration is invalid.", pl: "Konfiguracja hasła instancji jest nieprawidłowa." }),
        "password_hash_invalid",
        rayId,
      );
    }
    if (error.code === "login_rate_limited" || error.status === 429) {
      return appendDiagnostics(
        pickMobileCopy(locale, { zh: "登录尝试次数过多，请稍后再试。", en: "Too many sign-in attempts. Try again later.", pl: "Zbyt wiele prób logowania. Spróbuj ponownie później." }),
        "login_rate_limited",
        rayId,
      );
    }
    if (error.code === "unauthorized" || error.status === 401) {
      return appendDiagnostics(
        pickMobileCopy(locale, { zh: "用户名或密码不正确。", en: "The username or password is incorrect.", pl: "Nieprawidłowa nazwa użytkownika lub hasło." }),
        "invalid_credentials",
        rayId,
      );
    }
    if (error.status === 404) {
      return appendDiagnostics(
        pickMobileCopy(locale, {
          zh: "该实例地址没有找到 EdgeEver API，请检查地址。",
          en: "No EdgeEver API was found at this instance address.",
          pl: "Pod tym adresem instancji nie znaleziono API EdgeEver.",
        }),
        "edgeever_api_not_found",
        rayId,
      );
    }
    if (error.status === 403) {
      const isEdgeEverApiError = error.responseDiagnostics?.isEdgeEverApiError;
      return appendDiagnostics(
        isEdgeEverApiError
          ? pickMobileCopy(locale, { zh: "实例拒绝了登录请求。", en: "The instance rejected the login request.", pl: "Instancja odrzuciła żądanie logowania." })
          : pickMobileCopy(locale, {
            zh: "登录请求在到达 EdgeEver 前被安全策略拦截。请检查 Cloudflare Security Events、Access、WAF 或反向代理规则。",
            en: "A security policy blocked the request before it reached EdgeEver. Check Cloudflare Security Events, Access, WAF, or reverse-proxy rules.",
            pl: "Polityka bezpieczeństwa zablokowała żądanie, zanim dotarło do EdgeEver. Sprawdź Cloudflare Security Events, Access, WAF lub reguły reverse proxy.",
          }),
        isEdgeEverApiError ? error.code || "http_403" : "security_policy_blocked",
        rayId,
      );
    }
    if (error.status >= 500) {
      return appendDiagnostics(
        pickMobileCopy(locale, {
          zh: `实例服务异常（HTTP ${error.status}）。`,
          en: `The instance returned a server error (HTTP ${error.status}).`,
          pl: `Instancja zwróciła błąd serwera (HTTP ${error.status}).`,
        }),
        `http_${error.status}`,
        rayId,
      );
    }
    return appendDiagnostics(
      pickMobileCopy(locale, {
        zh: `实例拒绝了请求（HTTP ${error.status}）。`,
        en: `The instance rejected the request (HTTP ${error.status}).`,
        pl: `Instancja odrzuciła żądanie (HTTP ${error.status}).`,
      }),
      error.code || `http_${error.status}`,
      rayId,
    );
  }

  if (error instanceof Error && error.message === MISSING_MOBILE_SESSION_MESSAGE) {
    return appendDiagnostics(translateMobileText(error.message, locale), "mobile_session_missing");
  }

  if (error instanceof TypeError) {
    return appendDiagnostics(
      pickMobileCopy(locale, {
        zh: "无法连接实例，请检查实例地址和网络连接。",
        en: "Unable to reach the instance. Check its address and your network connection.",
        pl: "Nie można połączyć się z instancją. Sprawdź jej adres i połączenie sieciowe.",
      }),
      "network_unreachable",
    );
  }

  if (error instanceof SyntaxError) {
    return appendDiagnostics(
      pickMobileCopy(locale, {
        zh: "服务端返回的内容不是有效的 EdgeEver 响应。",
        en: "The server response is not a valid EdgeEver response.",
        pl: "Odpowiedź serwera nie jest prawidłową odpowiedzią EdgeEver.",
      }),
      "invalid_instance_response",
    );
  }

  return appendDiagnostics(
    pickMobileCopy(locale, { zh: "登录失败，请稍后再试。", en: "Sign-in failed. Try again later.", pl: "Logowanie nie powiodło się. Spróbuj ponownie później." }),
    "unexpected_login_error",
  );
};
