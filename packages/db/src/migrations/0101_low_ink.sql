ALTER TABLE "kalakriti_competition" ADD COLUMN "sequential_performances" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "kalakriti_competition"
SET "sequential_performances" = true
WHERE "normalized_name" ~ '(fancy dress|group dance|group singing|group song|solo dance|solo singing|solo song)';
