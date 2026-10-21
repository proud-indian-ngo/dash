import { Path, Rect, Svg } from "@react-pdf/renderer";
import QRCode from "qrcode";

/** A QR code as vectors, `size` points square, with the four-module quiet zone included. */
export function QrCode({ size, value }: { size: number; value: string }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const extent = modules.size + quiet * 2;
  let modulesPath = "";
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        modulesPath += `M${column + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
  }
  return (
    <Svg height={size} viewBox={`0 0 ${extent} ${extent}`} width={size}>
      <Rect fill="#ffffff" height={extent} width={extent} x={0} y={0} />
      <Path d={modulesPath} fill="#000000" />
    </Svg>
  );
}
