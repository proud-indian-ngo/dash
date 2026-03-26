import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { env } from "@pi-dash/env/web";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
import { SelectField, type SelectOption } from "@/components/form/select-field";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  deleteProfilePicture,
  getProfilePictureUploadUrl,
  MAX_AVATAR_FILE_SIZE_BYTES,
} from "@/functions/attachments";
import { authClient } from "@/lib/auth-client";
import { type ProfileFormValues, profileSchema } from "./profile-schema";

const TRAILING_SLASH = /\/$/;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const genderOptions: SelectOption[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Prefer not to say", value: "unspecified" },
];

function AvatarUpload() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Reset input so the same file can be re-selected
    e.target.value = "";

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      toast.error("Please select a JPG, PNG, GIF, or WebP image");
      return;
    }
    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      toast.error("Image must be under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const mimeType = file.type as
        | "image/gif"
        | "image/jpeg"
        | "image/png"
        | "image/webp";
      const { presignedUrl, key } = await getProfilePictureUploadUrl({
        data: {
          fileName: file.name,
          fileSize: file.size,
          mimeType,
        },
      });

      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) {
        toast.error("Upload failed");
        return;
      }

      const cdnUrl = `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${key}`;
      const { error } = await authClient.updateUser({ image: cdnUrl });
      if (error) {
        toast.error(error.message ?? "Failed to update profile picture");
        deleteProfilePicture({ data: { key } }).catch((error) => {
          log.error({
            component: "ProfileSection",
            action: "cleanupOrphanedR2",
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      } else {
        toast.success("Profile picture updated");
      }
    } catch (error) {
      log.error({
        component: "ProfileSection",
        action: "uploadProfilePicture",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to upload profile picture");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user?.image) {
      return;
    }

    setUploading(true);
    try {
      // Clear DB reference first — dangling R2 object is harmless,
      // but a dangling DB ref pointing to a deleted object = broken avatar.
      const imageUrl = user.image;
      const { error } = await authClient.updateUser({ image: "" });
      if (error) {
        toast.error(error.message ?? "Failed to remove profile picture");
        return;
      }

      // Best-effort R2 cleanup after DB is cleared
      const cdnBase = env.VITE_CDN_URL.replace(TRAILING_SLASH, "");
      if (imageUrl.startsWith(cdnBase)) {
        const key = imageUrl.slice(cdnBase.length + 1);
        deleteProfilePicture({ data: { key } }).catch((error) => {
          log.error({
            component: "ProfileSection",
            action: "cleanupR2AfterRemove",
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      toast.success("Profile picture removed");
    } catch (error) {
      log.error({
        component: "ProfileSection",
        action: "removeProfilePicture",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to remove profile picture");
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar className="size-16" fallbackClassName="text-lg" user={user} />
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            {uploading ? "Uploading..." : "Change photo"}
          </Button>
          {user.image && (
            <Button
              disabled={uploading}
              onClick={handleRemove}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          JPG, PNG, GIF or WebP. Max 5 MB.
        </p>
      </div>
      <input
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        ref={fileInputRef}
        type="file"
      />
    </div>
  );
}

export function ProfileSection() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const form = useForm({
    defaultValues: {
      dob: user?.dob ? new Date(user.dob) : undefined,
      gender: (user?.gender ?? "") as "" | "male" | "female" | "unspecified",
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    } satisfies ProfileFormValues,
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({
        dob: value.dob ?? undefined,
        gender: value.gender || undefined,
        name: value.name,
        phone: value.phone || undefined,
      });
      if (error) {
        toast.error(error.message ?? "Failed to save profile");
      } else {
        toast.success("Profile saved");
      }
    },
    validators: {
      onChange: profileSchema,
      onSubmit: profileSchema,
    },
  });

  return (
    <FormLayout className="flex flex-col gap-6 p-4" form={form}>
      <AvatarUpload />

      <div className="flex flex-col gap-4">
        <InputField isRequired label="Name" name="name" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            className="opacity-60"
            disabled
            id="profile-email"
            value={user?.email ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <PhoneField defaultCountry="IN" label="Phone" name="phone" />
        <SelectField
          label="Gender"
          name="gender"
          options={genderOptions}
          placeholder="Select gender"
        />
        <DateField label="Date of birth" name="dob" />
      </div>

      <div className="flex justify-end">
        <FormActions submitLabel="Save changes" submittingLabel="Saving..." />
      </div>
    </FormLayout>
  );
}
