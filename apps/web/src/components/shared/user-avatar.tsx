import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@pi-dash/design-system/components/ui/avatar";
import { useState } from "react";

import { buildAvatarUrl, resolveAvatarSrc } from "@/lib/avatar";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
}

interface UserAvatarProps {
  className?: string;
  fallbackClassName?: string;
  user: {
    name: string;
    email?: null | string;
    gender?: null | string;
    id?: string;
    image?: null | string;
  };
}

export function UserAvatar({
  user,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const uploadedSrc = resolveAvatarSrc(user);
  const generatedSrc = buildAvatarUrl(user.id);
  // A photo that no longer loads (deleted or unreachable) falls back to the
  // generated avatar; initials show only if that fails too.
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = failedSrc === uploadedSrc ? generatedSrc : uploadedSrc;
  return (
    <Avatar className={className}>
      <AvatarImage
        alt={user.name}
        onLoadingStatusChange={(status) => {
          if (status === "error" && src !== generatedSrc) {
            setFailedSrc(src);
          }
        }}
        src={src}
      />
      <AvatarFallback className={fallbackClassName}>
        {getInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}
