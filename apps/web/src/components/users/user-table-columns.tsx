import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { User } from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import capitalize from "lodash/capitalize";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  SKELETON_ACTIVE,
  SKELETON_BANNED,
  SKELETON_CREATED_AT,
  SKELETON_DOB,
  SKELETON_GENDER,
  SKELETON_NAME,
  SKELETON_ORIENTATION,
  SKELETON_ROLE,
  SKELETON_WHATSAPP,
} from "@/components/users/user-table-skeletons";
import { SHORT_DATE, SHORT_DATE_WITH_SECONDS } from "@/lib/date-formats";

export function createUserColumns(
  renderActions: (row: User) => ReactNode
): (ColumnDef<User> & { enableColumnOrdering?: boolean })[] {
  return [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="User" visibility={true} />
      ),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar className="size-8" user={row.original} />
          <div className="min-w-0 space-y-px">
            <div className="truncate font-medium text-foreground">
              {row.original.name}
            </div>
            <div className="truncate text-muted-foreground text-xs">
              {row.original.email}
            </div>
          </div>
        </div>
      ),
      meta: {
        headerTitle: "User",
        skeleton: SKELETON_NAME,
      },
      size: 240,
    },
    {
      id: "role",
      accessorFn: (row) => row.role ?? "volunteer",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Role" visibility={true} />
      ),
      cell: ({ row }) => {
        const roleName = row.original.role ?? "volunteer";
        return roleName === "admin" ? (
          <Badge variant="info-outline">Admin</Badge>
        ) : (
          <Badge className="capitalize" variant="secondary">
            {roleName.replace(/_/g, " ")}
          </Badge>
        );
      },
      meta: {
        headerTitle: "Role",
        skeleton: SKELETON_ROLE,
      },
      size: 120,
    },
    {
      id: "gender",
      accessorFn: (row) => (row.gender ? capitalize(row.gender) : "—"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Gender"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Gender",
        skeleton: SKELETON_GENDER,
      },
      size: 110,
    },
    {
      id: "dob",
      accessorFn: (row) => {
        if (row.dob == null) {
          return "—";
        }
        return format(row.dob, SHORT_DATE);
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="DOB" visibility={true} />
      ),
      meta: {
        headerTitle: "DOB",
        skeleton: SKELETON_DOB,
      },
      size: 120,
    },
    {
      id: "active",
      accessorFn: (row) => (row.isActive ? "yes" : "no"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Active"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success-outline">Active</Badge>
        ) : (
          <Badge variant="destructive-outline">Inactive</Badge>
        ),
      meta: {
        headerTitle: "Active",
        skeleton: SKELETON_ACTIVE,
      },
      size: 110,
    },
    {
      id: "attendedOrientation",
      accessorFn: (row) => (row.attendedOrientation ? "yes" : "no"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Orientation"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        row.original.attendedOrientation ? (
          <Badge variant="success-outline">Attended</Badge>
        ) : (
          <Badge variant="warning-outline">Pending</Badge>
        ),
      meta: {
        headerTitle: "Orientation",
        skeleton: SKELETON_ORIENTATION,
      },
      size: 140,
    },
    {
      id: "isOnWhatsapp",
      accessorFn: (row) => (row.isOnWhatsapp ? "yes" : "no"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="WhatsApp"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        row.original.isOnWhatsapp ? (
          <Badge variant="success-outline">Yes</Badge>
        ) : (
          <Badge variant="secondary">No</Badge>
        ),
      meta: {
        headerTitle: "WhatsApp",
        skeleton: SKELETON_WHATSAPP,
      },
      size: 110,
    },
    {
      id: "banned",
      accessorFn: (row) => (row.banned ? "yes" : "no"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Banned"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const isBanned = Boolean(row.original.banned);
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className={`size-2 shrink-0 rounded-full ${isBanned ? "bg-destructive" : "bg-green-500"}`}
            />
            <span className="truncate text-muted-foreground text-sm">
              {isBanned ? "Banned" : "Active"}
            </span>
          </div>
        );
      },
      meta: {
        headerTitle: "Banned",
        skeleton: SKELETON_BANNED,
      },
      size: 110,
    },
    {
      id: "createdAt",
      accessorFn: (row) => {
        if (row.createdAt == null) {
          return "—";
        }
        return format(row.createdAt, SHORT_DATE_WITH_SECONDS);
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Created"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Created",
        skeleton: SKELETON_CREATED_AT,
      },
      size: 180,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => renderActions(row.original),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: {
        cellClassName: "text-center",
      },
      size: 52,
      minSize: 52,
    },
  ];
}
