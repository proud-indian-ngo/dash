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
  SKELETON_BAN_EXPIRES,
  SKELETON_BAN_REASON,
  SKELETON_BANNED,
  SKELETON_CREATED_AT,
  SKELETON_DOB,
  SKELETON_EMAIL_VERIFIED,
  SKELETON_GENDER,
  SKELETON_NAME,
  SKELETON_PHONE,
  SKELETON_ROLE,
  SKELETON_UPDATED_AT,
  SKELETON_WHATSAPP,
} from "@/components/users/user-table-skeletons";
import { SHORT_DATE, SHORT_DATE_WITH_SECONDS } from "@/lib/date-formats";

export function createUserColumns(
  renderActions: (row: User) => ReactNode
): (ColumnDef<User> & { enableColumnOrdering?: boolean })[] {
  return [
    {
      accessorFn: (row) => row.name,
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
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="User" visibility={true} />
      ),
      id: "name",
      meta: {
        headerTitle: "User",
        skeleton: SKELETON_NAME,
      },
      size: 240,
    },
    {
      accessorFn: (row) => row.role ?? "volunteer",
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
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Role" visibility={true} />
      ),
      id: "role",
      meta: {
        headerTitle: "Role",
        skeleton: SKELETON_ROLE,
      },
      size: 120,
    },
    {
      accessorFn: (row) => (row.gender ? capitalize(row.gender) : "—"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Gender"
          visibility={true}
        />
      ),
      id: "gender",
      meta: {
        headerTitle: "Gender",
        skeleton: SKELETON_GENDER,
      },
      size: 110,
    },
    {
      accessorFn: (row) => {
        if (row.dob === null) {
          return "—";
        }
        return format(row.dob, SHORT_DATE);
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="DOB" visibility={true} />
      ),
      id: "dob",
      meta: {
        headerTitle: "DOB",
        skeleton: SKELETON_DOB,
      },
      size: 120,
    },
    {
      accessorFn: (row) => (row.isActive ? "yes" : "no"),
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success-outline">Active</Badge>
        ) : (
          <Badge variant="destructive-outline">Inactive</Badge>
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Active"
          visibility={true}
        />
      ),
      id: "active",
      meta: {
        headerTitle: "Active",
        skeleton: SKELETON_ACTIVE,
      },
      size: 110,
    },
    {
      accessorFn: (row) => (row.isOnWhatsapp ? "yes" : "no"),
      cell: ({ row }) =>
        row.original.isOnWhatsapp ? (
          <Badge variant="success-outline">Yes</Badge>
        ) : (
          <Badge variant="secondary">No</Badge>
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="WhatsApp"
          visibility={true}
        />
      ),
      id: "isOnWhatsapp",
      meta: {
        headerTitle: "WhatsApp",
        skeleton: SKELETON_WHATSAPP,
      },
      size: 110,
    },
    {
      accessorFn: (row) => row.phone ?? "—",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Phone" visibility={true} />
      ),
      id: "phone",
      meta: {
        headerTitle: "Phone",
        skeleton: SKELETON_PHONE,
      },
      size: 140,
    },
    {
      accessorFn: (row) => (row.emailVerified ? "yes" : "no"),
      cell: ({ row }) =>
        row.original.emailVerified ? (
          <Badge variant="success-outline">Verified</Badge>
        ) : (
          <Badge variant="secondary">Unverified</Badge>
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Email Verified"
          visibility={true}
        />
      ),
      id: "emailVerified",
      meta: {
        headerTitle: "Email Verified",
        skeleton: SKELETON_EMAIL_VERIFIED,
      },
      size: 130,
    },
    {
      accessorFn: (row) => (row.banned ? "yes" : "no"),
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
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Banned"
          visibility={true}
        />
      ),
      id: "banned",
      meta: {
        headerTitle: "Banned",
        skeleton: SKELETON_BANNED,
      },
      size: 110,
    },
    {
      accessorFn: (row) => row.banReason ?? "—",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Ban Reason"
          visibility={true}
        />
      ),
      id: "banReason",
      meta: {
        headerTitle: "Ban Reason",
        skeleton: SKELETON_BAN_REASON,
      },
      size: 180,
    },
    {
      accessorFn: (row) => {
        if (row.banExpires === null) {
          return "—";
        }
        return format(row.banExpires, SHORT_DATE_WITH_SECONDS);
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Ban Expires"
          visibility={true}
        />
      ),
      id: "banExpires",
      meta: {
        headerTitle: "Ban Expires",
        skeleton: SKELETON_BAN_EXPIRES,
      },
      size: 180,
    },
    {
      accessorFn: (row) => {
        if (row.createdAt === null) {
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
      id: "createdAt",
      meta: {
        headerTitle: "Created",
        skeleton: SKELETON_CREATED_AT,
      },
      size: 180,
    },
    {
      accessorFn: (row) => {
        if (row.updatedAt === null) {
          return "—";
        }
        return format(row.updatedAt, SHORT_DATE_WITH_SECONDS);
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Updated"
          visibility={true}
        />
      ),
      id: "updatedAt",
      meta: {
        headerTitle: "Updated",
        skeleton: SKELETON_UPDATED_AT,
      },
      size: 180,
    },
    {
      cell: ({ row }) => renderActions(row.original),
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        stopRowClick: true,
      },
      minSize: 52,
      size: 52,
    },
  ];
}
