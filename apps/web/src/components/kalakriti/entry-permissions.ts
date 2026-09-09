import {
  canRemoveKalakritiEntries,
  canWriteKalakritiEntries,
} from "@/lib/kalakriti-entry-policy";

export function getSessionEntryPermissions({
  access,
  centerEnabled,
  lifecycle,
  registrationOpen,
}: {
  access: Parameters<typeof canWriteKalakritiEntries>[0];
  centerEnabled: boolean;
  lifecycle: string;
  registrationOpen: boolean;
}) {
  const canWriteEntries = canWriteKalakritiEntries(access);
  const removalEnabled =
    canWriteEntries &&
    canRemoveKalakritiEntries({
      centerEnabled,
      lifecycle,
    });
  return {
    canWriteEntries,
    edit: removalEnabled,
    register: canWriteEntries && registrationOpen,
    remove: removalEnabled,
    uploadMusic: canWriteEntries && lifecycle !== "archived",
  };
}
