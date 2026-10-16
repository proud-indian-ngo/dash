import { Button } from "@pi-dash/design-system/components/ui/button";

import type { usePaymentScreenshotUpload } from "@/components/form/use-payment-screenshot-upload";

/**
 * The payment screenshot picker: a file input, then a preview of the upload
 * with Remove.
 */
export function PaymentScreenshotInput({
  describedBy,
  id,
  required,
  upload,
}: {
  describedBy: string;
  id: string;
  required: boolean;
  upload: ReturnType<typeof usePaymentScreenshotUpload>;
}) {
  if (upload.previewUrl) {
    return (
      <div className="flex items-start gap-3">
        <img
          alt="Payment screenshot preview"
          className="h-20 w-20 rounded-md border object-cover"
          height={80}
          src={upload.previewUrl}
          width={80}
        />
        <Button
          onClick={upload.remove}
          size="sm"
          type="button"
          variant="outline"
        >
          Remove
        </Button>
      </div>
    );
  }
  return (
    <input
      accept="image/jpeg,image/png,image/webp"
      aria-describedby={describedBy}
      aria-required={required}
      className="file:bg-muted text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
      disabled={upload.uploading}
      id={id}
      onChange={upload.handleFileChange}
      type="file"
    />
  );
}
