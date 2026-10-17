import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { ApiRequestError } from "@edgeever/client";
import { useQuery } from "@tanstack/react-query";
import type { LocalTiptapEditorRef } from "../components/LocalTiptapEditor";
import { buildMobileAiStreamBridgePayload, parseMobileSelectionAiRequest } from "../lib/mobile-ai-selection";
import { pickMobileCopy } from "../lib/mobile-copy";
import { safeDomCall } from "../lib/safe-dom-call";
import type { useSession } from "../lib/session";

type MobileAiClient = NonNullable<ReturnType<typeof useSession>["client"]>;

export const useMobileSelectionAi = ({
  client,
  editorRef,
  resolvedLocale,
  titleRef,
}: {
  client: MobileAiClient | null | undefined;
  editorRef: RefObject<LocalTiptapEditorRef | null>;
  resolvedLocale: "zh-CN" | "en-US" | "ja" | "pl";
  titleRef: RefObject<string>;
}) => {
  const activeRequestRef = useRef<{ requestId: string; controller: AbortController } | null>(null);
  const promptsQuery = useQuery({
    queryKey: ["ai-prompts", resolvedLocale],
    queryFn: async () => (await client!.listAiPrompts(resolvedLocale)).prompts,
    enabled: Boolean(client),
    retry: false,
  });
  const aiPromptsJson = useMemo(
    () => JSON.stringify(promptsQuery.data ?? []),
    [promptsQuery.data],
  );

  useEffect(() => () => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
  }, []);

  const requestSelectionAi = useCallback(async (requestJson: string) => {
    if (!client) throw new Error(pickMobileCopy(resolvedLocale, { zh: "当前未登录，无法使用 AI。", en: "AI is unavailable while signed out.", pl: "AI jest niedostępne bez zalogowania." }));
    const request = parseMobileSelectionAiRequest(requestJson);
    if (!request) throw new Error(pickMobileCopy(resolvedLocale, { zh: "AI 请求无效。", en: "The AI request is invalid.", pl: "Nieprawidłowe żądanie AI." }));

    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    activeRequestRef.current = { requestId: request.requestId, controller };

    void client.streamAiGeneration({
      action: request.action,
      promptId: request.promptId,
      locale: request.locale ?? resolvedLocale,
      title: titleRef.current.trim(),
      contentMarkdown: request.contentMarkdown,
      targetLanguage: request.targetLanguage,
      tone: request.tone,
      instruction: request.instruction,
    }, {
      signal: controller.signal,
      onEvent: (event) => {
        safeDomCall(() => editorRef.current?.pushAiStreamEvent(
          buildMobileAiStreamBridgePayload(request.requestId, event)
        ));
      },
    }).catch((requestError) => {
      if (controller.signal.aborted) return;
      const message = requestError instanceof ApiRequestError && requestError.code === "ai_not_configured"
        ? pickMobileCopy(resolvedLocale, {
            zh: "请先在 Web 或桌面端的“模型与代理”中配置模型。",
            en: "Configure a model in Models and agents on the web or desktop app first.",
            pl: "Najpierw skonfiguruj model w sekcji Modele i agenci w wersji Web lub desktopowej.",
          })
        : requestError instanceof Error
          ? requestError.message
          : pickMobileCopy(resolvedLocale, { zh: "AI 生成失败。", en: "AI generation failed.", pl: "Generowanie AI nie powiodło się." });
      safeDomCall(() => editorRef.current?.pushAiStreamEvent(buildMobileAiStreamBridgePayload(request.requestId, {
        type: "error",
        code: "ai_generation_failed",
        message,
      })));
    }).finally(() => {
      if (activeRequestRef.current?.requestId === request.requestId) {
        activeRequestRef.current = null;
      }
    });
  }, [client, editorRef, resolvedLocale, titleRef]);

  const cancelSelectionAi = useCallback(async (requestId: string) => {
    if (activeRequestRef.current?.requestId !== requestId) return;
    activeRequestRef.current.controller.abort();
    activeRequestRef.current = null;
  }, []);

  return { aiPromptsJson, cancelSelectionAi, requestSelectionAi };
};
