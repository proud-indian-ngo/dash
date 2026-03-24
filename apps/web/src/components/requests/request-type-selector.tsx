import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import type { RequestType } from "@/lib/request-types";
import { REQUEST_TYPE_LABELS } from "@/lib/request-types";

export function TypeSelector({
  value,
  onChange,
}: {
  onChange: (type: RequestType) => void;
  value: RequestType;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-medium text-sm" htmlFor="request-type">
        Type <span className="text-destructive">*</span>
      </label>
      <Select
        onValueChange={(val) => {
          if (
            val === "reimbursement" ||
            val === "advance_payment" ||
            val === "vendor_payment"
          ) {
            onChange(val);
          }
        }}
        value={value}
      >
        <SelectTrigger className="w-full" id="request-type">
          <span
            className="flex flex-1 items-center text-left"
            data-slot="select-value"
          >
            {REQUEST_TYPE_LABELS[value] ?? "Select type"}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="reimbursement">Reimbursement</SelectItem>
          <SelectItem value="advance_payment">Advance Payment</SelectItem>
          <SelectItem value="vendor_payment">Vendor Payment</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
