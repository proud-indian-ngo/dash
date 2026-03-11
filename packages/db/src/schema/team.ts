import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";
import { whatsappGroup } from "./whatsapp-group";

const teamMemberRoleValues = ["member", "lead"] as const;
export type TeamMemberRole = (typeof teamMemberRoleValues)[number];
export const teamMemberRoleEnum = pgEnum(
  "team_member_role",
  teamMemberRoleValues
);

export const team = pgTable(
  "team",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    whatsappGroupId: uuid("whatsapp_group_id")
      .references(() => whatsappGroup.id, { onDelete: "set null" })
      .unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("team_whatsappGroupId_idx").on(table.whatsappGroupId)]
);

export const teamMember = pgTable(
  "team_member",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: teamMemberRoleEnum("role").default("member").notNull(),
    joinedAt: timestamp("joined_at").notNull(),
  },
  (table) => [
    uniqueIndex("team_member_teamId_userId_uidx").on(
      table.teamId,
      table.userId
    ),
    index("team_member_teamId_idx").on(table.teamId),
    index("team_member_userId_idx").on(table.userId),
  ]
);

export const teamRelations = relations(team, ({ one, many }) => ({
  whatsappGroup: one(whatsappGroup, {
    fields: [team.whatsappGroupId],
    references: [whatsappGroup.id],
  }),
  members: many(teamMember),
  events: many(teamEvent),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));
