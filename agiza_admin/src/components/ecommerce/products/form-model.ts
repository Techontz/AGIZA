/**
 * Product editor form state and its conversion to / from the API.
 * Numbers are kept as strings while editing (empty = not set).
 */
import type {
  Condition,
  LocationKind,
  ProductDetail,
  ProductRelationRef,
  ProductStatus,
  ProductWrite,
  ProfitType,
  StockOverride,
  TaxCategory,
  VariantStatus,
  VariantWrite,
} from "@/lib/api/services/products";

export interface VariantForm {
  /** Stable client key (existing variants: `v<id>`). */
  key: string;
  id?: number;
  name: string;
  sku: string;
  price: string;
  compare_at_price: string;
  stock: string;
  /** Stock is only sent when the admin changed it (it sets on-hand at the location). */
  stockTouched: boolean;
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  status: VariantStatus;
  notes: string;
  option_values: number[];
  /** Existing variant edited in this session (inactive untouched rows are left alone). */
  touched: boolean;
}

export interface ProductForm {
  name: string;
  sku: string;
  brand: string;
  category: string;
  subcategory: string;
  status: ProductStatus;
  condition: Condition;
  condition_description: string;
  price: string;
  compare_at_price: string;
  stock: string;
  stockTouched: boolean;
  low_stock_threshold: string;
  pata_bei: boolean;
  location_kind: LocationKind;
  location: string;
  bin_code: string;
  stock_override: StockOverride;
  origin_country: string;
  shipping_profile: string;
  weight_kg: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  packages: string;
  shipping_methods: number[];
  ready_to_ship_days: string;
  shipping_notes: string;
  has_variations: boolean;
  variation_options: number[];
  variants: VariantForm[];
  description: string;
  specifications: { name: string; value: string }[];
  vendor: string;
  vendor_sku: string;
  vendor_location: string;
  vendor_profit_type: ProfitType | "";
  vendor_profit_value: string;
  featured: boolean;
  ofa_kali: boolean;
  allow_save: boolean;
  allow_chat: boolean;
  keywords: string;
  labels: number[];
  related_products: ProductRelationRef[];
  bought_together: ProductRelationRef[];
  gift_eligible: boolean;
  gifts: ProductRelationRef[];
  tax_category: TaxCategory;
  vat_applicable: boolean;
}

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/** Drop trailing zeros from API decimals ("8.000" → "8"). */
export function trimDecimal(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : v;
}

export function emptyForm(): ProductForm {
  return {
    name: "",
    sku: "",
    brand: "",
    category: "",
    subcategory: "",
    status: "draft",
    condition: "new",
    condition_description: "",
    price: "",
    compare_at_price: "",
    stock: "0",
    stockTouched: false,
    low_stock_threshold: "3",
    pata_bei: false,
    location_kind: "warehouse",
    location: "",
    bin_code: "",
    stock_override: "",
    origin_country: "",
    shipping_profile: "",
    weight_kg: "",
    length_cm: "",
    width_cm: "",
    height_cm: "",
    packages: "1",
    shipping_methods: [],
    ready_to_ship_days: "1",
    shipping_notes: "",
    has_variations: false,
    variation_options: [],
    variants: [],
    description: "",
    specifications: [],
    vendor: "",
    vendor_sku: "",
    vendor_location: "",
    vendor_profit_type: "",
    vendor_profit_value: "",
    featured: false,
    ofa_kali: false,
    allow_save: true,
    allow_chat: true,
    keywords: "",
    labels: [],
    related_products: [],
    bought_together: [],
    gift_eligible: false,
    gifts: [],
    tax_category: "standard",
    vat_applicable: true,
  };
}

export function formFromDetail(p: ProductDetail): ProductForm {
  return {
    name: p.name,
    sku: p.sku,
    brand: s(p.brand?.id),
    category: s(p.category?.id),
    subcategory: s(p.subcategory?.id),
    status: p.status,
    condition: p.condition,
    condition_description: p.condition_description,
    price: trimDecimal(p.price),
    compare_at_price: trimDecimal(p.compare_at_price),
    stock: s(p.location_stock ?? 0),
    stockTouched: false,
    low_stock_threshold: s(p.low_stock_threshold),
    pata_bei: p.pata_bei,
    location_kind: p.location_kind,
    location: s(p.location?.id),
    bin_code: p.bin_code,
    stock_override: p.stock_override,
    origin_country: s(p.origin_country),
    shipping_profile: s(p.shipping_profile?.id),
    weight_kg: trimDecimal(p.weight_kg),
    length_cm: trimDecimal(p.length_cm),
    width_cm: trimDecimal(p.width_cm),
    height_cm: trimDecimal(p.height_cm),
    packages: s(p.packages),
    shipping_methods: [...p.shipping_methods],
    ready_to_ship_days: s(p.ready_to_ship_days),
    shipping_notes: p.shipping_notes,
    has_variations: p.has_variations,
    variation_options: [...p.variation_options],
    variants: p.variants
      .filter((v) => !v.is_default)
      .map((v) => ({
        key: `v${v.id}`,
        id: v.id,
        name: v.name,
        sku: v.sku,
        price: trimDecimal(v.price),
        compare_at_price: trimDecimal(v.compare_at_price),
        stock: s(v.stock),
        stockTouched: false,
        weight_kg: trimDecimal(v.weight_kg),
        length_cm: trimDecimal(v.length_cm),
        width_cm: trimDecimal(v.width_cm),
        height_cm: trimDecimal(v.height_cm),
        status: v.status,
        notes: v.notes,
        option_values: v.option_values.map((o) => o.id),
        touched: false,
      })),
    description: p.description,
    specifications: p.specifications.map((x) => ({ ...x })),
    vendor: s(p.vendor?.id),
    vendor_sku: p.vendor_sku,
    vendor_location: p.vendor_location,
    vendor_profit_type: p.vendor_profit_type,
    vendor_profit_value: trimDecimal(p.vendor_profit_value),
    featured: p.featured,
    ofa_kali: p.ofa_kali,
    allow_save: p.allow_save,
    allow_chat: p.allow_chat,
    keywords: p.keywords,
    labels: p.labels.map((l) => l.id),
    related_products: [...p.relations.related_products],
    bought_together: [...p.relations.bought_together],
    gift_eligible: p.gift_eligible,
    gifts: [...p.relations.gifts],
    tax_category: p.tax_category,
    vat_applicable: p.vat_applicable,
  };
}

