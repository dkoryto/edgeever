import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MAX_AI_TEMPLATE_DESCRIPTION_LENGTH,
  buildAiTemplateGenerationRequest,
  parseAiGeneratedTemplate,
  type AiGeneratedTemplate,
} from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { renderAiTemplatePreviewHtml } from "@/lib/ai-template-preview";

export type AiTemplateSavePayload = {
  name: string;
  description: string | null;
  title: string | null;
  contentMarkdown: string;
  tags: string[];
};

type GenerationState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "error"; message: string };

export const AiTemplateGeneratorDialog = ({
  isSaving,
  onClose,
  onSave,
}: {
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: AiTemplateSavePayload) => Promise<void>;
}) => {
  const { i18n, t } = useTranslation();
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<AiGeneratedTemplate | null>(null);
  const [state, setState] = useState<GenerationState>({ kind: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"raw" | "preview">("preview");
  const controllerRef = useRef<AbortController | null>(null);
  const generating = state.kind === "generating";

  useEffect(() => () => controllerRef.current?.abort(), []);

  const generate = async () => {
    const description = request.trim();
    if (!description || generating) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "generating" });
    setSaveError(null);
    try {
      const payload = buildAiTemplateGenerationRequest({
        description,
        locale: i18n.resolvedLanguage ?? i18n.language,
        previousTitle: draft?.title,
      });
      const result = await api.pluginAi.generate({ ...payload, signal: controller.signal });
      if (controller.signal.aborted) return;
      setDraft(parseAiGeneratedTemplate(result.text, { fallbackTitle: t("templates.aiFallbackName") }));
      setEditorTab("preview");
      setState({ kind: "idle" });
    } catch {
      if (controller.signal.aborted) return;
      setState({ kind: "error", message: t("templates.aiGenerateFailed") });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const close = () => {
    controllerRef.current?.abort();
    onClose();
  };

  const save = async () => {
    if (!draft || !draft.title.trim() || !draft.contentMarkdown.trim()) return;
    setSaveError(null);
    try {
      await onSave({
        name: draft.title.trim(),
        description: draft.description.trim() || null,
        title: null,
        contentMarkdown: draft.contentMarkdown,
        tags: [],
      });
      onClose();
    } catch {
      setSaveError(t("templates.aiSaveFailed"));
    }
  };

  const previewHtml = useMemo(
    () => renderAiTemplatePreviewHtml(draft?.contentMarkdown ?? ""),
    [draft?.contentMarkdown],
  );

  const updateDraft = (patch: Partial<AiGeneratedTemplate>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !isSaving) close(); }}>
      <DialogContent className="max-w-2xl bg-card p-0 overflow-hidden border border-slate-200 rounded-xl shadow-xl" data-ai-template-generator="">
        <DialogHeader className="border-b border-slate-100 px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-slate-900" />
            {t("templates.aiGenerateTitle")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500">
            {t("templates.aiGenerateDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="ai-template-request">
              {t("templates.aiRequestLabel")}
            </label>
            <Textarea
              id="ai-template-request"
              className="min-h-20 resize-y text-sm"
              value={request}
              maxLength={MAX_AI_TEMPLATE_DESCRIPTION_LENGTH}
              disabled={generating || isSaving}
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void generate();
                }
              }}
              placeholder={t("templates.aiRequestPlaceholder")}
              autoFocus
            />
          </div>

          {state.kind === "error" && (
            <Alert variant="destructive" className="flex items-center justify-between gap-3 py-2.5 text-xs" role="alert">
              <AlertDescription>{state.message}</AlertDescription>
              <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => void generate()}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t("templates.aiRetry")}
              </Button>
            </Alert>
          )}

          {generating && !draft && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-xs text-slate-600" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("templates.aiGenerating")}
            </div>
          )}

          {draft && (
            <div className={`space-y-3 rounded-xl border border-slate-200 p-4 transition-opacity ${generating ? "opacity-60" : ""}`} aria-busy={generating}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="ai-template-name">{t("templates.name")}</label>
                  <Input
                    id="ai-template-name"
                    value={draft.title}
                    disabled={generating || isSaving}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    placeholder={t("templates.namePlaceholder")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="ai-template-description">{t("templates.descriptionField")}</label>
                  <Input
                    id="ai-template-description"
                    value={draft.description}
                    disabled={generating || isSaving}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    placeholder={t("templates.descriptionPlaceholder")}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">{t("templates.content")}</span>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
                    {(["preview", "raw"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        aria-pressed={editorTab === tab}
                        className={`rounded-md px-2.5 py-1 transition ${editorTab === tab ? "bg-card text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
                        onClick={() => setEditorTab(tab)}
                      >
                        {t(tab === "raw" ? "templates.rawEditor" : "templates.previewEditor")}
                      </button>
                    ))}
                  </div>
                </div>
                {editorTab === "raw" ? (
                  <Textarea
                    aria-label={t("templates.content")}
                    className="min-h-56 resize-y font-mono text-xs"
                    value={draft.contentMarkdown}
                    disabled={generating || isSaving}
                    onChange={(event) => updateDraft({ contentMarkdown: event.target.value })}
                  />
                ) : (
                  <div className="max-h-80 min-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
                    <div className="prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">{t("templates.aiReviewHint")}</p>
            </div>
          )}

          {saveError && (
            <Alert variant="destructive" className="py-2.5 text-xs" role="alert">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-3.5">
          <Button type="button" variant="outline" size="sm" onClick={close} disabled={isSaving}>
            <X className="h-3.5 w-3.5" />
            {t("common.cancel")}
          </Button>
          {draft ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => void generate()} disabled={generating || isSaving || !request.trim()}>
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {generating ? t("templates.aiGenerating") : t("templates.aiRegenerate")}
              </Button>
              <Button
                type="button"
                variant="solid"
                size="sm"
                className="font-semibold"
                onClick={() => void save()}
                disabled={generating || isSaving || !draft.title.trim() || !draft.contentMarkdown.trim()}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {t("templates.aiSaveAsTemplate")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="solid" size="sm" className="font-semibold" onClick={() => void generate()} disabled={generating || !request.trim()}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generating ? t("templates.aiGenerating") : t("templates.aiGenerate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
