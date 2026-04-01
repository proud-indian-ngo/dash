/**
 * Comprehensive dev data seed for worktree isolated databases.
 * Populates all tables with realistic data for development.
 *
 * Usage:
 *   DATABASE_URL="..." SKIP_VALIDATION=true bun run scripts/seed-dev-data.ts
 *
 * Called automatically by worktree-setup.sh --isolated-db
 */
import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import {
  advancePayment,
  advancePaymentHistory,
  advancePaymentLineItem,
} from "@pi-dash/db/schema/advance-payment";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import { eventFeedback } from "@pi-dash/db/schema/event-feedback";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  reimbursement,
  reimbursementHistory,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import {
  vendor,
  vendorPayment,
  vendorPaymentHistory,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import {
  vendorPaymentTransaction,
  vendorPaymentTransactionHistory,
} from "@pi-dash/db/schema/vendor-payment-transaction";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const log = (msg: string) => process.stdout.write(`  ${msg}\n`);
const now = new Date();

// ── Helpers ──────────────────────────────────────────────────────────────────

function past(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
function future(days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}
function subDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

// ── 1. Users ─────────────────────────────────────────────────────────────────

interface SeedUser {
  email: string;
  gender?: "male" | "female";
  name: string;
  password: string;
  phone?: string;
  role: string;
}

const USERS: SeedUser[] = [
  {
    email: "admin@pi-dash.dev",
    name: "Dev Admin",
    password: "Admin123!",
    role: "super_admin",
    gender: "male",
    phone: "+919876543210",
  },
  {
    email: "lead@pi-dash.dev",
    name: "Priya Sharma",
    password: "Lead123!",
    role: "volunteer",
    gender: "female",
    phone: "+919876543211",
  },
  {
    email: "volunteer1@pi-dash.dev",
    name: "Rahul Verma",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "male",
    phone: "+919876543212",
  },
  {
    email: "volunteer2@pi-dash.dev",
    name: "Ananya Patel",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "female",
    phone: "+919876543213",
  },
  {
    email: "volunteer3@pi-dash.dev",
    name: "Vikram Singh",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "male",
    phone: "+919876543214",
  },
  {
    email: "volunteer4@pi-dash.dev",
    name: "Meera Reddy",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "female",
    phone: "+919876543215",
  },
  {
    email: "newbie@pi-dash.dev",
    name: "Arjun Nair",
    password: "Newbie123!",
    role: "unoriented_volunteer",
    gender: "male",
    phone: "+919876543216",
  },
];

async function seedUsers(): Promise<Map<string, string>> {
  log("Seeding users...");
  const userMap = new Map<string, string>(); // email → id

  for (const u of USERS) {
    let record = await db.query.user.findFirst({
      columns: { id: true },
      where: (t, ops) => ops.eq(t.email, u.email),
    });

    if (!record) {
      await auth.api.createUser({
        body: { email: u.email, name: u.name, password: u.password },
      });
      record = await db.query.user.findFirst({
        columns: { id: true },
        where: (t, ops) => ops.eq(t.email, u.email),
      });
    }

    if (!record) {
      throw new Error(`Failed to create user: ${u.email}`);
    }

    await db
      .update(user)
      .set({
        role: u.role,
        emailVerified: true,
        gender: u.gender,
        phone: u.phone,
        isOnWhatsapp: true,
        isActive: true,
      })
      .where(eq(user.id, record.id));

    userMap.set(u.email, record.id);
  }

  log(`Created ${userMap.size} users`);
  return userMap;
}

// ── 2. Expense Categories ────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Travel", description: "Transportation and commute expenses" },
  { name: "Food", description: "Meals and refreshments" },
  { name: "Accommodation", description: "Hotel and lodging" },
  { name: "Supplies", description: "Office and event supplies" },
  { name: "Printing", description: "Banners, flyers, and print material" },
  { name: "Venue", description: "Venue rental and booking charges" },
  { name: "Equipment", description: "Equipment rental and purchase" },
  { name: "Miscellaneous", description: "Other uncategorized expenses" },
];

async function seedCategories(): Promise<Map<string, string>> {
  log("Seeding expense categories...");
  const catMap = new Map<string, string>();

  for (const cat of CATEGORIES) {
    let existing = await db.query.expenseCategory.findFirst({
      where: (t, ops) => ops.eq(t.name, cat.name),
    });
    if (!existing) {
      const id = uuidv7();
      await db.insert(expenseCategory).values({
        id,
        name: cat.name,
        description: cat.description,
        createdAt: now,
        updatedAt: now,
      });
      existing = {
        id,
        name: cat.name,
        description: cat.description,
        createdAt: now,
        updatedAt: now,
      };
    }
    catMap.set(cat.name, existing.id);
  }

  log(`${catMap.size} categories ready`);
  return catMap;
}

// ── 3. Bank Accounts ─────────────────────────────────────────────────────────

async function seedBankAccounts(userMap: Map<string, string>): Promise<void> {
  log("Seeding bank accounts...");
  const accounts = [
    {
      email: "admin@pi-dash.dev",
      name: "Dev Admin Savings",
      num: "1001200034005600",
      ifsc: "SBIN0001234",
    },
    {
      email: "lead@pi-dash.dev",
      name: "Priya Savings",
      num: "2001200034005601",
      ifsc: "HDFC0002345",
    },
    {
      email: "volunteer1@pi-dash.dev",
      name: "Rahul Savings",
      num: "3001200034005602",
      ifsc: "ICIC0003456",
    },
    {
      email: "volunteer2@pi-dash.dev",
      name: "Ananya Savings",
      num: "4001200034005603",
      ifsc: "AXIS0004567",
    },
    {
      email: "volunteer3@pi-dash.dev",
      name: "Vikram Salary",
      num: "5001200034005604",
      ifsc: "UTIB0005678",
    },
    {
      email: "volunteer4@pi-dash.dev",
      name: "Meera Current",
      num: "6001200034005605",
      ifsc: "KKBK0006789",
    },
  ];

  for (const a of accounts) {
    const userId = userMap.get(a.email);
    if (!userId) {
      continue;
    }
    const existing = await db.query.bankAccount.findFirst({
      where: (t, ops) => ops.eq(t.userId, userId),
    });
    if (!existing) {
      await db.insert(bankAccount).values({
        id: uuidv7(),
        userId,
        accountName: a.name,
        accountNumber: a.num,
        ifscCode: a.ifsc,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  log(`${accounts.length} bank accounts ready`);
}

// ── 4. WhatsApp Groups ───────────────────────────────────────────────────────

async function seedWhatsappGroups(): Promise<Map<string, string>> {
  log("Seeding WhatsApp groups...");
  const groups = [
    { name: "Teaching Team", jid: "120363001234567890@g.us" },
    { name: "Kitchen Duty", jid: "120363002345678901@g.us" },
    { name: "Event Coordinators", jid: "120363003456789012@g.us" },
    { name: "Weekend Seva", jid: "120363004567890123@g.us" },
  ];

  const groupMap = new Map<string, string>();
  for (const g of groups) {
    let existing = await db.query.whatsappGroup.findFirst({
      where: (t, ops) => ops.eq(t.jid, g.jid),
    });
    if (!existing) {
      const id = uuidv7();
      await db.insert(whatsappGroup).values({
        id,
        name: g.name,
        jid: g.jid,
        createdAt: now,
        updatedAt: now,
      });
      existing = { id } as typeof existing;
    }
    groupMap.set(g.name, existing!.id);
  }

  log(`${groupMap.size} WhatsApp groups ready`);
  return groupMap;
}

// ── 5. Teams ─────────────────────────────────────────────────────────────────

async function seedTeams(
  userMap: Map<string, string>,
  waGroups: Map<string, string>
): Promise<Map<string, string>> {
  log("Seeding teams...");
  const adminId = userMap.get("admin@pi-dash.dev")!;
  const leadId = userMap.get("lead@pi-dash.dev")!;
  const v1 = userMap.get("volunteer1@pi-dash.dev")!;
  const v2 = userMap.get("volunteer2@pi-dash.dev")!;
  const v3 = userMap.get("volunteer3@pi-dash.dev")!;
  const v4 = userMap.get("volunteer4@pi-dash.dev")!;

  const teams = [
    {
      name: "Teaching",
      waGroup: "Teaching Team",
      members: [
        { uid: leadId, role: "lead" as const },
        { uid: v1, role: "member" as const },
        { uid: v2, role: "member" as const },
      ],
    },
    {
      name: "Kitchen",
      waGroup: "Kitchen Duty",
      members: [
        { uid: v3, role: "lead" as const },
        { uid: v4, role: "member" as const },
        { uid: v1, role: "member" as const },
      ],
    },
    {
      name: "Events & Outreach",
      waGroup: "Event Coordinators",
      members: [
        { uid: adminId, role: "lead" as const },
        { uid: leadId, role: "member" as const },
        { uid: v2, role: "member" as const },
        { uid: v3, role: "member" as const },
      ],
    },
    {
      name: "Logistics",
      waGroup: null,
      members: [
        { uid: v4, role: "lead" as const },
        { uid: v1, role: "member" as const },
      ],
    },
  ];

  const teamMap = new Map<string, string>();
  for (const t of teams) {
    let existing = await db.query.team.findFirst({
      where: (tbl, ops) => ops.eq(tbl.name, t.name),
    });
    if (!existing) {
      const id = uuidv7();
      await db.insert(team).values({
        id,
        name: t.name,
        description: `The ${t.name} team`,
        whatsappGroupId: t.waGroup ? waGroups.get(t.waGroup) : undefined,
        createdAt: now,
        updatedAt: now,
      });
      for (const m of t.members) {
        await db.insert(teamMember).values({
          id: uuidv7(),
          teamId: id,
          userId: m.uid,
          role: m.role,
          joinedAt: past(30),
        });
      }
      existing = { id } as typeof existing;
    }
    teamMap.set(t.name, existing!.id);
  }

  log(`${teamMap.size} teams ready`);
  return teamMap;
}

// ── 6. Events ────────────────────────────────────────────────────────────────

async function seedEvents(
  teamMap: Map<string, string>,
  userMap: Map<string, string>
): Promise<Map<string, string>> {
  log("Seeding events...");
  const adminId = userMap.get("admin@pi-dash.dev")!;
  const leadId = userMap.get("lead@pi-dash.dev")!;
  const v1 = userMap.get("volunteer1@pi-dash.dev")!;
  const v2 = userMap.get("volunteer2@pi-dash.dev")!;
  const v3 = userMap.get("volunteer3@pi-dash.dev")!;

  const events = [
    {
      name: "Weekly Teaching Session",
      teamName: "Teaching",
      start: past(7),
      end: addHours(past(7), 2),
      isPublic: true,
      creator: leadId,
      feedbackEnabled: true,
      location: "Bangalore Community Hall",
    },
    {
      name: "Upcoming Teaching Session",
      teamName: "Teaching",
      start: future(2),
      end: addHours(future(2), 2),
      isPublic: true,
      creator: leadId,
      location: "Bangalore Community Hall",
    },
    {
      name: "Kitchen Prep Day",
      teamName: "Kitchen",
      start: past(3),
      end: addHours(past(3), 4),
      isPublic: false,
      creator: v3,
      location: "Main Kitchen",
    },
    {
      name: "Community Outreach Drive",
      teamName: "Events & Outreach",
      start: future(7),
      end: addHours(future(7), 6),
      isPublic: true,
      creator: adminId,
      feedbackEnabled: true,
      location: "Cubbon Park, Bangalore",
    },
    {
      name: "Monthly Planning Meeting",
      teamName: "Events & Outreach",
      start: past(14),
      end: addHours(past(14), 1),
      isPublic: false,
      creator: adminId,
      location: "Office Conference Room",
    },
    {
      name: "Supply Run",
      teamName: "Logistics",
      start: future(1),
      end: addHours(future(1), 3),
      isPublic: false,
      creator: v1,
      location: "Wholesale Market",
    },
  ];

  const eventMap = new Map<string, string>();

  for (const e of events) {
    const teamId = teamMap.get(e.teamName)!;
    const id = uuidv7();
    await db.insert(teamEvent).values({
      id,
      teamId,
      name: e.name,
      description: `${e.name} — organized by the ${e.teamName} team`,
      location: e.location,
      startTime: e.start,
      endTime: e.end,
      isPublic: e.isPublic,
      feedbackEnabled: e.feedbackEnabled ?? false,
      feedbackDeadline: e.feedbackEnabled ? future(3) : undefined,
      createdBy: e.creator,
      createdAt: subDays(e.start, 5),
      updatedAt: subDays(e.start, 5),
    });
    eventMap.set(e.name, id);

    // Add members
    const memberIds = [e.creator, v1, v2].slice(0, 3);
    const isPast = e.start < now;
    for (const uid of memberIds) {
      if (isPast) {
        await db.execute(sql`
          INSERT INTO team_event_member (id, event_id, user_id, added_at, attendance, attendance_marked_at, attendance_marked_by)
          VALUES (${uuidv7()}, ${id}, ${uid}, ${subDays(e.start, 3).toISOString()},
            'present'::attendance_status, ${e.end?.toISOString() ?? null}, ${e.creator})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
      } else {
        await db.execute(sql`
          INSERT INTO team_event_member (id, event_id, user_id, added_at)
          VALUES (${uuidv7()}, ${id}, ${uid}, ${subDays(e.start, 3).toISOString()})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
      }
    }
  }

  log(`${eventMap.size} events ready`);
  return eventMap;
}

// ── 7. Event extras (interests, feedback, photos, updates) ───────────────────

async function seedEventExtras(
  eventMap: Map<string, string>,
  userMap: Map<string, string>
): Promise<void> {
  log("Seeding event extras...");
  const v3 = userMap.get("volunteer3@pi-dash.dev")!;
  const v4 = userMap.get("volunteer4@pi-dash.dev")!;
  const adminId = userMap.get("admin@pi-dash.dev")!;
  const leadId = userMap.get("lead@pi-dash.dev")!;

  // Interest in public events
  const outreachId = eventMap.get("Community Outreach Drive")!;
  await db.insert(eventInterest).values({
    id: uuidv7(),
    eventId: outreachId,
    userId: v3,
    status: "approved",
    message: "I'd love to help with the outreach drive!",
    reviewedBy: adminId,
    reviewedAt: now,
    createdAt: past(5),
  });
  await db.insert(eventInterest).values({
    id: uuidv7(),
    eventId: outreachId,
    userId: v4,
    status: "pending",
    message: "Can I join as a photographer?",
    createdAt: past(2),
  });

  // Feedback for past events
  const teachingId = eventMap.get("Weekly Teaching Session")!;
  const fbId = uuidv7();
  await db.insert(eventFeedback).values({
    id: fbId,
    eventId: teachingId,
    content:
      "Great session! The kids were very engaged. Could use more art supplies next time.",
    createdAt: past(5),
    updatedAt: past(5),
  });

  // Photos for past events
  await db.insert(eventPhoto).values({
    id: uuidv7(),
    eventId: teachingId,
    r2Key: "dev/events/teaching-01.jpg",
    caption: "Kids during the drawing activity",
    status: "approved",
    uploadedBy: leadId,
    reviewedBy: adminId,
    reviewedAt: past(5),
    createdAt: past(6),
  });
  await db.insert(eventPhoto).values({
    id: uuidv7(),
    eventId: teachingId,
    r2Key: "dev/events/teaching-02.jpg",
    caption: "Group photo at the end",
    status: "pending",
    uploadedBy: v3,
    createdAt: past(5),
  });

  // Event updates
  const planningId = eventMap.get("Monthly Planning Meeting")!;
  await db.insert(eventUpdate).values({
    id: uuidv7(),
    eventId: planningId,
    content:
      "Meeting minutes: discussed Q2 goals, budget allocation, and volunteer recruitment targets.",
    createdBy: adminId,
    createdAt: past(13),
    updatedAt: past(13),
  });
  await db.insert(eventUpdate).values({
    id: uuidv7(),
    eventId: outreachId,
    content:
      "Reminder: please bring water bottles and sunscreen. We'll meet at the park entrance at 8 AM.",
    createdBy: adminId,
    createdAt: past(1),
    updatedAt: past(1),
  });

  log("Event extras seeded");
}

// ── 8. Reimbursements ────────────────────────────────────────────────────────

async function seedReimbursements(
  userMap: Map<string, string>,
  catMap: Map<string, string>
): Promise<void> {
  log("Seeding reimbursements...");
  const adminId = userMap.get("admin@pi-dash.dev")!;
  const v1 = userMap.get("volunteer1@pi-dash.dev")!;
  const v2 = userMap.get("volunteer2@pi-dash.dev")!;
  const leadId = userMap.get("lead@pi-dash.dev")!;
  const travelCat = catMap.get("Travel")!;
  const foodCat = catMap.get("Food")!;
  const suppliesCat = catMap.get("Supplies")!;

  const reimbursements = [
    {
      userId: v1,
      title: "Bus fare for teaching sessions (March)",
      city: "bangalore" as const,
      status: "approved" as const,
      expenseDate: past(10),
      reviewedBy: adminId,
      items: [
        { cat: travelCat, desc: "Bus pass - monthly", amount: "1500.00" },
        { cat: foodCat, desc: "Snacks for kids", amount: "450.00" },
      ],
    },
    {
      userId: v2,
      title: "Art supplies purchase",
      city: "bangalore" as const,
      status: "pending" as const,
      expenseDate: past(5),
      items: [
        {
          cat: suppliesCat,
          desc: "Crayons and sketch pads",
          amount: "2200.00",
        },
        { cat: suppliesCat, desc: "Chart papers", amount: "350.00" },
      ],
    },
    {
      userId: leadId,
      title: "Venue booking deposit",
      city: "mumbai" as const,
      status: "draft" as const,
      expenseDate: past(2),
      items: [
        { cat: suppliesCat, desc: "Community hall deposit", amount: "5000.00" },
      ],
    },
    {
      userId: v1,
      title: "Auto fare for supply pickup",
      city: "bangalore" as const,
      status: "rejected" as const,
      expenseDate: past(20),
      reviewedBy: adminId,
      rejectionReason: "Please submit with receipt",
      items: [
        { cat: travelCat, desc: "Auto to wholesale market", amount: "300.00" },
      ],
    },
  ];

  for (const r of reimbursements) {
    const id = uuidv7();
    await db.insert(reimbursement).values({
      id,
      userId: r.userId,
      title: r.title,
      city: r.city,
      expenseDate: r.expenseDate.toISOString().split("T")[0],
      status: r.status,
      rejectionReason: r.rejectionReason,
      bankAccountName: "Savings Account",
      bankAccountNumber: "1234567890",
      bankAccountIfscCode: "SBIN0001234",
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedBy ? past(1) : undefined,
      submittedAt: r.status === "draft" ? undefined : subDays(r.expenseDate, 1),
      createdAt: subDays(r.expenseDate, 2),
      updatedAt: now,
    });

    for (let i = 0; i < r.items.length; i++) {
      const item = r.items[i];
      await db.insert(reimbursementLineItem).values({
        id: uuidv7(),
        reimbursementId: id,
        categoryId: item.cat,
        description: item.desc,
        amount: item.amount,
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(reimbursementHistory).values({
      id: uuidv7(),
      reimbursementId: id,
      actorId: r.userId,
      action: "created",
      createdAt: subDays(r.expenseDate, 2),
    });

    if (r.status !== "draft") {
      await db.insert(reimbursementHistory).values({
        id: uuidv7(),
        reimbursementId: id,
        actorId: r.userId,
        action: "submitted",
        createdAt: subDays(r.expenseDate, 1),
      });
    }

    if (r.status === "approved" || r.status === "rejected") {
      await db.insert(reimbursementHistory).values({
        id: uuidv7(),
        reimbursementId: id,
        actorId: r.reviewedBy!,
        action: r.status,
        note: r.rejectionReason,
        createdAt: past(1),
      });
    }
  }

  log(`${reimbursements.length} reimbursements seeded`);
}

// ── 9. Advance Payments ──────────────────────────────────────────────────────

async function seedAdvancePayments(
  userMap: Map<string, string>,
  catMap: Map<string, string>
): Promise<void> {
  log("Seeding advance payments...");
  const adminId = userMap.get("admin@pi-dash.dev")!;
  const leadId = userMap.get("lead@pi-dash.dev")!;
  const venueCat = catMap.get("Venue")!;
  const equipCat = catMap.get("Equipment")!;

  const id = uuidv7();
  await db.insert(advancePayment).values({
    id,
    userId: leadId,
    title: "Advance for community hall booking",
    city: "bangalore",
    status: "approved",
    bankAccountName: "Priya Savings",
    bankAccountNumber: "2001200034005601",
    bankAccountIfscCode: "HDFC0002345",
    reviewedBy: adminId,
    reviewedAt: past(3),
    submittedAt: past(5),
    createdAt: past(7),
    updatedAt: past(3),
  });

  await db.insert(advancePaymentLineItem).values({
    id: uuidv7(),
    advancePaymentId: id,
    categoryId: venueCat,
    description: "Hall booking advance (50%)",
    amount: "10000.00",
    sortOrder: 0,
    createdAt: past(7),
    updatedAt: past(7),
  });
  await db.insert(advancePaymentLineItem).values({
    id: uuidv7(),
    advancePaymentId: id,
    categoryId: equipCat,
    description: "Sound system rental deposit",
    amount: "3000.00",
    sortOrder: 1,
    createdAt: past(7),
    updatedAt: past(7),
  });

  await db.insert(advancePaymentHistory).values({
    id: uuidv7(),
    advancePaymentId: id,
    actorId: leadId,
    action: "created",
    createdAt: past(7),
  });
  await db.insert(advancePaymentHistory).values({
    id: uuidv7(),
    advancePaymentId: id,
    actorId: leadId,
    action: "submitted",
    createdAt: past(5),
  });
  await db.insert(advancePaymentHistory).values({
    id: uuidv7(),
    advancePaymentId: id,
    actorId: adminId,
    action: "approved",
    createdAt: past(3),
  });

  log("1 advance payment seeded");
}

// ── 10. Vendors & Vendor Payments ────────────────────────────────────────────

async function seedVendors(
  userMap: Map<string, string>,
  catMap: Map<string, string>
): Promise<void> {
  log("Seeding vendors and payments...");
  const adminId = userMap.get("admin@pi-dash.dev")!;
  const leadId = userMap.get("lead@pi-dash.dev")!;
  const v1 = userMap.get("volunteer1@pi-dash.dev")!;
  const printCat = catMap.get("Printing")!;
  const foodCat = catMap.get("Food")!;

  // Vendor 1 — Approved
  const v1Id = uuidv7();
  await db.insert(vendor).values({
    id: v1Id,
    name: "QuickPrint Solutions",
    contactEmail: "info@quickprint.dev",
    contactPhone: "+919800011122",
    bankAccountName: "QuickPrint Solutions",
    bankAccountNumber: "7771234567890",
    bankAccountIfscCode: "HDFC0007890",
    address: "42 MG Road, Bangalore",
    gstNumber: "29AABCQ1234F1ZA",
    status: "approved",
    createdBy: leadId,
    createdAt: past(60),
    updatedAt: past(55),
  });

  // Vendor 2 — Pending
  const v2Id = uuidv7();
  await db.insert(vendor).values({
    id: v2Id,
    name: "Fresh Kitchen Caterers",
    contactEmail: "orders@freshkitchen.dev",
    contactPhone: "+919800033344",
    bankAccountName: "Fresh Kitchen Caterers",
    bankAccountNumber: "8881234567891",
    bankAccountIfscCode: "ICIC0008901",
    address: "15 Food Street, Bangalore",
    panNumber: "AABCF1234G",
    status: "pending",
    createdBy: v1,
    createdAt: past(5),
    updatedAt: past(5),
  });

  // Vendor Payment for QuickPrint — approved, partially paid
  const vpId = uuidv7();
  await db.insert(vendorPayment).values({
    id: vpId,
    userId: leadId,
    vendorId: v1Id,
    title: "Banner printing for outreach event",
    status: "partially_paid",
    reviewedBy: adminId,
    reviewedAt: past(12),
    submittedAt: past(14),
    createdAt: past(15),
    updatedAt: past(8),
  });

  await db.insert(vendorPaymentLineItem).values({
    id: uuidv7(),
    vendorPaymentId: vpId,
    categoryId: printCat,
    description: "10 vinyl banners (6x3 ft)",
    amount: "8500.00",
    sortOrder: 0,
    createdAt: past(15),
    updatedAt: past(15),
  });
  await db.insert(vendorPaymentLineItem).values({
    id: uuidv7(),
    vendorPaymentId: vpId,
    categoryId: printCat,
    description: "500 flyers (A5)",
    amount: "2500.00",
    sortOrder: 1,
    createdAt: past(15),
    updatedAt: past(15),
  });

  await db.insert(vendorPaymentHistory).values({
    id: uuidv7(),
    vendorPaymentId: vpId,
    actorId: leadId,
    action: "created",
    createdAt: past(15),
  });
  await db.insert(vendorPaymentHistory).values({
    id: uuidv7(),
    vendorPaymentId: vpId,
    actorId: leadId,
    action: "submitted",
    createdAt: past(14),
  });
  await db.insert(vendorPaymentHistory).values({
    id: uuidv7(),
    vendorPaymentId: vpId,
    actorId: adminId,
    action: "approved",
    createdAt: past(12),
  });

  // Transaction for partial payment
  const txId = uuidv7();
  await db.insert(vendorPaymentTransaction).values({
    id: txId,
    vendorPaymentId: vpId,
    userId: adminId,
    amount: "5000.00",
    description: "First installment via NEFT",
    transactionDate: past(10),
    paymentMethod: "NEFT",
    paymentReference: "NEFT-REF-001",
    status: "approved",
    reviewedBy: adminId,
    reviewedAt: past(9),
    createdAt: past(10),
    updatedAt: past(9),
  });
  await db.insert(vendorPaymentTransactionHistory).values({
    id: uuidv7(),
    vendorPaymentTransactionId: txId,
    actorId: adminId,
    action: "created",
    createdAt: past(10),
  });
  await db.insert(vendorPaymentTransactionHistory).values({
    id: uuidv7(),
    vendorPaymentTransactionId: txId,
    actorId: adminId,
    action: "approved",
    createdAt: past(9),
  });

  // Second vendor payment — pending
  const vp2Id = uuidv7();
  await db.insert(vendorPayment).values({
    id: vp2Id,
    userId: v1,
    vendorId: v2Id,
    title: "Catering for weekend seva",
    status: "pending",
    submittedAt: past(2),
    createdAt: past(3),
    updatedAt: past(2),
  });
  await db.insert(vendorPaymentLineItem).values({
    id: uuidv7(),
    vendorPaymentId: vp2Id,
    categoryId: foodCat,
    description: "Lunch for 50 people",
    amount: "15000.00",
    sortOrder: 0,
    createdAt: past(3),
    updatedAt: past(3),
  });
  await db.insert(vendorPaymentHistory).values({
    id: uuidv7(),
    vendorPaymentId: vp2Id,
    actorId: v1,
    action: "created",
    createdAt: past(3),
  });
  await db.insert(vendorPaymentHistory).values({
    id: uuidv7(),
    vendorPaymentId: vp2Id,
    actorId: v1,
    action: "submitted",
    createdAt: past(2),
  });

  log("2 vendors, 2 payments, 1 transaction seeded");
}

// ── 11. App Config ───────────────────────────────────────────────────────────

async function seedAppConfig(): Promise<void> {
  log("Seeding app config...");
  const configs = [
    { key: "org_name", value: "Proud Indian NGO" },
    { key: "org_city", value: "Bangalore" },
    { key: "reimbursement_auto_approve_limit", value: "500" },
  ];

  for (const c of configs) {
    await db
      .insert(appConfig)
      .values({ key: c.key, value: c.value, updatedAt: now })
      .onConflictDoNothing();
  }
  log(`${configs.length} config entries ready`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write("=== Seeding Dev Data ===\n");

  await syncPermissions();
  log("Permissions synced");

  const userMap = await seedUsers();
  const catMap = await seedCategories();
  await seedBankAccounts(userMap);
  const waGroups = await seedWhatsappGroups();
  const teamMap = await seedTeams(userMap, waGroups);

  // Events and financial records use generated UUIDs, so skip if already seeded
  // to avoid duplicates on re-run (idempotency).
  const existingEvent = await db.query.teamEvent.findFirst();
  let eventCount = 0;
  if (existingEvent) {
    log("Events already seeded — skipping events and financial records");
  } else {
    const eventMap = await seedEvents(teamMap, userMap);
    eventCount = eventMap.size;
    await seedEventExtras(eventMap, userMap);
    await seedReimbursements(userMap, catMap);
    await seedAdvancePayments(userMap, catMap);
    await seedVendors(userMap, catMap);
  }

  await seedAppConfig();

  process.stdout.write("\nDev data seeded successfully!\n");
  process.stdout.write(`  Users: ${userMap.size}\n`);
  process.stdout.write(`  Categories: ${catMap.size}\n`);
  process.stdout.write(`  Teams: ${teamMap.size}\n`);
  if (eventCount > 0) {
    process.stdout.write(`  Events: ${eventCount}\n`);
    process.stdout.write(
      "  + reimbursements, advance payments, vendors, payments, transactions\n"
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Seed failed: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exitCode = 1;
});
