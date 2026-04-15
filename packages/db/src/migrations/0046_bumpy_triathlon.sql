ALTER TABLE "center" DROP CONSTRAINT "center_name_unique";--> statement-breakpoint
ALTER TABLE "student" DROP CONSTRAINT "student_center_id_center_id_fk";
--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "center_name_city_uidx" ON "center" USING btree ("name","city");