import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";

export function PendingDialog({
  description,
  onOpenChange,
  title,
}: {
  description: string;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-24">
          <Loader />
        </div>
      </DialogContent>
    </Dialog>
  );
}
