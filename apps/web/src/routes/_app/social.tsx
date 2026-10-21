import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { SocialRun } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton } from "@/components/shared/page-skeleton";
import {
  type SocialPostRow,
  SocialPostsTable,
} from "@/components/social/social-posts-table";
import { SocialRunsTable } from "@/components/social/social-runs-table";
import { SocialSettings } from "@/components/social/social-settings";
import { useSocialPeople } from "@/components/social/use-social-people";
import { handleMutationResult } from "@/lib/mutation-result";
import { assertPermission } from "@/lib/route-guards";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/social")({
  beforeLoad: ({ context }) => assertPermission(context, "social.manage"),
  component: SocialPage,
  head: () => ({ meta: [{ title: `Social | ${env.VITE_APP_NAME}` }] }),
});

const SOCIAL_TABS = ["runs", "posts", "settings"] as const;
type SocialTab = (typeof SOCIAL_TABS)[number];

function RunsTab() {
  const [runs, result] = useQuery(queries.socialRun.all());
  return (
    <SocialRunsTable
      isLoading={runs.length === 0 && isAwaitingResult(result)}
      runs={runs as SocialRun[]}
    />
  );
}

function PostsTab() {
  const zero = useZero();
  const [posts, result] = useQuery(queries.socialPost.all());
  const people = useSocialPeople(posts.map((post) => post.droppedBy));
  const rows: SocialPostRow[] = posts.map((post) => ({
    ...post,
    droppedByName: post.droppedBy
      ? (people?.names.get(post.droppedBy) ?? null)
      : null,
  }));
  const [dropTarget, setDropTarget] = useState<SocialPostRow | null>(null);
  const [dropping, setDropping] = useState(false);

  const handleConfirm = useEventCallback(async () => {
    if (!dropTarget) {
      return;
    }
    setDropping(true);
    try {
      const res = await zero.mutate(
        mutators.socialPost.drop({ id: dropTarget.id, now: Date.now() })
      ).server;
      handleMutationResult(res, {
        entityId: dropTarget.id,
        errorMsg: "Couldn't drop post",
        mutation: "socialPost.drop",
        successMsg: "Post dropped",
      });
      if (res.type !== "error") {
        setDropTarget(null);
      }
    } catch (error) {
      log.error({
        action: "dropSocialPost",
        component: "SocialPage",
        error: error instanceof Error ? error.message : String(error),
        postId: dropTarget.id,
      });
    }
    setDropping(false);
  });
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setDropTarget(null);
    }
  });

  return (
    <>
      <SocialPostsTable
        isLoading={posts.length === 0 && isAwaitingResult(result)}
        onDrop={setDropTarget}
        posts={rows}
      />
      <ConfirmDialog
        confirmLabel="Drop post"
        description="The pipeline will never publish this post or queue it again, and deletes it from Buffer within the hour."
        loading={dropping}
        loadingLabel="Dropping..."
        onConfirm={handleConfirm}
        onOpenChange={handleOpenChange}
        open={!!dropTarget}
        title="Drop this post?"
        variant="destructive"
      />
    </>
  );
}

function SettingsTab() {
  const [configs, result] = useQuery(queries.appConfig.all());
  if (configs.length === 0 && isAwaitingResult(result)) {
    return <FormSkeleton className="max-w-3xl" fields={4} />;
  }
  return <SocialSettings configs={configs} />;
}

function SocialPage() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(SOCIAL_TABS).withDefault("runs")
  );
  const handleTabChange = useEventCallback((value: string | null) =>
    setTab(value as SocialTab)
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        description="What the social media pipeline ran and posted, and the switches that pause it."
        title="Social"
      />
      <Tabs className="mt-4" onValueChange={handleTabChange} value={tab}>
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4 grid *:min-w-0" value="runs">
          <RunsTab />
        </TabsContent>
        <TabsContent className="mt-4 grid *:min-w-0" value="posts">
          <PostsTab />
        </TabsContent>
        <TabsContent className="mt-4" value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
