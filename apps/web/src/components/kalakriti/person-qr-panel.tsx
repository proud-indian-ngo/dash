import { QRCodeSVG } from "qrcode.react";

interface PersonQrPanelProps {
  id: string;
  type: "student" | "guardian" | "volunteer";
  enabled?: boolean;
}

export function PersonQrPanel({
  id,
  type,
  enabled = true,
}: PersonQrPanelProps) {
  if (!enabled) {
    return null;
  }

  return (
    <section aria-label="Person QR code" className="grid gap-3">
      <h3 className="text-sm font-medium">QR code</h3>
      <QRCodeSVG
        aria-label="Person QR code"
        className="max-w-full"
        marginSize={4}
        role="img"
        size={192}
        title="Person QR code"
        value={JSON.stringify({ id, type })}
      />
    </section>
  );
}
