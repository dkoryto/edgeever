import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, LoaderCircle, Share2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SharePasswordControls } from "./SharePasswordControls";
import { api, getConfiguredDesktopApiBaseUrl } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";

export const getPublicShareUrl = (token: string) => {
  const baseUrl = getConfiguredDesktopApiBaseUrl() || window.location.origin;
  return `${baseUrl.replace(/\/$/, "")}/share/${encodeURIComponent(token)}`;
};

const sharePasswordStorageKey = (memoId: string) => `edgeever.sharePassword.${memoId}`;

const readStoredSharePassword = (memoId: string, token: string) => {
  try {
    const raw = window.localStorage.getItem(sharePasswordStorageKey(memoId)) || window.sessionStorage.getItem(sharePasswordStorageKey(memoId));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string; password?: string };
    return parsed.token === token && typeof parsed.password === "string" ? parsed.password : "";
  } catch {
    return "";
  }
};

const writeStoredSharePassword = (memoId: string, token: string, password: string) => {
  try {
    window.localStorage.setItem(sharePasswordStorageKey(memoId), JSON.stringify({ token, password }));
  } catch {
    // Storage may be unavailable; the generated password is still shown in this dialog session.
  }
};

const clearStoredSharePassword = (memoId: string) => {
  try {
    window.localStorage.removeItem(sharePasswordStorageKey(memoId));
    window.sessionStorage.removeItem(sharePasswordStorageKey(memoId));
  } catch {
    // Ignore restricted storage contexts.
  }
};

export const memoShareQueryKey = (memoId: string) => ["memo-share", memoId] as const;

export const ShareMemoDialog = ({
  memoId,
  open,
  onOpenChange,
}: {
  memoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [copyTarget, setCopyTarget] = useState<"link" | "password" | "both">("link");
  const [revealedPassword, setRevealedPassword] = useState("");
  const copyResetTimerRef = useRef<number | null>(null);
  const queryKey = memoShareQueryKey(memoId);
  const shareQuery = useQuery({
    queryKey,
    queryFn: () => api.getMemoShare(memoId),
    enabled: open,
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () => api.createMemoShare(memoId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
    },
  });
  const passwordMutation = useMutation({
    mutationFn: (passwordProtected: boolean) => api.updateMemoShare(memoId, { passwordProtected }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, { share: { ...data.share, password: undefined } });
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
      if (data.share.password) {
        writeStoredSharePassword(memoId, data.share.token, data.share.password);
        setRevealedPassword(data.share.password);
      } else {
        clearStoredSharePassword(memoId);
        setRevealedPassword("");
      }
    },
  });
  const revokeMutation = useMutation({
    mutationFn: () => api.revokeMemoShare(memoId),
    onSuccess: () => {
      clearStoredSharePassword(memoId);
      setRevealedPassword("");
      queryClient.setQueryData(queryKey, { share: null });
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
    },
  });
  useEffect(() => {
    createMutation.reset();
    passwordMutation.reset();
    revokeMutation.reset();
    setCopyState("idle");
    setCopyTarget("link");
    setRevealedPassword("");
  }, [memoId]);
  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  const share = shareQuery.data?.share ?? null;
  useEffect(() => {
    if (!share?.passwordProtected) {
      setRevealedPassword("");
      return;
    }
    setRevealedPassword(readStoredSharePassword(memoId, share.token));
  }, [memoId, share?.passwordProtected, share?.token]);

  const shareUrl = share ? getPublicShareUrl(share.token) : "";
  const isWorking = shareQuery.isLoading || createMutation.isPending || passwordMutation.isPending || revokeMutation.isPending;
  const error = shareQuery.error || createMutation.error || passwordMutation.error || revokeMutation.error;

  const markCopied = (target: "link" | "password" | "both", copied: boolean) => {
    setCopyTarget(target);
    setCopyState(copied ? "copied" : "error");
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimerRef.current = null;
    }, 3000);
  };

  const copyValue = async (target: "link" | "password" | "both", value: string) => {
    markCopied(target, await copyTextToClipboard(value));
  };

  const copiedLabel = (target: "link" | "password" | "both", idleKey: string) =>
    copyState === "copied" && copyTarget === target
      ? "sharing.copied"
      : copyState === "error" && copyTarget === target
        ? "sharing.copyFailed"
        : idleKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Share2 className="h-5 w-5 text-slate-700" />
            {t("sharing.title")}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 text-slate-500">
            {t(share?.passwordProtected ? "sharing.descriptionProtected" : "sharing.description")}
          </DialogDescription>
        </DialogHeader>

        {shareQuery.isLoading ? (
          <div className="flex min-h-20 items-center justify-center text-slate-500" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : share ? (
          <div className="space-y-3.5">
            {/* SharePasswordControls renders t("sharing.passwordToggle") */}
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly aria-label={t("sharing.linkLabel")} className="min-w-0 font-mono text-xs" />
              <Button
                variant={copyState === "copied" && copyTarget === "link" ? "solid" : copyState === "error" && copyTarget === "link" ? "danger" : "outline"}
                className="min-w-28 shrink-0"
                aria-live="polite"
                onClick={() =>
                  void copyValue(
                    "link",
                    share.passwordProtected && revealedPassword
                      ? `${shareUrl}\n${t("sharing.passwordPrefix")}${revealedPassword}`
                      : shareUrl,
                  )
                }
              >
                {copyState === "copied" && copyTarget === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {t(
                  copyState === "copied" && copyTarget === "link"
                    ? "sharing.copied"
                    : copyState === "error" && copyTarget === "link"
                      ? "sharing.copyFailed"
                      : share.passwordProtected && revealedPassword
                        ? "sharing.copyLinkAndPassword"
                        : "sharing.copy",
                )}
              </Button>
            </div>

            <SharePasswordControls
              passwordProtected={share.passwordProtected}
              password={revealedPassword}
              busy={isWorking}
              shareUrl={shareUrl}
              hideCopyBoth={true}
              onChange={(enabled) => passwordMutation.mutate(enabled)}
            />

            <div className="flex items-center justify-between pt-2">
              <Button variant="danger" disabled={isWorking} onClick={() => revokeMutation.mutate()}>
                <Trash2 className="h-4 w-4" />
                {t("sharing.revoke")}
              </Button>
              <Button variant="outline" onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="h-4 w-4" />
                {t("sharing.open")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-6 text-slate-600">{t("sharing.inactiveHint")}</p>
            <Button className="w-full" variant="solid" disabled={isWorking} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {t("sharing.create")}
            </Button>
          </div>
        )}
        {error ? <p className="text-xs leading-5 text-rose-600" role="alert">{t("sharing.error")}</p> : null}

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
