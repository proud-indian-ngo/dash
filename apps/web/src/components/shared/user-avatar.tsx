import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@pi-dash/design-system/components/ui/avatar";
import { buildAvatarUrl } from "@/lib/avatar";

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
  };
}

export function UserAvatar({
  user,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  return (
    <Avatar className={className}>
      <AvatarImage
        alt={user.name}
        src={buildAvatarUrl(user.email, user.gender)}
      />
      <AvatarFallback className={fallbackClassName}>
        {getInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}
