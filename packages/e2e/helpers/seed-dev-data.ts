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
    gender: "male",
    name: "Dev Admin",
    password: "Admin123!",
    phone: "+919876543210",
    role: "super_admin",
  },
  {
    email: "lead@pi-dash.dev",
    gender: "female",
    name: "Priya Sharma",
    password: "Lead123!",
    phone: "+919876543211",
    role: "volunteer",
  },
  {
    email: "volunteer1@pi-dash.dev",
    gender: "male",
    name: "Rahul Verma",
    password: "Volunteer123!",
    phone: "+919876543212",
    role: "volunteer",
  },
  {
    email: "volunteer2@pi-dash.dev",
    gender: "female",
    name: "Ananya Patel",
    password: "Volunteer123!",
    phone: "+919876543213",
    role: "volunteer",
  },
  {
    email: "volunteer3@pi-dash.dev",
    gender: "male",
    name: "Vikram Singh",
    password: "Volunteer123!",
    phone: "+919876543214",
    role: "volunteer",
  },
  {
    email: "volunteer4@pi-dash.dev",
    gender: "female",
    name: "Meera Reddy",
    password: "Volunteer123!",
    phone: "+919876543215",
    role: "volunteer",
  },
  {
    email: "newbie@pi-dash.dev",
    gender: "male",
    name: "Arjun Nair",
    password: "Newbie123!",
    phone: "+919876543216",
    role: "unoriented_volunteer",
  },
];

async function seedUsers(): Promise<Map<string, string>> {
  log("Seeding users...");
  const userMap = new Map<string, string>(); // email → id

  await Promise.all(
    USERS.map(async (u) => {
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
          emailVerified: true,
          gender: u.gender,
          isActive: true,
          isOnWhatsapp: true,
          phone: u.phone,
          role: u.role,
        })
        .where(eq(user.id, record.id));

      userMap.set(u.email, record.id);
    })
  );

  log(`Created ${userMap.size} users`);
  return userMap;
}

// ── 2. Expense Categories ────────────────────────────────────────────────────

const CATEGORIES = [
  { description: "Transportation and commute expenses", name: "Travel" },
  { description: "Meals and refreshments", name: "Food" },
  { description: "Hotel and lodging", name: "Accommodation" },
  { description: "Office and event supplies", name: "Supplies" },
  { description: "Banners, flyers, and print material", name: "Printing" },
  { description: "Venue rental and booking charges", name: "Venue" },
  { description: "Equipment rental and purchase", name: "Equipment" },
  { description: "Other uncategorized expenses", name: "Miscellaneous" },
];

async function seedCategories(): Promise<Map<string, string>> {
  log("Seeding expense categories...");
  const catMap = new Map<string, string>();

  await Promise.all(
    CATEGORIES.map(async (cat) => {
      let existing = await db.query.expenseCategory.findFirst({
        where: (t, ops) => ops.eq(t.name, cat.name),
      });
      if (!existing) {
        const id = uuidv7();
        await db.insert(expenseCategory).values({
          createdAt: now,
          description: cat.description,
          id,
          name: cat.name,
          updatedAt: now,
        });
        existing = {
          createdAt: now,
          description: cat.description,
          id,
          name: cat.name,
          updatedAt: now,
        };
      }
      catMap.set(cat.name, existing.id);
    })
  );

  log(`${catMap.size} categories ready`);
  return catMap;
}

// ── 3. Bank Accounts ─────────────────────────────────────────────────────────

async function seedBankAccounts(userMap: Map<string, string>): Promise<void> {
  log("Seeding bank accounts...");
  const accounts = [
    {
      email: "admin@pi-dash.dev",
      ifsc: "SBIN0001234",
      name: "Dev Admin Savings",
      num: "1001200034005600",
    },
    {
      email: "lead@pi-dash.dev",
      ifsc: "HDFC0002345",
      name: "Priya Savings",
      num: "2001200034005601",
    },
    {
      email: "volunteer1@pi-dash.dev",
      ifsc: "ICIC0003456",
      name: "Rahul Savings",
      num: "3001200034005602",
    },
    {
      email: "volunteer2@pi-dash.dev",
      ifsc: "AXIS0004567",
      name: "Ananya Savings",
      num: "4001200034005603",
    },
    {
      email: "volunteer3@pi-dash.dev",
      ifsc: "UTIB0005678",
      name: "Vikram Salary",
      num: "5001200034005604",
    },
    {
      email: "volunteer4@pi-dash.dev",
      ifsc: "KKBK0006789",
      name: "Meera Current",
      num: "6001200034005605",
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
        accountName: a.name,
        accountNumber: a.num,
        createdAt: now,
        id: uuidv7(),
        ifscCode: a.ifsc,
        isDefault: true,
        updatedAt: now,
        userId,
      });
    }
  }
  log(`${accounts.length} bank accounts ready`);
}

