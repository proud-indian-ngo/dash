import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { CashVoucher, type CashVoucherProps } from "./cash-voucher";

export function generateCashVoucherPdf(
  props: CashVoucherProps
): Promise<Buffer> {
  // biome-ignore lint/suspicious/noExplicitAny: react-pdf types require this
  return renderToBuffer(createElement(CashVoucher, props) as any);
}
