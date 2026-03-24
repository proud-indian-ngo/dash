import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";

export const SKELETON_NAME = (
  <div className="flex h-10.25 items-center gap-3">
    <Skeleton className="size-8 rounded-full" />
    <div className="space-y-1">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-3 w-20" />
    </div>
  </div>
);
export const SKELETON_ROLE = <Skeleton className="h-6 w-16" />;
export const SKELETON_GENDER = <Skeleton className="h-5 w-14" />;
export const SKELETON_DOB = <Skeleton className="h-5 w-20" />;
export const SKELETON_ACTIVE = <Skeleton className="h-6 w-14" />;
export const SKELETON_ORIENTATION = <Skeleton className="h-6 w-20" />;
export const SKELETON_BANNED = (
  <div className="flex items-center gap-1.5">
    <Skeleton className="size-2 rounded-full" />
    <Skeleton className="h-4 w-10" />
  </div>
);
export const SKELETON_CREATED_AT = <Skeleton className="h-5 w-32" />;
export const SKELETON_WHATSAPP = <Skeleton className="h-6 w-14" />;
