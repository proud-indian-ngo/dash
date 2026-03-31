INSERT INTO "role" ("id", "name", "is_system", "created_at", "updated_at")
VALUES
  ('super_admin', 'Super Admin', true, now(), now()),
  ('finance_admin', 'Finance Admin', true, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "user" SET "role" = 'super_admin' WHERE "role" = 'admin';
