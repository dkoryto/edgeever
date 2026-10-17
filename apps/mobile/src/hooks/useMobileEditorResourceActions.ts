import { useCallback, type MutableRefObject } from "react";
import { Alert } from "react-native";
import type { createEdgeEverClient } from "@edgeever/client";
import type { LocalTiptapEditorRef } from "../components/LocalTiptapEditor";
import {
  openMobileResource,
  parseMobileResourceTargetJson,
  saveMobileResourceAs,
  type MobileResourceTarget,
} from "../lib/mobile-attachments";
import { pickMobileCopy, type MobileCopyLocale } from "../lib/mobile-copy";
import { loadProtectedResourceDataUrl, type ProtectedResourceLoadFailure } from "../lib/mobile-protected-resources";
import { safeDomCall } from "../lib/safe-dom-call";

type Client = ReturnType<typeof createEdgeEverClient> | null;

type Options = {
  baseUrl: string;
  canMutate: () => boolean;
  client: Client;
  editorRef: MutableRefObject<LocalTiptapEditorRef | null>;
  onLoadFailure: (failure: ProtectedResourceLoadFailure) => void;
  onSelect: (target: MobileResourceTarget) => void;
  resolvedLocale: MobileCopyLocale;
  resourceCacheRef: MutableRefObject<Map<string, Promise<string | null>>>;
  sessionBaseUrl?: string;
  token?: string;
};

export const useMobileEditorResourceActions = ({
  baseUrl,
  canMutate,
  client,
  editorRef,
  onLoadFailure,
  onSelect,
  resolvedLocale,
  resourceCacheRef,
  sessionBaseUrl,
  token,
}: Options) => {
  const unavailable = useCallback((copy: { zh: string; en: string; pl: string }) =>
    new Error(pickMobileCopy(resolvedLocale, copy)), [resolvedLocale]);

  const loadEditorResource = useCallback((source: string) => {
    if (!client) return Promise.resolve(null);
    return loadProtectedResourceDataUrl(source, {
      baseUrl: sessionBaseUrl ?? baseUrl,
      cache: resourceCacheRef.current,
      getResourceBlob: client.getResourceBlob,
      onFailure: onLoadFailure,
      token,
    });
  }, [baseUrl, client, onLoadFailure, resourceCacheRef, sessionBaseUrl, token]);

  const downloadResource = useCallback(async (target: MobileResourceTarget) => {
    if (!client) throw unavailable({ zh: "当前无法读取附件。", en: "The attachment client is unavailable.", pl: "Nie można teraz odczytać załącznika." });
    await openMobileResource(client, target, { baseUrl: sessionBaseUrl ?? baseUrl, token });
  }, [baseUrl, client, sessionBaseUrl, token, unavailable]);

  const saveResourceAs = useCallback(async (target: MobileResourceTarget) => {
    if (!client) throw unavailable({ zh: "当前无法读取资源。", en: "The resource client is unavailable.", pl: "Nie można teraz odczytać zasobu." });
    const result = await saveMobileResourceAs(client, target, { baseUrl: sessionBaseUrl ?? baseUrl, token });
    if (result.kind === "saf") {
      Alert.alert(
        pickMobileCopy(resolvedLocale, { zh: "下载成功", en: "Downloaded", pl: "Pobrano" }),
        pickMobileCopy(resolvedLocale, { zh: `已保存：${result.filename}`, en: `Saved ${result.filename}`, pl: `Zapisano: ${result.filename}` }),
      );
    }
  }, [baseUrl, client, resolvedLocale, sessionBaseUrl, token, unavailable]);

  const requireMutableClient = useCallback(() => {
    if (!client || !canMutate()) {
      throw unavailable({ zh: "请等待笔记同步完成。", en: "Wait for this note to sync first.", pl: "Poczekaj, aż notatka się zsynchronizuje." });
    }
    return client;
  }, [canMutate, client, unavailable]);

  const renameResource = useCallback(async (target: MobileResourceTarget, filename: string) => {
    const mutableClient = requireMutableClient();
    const { resource } = await mutableClient.renameResource(target.resourceId, filename);
    safeDomCall(() => editorRef.current?.renameResource(JSON.stringify(target), resource.filename || filename));
  }, [editorRef, requireMutableClient]);

  const deleteResource = useCallback(async (target: MobileResourceTarget) => {
    const mutableClient = requireMutableClient();
    await mutableClient.deleteResource(target.resourceId);
    safeDomCall(() => editorRef.current?.removeResource(JSON.stringify(target)));
  }, [editorRef, requireMutableClient]);

  const selectResource = useCallback(async (targetJson: string) => {
    const target = parseMobileResourceTargetJson(targetJson);
    if (target) onSelect(target);
  }, [onSelect]);

  return { deleteResource, downloadResource, loadEditorResource, renameResource, saveResourceAs, selectResource };
};
