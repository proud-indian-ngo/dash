import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { SOCIAL_TOKEN_NAME_MAX_LENGTH } from "@pi-dash/shared/social-recap";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { log } from "evlog";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import {
  createSocialApiTokenFn,
  getSocialApiTokens,
  revokeSocialApiTokenFn,
  type SocialApiTokenListItem,
} from "@/functions/social-api-tokens";
import { SHORT_DATE } from "@/lib/date-formats";
import { getErrorMessage } from "@/lib/errors";

const SCOPE_OPTIONS = [
  { description: "List events and stats", value: "events:read" },
  { description: "Event photos and signed links", value: "photos:read" },
  { description: "Volunteer sign-up counts", value: "signups:read" },
  { description: "Record posts and send the digest", value: "social:write" },
] as const;

type Scope = (typeof SCOPE_OPTIONS)[number]["value"];

function formatDate(value: number | null) {
  return value === null ? "Never" : format(new Date(value), SHORT_DATE);
}

function ScopeCheckbox({
  checked,
  description,
  onToggle,
  value,
}: {
  checked: boolean;
  description: string;
  onToggle: (scope: Scope, checked: boolean) => void;
  value: Scope;
}) {
  const id = `token-scope-${value}`;
  const handleChange = useEventCallback((next: boolean) =>
    onToggle(value, next)
  );
  return (
    <div className="flex items-start gap-2">
      <Checkbox checked={checked} id={id} onCheckedChange={handleChange} />
      <Label className="grid gap-0.5 font-normal" htmlFor={id}>
        <span className="font-mono text-sm">{value}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </Label>
    </div>
  );
}

function CreatedToken({
  onDone,
  token,
}: {
  onDone: () => void;
  token: string;
}) {
  const handleCopy = useEventCallback(async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Token copied");
    } catch {
      toast.error("Couldn't copy. Select the token and copy it manually.");
    }
  });
  return (
    <>
      <div className="grid gap-3">
        <p className="text-sm" role="alert">
          Copy this token now. It cannot be shown again; if it is lost, revoke
          it and create a new one.
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="New API token"
            className="font-mono"
            onFocus={(event) => event.target.select()}
            readOnly
            value={token}
          />
          <Button onClick={handleCopy} type="button" variant="outline">
            Copy
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function CreateTokenDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const createToken = useServerFn(createSocialApiTokenFn);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setScopes([]);
    setToken(null);
  };
  const handleOpenChange = useEventCallback((next: boolean) => {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  });
  const handleToggle = useEventCallback((scope: Scope, checked: boolean) =>
    setScopes((prev) =>
      checked ? [...prev, scope] : prev.filter((item) => item !== scope)
    )
  );
  const handleSubmit = useEventCallback(async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await createToken({
        data: { name: name.trim(), scopes },
      });
      setToken(result.token);
      onCreated();
    } catch (error) {
      log.error({
        action: "createSocialApiToken",
        component: "ApiTokensSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't create token");
    } finally {
      setSubmitting(false);
    }
  });
  const handleDone = useEventCallback(() => handleOpenChange(false));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>{token ? "Token created" : "Create token"}</DialogTitle>
          <DialogDescription>
            Bearer token for the social API at /api/social/v1.
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <CreatedToken onDone={handleDone} token={token} />
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                maxLength={SOCIAL_TOKEN_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. social-artifacts worker"
                required
                value={name}
              />
            </div>
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-medium">Scopes</legend>
              {SCOPE_OPTIONS.map((option) => (
                <ScopeCheckbox
                  checked={scopes.includes(option.value)}
                  description={option.description}
                  key={option.value}
                  onToggle={handleToggle}
                  value={option.value}
                />
              ))}
            </fieldset>
            <DialogFooter>
              <Button onClick={handleDone} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={submitting || !name.trim() || scopes.length === 0}
                type="submit"
              >
                Create token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TokenRow({
  onRevoke,
  token,
}: {
  onRevoke: (token: SocialApiTokenListItem) => void;
  token: SocialApiTokenListItem;
}) {
  const handleRevoke = useEventCallback(() => onRevoke(token));
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{token.name}</span>
          {token.revokedAt === null ? (
            <StatusBadge tone="success">Active</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">
              Revoked {formatDate(token.revokedAt)}
            </StatusBadge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {token.scopes.map((scope) => (
            <Tag className="font-mono" key={scope}>
              {scope}
            </Tag>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Created{" "}
          <span className="font-mono">{formatDate(token.createdAt)}</span> ·
          Last used{" "}
          <span className="font-mono">{formatDate(token.lastUsedAt)}</span>
        </p>
      </div>
      {token.revokedAt === null ? (
        <Button
          onClick={handleRevoke}
          size="sm"
          type="button"
          variant="outline"
        >
          Revoke
        </Button>
      ) : null}
    </li>
  );
}

/** Settings: bearer tokens for the social-artifacts pipeline. */
export function ApiTokensSection() {
  const listTokens = useServerFn(getSocialApiTokens);
  const revokeToken = useServerFn(revokeSocialApiTokenFn);
  const [tokens, setTokens] = useState<SocialApiTokenListItem[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<SocialApiTokenListItem | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  // Kept after close so the dialog's exit animation still names the token.
  const [revokeName, setRevokeName] = useState("");
  const startRevoke = useEventCallback((token: SocialApiTokenListItem) => {
    setRevokeName(token.name);
    setRevoking(token);
  });

  const refresh = useEventCallback(async () => {
    try {
      setTokens(await listTokens());
    } catch (error) {
      log.error({
        action: "listSocialApiTokens",
        component: "ApiTokensSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't load API tokens");
      setTokens([]);
    }
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleConfirmRevoke = useEventCallback(async () => {
    if (!revoking) {
      return;
    }
    setRevokeLoading(true);
    try {
      await revokeToken({ data: { id: revoking.id } });
      toast.success("Token revoked");
      await refresh();
    } catch (error) {
      log.error({
        action: "revokeSocialApiToken",
        component: "ApiTokensSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't revoke token");
    } finally {
      setRevokeLoading(false);
      setRevoking(null);
    }
  });
  const handleRevokeOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setRevoking(null);
    }
  });
  const openCreate = useEventCallback(() => setCreateOpen(true));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-prose text-sm">
          Bearer tokens for the social API used by the social-artifacts
          pipeline. Only a hash is stored, so a token is shown once when it is
          created.
        </p>
        <Button onClick={openCreate} type="button">
          Create token
        </Button>
      </div>

      {tokens === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : null}
      {tokens?.length === 0 ? (
        <p className="text-muted-foreground text-sm">No API tokens yet.</p>
      ) : null}
      {tokens && tokens.length > 0 ? (
        <ul aria-label="API tokens">
          {tokens.map((token) => (
            <TokenRow key={token.id} onRevoke={startRevoke} token={token} />
          ))}
        </ul>
      ) : null}

      <CreateTokenDialog
        onCreated={refresh}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />

      <ConfirmDialog
        confirmLabel="Revoke token"
        description={
          <>
            Requests using <strong>{revokeName}</strong> stop working
            immediately. This cannot be undone.
          </>
        }
        loading={revokeLoading}
        loadingLabel="Revoking..."
        onConfirm={handleConfirmRevoke}
        onOpenChange={handleRevokeOpenChange}
        open={revoking !== null}
        title="Revoke API token"
      />
    </div>
  );
}
