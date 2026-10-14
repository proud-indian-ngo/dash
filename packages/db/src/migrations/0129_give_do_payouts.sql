ALTER TYPE "public"."gateway_settlement_provider" ADD VALUE 'give_do';--> statement-breakpoint
ALTER TYPE "public"."import_batch_source" ADD VALUE 'give_do_payout' BEFORE 'give_do_csv';