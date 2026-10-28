ALTER TABLE "user" DROP COLUMN IF EXISTS "dob";--> statement-breakpoint
-- Sign-up codes issued by the removed email OTP plugin; nothing reads them now.
DELETE FROM "verification" WHERE "identifier" LIKE 'email-verification-otp-%';
