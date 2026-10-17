-- One-time grant: unoriented volunteers manage their own bank accounts now
-- that the bank-account mutators check bank_accounts.manage_own. A fresh
-- database has no roles or permissions yet, so this does nothing there and
-- syncPermissions() seeds the role from UNORIENTED_VOLUNTEER_PERMISSIONS.
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT 'unoriented_volunteer', 'bank_accounts.manage_own'
WHERE EXISTS (SELECT 1 FROM "role" WHERE "id" = 'unoriented_volunteer')
  AND EXISTS (SELECT 1 FROM "permission" WHERE "id" = 'bank_accounts.manage_own')
ON CONFLICT DO NOTHING;
