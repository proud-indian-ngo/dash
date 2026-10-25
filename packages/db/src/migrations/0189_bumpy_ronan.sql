CREATE TABLE "private"."jwks" (
	"alg" text,
	"created_at" timestamp NOT NULL,
	"crv" text,
	"expires_at" timestamp,
	"id" text PRIMARY KEY NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_access_token" (
	"authorization_code_id" text,
	"client_id" text NOT NULL,
	"confirmation" jsonb,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"reference_id" text,
	"refresh_id" text,
	"requested_user_info_claims" text[],
	"resources" text[],
	"revoked" timestamp,
	"scopes" text[] NOT NULL,
	"session_id" text,
	"token" text NOT NULL,
	"user_id" text,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_client" (
	"application_type" text,
	"backchannel_logout_session_required" boolean,
	"backchannel_logout_uri" text,
	"client_credentials_scopes" text[] DEFAULT '{}',
	"client_discovery_id" text,
	"client_id" text NOT NULL,
	"client_secret" text,
	"contacts" text[],
	"created_at" timestamp,
	"disabled" boolean DEFAULT false,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"enable_end_session" boolean,
	"grant_types" text[],
	"icon" text,
	"id" text PRIMARY KEY NOT NULL,
	"jwks" text,
	"jwks_uri" text,
	"metadata" jsonb,
	"name" text,
	"policy" text,
	"post_logout_redirect_uris" text[],
	"redirect_uris" text[] NOT NULL,
	"reference_id" text,
	"require_pkce" boolean,
	"response_types" text[],
	"scopes" text[],
	"skip_consent" boolean,
	"software_id" text,
	"software_statement" text,
	"software_version" text,
	"subject_type" text,
	"token_endpoint_auth_method" text,
	"tos" text,
	"updated_at" timestamp,
	"uri" text,
	"user_id" text,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_client_assertion" (
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_client_resource" (
	"client_id" text NOT NULL,
	"created_at" timestamp,
	"id" text PRIMARY KEY NOT NULL,
	"metadata" jsonb,
	"resource_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_consent" (
	"client_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"reference_id" text,
	"requested_user_info_claims" text[],
	"resources" text[],
	"scopes" text[] NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_refresh_token" (
	"authorization_code_id" text,
	"auth_time" timestamp,
	"client_id" text NOT NULL,
	"confirmation" jsonb,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"reference_id" text,
	"requested_user_info_claims" text[],
	"resources" text[],
	"revoked" timestamp,
	"rotated_at" timestamp,
	"rotation_replay_expires_at" timestamp,
	"rotation_replay_response" text,
	"scopes" text[] NOT NULL,
	"session_id" text,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "private"."oauth_resource" (
	"access_token_ttl" integer,
	"allowed_scopes" text[],
	"created_at" timestamp,
	"custom_claims" jsonb,
	"disabled" boolean DEFAULT false,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"metadata" jsonb,
	"name" text NOT NULL,
	"policy_version" integer DEFAULT 1,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"updated_at" timestamp,
	CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "private"."oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "private"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "private"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "private"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "private"."oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "private"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "private"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_id_idx" ON "private"."oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_session_id_idx" ON "private"."oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_id_idx" ON "private"."oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_authorization_code_id_idx" ON "private"."oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "private"."oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_user_id_idx" ON "private"."oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_resource_client_resource_uidx" ON "private"."oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resource_resource_id_idx" ON "private"."oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_id_idx" ON "private"."oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_id_idx" ON "private"."oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "private"."oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "private"."oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "private"."oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_authorization_code_id_idx" ON "private"."oauth_refresh_token" USING btree ("authorization_code_id");