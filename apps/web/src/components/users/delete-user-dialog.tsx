import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import { log } from "evlog";
import { toast } from "sonner";

interface DeleteUserDialogProps {
  disabled?: boolean;
  isDeleting?: boolean;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  userId: string;
  userName: string;
}

export function DeleteUserDialog({
  disabled = false,
  isDeleting = false,
  onOpenChange,
  onConfirm,
  open,
  userId,
  userName,
}: DeleteUserDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{userName}</strong> and revoke
            all related sessions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDeleting}
            size="default"
            variant="outline"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled || isDeleting}
            onClick={async () => {
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (error) {
                log.error({
                  component: "DeleteUserDialog",
                  action: "deleteUser",
                  userId,
                  userName,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to delete user",
                });
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Failed to delete user"
                );
              }
            }}
            variant="destructive"
          >
            {isDeleting ? "Deleting..." : "Delete user"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