// ── 4. WhatsApp Groups ───────────────────────────────────────────────────────

async function seedWhatsappGroups(): Promise<Map<string, string>> {
  log("Seeding WhatsApp groups...");
  const groups = [
    { jid: "120363001234567890@g.us", name: "Teaching Team" },
    { jid: "120363002345678901@g.us", name: "Kitchen Duty" },
    { jid: "120363003456789012@g.us", name: "Event Coordinators" },
    { jid: "120363004567890123@g.us", name: "Weekend Seva" },
  ];

  const groupMap = new Map<string, string>();
  await Promise.all(
    groups.map(async (g) => {
      let existing = await db.query.whatsappGroup.findFirst({
        where: (t, ops) => ops.eq(t.jid, g.jid),
      });
      if (!existing) {
        const id = uuidv7();
        await db.insert(whatsappGroup).values({
          createdAt: now,
          id,
          jid: g.jid,
          name: g.name,
          updatedAt: now,
        });
        existing = { id } as typeof existing;
      }
      groupMap.set(g.name, existing!.id);
    })
  );

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
      members: [
        { role: "lead" as const, uid: leadId },
        { role: "member" as const, uid: v1 },
        { role: "member" as const, uid: v2 },
      ],
      name: "Teaching",
      waGroup: "Teaching Team",
    },
    {
      members: [
        { role: "lead" as const, uid: v3 },
        { role: "member" as const, uid: v4 },
        { role: "member" as const, uid: v1 },
      ],
      name: "Kitchen",
      waGroup: "Kitchen Duty",
    },
    {
      members: [
        { role: "lead" as const, uid: adminId },
        { role: "member" as const, uid: leadId },
        { role: "member" as const, uid: v2 },
        { role: "member" as const, uid: v3 },
      ],
      name: "Events & Outreach",
      waGroup: "Event Coordinators",
    },
    {
      members: [
        { role: "lead" as const, uid: v4 },
        { role: "member" as const, uid: v1 },
      ],
      name: "Logistics",
      waGroup: null,
    },
  ];

  const teamMap = new Map<string, string>();
  await Promise.all(
    teams.map(async (t) => {
      let existing = await db.query.team.findFirst({
        where: (tbl, ops) => ops.eq(tbl.name, t.name),
      });
      if (!existing) {
        const id = uuidv7();
        await db.insert(team).values({
          createdAt: now,
          description: `The ${t.name} team`,
          id,
          name: t.name,
          updatedAt: now,
          whatsappGroupId: t.waGroup ? waGroups.get(t.waGroup) : undefined,
        });
        for (const m of t.members) {
          await db.insert(teamMember).values({
            id: uuidv7(),
            joinedAt: past(30),
            role: m.role,
            teamId: id,
            userId: m.uid,
          });
        }
        existing = { id } as typeof existing;
      }
      teamMap.set(t.name, existing!.id);
    })
  );

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
      creator: leadId,
      end: addHours(past(7), 2),
      feedbackEnabled: true,
      isPublic: true,
      location: "Bangalore Community Hall",
      name: "Weekly Teaching Session",
      start: past(7),
      teamName: "Teaching",
    },
    {
      creator: leadId,
      end: addHours(future(2), 2),
      isPublic: true,
      location: "Bangalore Community Hall",
      name: "Upcoming Teaching Session",
      start: future(2),
      teamName: "Teaching",
    },
    {
      creator: v3,
      end: addHours(past(3), 4),
      isPublic: false,
      location: "Main Kitchen",
      name: "Kitchen Prep Day",
      start: past(3),
      teamName: "Kitchen",
    },
    {
      creator: adminId,
      end: addHours(future(7), 6),
      feedbackEnabled: true,
      isPublic: true,
      location: "Cubbon Park, Bangalore",
      name: "Community Outreach Drive",
      start: future(7),
      teamName: "Events & Outreach",
    },
    {
      creator: adminId,
      end: addHours(past(14), 1),
      isPublic: false,
      location: "Office Conference Room",
      name: "Monthly Planning Meeting",
      start: past(14),
      teamName: "Events & Outreach",
    },
    {
      creator: v1,
      end: addHours(future(1), 3),
      isPublic: false,
      location: "Wholesale Market",
      name: "Supply Run",
      start: future(1),
      teamName: "Logistics",
    },
  ];

  const eventMap = new Map<string, string>();

  await Promise.all(
    events.map(async (e) => {
      const teamId = teamMap.get(e.teamName)!;
      const id = uuidv7();
      await db.insert(teamEvent).values({
        createdAt: subDays(e.start, 5),
        createdBy: e.creator,
        description: `${e.name} — organized by the ${e.teamName} team`,
        endTime: e.end,
        feedbackDeadline: e.feedbackEnabled ? future(3) : undefined,
        feedbackEnabled: e.feedbackEnabled ?? false,
        id,
        isPublic: e.isPublic,
        location: e.location,
        name: e.name,
        startTime: e.start,
        teamId,
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
    })
  );

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
    createdAt: past(5),
    eventId: outreachId,
    id: uuidv7(),
    message: "I'd love to help with the outreach drive!",
    reviewedAt: now,
    reviewedBy: adminId,
    status: "approved",
    userId: v3,
  });
  await db.insert(eventInterest).values({
    createdAt: past(2),
    eventId: outreachId,
    id: uuidv7(),
    message: "Can I join as a photographer?",
    status: "pending",
    userId: v4,
  });

  // Feedback for past events
  const teachingId = eventMap.get("Weekly Teaching Session")!;
  const fbId = uuidv7();
  await db.insert(eventFeedback).values({
    content:
      "Great session! The kids were very engaged. Could use more art supplies next time.",
    createdAt: past(5),
    eventId: teachingId,
    id: fbId,
    updatedAt: past(5),
  });

  // Photos for past events
  await db.insert(eventPhoto).values({
    caption: "Kids during the drawing activity",
    createdAt: past(6),
    eventId: teachingId,
    id: uuidv7(),
    r2Key: "dev/events/teaching-01.jpg",
    reviewedAt: past(5),
    reviewedBy: adminId,
    status: "approved",
    uploadedBy: leadId,
  });
  await db.insert(eventPhoto).values({
    caption: "Group photo at the end",
    createdAt: past(5),
    eventId: teachingId,
    id: uuidv7(),
    r2Key: "dev/events/teaching-02.jpg",
    status: "pending",
    uploadedBy: v3,
  });

  // Event updates
  const planningId = eventMap.get("Monthly Planning Meeting")!;
  await db.insert(eventUpdate).values({
    content:
      "Meeting minutes: discussed Q2 goals, budget allocation, and volunteer recruitment targets.",
    createdAt: past(13),
    createdBy: adminId,
    eventId: planningId,
    id: uuidv7(),
    reviewedAt: past(13),
    reviewedBy: adminId,
    status: "approved",
    updatedAt: past(13),
  });
  await db.insert(eventUpdate).values({
    content:
      "Reminder: please bring water bottles and sunscreen. We'll meet at the park entrance at 8 AM.",
    createdAt: past(1),
    createdBy: adminId,
    eventId: outreachId,
    id: uuidv7(),
    reviewedAt: past(1),
    reviewedBy: adminId,
    status: "approved",
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
      city: "bangalore" as const,
      expenseDate: past(10),
      items: [
        { amount: "1500.00", cat: travelCat, desc: "Bus pass - monthly" },
        { amount: "450.00", cat: foodCat, desc: "Snacks for kids" },
      ],
      reviewedBy: adminId,
      status: "approved" as const,
      title: "Bus fare for teaching sessions (March)",
      userId: v1,
    },
    {
      city: "bangalore" as const,
      expenseDate: past(5),
      items: [
        {
          amount: "2200.00",
          cat: suppliesCat,
          desc: "Crayons and sketch pads",
        },
        { amount: "350.00", cat: suppliesCat, desc: "Chart papers" },
      ],
      status: "pending" as const,
      title: "Art supplies purchase",
      userId: v2,
    },
    {
      city: "mumbai" as const,
      expenseDate: past(2),
      items: [
        { amount: "5000.00", cat: suppliesCat, desc: "Community hall deposit" },
      ],
      status: "pending" as const,
      title: "Venue booking deposit",
      userId: leadId,
    },
    {
      city: "bangalore" as const,
      expenseDate: past(20),
      items: [
        { amount: "300.00", cat: travelCat, desc: "Auto to wholesale market" },
      ],
      rejectionReason: "Please submit with receipt",
      reviewedBy: adminId,
      status: "rejected" as const,
      title: "Auto fare for supply pickup",
      userId: v1,
    },
  ];

  await Promise.all(
    reimbursements.map(async (r) => {
      const id = uuidv7();
      await db.insert(reimbursement).values({
        bankAccountIfscCode: "SBIN0001234",
        bankAccountName: "Savings Account",
        bankAccountNumber: "1234567890",
        city: r.city,
        createdAt: subDays(r.expenseDate, 2),
        expenseDate: r.expenseDate.toISOString().split("T")[0],
        id,
        rejectionReason: r.rejectionReason,
        reviewedAt: r.reviewedBy ? past(1) : undefined,
        reviewedBy: r.reviewedBy,
        status: r.status,
        submittedAt: subDays(r.expenseDate, 1),
        title: r.title,
        updatedAt: now,
        userId: r.userId,
      });

      for (let i = 0; i < r.items.length; i++) {
        const item = r.items[i];
        await db.insert(reimbursementLineItem).values({
          amount: item.amount,
          categoryId: item.cat,
          createdAt: now,
          description: item.desc,
          id: uuidv7(),
          reimbursementId: id,
          sortOrder: i,
          updatedAt: now,
        });
      }

      await db.insert(reimbursementHistory).values({
        action: "created",
        actorId: r.userId,
        createdAt: subDays(r.expenseDate, 2),
        id: uuidv7(),
        reimbursementId: id,
      });

      await db.insert(reimbursementHistory).values({
        action: "submitted",
        actorId: r.userId,
        createdAt: subDays(r.expenseDate, 1),
        id: uuidv7(),
        reimbursementId: id,
      });

      if (r.status === "approved" || r.status === "rejected") {
        await db.insert(reimbursementHistory).values({
          action: r.status,
          actorId: r.reviewedBy!,
          createdAt: past(1),
          id: uuidv7(),
          note: r.rejectionReason,
          reimbursementId: id,
        });
      }
    })
  );

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
    bankAccountIfscCode: "HDFC0002345",
    bankAccountName: "Priya Savings",
    bankAccountNumber: "2001200034005601",
    city: "bangalore",
    createdAt: past(7),
    id,
    reviewedAt: past(3),
    reviewedBy: adminId,
    status: "approved",
    submittedAt: past(5),
    title: "Advance for community hall booking",
    updatedAt: past(3),
    userId: leadId,
  });

  await db.insert(advancePaymentLineItem).values({
    advancePaymentId: id,
    amount: "10000.00",
    categoryId: venueCat,
    createdAt: past(7),
    description: "Hall booking advance (50%)",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: past(7),
  });
  await db.insert(advancePaymentLineItem).values({
    advancePaymentId: id,
    amount: "3000.00",
    categoryId: equipCat,
    createdAt: past(7),
    description: "Sound system rental deposit",
    id: uuidv7(),
    sortOrder: 1,
    updatedAt: past(7),
  });

  await db.insert(advancePaymentHistory).values({
    action: "created",
    actorId: leadId,
    advancePaymentId: id,
    createdAt: past(7),
    id: uuidv7(),
  });
  await db.insert(advancePaymentHistory).values({
    action: "submitted",
    actorId: leadId,
    advancePaymentId: id,
    createdAt: past(5),
    id: uuidv7(),
  });
  await db.insert(advancePaymentHistory).values({
    action: "approved",
    actorId: adminId,
    advancePaymentId: id,
    createdAt: past(3),
    id: uuidv7(),
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
    address: "42 MG Road, Bangalore",
    bankAccountIfscCode: "HDFC0007890",
    bankAccountName: "QuickPrint Solutions",
    bankAccountNumber: "7771234567890",
    contactEmail: "info@quickprint.dev",
    contactPhone: "+919800011122",
    createdAt: past(60),
    createdBy: leadId,
    gstNumber: "29AABCQ1234F1ZA",
    id: v1Id,
    name: "QuickPrint Solutions",
    status: "approved",
    updatedAt: past(55),
  });

  // Vendor 2 — Pending
  const v2Id = uuidv7();
  await db.insert(vendor).values({
    address: "15 Food Street, Bangalore",
    bankAccountIfscCode: "ICIC0008901",
    bankAccountName: "Fresh Kitchen Caterers",
    bankAccountNumber: "8881234567891",
    contactEmail: "orders@freshkitchen.dev",
    contactPhone: "+919800033344",
    createdAt: past(5),
    createdBy: v1,
    id: v2Id,
    name: "Fresh Kitchen Caterers",
    panNumber: "AABCF1234G",
    status: "pending",
    updatedAt: past(5),
  });

  // Vendor Payment for QuickPrint — approved, partially paid
  const vpId = uuidv7();
  await db.insert(vendorPayment).values({
    createdAt: past(15),
    id: vpId,
    reviewedAt: past(12),
    reviewedBy: adminId,
    status: "partially_paid",
    submittedAt: past(14),
    title: "Banner printing for outreach event",
    updatedAt: past(8),
    userId: leadId,
    vendorId: v1Id,
  });

  await db.insert(vendorPaymentLineItem).values({
    amount: "8500.00",
    categoryId: printCat,
    createdAt: past(15),
    description: "10 vinyl banners (6x3 ft)",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: past(15),
    vendorPaymentId: vpId,
  });
  await db.insert(vendorPaymentLineItem).values({
    amount: "2500.00",
    categoryId: printCat,
    createdAt: past(15),
    description: "500 flyers (A5)",
    id: uuidv7(),
    sortOrder: 1,
    updatedAt: past(15),
    vendorPaymentId: vpId,
  });

  await db.insert(vendorPaymentHistory).values({
    action: "created",
    actorId: leadId,
    createdAt: past(15),
    id: uuidv7(),
    vendorPaymentId: vpId,
  });
  await db.insert(vendorPaymentHistory).values({
    action: "submitted",
    actorId: leadId,
    createdAt: past(14),
    id: uuidv7(),
    vendorPaymentId: vpId,
  });
  await db.insert(vendorPaymentHistory).values({
    action: "approved",
    actorId: adminId,
    createdAt: past(12),
    id: uuidv7(),
    vendorPaymentId: vpId,
  });

  // Transaction for partial payment
  const txId = uuidv7();
  await db.insert(vendorPaymentTransaction).values({
    amount: "5000.00",
    createdAt: past(10),
    description: "First installment via NEFT",
    id: txId,
    paymentMethod: "NEFT",
    paymentReference: "NEFT-REF-001",
    reviewedAt: past(9),
    reviewedBy: adminId,
    status: "approved",
    transactionDate: past(10),
    updatedAt: past(9),
    userId: adminId,
    vendorPaymentId: vpId,
  });
  await db.insert(vendorPaymentTransactionHistory).values({
    action: "created",
    actorId: adminId,
    createdAt: past(10),
    id: uuidv7(),
    vendorPaymentTransactionId: txId,
  });
  await db.insert(vendorPaymentTransactionHistory).values({
    action: "approved",
    actorId: adminId,
    createdAt: past(9),
    id: uuidv7(),
    vendorPaymentTransactionId: txId,
  });

  // Second vendor payment — pending
  const vp2Id = uuidv7();
  await db.insert(vendorPayment).values({
    createdAt: past(3),
    id: vp2Id,
    status: "pending",
    submittedAt: past(2),
    title: "Catering for weekend seva",
    updatedAt: past(2),
    userId: v1,
    vendorId: v2Id,
  });
  await db.insert(vendorPaymentLineItem).values({
    amount: "15000.00",
    categoryId: foodCat,
    createdAt: past(3),
    description: "Lunch for 50 people",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: past(3),
    vendorPaymentId: vp2Id,
  });
  await db.insert(vendorPaymentHistory).values({
    action: "created",
    actorId: v1,
    createdAt: past(3),
    id: uuidv7(),
    vendorPaymentId: vp2Id,
  });
  await db.insert(vendorPaymentHistory).values({
    action: "submitted",
    actorId: v1,
    createdAt: past(2),
    id: uuidv7(),
    vendorPaymentId: vp2Id,
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

  await Promise.all(
    configs.map(async (c) => {
      await db
        .insert(appConfig)
        .values({ key: c.key, updatedAt: now, value: c.value })
        .onConflictDoNothing();
    })
  );
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