const idOrNull = (v: string) => (v ? Number(v) : null);
const decOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
const int = (v: string, fallback: number) => (v.trim() === "" || !Number.isFinite(Number(v)) ? fallback : Math.trunc(Number(v)));

function variantPayload(v: VariantForm, isNew: boolean): VariantWrite {
  return {
    ...(v.id ? { id: v.id } : {}),
    name: v.name.trim(),
    sku: v.sku.trim(),
    price: decOrNull(v.price),
    compare_at_price: decOrNull(v.compare_at_price),
    weight_kg: decOrNull(v.weight_kg),
    length_cm: decOrNull(v.length_cm),
    width_cm: decOrNull(v.width_cm),
    height_cm: decOrNull(v.height_cm),
    status: v.status,
    notes: v.notes,
    option_values: v.option_values,
    ...(isNew || v.stockTouched || !v.id ? { stock: int(v.stock, 0) } : {}),
  };
}

/** Variants actually sent: inactive rows the admin didn't touch are left as they are. */
export function sentVariants(f: ProductForm): VariantForm[] {
  return f.variants.filter((v) => !(v.id && v.status === "inactive" && !v.touched));
}

export function toPayload(f: ProductForm, isNew: boolean): ProductWrite {
  const atWarehouse = f.location_kind === "warehouse";
  const payload: ProductWrite = {
    name: f.name.trim(),
    sku: f.sku.trim(),
    brand: idOrNull(f.brand),
    category: idOrNull(f.category),
    subcategory: idOrNull(f.subcategory),
    status: f.status,
    condition: f.condition,
    condition_description: f.condition === "new" ? "" : f.condition_description,
    price: f.price.trim(),
    compare_at_price: decOrNull(f.compare_at_price),
    low_stock_threshold: int(f.low_stock_threshold, 3),
    pata_bei: f.pata_bei,
    location_kind: f.location_kind,
    location: atWarehouse ? idOrNull(f.location) : null,
    bin_code: atWarehouse ? f.bin_code : "",
    stock_override: f.stock_override,
    origin_country: idOrNull(f.origin_country),
    shipping_profile: idOrNull(f.shipping_profile),
    weight_kg: decOrNull(f.weight_kg),
    length_cm: decOrNull(f.length_cm),
    width_cm: decOrNull(f.width_cm),
    height_cm: decOrNull(f.height_cm),
    packages: int(f.packages, 1),
    shipping_methods: f.shipping_methods,
    ready_to_ship_days: int(f.ready_to_ship_days, 1),
    shipping_notes: f.shipping_notes,
    has_variations: f.has_variations,
    variation_options: f.has_variations ? f.variation_options : [],
    description: f.description,
    specifications: f.specifications
      .map((x) => ({ name: x.name.trim(), value: x.value.trim() }))
      .filter((x) => x.name && x.value),
    vendor: idOrNull(f.vendor),
    vendor_sku: f.vendor_sku,
    vendor_location: f.vendor_location,
    vendor_profit_type: f.vendor ? f.vendor_profit_type : "",
    vendor_profit_value: f.vendor ? decOrNull(f.vendor_profit_value) : null,
    featured: f.featured,
    ofa_kali: f.ofa_kali,
    allow_save: f.allow_save,
    allow_chat: f.allow_chat,
    keywords: f.keywords.trim(),
    labels: f.labels,
    related_products: f.related_products.map((p) => p.id),
    bought_together: f.bought_together.map((p) => p.id),
    gift_eligible: f.gift_eligible,
    gifts: f.gift_eligible ? f.gifts.map((p) => p.id) : [],
    tax_category: f.tax_category,
    vat_applicable: f.vat_applicable,
  };
  if (f.has_variations) {
    payload.variants = sentVariants(f).map((v) => variantPayload(v, isNew));
  } else if (atWarehouse && (isNew || f.stockTouched)) {
    payload.stock = int(f.stock, 0);
  }
  return payload;
}

/** CBM (m³) and volumetric weight (kg) from package dimensions in cm. */
export function measures(l: string, w: string, h: string, divisor: number) {
  const volume = (parseFloat(l) || 0) * (parseFloat(w) || 0) * (parseFloat(h) || 0);
  return { cbm: (volume / 1_000_000).toFixed(4), volumetric: (volume / divisor).toFixed(2), hasAll: volume > 0 };
}
