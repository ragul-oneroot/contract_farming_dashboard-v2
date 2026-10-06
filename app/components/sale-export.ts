import { saleBuyer, type ProductSale } from "../lib/api";
import type { ExportColumn } from "./excel-export";
import { isLateEntry } from "./late-entry-tag";

/**
 * The sales download, shared by Field Sales and Sales Analysis so the two
 * produce the same sheet.
 */
/** One product line of a sale - the download has a row per product sold. */
export type SaleLine = { sale: ProductSale; item: ProductSale["items"][number]; first: boolean };

const when = (s?: string | null) => (s ? new Date(s) : null);
const place = (s: ProductSale) => {
  const buyer = saleBuyer(s);
  const a = buyer.kind === "fpo" ? s.fpo?.address : s.farmer?.farmAddress;
  return a;
};

/**
 * Every column a sales download can carry. Sale-level money (overall
 * discount, other charges, total) is written on the sale's FIRST line only,
 * so adding up a column in Excel gives the real figure, not one multiplied by
 * the number of products in the basket.
 */
export const SALE_COLUMNS: ExportColumn<SaleLine>[] = [
  { key: "invoiceNo", label: "Invoice no", value: (l) => l.sale.invoiceNo },
  { key: "soldAt", label: "Sold on", value: (l) => when(l.sale.soldAt) },
  { key: "createdAt", label: "Recorded at", value: (l) => when(l.sale.createdAt), checked: false },
  { key: "lateEntry", label: "Entered late", value: (l) => (isLateEntry(l.sale) ? "Yes" : ""), checked: false },
  { key: "agronomist", label: "Agronomist", value: (l) => l.sale.agronomist?.name || l.sale.agronomistName },
  { key: "agronomistMobile", label: "Agronomist mobile", value: (l) => l.sale.agronomist?.mobile, checked: false },
  { key: "buyerType", label: "Buyer type", value: (l) => (saleBuyer(l.sale).kind === "fpo" ? "FPO" : "Farmer") },
  { key: "buyer", label: "Buyer", value: (l) => saleBuyer(l.sale).name },
  { key: "buyerMobile", label: "Buyer mobile", value: (l) => saleBuyer(l.sale).mobile },
  { key: "village", label: "Village", value: (l) => place(l.sale)?.village, checked: false },
  { key: "taluk", label: "Taluk", value: (l) => place(l.sale)?.taluk, checked: false },
  { key: "district", label: "District", value: (l) => place(l.sale)?.district, checked: false },
  // Blank, not 0, on an FPO row: a column sum should not be told an FPO farms nought acres.
  { key: "acres", label: "Farmer acres", value: (l) => (typeof l.sale.farmerAcres === "number" ? l.sale.farmerAcres : null), checked: false },
  { key: "crop", label: "Crop", value: (l) => l.sale.cropName },
  { key: "product", label: "Product", value: (l) => l.item.name },
  { key: "unit", label: "Size / unit", value: (l) => l.item.unit },
  { key: "qty", label: "Qty", value: (l) => l.item.qty },
  { key: "listPrice", label: "List price", value: (l) => l.item.listPrice ?? null, checked: false },
  { key: "unitPrice", label: "Unit price", value: (l) => l.item.unitPrice },
  { key: "lineDiscount", label: "Product discount ₹", value: (l) => l.item.discountAmount ?? 0, checked: false },
  { key: "lineTotal", label: "Product total ₹", value: (l) => l.item.lineTotal },
  { key: "saleDiscount", label: "Overall discount ₹", value: (l) => (l.first ? (l.sale.discountAmount ?? 0) : null), checked: false },
  { key: "otherCharges", label: "Other charges ₹", value: (l) => (l.first ? (l.sale.otherCharges ?? 0) : null), checked: false },
  { key: "total", label: "Bill total ₹", value: (l) => (l.first ? l.sale.total : null) },
  { key: "beforePhoto", label: "Before photo link", value: (l) => l.item.beforePhotoUrl, checked: false },
  { key: "afterPhoto", label: "After photo link", value: (l) => l.item.afterPhotoUrl, checked: false },
  { key: "notes", label: "Notes", value: (l) => l.sale.notes, checked: false },
  { key: "latitude", label: "Latitude", value: (l) => l.sale.location?.latitude, checked: false },
  { key: "longitude", label: "Longitude", value: (l) => l.sale.location?.longitude, checked: false },
];

/** A row per product sold, flagging each sale's first line. */
export const saleLines = (sales: ProductSale[]): SaleLine[] =>
  sales.flatMap((sale) => sale.items.map((item, i) => ({ sale, item, first: i === 0 })));
