ALTER TABLE "grant_agreement" DROP CONSTRAINT "grant_agreement_project_unique";--> statement-breakpoint
CREATE INDEX "grant_agreement_projectId_idx" ON "grant_agreement" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_grant_not_in_kind_check" CHECK ("contribution"."grant_id" IS NULL OR "contribution"."channel" <> 'in_kind');