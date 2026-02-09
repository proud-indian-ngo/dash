type AvatarGender = null | string | undefined;

const normalizeGender = (
  gender: AvatarGender
): "female" | "male" | undefined => {
  if (!gender) {
    return undefined;
  }

  const normalizedGender = gender.trim().toLowerCase();
  if (normalizedGender === "male" || normalizedGender === "female") {
    return normalizedGender;
  }

  return undefined;
};

export const buildAvatarUrl = (
  email?: null | string,
  gender?: AvatarGender
): string | undefined => {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return undefined;
  }

  const params = new URLSearchParams({
    email: normalizedEmail,
  });
  const normalizedGender = normalizeGender(gender);
  if (normalizedGender) {
    params.set("gender", normalizedGender);
  }

  return `/api/avatar?${params.toString()}`;
};
