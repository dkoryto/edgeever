import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, LoaderCircle, Share2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SharePasswordControls } from "./SharePasswordControls";
import { Input } from "@/components/ui/input";
import { api, getConfiguredDesktopApiBaseUrl } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";

export const getPublicNotebookShareUrl = (token: string) =>
  `${(getConfiguredDesktopApiBaseUrl() || window.location.origin).replace(/\/$/, "")}/share/notebook/${encodeURIComponent(token)}`;

const notebookSharePasswordStorageKey = (notebookId: string) => `edgeever.notebookSharePassword.${notebookId}`;

const readStoredNotebookSharePassword = (notebookId: string, token: string) => {
  try {
    const raw = window.localStorage.getItem(notebookSharePasswordStorageKey(notebookId)) || window.sessionStorage.getItem(notebookSharePasswordStorageKey(notebookId));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string; password?: string };
    return parsed.token === token && typeof parsed.password === "string" ? parsed.password : "";
  } catch {
    return "";
  }
};

const writeStoredNotebookSharePassword = (notebookId: string, token: string, password: string) => {
  try {
    window.localStorage.setItem(notebookSharePasswordStorageKey(notebookId), JSON.stringify({ token, password }));
  } catch {
    // Storage may be unavailable; the generated password is still shown in this dialog session.
  }
};

const clearStoredNotebookSharePassword = (notebookId: string) => {
  try {
    window.localStorage.removeItem(notebookSharePasswordStorageKey(notebookId));
    window.sessionStorage.removeItem(notebookSharePasswordStorageKey(notebookId));
  } catch {
    // Ignore restricted storage contexts.
  }
};

export const ShareNotebookDialog = ({
  notebookId,
  notebookName,
  inherited = false,
  open,
  onOpenChange,
}: {
  notebookId: string;
  notebookName: string;
  inherited?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [revealedPassword, setRevealedPassword] = useState("");
  const copyResetTimerRef = useRef<number | null>(null);

  const queryKey = [
    "notebook-share",
    getConfiguredDesktopApiBaseUrl(),
    notebookId,
  ];

  const query = useQuery({
    queryKey,
    queryFn: () => api.getNotebookShare(notebookId),
    enabled: open,
    retry: false,
    refetchOnMount: "always",
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notebook-shares"] });

  const create = useMutation({
    mutationFn: () => api.createNotebookShare(notebookId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void invalidate();
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (passwordProtected: boolean) => api.updateNotebookShare(notebookId, { passwordProtected }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, { share: { ...data.share, password: undefined } });
      void invalidate();
      if (data.share.password) {
        writeStoredNotebookSharePassword(notebookId, data.share.token, data.share.password);
        setRevealedPassword(data.share.password);
      } else {
        clearStoredNotebookSharePassword(notebookId);
        setRevealedPassword("");
      }
    },
  });

  const revoke = useMutation({
    mutationFn: () => api.revokeNotebookShare(notebookId),
    onSuccess: () => {
      clearStoredNotebookSharePassword(notebookId);
      setRevealedPassword("");
      queryClient.setQueryData(queryKey, { share: null });
      setCopyState("idle");
      void invalidate();
    },
  });

  useEffect(() => {
    create.reset();
    passwordMutation.reset();
    revoke.reset();
    setCopyState("idle");
    setRevealedPassword("");
  }, [notebookId]);

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  const share = query.data?.share ?? null;

  useEffect(() => {
    if (!share?.passwordProtected) {
      setRevealedPassword("");
      return;
    }
    setRevealedPassword(readStoredNotebookSharePassword(notebookId, share.token));
  }, [notebookId, share?.passwordProtected, share?.token]);

  const shareUrl = share ? getPublicNotebookShareUrl(share.token) : "";
  const busy = query.isFetching || create.isPending || revoke.isPending || passwordMutation.isPending;
  const failed = query.isError || create.isError || revoke.isError || passwordMutation.isError;
  const hasPassword = Boolean(share?.passwordProtected && revealedPassword);

  const handlePrimaryCopy = async () => {
    const value = hasPassword
      ? `${shareUrl}\n${t("sharing.passwordPrefix")}${revealedPassword}`
      : shareUrl;
    const ok = await copyTextToClipboard(value);
    setCopyState(ok ? "copied" : "error");
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimerRef.current = null;
    }, 3000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Share2 className="h-5 w-5 text-slate-700" />
            {t("sharing.notebookTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 text-slate-500">
            <span className="font-medium text-slate-800">{notebookName}</span>
            <span className="mx-1 text-slate-400">·</span>
            <span>
              {t(share?.passwordProtected ? "sharing.notebookProtectedScopeHint" : "sharing.notebookScopeHint")}
            </span>
          </DialogDescription>
        </DialogHeader>

        {inherited ? (
          <p className="text-xs text-amber-700">
            {t("sharing.notebookInheritedHint")}
          </p>
        ) : null}

        {query.isPending ? (
          <div className="flex min-h-20 items-center justify-center text-slate-500" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-label={t("sharing.publicLoading")} />
          </div>
        ) : share ? (
          <div className="space-y-3.5">
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                aria-label={t("sharing.linkLabel")}
                className="min-w-0 font-mono text-xs"
              />
              <Button
                variant={copyState === "copied" ? "solid" : copyState === "error" ? "danger" : "outline"}
                className="min-w-28 shrink-0"
                aria-live="polite"
                onClick={() => void handlePrimaryCopy()}
              >
                {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {t(
                  copyState === "copied"
                    ? "sharing.copied"
                    : copyState === "error"
                      ? "sharing.copyFailed"
                      : hasPassword
                        ? "sharing.copyLinkAndPassword"
                        : "sharing.copy",
                )}
              </Button>
            </div>

            <SharePasswordControls
              key={share.token}
              passwordProtected={share.passwordProtected}
              password={revealedPassword}
              busy={busy}
              shareUrl={shareUrl}
              hideCopyBoth={true}
              onChange={(enabled) => passwordMutation.mutate(enabled)}
            />

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => revoke.mutate()}
              >
                <Trash2 className="h-4 w-4" />
                {t("sharing.revoke")}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(shareUrl, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="h-4 w-4" />
                {t("sharing.open")}
              </Button>
            </div>
          </div>
        ) : !query.isError ? (
          <div className="space-y-3">
            <p className="text-xs leading-6 text-slate-600">{t("sharing.notebookScopeHint")}</p>
            <Button className="w-full" variant="solid" disabled={busy} onClick={() => create.mutate()}>
              {create.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {t("sharing.create")}
            </Button>
          </div>
        ) : null}

        {failed ? (
          <div role="alert" className="space-y-2 text-sm text-rose-600">
            <p>{t("sharing.error")}</p>
            {query.isError ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void query.refetch()}
              >
                {t("sharing.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {location.pathname !== "/settings" ? (
          <div className="pt-1 text-center">
            <Link
              to="/settings?tab=sharing"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              {t("sharing.viewAll")}
            </Link>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
