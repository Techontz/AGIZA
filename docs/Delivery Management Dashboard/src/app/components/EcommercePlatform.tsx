import { useState } from 'react';
import {
  Store,
  Package,
  Tag,
  Settings,
  Edit,
  Trash2,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  Image as ImageIcon,
  ShoppingCart,
  Ship,
  Truck,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  DollarSign,
  Percent,
  Globe
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
  image: string;
  description: string;
  sku: string;
  brand?: string;
  originCountry?: string;
  defaultShipmentType?: 'Air' | 'Sea' | 'Air Sensitive' | 'Sea Sensitive';
  attributes?: {
    color?: string;
    size?: string;
    weight?: string;
    material?: string;
    [key: string]: string | undefined;
  };
}

const mockProducts: Product[] = [
  {
    id: 'PROD-001',
    name: 'Samsung Galaxy A54 5G',
    category: 'Electronics',
    price: 850000,
    stock: 15,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&h=400&fit=crop',
    description: '6.4" Super AMOLED Display, 128GB Storage, 8GB RAM',
    sku: 'ELEC-SAM-A54',
    brand: 'Samsung',
    originCountry: 'Dubai (UAE)',
    defaultShipmentType: 'Air Sensitive',
    attributes: {
      color: 'Awesome Violet',
      storage: '128GB',
      ram: '8GB',
      display: '6.4" Super AMOLED'
    }
  },
  {
    id: 'PROD-002',
    name: 'Nike Air Max 270',
    category: 'Fashion',
    price: 180000,
    stock: 8,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
    description: 'Men\'s Running Shoes - Black/White',
    sku: 'FASH-NIKE-AM270',
    brand: 'Nike',
    originCountry: 'USA',
    defaultShipmentType: 'Air',
    attributes: {
      color: 'Black/White',
      size: '42',
      material: 'Mesh Upper',
      type: 'Running Shoes'
    }
  },
  {
    id: 'PROD-003',
    name: 'MacBook Air M2',
    category: 'Electronics',
    price: 2500000,
    stock: 3,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',
    description: '13.6" Liquid Retina, 256GB SSD, 8GB RAM',
    sku: 'ELEC-APPLE-MBA-M2',
    brand: 'Apple',
    originCountry: 'China',
    defaultShipmentType: 'Air Sensitive',
    attributes: {
      color: 'Space Gray',
      storage: '256GB SSD',
      ram: '8GB',
      processor: 'Apple M2',
      display: '13.6" Liquid Retina'
    }
  },
  {
    id: 'PROD-004',
    name: 'Sony WH-1000XM5 Headphones',
    category: 'Electronics',
    price: 650000,
    stock: 12,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&h=400&fit=crop',
    description: 'Wireless Noise Cancelling Headphones',
    sku: 'ELEC-SONY-WH1000XM5',
    brand: 'Sony',
    attributes: {
      color: 'Black',
      connectivity: 'Bluetooth 5.2',
      battery: '30 hours',
      noise_cancelling: 'Active'
    }
  },
  {
    id: 'PROD-005',
    name: 'Adidas Ultraboost 22',
    category: 'Fashion',
    price: 220000,
    stock: 0,
    status: 'inactive',
    image: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400&h=400&fit=crop',
    description: 'Running Shoes - White/Blue',
    sku: 'FASH-ADID-UB22',
    brand: 'Adidas',
    attributes: {
      color: 'White/Blue',
      size: '43',
      material: 'Primeknit',
      type: 'Running Shoes'
    }
  },
  {
    id: 'PROD-006',
    name: 'LG 55" 4K Smart TV',
    category: 'Electronics',
    price: 1200000,
    stock: 5,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&h=400&fit=crop',
    description: '55" 4K UHD Smart TV with WebOS',
    sku: 'ELEC-LG-55UK',
    brand: 'LG',
    attributes: {
      screen_size: '55"',
      resolution: '4K UHD',
      smart_platform: 'WebOS',
      hdr: 'HDR10'
    }
  },
  {
    id: 'PROD-007',
    name: 'Levi\'s 501 Original Jeans',
    category: 'Fashion',
    price: 95000,
    stock: 25,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop',
    description: 'Classic Fit Jeans - Blue Denim',
    sku: 'FASH-LEVI-501',
    brand: 'Levi\'s',
    attributes: {
      color: 'Blue Denim',
      size: '32x34',
      fit: 'Classic Straight',
      material: '100% Cotton'
    }
  },
  {
    id: 'PROD-008',
    name: 'Canon EOS R6 Camera',
    category: 'Electronics',
    price: 4500000,
    stock: 2,
    status: 'active',
    image: 'https://images.unsplash.com/photo-1606980707976-8fc0c1c3d3d1?w=400&h=400&fit=crop',
    description: 'Full-Frame Mirrorless Camera Body',
    sku: 'ELEC-CANON-R6',
    brand: 'Canon',
    attributes: {
      sensor: 'Full-Frame 20.1MP',
      video: '4K 60fps',
      autofocus: 'Dual Pixel CMOS AF II',
      stabilization: '5-axis IBIS'
    }
  },
];

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: 'active' | 'inactive';
  profitType: 'fixed' | 'percent';
  profitValue: number;
  profitScope: 'all' | 'per_product';
  productsCount: number;
  totalSales: number;
  joinedDate: string;
}

// Delivery Estimation Plugin Component
interface DeliveryEstimationPluginProps {
  origin?: string;
  destination?: string;
  shipmentType?: 'Air' | 'Sea' | 'Air Sensitive' | 'Sea Sensitive';
  compact?: boolean;
}

export function DeliveryEstimationPlugin({ 
  origin = 'China', 
  destination = 'Dar es Salaam', 
  shipmentType = 'Air',
  compact = false 
}: DeliveryEstimationPluginProps) {
  const calculateEstimate = () => {
    let min = 0;
    let max = 0;

    // Base days by origin and method
    const baseEstimates: Record<string, { air: [number, number], sea: [number, number] }> = {
      'China': { air: [7, 12], sea: [35, 45] },
      'USA': { air: [10, 14], sea: [45, 60] },
      'UK': { air: [10, 14], sea: [45, 60] },
      'Dubai (UAE)': { air: [4, 7], sea: [20, 30] },
      'India': { air: [5, 8], sea: [25, 35] },
      'Tanzania': { air: [1, 2], sea: [2, 3] },
    };

    const originKey = Object.keys(baseEstimates).find(k => origin.includes(k)) || 'China';
    const isAir = shipmentType.includes('Air');
    const [baseMin, baseMax] = isAir ? baseEstimates[originKey].air : baseEstimates[originKey].sea;

    min = baseMin;
    max = baseMax;

    // Sensitive goods delay
    if (shipmentType.includes('Sensitive')) {
      min += 3;
      max += 5;
    }

    // Destination delay (if not Dar es Salaam)
    if (destination !== 'Dar es Salaam') {
      min += 2;
      max += 4;
    }

    return { min, max };
  };

  const { min, max } = calculateEstimate();

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-700 font-semibold bg-blue-50 px-2 py-1 rounded">
        <Clock className="size-4" />
        {min}-{max} Days
      </div>
    );
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Truck className="size-5 text-blue-600" />
          <h4 className="font-bold text-gray-900">Delivery Estimator</h4>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-full uppercase">
          Plugin Active
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Route:</span>
          <span className="font-medium text-gray-900">{origin} → {destination}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Method:</span>
          <span className="font-medium text-gray-900 flex items-center gap-1">
            {shipmentType.includes('Air') ? <ImageIcon className="size-3 text-blue-500" /> : <Ship className="size-3 text-cyan-500" />}
            {shipmentType}
          </span>
        </div>
        
        <div className="pt-3 border-t border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-1 uppercase tracking-wider text-center">Estimated Arrival</p>
          <div className="text-center">
            <span className="text-3xl font-black text-blue-600">{min}-{max}</span>
            <span className="ml-1 text-lg font-bold text-blue-600">DAYS</span>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center italic mt-2">
          *Estimates include clearing and processing time.
        </p>
      </div>
    </div>
  );
}

const mockVendors: Vendor[] = [
  {
    id: 'VEND-001',
    name: 'TechHub Electronics',
    email: 'contact@techhub.co.tz',
    phone: '+255 712 345 678',
    location: 'Dar es Salaam',
    status: 'active',
    profitType: 'percent',
    profitValue: 15,
    profitScope: 'all',
    productsCount: 45,
    totalSales: 12500000,
    joinedDate: '2024-01-15'
  },
  {
    id: 'VEND-002',
    name: 'Fashion Forward',
    email: 'sales@fashionforward.co.tz',
    phone: '+255 754 987 654',
    location: 'Arusha',
    status: 'active',
    profitType: 'fixed',
    profitValue: 25000,
    profitScope: 'per_product',
    productsCount: 28,
    totalSales: 8750000,
    joinedDate: '2024-02-20'
  },
  {
    id: 'VEND-003',
    name: 'Home Essentials Ltd',
    email: 'info@homeessentials.co.tz',
    phone: '+255 765 432 109',
    location: 'Mwanza',
    status: 'active',
    profitType: 'percent',
    profitValue: 20,
    profitScope: 'all',
    productsCount: 62,
    totalSales: 15200000,
    joinedDate: '2023-11-10'
  },
  {
    id: 'VEND-004',
    name: 'Sports Zone',
    email: 'team@sportszone.co.tz',
    phone: '+255 743 210 987',
    location: 'Dodoma',
    status: 'active',
    profitType: 'fixed',
    profitValue: 30000,
    profitScope: 'all',
    productsCount: 34,
    totalSales: 6800000,
    joinedDate: '2024-03-05'
  },
  {
    id: 'VEND-005',
    name: 'Smart Gadgets',
    email: 'hello@smartgadgets.co.tz',
    phone: '+255 789 654 321',
    location: 'Dar es Salaam',
    status: 'inactive',
    profitType: 'percent',
    profitValue: 12,
    profitScope: 'per_product',
    productsCount: 18,
    totalSales: 3200000,
    joinedDate: '2023-09-18'
  }
];

// ─── Product Edit Modal ───────────────────────────────────────────────────────

const SI = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
  </div>
);
const FI = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className ?? ''}`} />
);
const FS = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${props.className ?? ''}`} />
);
const FTA = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${props.className ?? ''}`} />
);
const SecHead = ({ n, title }: { n: number; title: string }) => (
  <div className="flex items-center gap-3 pt-5 pb-3 border-t border-gray-100 first:border-t-0 first:pt-0">
    <span className="size-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
    <h3 className="font-semibold text-gray-800">{title}</h3>
  </div>
);

// ─── Variation Edit Modal ──────────────────────────────────────────────────────

interface VariationData {
  id: string;
  name: string;
  sku: string;
  price: string;
  comparePrice: string;
  stock: string;
  weight: string;
  len: string;
  wid: string;
  hgt: string;
  status: string;
  images: string[];
  notes: string;
}

function VariationEditModal({ variation, onClose, onSave }: {
  variation: VariationData | null;
  onClose: () => void;
  onSave: (v: VariationData) => void;
}) {
  const isNew = !variation;
  const [name, setName] = useState(variation?.name ?? '');
  const [sku, setSku] = useState(variation?.sku ?? '');
  const [price, setPrice] = useState(variation?.price ?? '');
  const [comparePrice, setComparePrice] = useState(variation?.comparePrice ?? '');
  const [stock, setStock] = useState(variation?.stock ?? '0');
  const [weight, setWeight] = useState(variation?.weight ?? '');
  const [len, setLen] = useState(variation?.len ?? '');
  const [wid, setWid] = useState(variation?.wid ?? '');
  const [hgt, setHgt] = useState(variation?.hgt ?? '');
  const [status, setStatus] = useState(variation?.status ?? 'Active');
  const [notes, setNotes] = useState(variation?.notes ?? '');
  const [images, setImages] = useState<string[]>(variation?.images ?? []);
  const [imageUrl, setImageUrl] = useState('');

  const addImageUrl = () => {
    const url = imageUrl.trim();
    if (url) { setImages(prev => [...prev, url]); setImageUrl(''); }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: variation?.id ?? `VAR-${Date.now()}`,
      name: name.trim(),
      sku: sku.trim(),
      price,
      comparePrice,
      stock,
      weight,
      len,
      wid,
      hgt,
      status,
      images,
      notes,
    });
  };

  const cbm = ((parseFloat(len) || 0) * (parseFloat(wid) || 0) * (parseFloat(hgt) || 0) / 1_000_000).toFixed(4);
  const volW = ((parseFloat(len) || 0) * (parseFloat(wid) || 0) * (parseFloat(hgt) || 0) / 5000).toFixed(2);

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{isNew ? 'Add Variation' : 'Edit Variation'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Each variation has its own SKU, price, stock, dimensions, and images</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Variation identity */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Identity</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Variant Label *</label>
                <FI value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 128GB / Midnight Black" />
                <p className="text-xs text-gray-400 mt-1">Displayed to customer as the variation option</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Variant SKU</label>
                <FI value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. PROD-001-128-BLK" />
              </div>
            </div>
          </div>

          {/* Price */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pricing</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Price (TSh) *</label>
                <FI type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="850000" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Compare-at Price (TSh)</label>
                <FI type="number" value={comparePrice} onChange={e => setComparePrice(e.target.value)} placeholder="950000" />
              </div>
            </div>
          </div>

          {/* Stock */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Inventory</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Stock Quantity</label>
                <FI type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status</label>
                <FS value={status} onChange={e => setStatus(e.target.value)}>
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>Out of Stock</option>
                </FS>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Weight & Dimensions <span className="normal-case font-normal text-gray-400">(overrides parent product for shipping)</span></p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Weight (KG)</label>
                <FI type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Length (cm)</label>
                <FI type="number" value={len} onChange={e => setLen(e.target.value)} placeholder="30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Width (cm)</label>
                <FI type="number" value={wid} onChange={e => setWid(e.target.value)} placeholder="20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Height (cm)</label>
                <FI type="number" value={hgt} onChange={e => setHgt(e.target.value)} placeholder="10" />
              </div>
            </div>
            {(len || wid || hgt) && (
              <div className="mt-2 flex gap-6 text-xs text-gray-500">
                <span>CBM: <strong>{cbm}</strong> m³</span>
                <span>Vol. Weight: <strong>{volW} KG</strong></span>
              </div>
            )}
          </div>

          {/* Images */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Variation Images <span className="normal-case font-normal text-gray-400">(optional — override parent product images)</span></p>
            <div className="flex flex-wrap gap-2 mb-3">
              {images.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt={`Var ${i + 1}`} className="size-16 rounded-lg object-cover border border-gray-200" />
                  <button
                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full size-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="size-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <label className="size-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Plus className="size-5 text-gray-400" />
                <span className="text-xs text-gray-400 mt-0.5">Upload</span>
                <input type="file" accept="image/*" className="sr-only" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setImages(prev => [...prev, URL.createObjectURL(file)]);
                }} />
              </label>
            </div>
            <div className="flex gap-2">
              <FI type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addImageUrl()} placeholder="Or paste image URL..." className="text-xs py-1.5" />
              <button type="button" onClick={addImageUrl} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium whitespace-nowrap">Add URL</button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Internal Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <FTA rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Only available in UAE bundle; limited stock confirmed with supplier" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 rounded-b-xl">
          <button onClick={handleSave} disabled={!name.trim()} className="flex-1 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {isNew ? 'Add Variation' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ProductEditModal({ product, categories, onClose }: { product: Product | null; categories: string[]; onClose: () => void }) {
  const [condition, setCondition] = useState('New');
  const [hasVariations, setHasVariations] = useState(false);
  const [giftEligible, setGiftEligible] = useState(false);
  const [vatApplicable, setVatApplicable] = useState(true);
  const [pataBeiBool, setPataBeiBool] = useState(false);
  const [weight, setWeight] = useState('8');
  const [lenCm, setLenCm] = useState('50');
  const [widCm, setWidCm] = useState('40');
  const [hgtCm, setHgtCm] = useState('30');
  const [shippingProfile, setShippingProfile] = useState('Electronics');
  const [primaryImage, setPrimaryImage] = useState(product?.image || '');
  const [galleryImages, setGalleryImages] = useState<string[]>(
    product?.image ? [product.image] : []
  );
  const [imageInputVal, setImageInputVal] = useState('');
  const [variations, setVariations] = useState<VariationData[]>([]);
  const [showVariationModal, setShowVariationModal] = useState(false);
  const [editingVariation, setEditingVariation] = useState<VariationData | null>(null);

  const addImageFromUrl = () => {
    const url = imageInputVal.trim();
    if (!url) return;
    if (galleryImages.length === 0) setPrimaryImage(url);
    setGalleryImages(prev => [...prev, url]);
    setImageInputVal('');
  };

  const cbm = ((parseFloat(lenCm) || 0) * (parseFloat(widCm) || 0) * (parseFloat(hgtCm) || 0) / 1_000_000).toFixed(4);
  const volWeight = ((parseFloat(lenCm) || 0) * (parseFloat(widCm) || 0) * (parseFloat(hgtCm) || 0) / 5000).toFixed(2);

  const profileHandling: Record<string, string[]> = {
    'Standard Goods': [],
    'Electronics': ['Fragile'],
    'Camera': ['Fragile', 'Electronics'],
    'Laptop': ['Electronics', 'Contains Battery'],
    'Drone': ['Electronics', 'Contains Battery', 'Fragile'],
    'Battery / Restricted': ['Contains Battery', 'Restricted Handling'],
    'Oversized': ['Special Handling'],
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[94vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{product ? 'Edit Product' : 'Add New Product'}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-1">
          {/* ── Images & Media ── */}
          <div className="pb-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ImageIcon className="size-4 text-gray-500" />Images & Media
            </p>
            <div className="flex gap-4">
              {/* Primary image preview */}
              <div className="flex-shrink-0">
                <p className="text-xs text-gray-400 mb-1.5">Primary Image</p>
                {primaryImage ? (
                  <div className="relative group">
                    <img
                      src={primaryImage}
                      alt="Primary"
                      className="size-28 rounded-xl object-cover border-2 border-blue-400 shadow-sm"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => { setPrimaryImage(''); setGalleryImages(g => g.filter(u => u !== primaryImage)); }}
                        className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        title="Remove"
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">Main</span>
                  </div>
                ) : (
                  <div className="size-28 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                    <ImageIcon className="size-8 text-gray-300" />
                  </div>
                )}
              </div>

              {/* Gallery thumbnails */}
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1.5">Gallery ({galleryImages.length})</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {galleryImages.map((url, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={url}
                        alt={`Gallery ${i + 1}`}
                        className={`size-14 rounded-lg object-cover border-2 cursor-pointer transition-all ${primaryImage === url ? 'border-blue-400' : 'border-gray-200 hover:border-blue-300'}`}
                        onClick={() => setPrimaryImage(url)}
                        title="Set as primary"
                      />
                      <button
                        onClick={() => {
                          const next = galleryImages.filter((_, j) => j !== i);
                          setGalleryImages(next);
                          if (primaryImage === url) setPrimaryImage(next[0] || '');
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full size-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <svg className="size-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  {/* Add placeholder slot */}
                  <label className="size-14 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <Plus className="size-5 text-gray-400" />
                    <span className="text-xs text-gray-400 mt-0.5">Upload</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        if (!primaryImage) setPrimaryImage(url);
                        setGalleryImages(prev => [...prev, url]);
                      }
                    }} />
                  </label>
                </div>
                {/* URL input */}
                <div className="flex gap-2 items-center">
                  <FI
                    type="url"
                    placeholder="Or paste image URL..."
                    value={imageInputVal}
                    onChange={e => setImageInputVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addImageFromUrl()}
                    className="text-xs py-1.5"
                  />
                  <button
                    type="button"
                    onClick={addImageFromUrl}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                  >
                    Add URL
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Click a thumbnail to set it as the primary image. Drag to reorder (coming soon).</p>
              </div>
            </div>
          </div>

          {/* ── Section 1: Basic Information ── */}
          <SecHead n={1} title="Basic Information" />
          <div className="space-y-4">
            <SI label="Product Name *">
              <FI type="text" defaultValue={product?.name} placeholder="e.g. Samsung Galaxy A54 5G" />
            </SI>
            <div className="grid grid-cols-2 gap-4">
              <SI label="SKU"><FI type="text" defaultValue={product?.sku} placeholder="ELEC-SAM-A54" /></SI>
              <SI label="Brand"><FI type="text" defaultValue={product?.brand} placeholder="e.g. Samsung, Apple, Nike" /></SI>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SI label="Category *">
                <FS defaultValue={product?.category}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </FS>
              </SI>
              <SI label="Subcategory">
                <FS><option>Select subcategory...</option><option>Smartphones</option><option>Laptops</option><option>Cameras</option></FS>
              </SI>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SI label="Status *">
                <FS defaultValue={product?.status}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="hidden">Hidden</option>
                  <option value="out_of_stock">Out of Stock</option>
                </FS>
              </SI>
              <SI label="Product Condition *">
                <FS value={condition} onChange={e => setCondition(e.target.value)}>
                  <option>New</option><option>Used</option><option>Refurbished</option><option>Open Box</option>
                </FS>
              </SI>
            </div>
            {condition !== 'New' && (
              <SI label="Condition Description" hint="Displayed to customers on the product page">
                <FTA rows={2} placeholder={"e.g. Used — minor body marks, fully functional."} />
              </SI>
            )}
          </div>

          {/* ── Section 2: Price & Inventory ── */}
          <SecHead n={2} title="Price & Inventory" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SI label="Price (TSh) *"><FI type="number" defaultValue={product?.price} placeholder="850000" /></SI>
              <SI label="Compare-at / Original Price (TSh)" hint="Shown as strikethrough original price"><FI type="number" placeholder="950000" /></SI>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SI label="Stock *"><FI type="number" defaultValue={product?.stock} /></SI>
              <SI label="Low Stock Alert At"><FI type="number" placeholder="e.g. 3" /></SI>
              <SI label="Stock Status">
                <FS><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option></FS>
              </SI>
            </div>
            <div className="flex items-center gap-6 py-1">
              <span className="text-sm font-semibold text-gray-700">Allow "Pata Bei" when out of stock:</span>
              {['Yes', 'No'].map(v => (
                <label key={v} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="pata_bei" checked={pataBeiBool === (v === 'Yes')} onChange={() => setPataBeiBool(v === 'Yes')} className="text-blue-600" />{v}
                </label>
              ))}
              <span className="text-xs text-gray-400">Allows out-of-stock products to remain visible for quotation requests</span>
            </div>
          </div>

          {/* ── Section 3: Product Location ── */}
          <SecHead n={3} title="Product Location" />
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 mb-3 text-xs text-blue-700">
            Product Location = where the product currently is. This is <strong>not</strong> the customer's delivery address. Displayed to customers as "Inapatikana: Dar es Salaam". <strong>Required when product is In Stock.</strong>
          </div>
          <div className="space-y-3">
            <SI label="Warehouse / Location *" hint="Select the warehouse or shop where this product is physically stored. Required when product is In Stock.">
              <FS>
                <option value="">— Select location —</option>
                <optgroup label="Tanzania — Fulfillment Centers">
                  <option value="WH-TZ-001">WH-TZ-001 · Dar es Salaam Central Warehouse</option>
                  <option value="WH-TZ-003">WH-TZ-003 · Mwanza Lakeside Center</option>
                </optgroup>
                <optgroup label="Tanzania — Pickup Points">
                  <option value="WH-TZ-002">WH-TZ-002 · Arusha Pickup Point</option>
                </optgroup>
                <optgroup label="Tanzania — Shop Locations">
                  <option value="WH-SHOP-001">WH-SHOP-001 · Agiza Shop — Dar es Salaam</option>
                  <option value="WH-SHOP-002">WH-SHOP-002 · Agiza Shop — Mwanza</option>
                </optgroup>
                <optgroup label="International — Consolidation Hubs">
                  <option value="WH-INT-001">WH-INT-001 · Guangzhou Consolidation Hub (China)</option>
                  <option value="WH-INT-002">WH-INT-002 · Dubai Jebel Ali Center (UAE)</option>
                  <option value="WH-INT-003">WH-INT-003 · Mumbai Export Hub (India)</option>
                  <option value="WH-INT-004">WH-INT-004 · London Gateway Center (UK)</option>
                  <option value="WH-INT-005">WH-INT-005 · New Jersey East Coast Hub (USA)</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="VENDOR">Vendor Location (not Agiza warehouse)</option>
                  <option value="TRANSIT">In Transit</option>
                </optgroup>
              </FS>
            </SI>
            <div className="grid grid-cols-2 gap-4">
              <SI label="Shelf / Bin Code" hint="Shelf or bin position inside the warehouse (e.g. A-12-3)">
                <FI placeholder="e.g. A-12-3" />
              </SI>
              <SI label="Stock Status Override">
                <FS>
                  <option>Auto (from stock qty)</option>
                  <option>In Stock</option>
                  <option>Reserved</option>
                  <option>In Transit</option>
                </FS>
              </SI>
            </div>
          </div>

          {/* ── Section 4: Shipping Profile ── */}
          <SecHead n={4} title="Shipping Profile" />
          <div className="space-y-3">
            <SI label="Shipping Profile *" hint="Defines how this product is classified for shipping and its special handling requirements">
              <FS value={shippingProfile} onChange={e => setShippingProfile(e.target.value)}>
                <option>Standard Goods</option>
                <option>Electronics</option>
                <option>Camera</option>
                <option>Laptop</option>
                <option>Drone</option>
                <option>Battery / Restricted</option>
                <option>Oversized</option>
                <option>Manual Quote</option>
              </FS>
            </SI>
            {(profileHandling[shippingProfile] ?? []).length > 0 && (
              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5">
                <svg className="size-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <p className="text-xs font-semibold text-yellow-700 mb-1">Special Handling from profile:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(profileHandling[shippingProfile] ?? []).map(h => (
                      <span key={h} className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-medium">{h}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 5: Physical & Shipping Dimensions ── */}
          <SecHead n={5} title="Physical & Shipping Dimensions" />
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <SI label="Weight (KG) *"><FI type="number" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} /></SI>
              <SI label="Length (CM)"><FI type="number" step="0.1" value={lenCm} onChange={e => setLenCm(e.target.value)} /></SI>
              <SI label="Width (CM)"><FI type="number" step="0.1" value={widCm} onChange={e => setWidCm(e.target.value)} /></SI>
              <SI label="Height (CM)"><FI type="number" step="0.1" value={hgtCm} onChange={e => setHgtCm(e.target.value)} /></SI>
              <SI label="Packages"><FI type="number" defaultValue="1" /></SI>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SI label="CBM (auto-calculated)" hint="Length × Width × Height ÷ 1,000,000">
                <FI value={cbm} readOnly className="bg-gray-50 font-mono text-blue-700 font-semibold" />
              </SI>
              <SI label="Volumetric Weight (auto-calculated)" hint="L × W × H ÷ 5,000 — configured in Shipping Engine Settings">
                <FI value={`${volWeight} KG`} readOnly className="bg-gray-50 font-mono text-blue-700 font-semibold" />
              </SI>
            </div>
            <p className="text-xs text-gray-400">CBM and volumetric weight are calculated automatically from package dimensions. Use package dimensions, not product dimensions alone.</p>
          </div>

          {/* ── Section 6: Shipping Information ── */}
          <SecHead n={6} title="Shipping Information" />
          <div className="space-y-4">
            <SI label="Origin" hint="Automatically linked to Product Location">
              <FI value="Dar es Salaam, Tanzania" readOnly className="bg-gray-50 text-gray-500" />
            </SI>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Available Shipping Methods</label>
              <div className="grid grid-cols-2 gap-2">
                {['Air Cargo', 'Sea Freight', 'Express Courier', 'Local Delivery', 'Other'].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" defaultChecked={m === 'Air Cargo' || m === 'Local Delivery'} className="rounded border-gray-300 text-blue-600" />{m}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">Shipping prices are calculated automatically by the Shipping Engine — do not enter prices here.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SI label="Ready to Ship (days)" hint="How many days until product is ready to dispatch">
                <FI type="number" defaultValue="1" className="max-w-24" />
              </SI>
              <SI label="Shipping Notes (optional)">
                <FTA rows={2} placeholder="Any special shipping notes..." />
              </SI>
            </div>
          </div>

          {/* ── Section 7: Variations ── */}
          <SecHead n={7} title="Variations" />
          <div className="space-y-3">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold text-gray-700">Has Variations:</span>
              {['Yes', 'No'].map(v => (
                <label key={v} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="has_variations" checked={hasVariations === (v === 'Yes')} onChange={() => setHasVariations(v === 'Yes')} className="text-blue-600" />{v}
                </label>
              ))}
            </div>
            {hasVariations && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Variation type checkboxes */}
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Variation Attributes</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                    {['Color', 'Storage', 'Size', 'Model', 'Capacity', 'Other'].map(attr => (
                      <label key={attr} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-blue-600" />{attr}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Variations list */}
                {variations.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-white">
                        {['Variant', 'SKU', 'Price (TSh)', 'Stock', 'Weight', 'Status', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {variations.map(v => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {v.images[0] && <img src={v.images[0]} alt="" className="size-8 rounded object-cover border border-gray-200" />}
                              <span className="font-medium text-gray-800">{v.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{v.sku || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{v.price ? Number(v.price).toLocaleString() : '—'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{v.stock}</td>
                          <td className="px-3 py-2.5 text-gray-500">{v.weight ? `${v.weight} KG` : '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{v.status}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => { setEditingVariation(v); setShowVariationModal(true); }}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setVariations(prev => prev.filter(x => x.id !== v.id))}
                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Add variation button */}
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setEditingVariation(null); setShowVariationModal(true); }}
                    className="flex items-center gap-2 text-blue-600 text-sm font-medium hover:text-blue-800 transition-colors"
                  >
                    <Plus className="size-4" />
                    Add Variation
                  </button>
                  <p className="text-xs text-gray-400">{variations.length} variation{variations.length !== 1 ? 's' : ''} · Each can have its own SKU, price, stock, dimensions &amp; images</p>
                </div>
              </div>
            )}
          </div>

          {/* Variation Edit Modal */}
          {showVariationModal && (
            <VariationEditModal
              variation={editingVariation}
              onClose={() => { setShowVariationModal(false); setEditingVariation(null); }}
              onSave={v => {
                if (editingVariation) {
                  setVariations(prev => prev.map(x => x.id === v.id ? v : x));
                } else {
                  setVariations(prev => [...prev, v]);
                }
                setShowVariationModal(false);
                setEditingVariation(null);
              }}
            />
          )}

          {/* ── Section 8: Description & Specifications ── */}
          <SecHead n={8} title="Description & Specifications" />
          <div className="space-y-4">
            <SI label="Description" hint="Displayed on the customer product page">
              <FTA rows={3} defaultValue={product?.description} />
            </SI>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Key Features / Specifications <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="space-y-2">
                {[['Display', '6.4"'], ['Storage', '128GB'], ['RAM', '8GB']].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <FI defaultValue={k} className="w-32" placeholder="Spec name" />
                    <FI defaultValue={v} placeholder="Value" />
                    <button className="px-2 text-gray-400 hover:text-red-500 text-sm">×</button>
                  </div>
                ))}
                <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:text-blue-800">
                  <Plus className="size-4" />Add Specification
                </button>
              </div>
            </div>
          </div>

          {/* ── Section 9: Vendor / Source ── */}
          <SecHead n={9} title="Vendor / Source" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SI label="Vendor / Seller">
                <FS><option>Select vendor...</option><option>TechSource China</option><option>Global Electronics Ltd</option><option>Direct Import</option></FS>
              </SI>
              <SI label="Vendor SKU"><FI placeholder="Vendor's product code" /></SI>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SI label="Vendor Location"><FI placeholder="e.g. Guangzhou, China" /></SI>
              <SI label="Verified Vendor">
                <div className="flex items-center gap-4 pt-1">
                  {['Yes', 'No'].map(v => (
                    <label key={v} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="verified_vendor" defaultChecked={v === 'No'} className="text-blue-600" />{v}
                    </label>
                  ))}
                </div>
              </SI>
            </div>
          </div>

          {/* ── Section 10: Shop & Discovery ── */}
          <SecHead n={10} title="Shop & Discovery" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {[
                { id: 'featured', label: 'Featured Product' },
                { id: 'ofa_kali', label: 'Ofa Kali' },
                { id: 'allow_save', label: 'Allow Customer Save' },
                { id: 'allow_chat', label: 'Allow Customer Chat' },
              ].map(({ id, label }) => (
                <div key={id} className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <div className="flex items-center gap-3">
                    {['Yes', 'No'].map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                        <input type="radio" name={id} defaultChecked={v === 'No'} className="text-blue-600" />{v}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <SI label="Search Keywords / Tags" hint="Helps customers find this product">
              <FI placeholder="e.g. smartphone, samsung, android, 5g" />
            </SI>
          </div>

          {/* ── Section 11: Related Products ── */}
          <SecHead n={11} title="Related Products" />
          <div>
            <p className="text-xs text-gray-500 mb-3">Displayed on the product page as "Bidhaa Zinazohusiana". For product discovery only — not shown in the buy flow.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Samsung Galaxy A34 5G', 'iPhone 14'].map(p => (
                <span key={p} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm flex items-center gap-1.5">
                  {p}<button className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:text-blue-800">
              <Plus className="size-4" />Add Related Product
            </button>
          </div>

          {/* ── Section 12: Frequently Bought Together ── */}
          <SecHead n={12} title="Frequently Bought Together" />
          <div>
            <p className="text-xs text-gray-500 mb-3">Shown after the customer presses "NUNUA SASA". Not visible as general recommendations on the product page.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Memory Card 256GB', 'Phone Case'].map(p => (
                <span key={p} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm flex items-center gap-1.5">
                  {p}<button className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:text-blue-800">
              <Plus className="size-4" />Add Product
            </button>
          </div>

          {/* ── Section 13: Gifts ── */}
          <SecHead n={13} title="Gift Eligibility" />
          <div className="space-y-3">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold text-gray-700">Gift Eligible:</span>
              {['Yes', 'No'].map(v => (
                <label key={v} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="gift_eligible" checked={giftEligible === (v === 'Yes')} onChange={() => setGiftEligible(v === 'Yes')} className="text-blue-600" />{v}
                </label>
              ))}
            </div>
            {giftEligible && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Gifts shown alongside Frequently Bought Together after "NUNUA SASA".</p>
                <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:text-blue-800">
                  <Plus className="size-4" />Add Gift
                </button>
              </div>
            )}
          </div>

          {/* ── Section 14: Tax ── */}
          <SecHead n={14} title="Tax" />
          <div className="grid grid-cols-2 gap-4">
            <SI label="Tax Category">
              <FS>
                <option>Standard Rate (VAT 18%)</option>
                <option>Zero Rated</option>
                <option>Exempt</option>
                <option>Special Goods</option>
              </FS>
            </SI>
            <SI label="VAT Applicable">
              <div className="flex items-center gap-4 pt-1">
                {['Yes', 'No'].map(v => (
                  <label key={v} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="vat" checked={vatApplicable === (v === 'Yes')} onChange={() => setVatApplicable(v === 'Yes')} className="text-blue-600" />{v}
                  </label>
                ))}
              </div>
            </SI>
          </div>
          <p className="text-xs text-gray-400 mt-1">Actual tax calculation is handled by the Agiza tax/checkout system — do not enter final tax amounts here.</p>

          {/* ── Section 15: Shipping Engine ── */}
          <SecHead n={15} title="Shipping Engine" />
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-4 text-sm">
              {[
                ['Shipping Profile', shippingProfile],
                ['Product Location', 'Dar es Salaam, TZ'],
                ['Weight', `${weight} KG`],
                ['CBM', cbm],
                ['Volumetric Weight', `${volWeight} KG`],
                ['Available Methods', 'Air Cargo, Local Delivery'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-gray-500 font-medium">{k}</p>
                  <p className="font-semibold text-gray-800">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 border-t border-gray-200 pt-3">
              Shipping cost and delivery estimates are calculated automatically by the Shipping Engine based on the customer's destination, shipping method, product profile, weight, dimensions, CBM, and applicable shipping rules.
            </p>
            <button className="text-blue-600 text-sm font-medium flex items-center gap-1.5 hover:text-blue-800">
              <Ship className="size-4" />Test Shipping Rate →
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 rounded-b-xl">
          <button className="flex-1 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm">
            {product ? 'Update Product' : 'Add Product'}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface EcommercePlatformProps {
  onNavigate?: (page: string) => void;
}

export function EcommercePlatform({ onNavigate }: EcommercePlatformProps) {
  const [activeTab, setActiveTab] = useState<'menu' | 'products' | 'categories' | 'settings' | 'vendors' | 'product-options' | 'labels' | 'brands'>('menu');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showProfitModal, setShowProfitModal] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');

  // Product Options state
  const [productOptions, setProductOptions] = useState([
    { id: 'OPT-001', name: 'Size', type: 'size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], status: 'Active' as const },
    { id: 'OPT-002', name: 'Color', type: 'color', values: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow'], status: 'Active' as const },
    { id: 'OPT-003', name: 'Bundle', type: 'bundle', values: ['Single', '2-Pack', '3-Pack', '5-Pack'], status: 'Active' as const },
    { id: 'OPT-004', name: 'Storage', type: 'storage', values: ['64GB', '128GB', '256GB', '512GB'], status: 'Active' as const },
    { id: 'OPT-005', name: 'Material', type: 'text', values: ['Cotton', 'Polyester', 'Leather', 'Nylon'], status: 'Active' as const },
  ]);
  const [optionNewValue, setOptionNewValue] = useState<Record<string, string>>({});
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionType, setNewOptionType] = useState('text');

  // Labels state
  type LabelColor = 'blue' | 'red' | 'yellow' | 'purple' | 'orange' | 'green' | 'gray';
  const labelColorMap: Record<LabelColor, string> = {
    blue: 'bg-blue-500 text-white', red: 'bg-red-500 text-white', yellow: 'bg-yellow-400 text-gray-900',
    purple: 'bg-purple-500 text-white', orange: 'bg-orange-500 text-white', green: 'bg-green-500 text-white',
    gray: 'bg-gray-500 text-white',
  };
  const [productLabels, setProductLabels] = useState([
    { id: 'LBL-001', name: 'New Arrival', color: 'blue' as LabelColor, products: 12, visible: true },
    { id: 'LBL-002', name: 'Sale', color: 'red' as LabelColor, products: 8, visible: true },
    { id: 'LBL-003', name: 'Best Seller', color: 'yellow' as LabelColor, products: 15, visible: true },
    { id: 'LBL-004', name: 'Limited Edition', color: 'purple' as LabelColor, products: 3, visible: true },
    { id: 'LBL-005', name: 'Flash Deal', color: 'orange' as LabelColor, products: 6, visible: false },
    { id: 'LBL-006', name: 'Trending', color: 'green' as LabelColor, products: 9, visible: true },
  ]);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState<LabelColor>('blue');

  // Brands state
  const [storeBrands, setStoreBrands] = useState([
    { id: 'BRD-001', name: 'Samsung', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Samsung_Logo.svg', country: 'South Korea', products: 8, status: 'Active' as const },
    { id: 'BRD-002', name: 'Nike', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg', country: 'USA', products: 12, status: 'Active' as const },
    { id: 'BRD-003', name: 'Apple', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg', country: 'USA', products: 5, status: 'Active' as const },
    { id: 'BRD-004', name: 'IKEA', logo: '', country: 'Sweden', products: 18, status: 'Active' as const },
    { id: 'BRD-005', name: 'Adidas', logo: '', country: 'Germany', products: 7, status: 'Inactive' as const },
    { id: 'BRD-006', name: 'Xiaomi', logo: '', country: 'China', products: 11, status: 'Active' as const },
  ]);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandCountry, setNewBrandCountry] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');

  const categories = Array.from(new Set(mockProducts.map(p => p.category)));

  const filteredProducts = mockProducts.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    totalProducts: mockProducts.length,
    activeProducts: mockProducts.filter(p => p.status === 'active').length,
    outOfStock: mockProducts.filter(p => p.stock === 0).length,
    totalValue: mockProducts.reduce((sum, p) => sum + (p.price * p.stock), 0),
  };

  // If we're on the menu view, show the navigation list
  if (activeTab === 'menu') {
    return (
      <div className="p-6">
        <div className="max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">E-commerce Platform Management</h1>
            <p className="text-gray-600">Manage your online store products, orders, shipments, and settings</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Products</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.totalProducts}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <Package className="size-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Active Products</p>
                  <p className="text-3xl font-bold text-green-600">{stats.activeProducts}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <Store className="size-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Out of Stock</p>
                  <p className="text-3xl font-bold text-red-600">{stats.outOfStock}</p>
                </div>
                <div className="bg-red-100 p-3 rounded-full">
                  <Package className="size-6 text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Inventory Value</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {(stats.totalValue / 1000000).toFixed(1)}M
                  </p>
                </div>
                <div className="bg-purple-100 p-3 rounded-full">
                  <Tag className="size-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Products Management */}
            <button
              onClick={() => setActiveTab('products')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-4 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Package className="size-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Products Management</h3>
                    <p className="text-sm text-gray-600">Manage product catalog, brands, and attributes</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </button>

            {/* Orders (Links to main e-commerce orders page) */}
            <button
              onClick={() => onNavigate?.('ecommerce-orders')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-green-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-4 rounded-lg group-hover:bg-green-200 transition-colors">
                    <ShoppingCart className="size-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Shop Orders</h3>
                    <p className="text-sm text-gray-600">View and manage e-commerce platform orders</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-green-600 transition-colors" />
              </div>
            </button>

            {/* Shipments (Links to Shipping & Tracking) */}
            <button
              onClick={() => onNavigate?.('shipping')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-cyan-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-cyan-100 p-4 rounded-lg group-hover:bg-cyan-200 transition-colors">
                    <Ship className="size-8 text-cyan-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Shipments</h3>
                    <p className="text-sm text-gray-600">Track international and local shipments</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-cyan-600 transition-colors" />
              </div>
            </button>

            {/* Deliveries (Links to Deliveries page) */}
            <button
              onClick={() => onNavigate?.('deliveries')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-orange-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-orange-100 p-4 rounded-lg group-hover:bg-orange-200 transition-colors">
                    <Truck className="size-8 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Deliveries</h3>
                    <p className="text-sm text-gray-600">Manage local delivery operations and tracking</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-orange-600 transition-colors" />
              </div>
            </button>

            {/* Categories */}
            <button
              onClick={() => setActiveTab('categories')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-purple-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-purple-100 p-4 rounded-lg group-hover:bg-purple-200 transition-colors">
                    <Tag className="size-8 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Categories</h3>
                    <p className="text-sm text-gray-600">Organize products into categories</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-purple-600 transition-colors" />
              </div>
            </button>

            {/* Store Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-gray-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-gray-100 p-4 rounded-lg group-hover:bg-gray-200 transition-colors">
                    <Settings className="size-8 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Store Settings</h3>
                    <p className="text-sm text-gray-600">Configure store preferences and delivery estimates</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
            </button>

            {/* Vendors */}
            <button
              onClick={() => setActiveTab('vendors')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-indigo-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-100 p-4 rounded-lg group-hover:bg-indigo-200 transition-colors">
                    <Users className="size-8 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Vendors</h3>
                    <p className="text-sm text-gray-600">Manage vendors and their profit settings</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-indigo-600 transition-colors" />
              </div>
            </button>

            {/* Product Options */}
            <button
              onClick={() => setActiveTab('product-options')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-teal-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-teal-100 p-4 rounded-lg group-hover:bg-teal-200 transition-colors">
                    <ToggleLeft className="size-8 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Product Options</h3>
                    <p className="text-sm text-gray-600">Manage global option sets: sizes, colors, bundles and more</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-teal-600 transition-colors" />
              </div>
            </button>

            {/* Product Labels */}
            <button
              onClick={() => setActiveTab('labels')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-rose-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-rose-100 p-4 rounded-lg group-hover:bg-rose-200 transition-colors">
                    <Tag className="size-8 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Product Labels</h3>
                    <p className="text-sm text-gray-600">Create and manage labels like New Arrival, Sale, Best Seller</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-rose-600 transition-colors" />
              </div>
            </button>

            {/* Brands */}
            <button
              onClick={() => setActiveTab('brands')}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-yellow-500 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-yellow-100 p-4 rounded-lg group-hover:bg-yellow-200 transition-colors">
                    <DollarSign className="size-8 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Brands</h3>
                    <p className="text-sm text-gray-600">Add and manage product brands with logos and descriptions</p>
                  </div>
                </div>
                <ChevronRight className="size-6 text-gray-400 group-hover:text-yellow-600 transition-colors" />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Return existing content for other tabs
  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header with back button */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('menu')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="size-6 text-gray-600 rotate-180" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {activeTab === 'products' ? 'Products Management' :
                 activeTab === 'categories' ? 'Categories' :
                 activeTab === 'settings' ? 'Store Settings' :
                 activeTab === 'product-options' ? 'Product Options' :
                 activeTab === 'labels' ? 'Product Labels' :
                 activeTab === 'brands' ? 'Brands' : 'Vendors'}
              </h1>
              <p className="text-gray-600">
                {activeTab === 'products' ? 'Manage your product catalog with brands and attributes' :
                 activeTab === 'categories' ? 'Organize products into categories' :
                 activeTab === 'settings' ? 'Configure your store preferences' :
                 activeTab === 'product-options' ? 'Global option sets applied to product variations' :
                 activeTab === 'labels' ? 'Create labels to highlight products in the store' :
                 activeTab === 'brands' ? 'Manage product brands displayed on the store' :
                 'Manage vendors and their profit settings'}
              </p>
            </div>
          </div>
          {activeTab === 'products' && (
            <button
              onClick={() => {
                setSelectedProduct(null);
                setShowProductModal(true);
              }}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <Plus className="size-5" />
              Add New Product
            </button>
          )}
          {activeTab === 'vendors' && (
            <button
              onClick={() => {
                setSelectedVendor(null);
                setShowVendorModal(true);
              }}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <Plus className="size-5" />
              Add New Vendor
            </button>
          )}
        </div>

        {/* Content */}
        {activeTab === 'products' ? (
          <div>
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products by name or SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 flex-wrap">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Products List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-12"></th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Product</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">SKU</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Category</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Price</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Stock</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Origin</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      {/* Thumbnail */}
                      <td className="px-4 py-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="size-11 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                        />
                      </td>
                      {/* Name + brand + description */}
                      <td className="px-4 py-3 max-w-64">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900 leading-snug">{product.name}</span>
                          {product.brand && (
                            <span className="text-xs text-blue-600 font-medium mt-0.5">{product.brand}</span>
                          )}
                          <span className="text-xs text-gray-400 mt-0.5 line-clamp-1">{product.description}</span>
                        </div>
                      </td>
                      {/* SKU */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{product.sku}</span>
                      </td>
                      {/* Category */}
                      <td className="px-4 py-3 text-gray-600 text-xs">{product.category}</td>
                      {/* Price */}
                      <td className="px-4 py-3">
                        <span className="font-bold text-blue-600 whitespace-nowrap">TSh {product.price.toLocaleString()}</span>
                      </td>
                      {/* Stock */}
                      <td className="px-4 py-3">
                        {product.stock === 0 ? (
                          <span className="text-red-600 font-semibold text-xs">Out of Stock</span>
                        ) : product.stock <= 5 ? (
                          <span className="text-orange-600 font-semibold text-xs">{product.stock} left</span>
                        ) : (
                          <span className="text-gray-700 text-xs">{product.stock} units</span>
                        )}
                      </td>
                      {/* Origin */}
                      <td className="px-4 py-3 text-gray-500 text-xs">{product.originCountry || '—'}</td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {product.status === 'active' ? (
                          <span className="bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full text-xs font-medium">Active</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full text-xs font-medium">Inactive</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelectedProduct(product); setShowProductModal(true); }}
                            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                          >
                            <Edit className="size-3.5" />Edit
                          </button>
                          <button className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProducts.length === 0 && (
                <div className="py-16 text-center text-gray-400">
                  <Package className="size-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No products found</p>
                  <p className="text-sm mt-1">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'categories' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Product Categories</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {categories.map((category) => {
                const count = mockProducts.filter(p => p.category === category).length;
                return (
                  <div key={category} className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{category}</h3>
                        <p className="text-sm text-gray-600">{count} products</p>
                      </div>
                      <button className="text-blue-600 hover:text-blue-800">
                        <Edit className="size-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-2">
                <Plus className="size-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Add Category</span>
              </button>
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Store Settings</h2>
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Store Name</label>
                <input
                  type="text"
                  defaultValue="Agiza E-commerce Store"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Store Description</label>
                <textarea
                  rows={3}
                  defaultValue="Your trusted online marketplace in Tanzania for electronics, fashion, and more."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Store Location</label>
                <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option>Dar es Salaam</option>
                  <option>Arusha</option>
                  <option>Mwanza</option>
                  <option>Dodoma</option>
                  <option>Mbeya</option>
                  <option>Tanga</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
                <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option>TSh - Tanzanian Shilling</option>
                </select>
              </div>

              {/* Estimated Delivery Setting */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="size-6 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Estimated Delivery Settings</h3>
                    <p className="text-sm text-gray-600">Configure delivery time estimates based on store location to destination city</p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Same City Delivery</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          defaultValue="1"
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-600">- </span>
                        <input
                          type="number"
                          defaultValue="2"
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 font-medium">days</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Regional Delivery</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          defaultValue="3"
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-600">- </span>
                        <input
                          type="number"
                          defaultValue="5"
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 font-medium">days</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Custom City-to-City Routes</label>
                    <div className="bg-white rounded-lg p-3 border border-gray-300">
                      <div className="flex items-center gap-3 text-sm">
                        <MapPin className="size-4 text-gray-500" />
                        <span className="text-gray-700">Dar es Salaam → Arusha:</span>
                        <span className="font-semibold text-gray-900">2-3 days</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-300">
                      <div className="flex items-center gap-3 text-sm">
                        <MapPin className="size-4 text-gray-500" />
                        <span className="text-gray-700">Dar es Salaam → Mwanza:</span>
                        <span className="font-semibold text-gray-900">4-6 days</span>
                      </div>
                    </div>
                    <button className="w-full bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
                      + Add Custom Route
                    </button>
                  </div>

                  {/* Estimation Plugin Global Config */}
                  <div className="pt-4 border-t border-blue-200">
                    <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                      <Globe className="size-4" />
                      Global Origin Rules
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white rounded-lg border border-blue-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">China Air</p>
                        <p className="text-sm font-semibold text-gray-900">7 - 12 Days</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-blue-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">USA Air</p>
                        <p className="text-sm font-semibold text-gray-900">10 - 14 Days</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-blue-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">Dubai Air</p>
                        <p className="text-sm font-semibold text-gray-900">4 - 7 Days</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-blue-100">
                        <p className="text-xs font-bold text-gray-400 uppercase">India Air</p>
                        <p className="text-sm font-semibold text-gray-900">5 - 8 Days</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between py-3 border-t border-gray-200">
                <div>
                  <p className="font-semibold text-gray-900">Enable Guest Checkout</p>
                  <p className="text-sm text-gray-600">Allow customers to checkout without creating an account</p>
                </div>
                <ToggleRight className="size-8 text-blue-600" />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <div>
                  <p className="font-semibold text-gray-900">Enable Product Reviews</p>
                  <p className="text-sm text-gray-600">Let customers leave reviews on products</p>
                </div>
                <ToggleRight className="size-8 text-blue-600" />
              </div>
              <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                Save Settings
              </button>
            </div>
          </div>
        ) : activeTab === 'product-options' ? (
          <div className="space-y-6">
            {/* Add new option set */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Add New Option Set</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Option Name *</label>
                  <input value={newOptionName} onChange={e => setNewOptionName(e.target.value)} placeholder="e.g. Shoe Size, RAM, Flavour" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type</label>
                  <select value={newOptionType} onChange={e => setNewOptionType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="size">Size</option>
                    <option value="color">Color</option>
                    <option value="bundle">Bundle</option>
                    <option value="storage">Storage</option>
                    <option value="text">Text / Other</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    if (!newOptionName.trim()) return;
                    setProductOptions(prev => [...prev, { id: `OPT-${Date.now()}`, name: newOptionName.trim(), type: newOptionType, values: [], status: 'Active' as const }]);
                    setNewOptionName('');
                  }}
                  disabled={!newOptionName.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="size-4 inline mr-1.5" />Add Option Set
                </button>
              </div>
            </div>

            {/* Option sets list */}
            <div className="space-y-4">
              {productOptions.map(opt => (
                <div key={opt.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">{opt.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono capitalize">{opt.type}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${opt.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{opt.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{opt.values.length} value{opt.values.length !== 1 ? 's' : ''}</span>
                      <button onClick={() => setProductOptions(prev => prev.filter(o => o.id !== opt.id))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete option set">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {opt.values.map((val, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-sm">
                          <span>{val}</span>
                          <button onClick={() => setProductOptions(prev => prev.map(o => o.id === opt.id ? { ...o, values: o.values.filter((_, i) => i !== idx) } : o))} className="text-gray-400 hover:text-red-500 ml-1 leading-none">×</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={optionNewValue[opt.id] ?? ''}
                        onChange={e => setOptionNewValue(prev => ({ ...prev, [opt.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (optionNewValue[opt.id] ?? '').trim()) {
                            setProductOptions(prev => prev.map(o => o.id === opt.id ? { ...o, values: [...o.values, (optionNewValue[opt.id] ?? '').trim()] } : o));
                            setOptionNewValue(prev => ({ ...prev, [opt.id]: '' }));
                          }
                        }}
                        placeholder="Add a value..."
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                      />
                      <button
                        onClick={() => {
                          const val = (optionNewValue[opt.id] ?? '').trim();
                          if (!val) return;
                          setProductOptions(prev => prev.map(o => o.id === opt.id ? { ...o, values: [...o.values, val] } : o));
                          setOptionNewValue(prev => ({ ...prev, [opt.id]: '' }));
                        }}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                      >Add</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'labels' ? (
          <div className="space-y-6">
            {/* Add new label */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Add New Label</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Label Name *</label>
                  <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="e.g. Flash Sale, Staff Pick" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Color</label>
                  <select value={newLabelColor} onChange={e => setNewLabelColor(e.target.value as LabelColor)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="blue">Blue</option>
                    <option value="red">Red</option>
                    <option value="yellow">Yellow</option>
                    <option value="purple">Purple</option>
                    <option value="orange">Orange</option>
                    <option value="green">Green</option>
                    <option value="gray">Gray</option>
                  </select>
                </div>
                <div className="flex items-center">
                  {newLabelName && <span className={`px-3 py-1 rounded-full text-xs font-bold ${labelColorMap[newLabelColor]}`}>{newLabelName}</span>}
                </div>
                <button
                  onClick={() => {
                    if (!newLabelName.trim()) return;
                    setProductLabels(prev => [...prev, { id: `LBL-${Date.now()}`, name: newLabelName.trim(), color: newLabelColor, products: 0, visible: true }]);
                    setNewLabelName('');
                  }}
                  disabled={!newLabelName.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="size-4 inline mr-1.5" />Add Label
                </button>
              </div>
            </div>

            {/* Labels grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {productLabels.map(label => (
                <div key={label.id} className="bg-white rounded-lg border border-gray-200 p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${labelColorMap[label.color]}`}>{label.name}</span>
                    <div>
                      <p className="text-xs text-gray-500">{label.products} product{label.products !== 1 ? 's' : ''}</p>
                      <p className={`text-xs font-medium mt-0.5 ${label.visible ? 'text-green-600' : 'text-gray-400'}`}>{label.visible ? 'Visible' : 'Hidden'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setProductLabels(prev => prev.map(l => l.id === label.id ? { ...l, visible: !l.visible } : l))}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title={label.visible ? 'Hide label' : 'Show label'}
                    >
                      {label.visible ? <ToggleRight className="size-5 text-blue-600" /> : <ToggleLeft className="size-5" />}
                    </button>
                    <button
                      onClick={() => setProductLabels(prev => prev.filter(l => l.id !== label.id))}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete label"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <strong>Tip:</strong> Labels appear as badges on product cards in your store. Assign labels to products from the Product edit page under Shop &amp; Discovery settings.
            </div>
          </div>
        ) : activeTab === 'brands' ? (
          <div className="space-y-6">
            {/* Add new brand */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Add New Brand</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Brand Name *</label>
                  <input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="e.g. Sony, Puma" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Country of Origin</label>
                  <input value={newBrandCountry} onChange={e => setNewBrandCountry(e.target.value)} placeholder="e.g. Japan" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Logo URL (optional)</label>
                  <input value={newBrandLogo} onChange={e => setNewBrandLogo(e.target.value)} placeholder="https://..." className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
                </div>
                <button
                  onClick={() => {
                    if (!newBrandName.trim()) return;
                    setStoreBrands(prev => [...prev, { id: `BRD-${Date.now()}`, name: newBrandName.trim(), logo: newBrandLogo.trim(), country: newBrandCountry.trim(), products: 0, status: 'Active' as const }]);
                    setNewBrandName(''); setNewBrandCountry(''); setNewBrandLogo('');
                  }}
                  disabled={!newBrandName.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="size-4 inline mr-1.5" />Add Brand
                </button>
              </div>
            </div>

            {/* Brands grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {storeBrands.map(brand => (
                <div key={brand.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {brand.logo ? (
                        <img src={brand.logo} alt={brand.name} className="size-10 object-contain rounded border border-gray-100 p-1 bg-white" />
                      ) : (
                        <div className="size-10 rounded border border-gray-100 bg-gray-50 flex items-center justify-center text-lg font-bold text-gray-400">
                          {brand.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{brand.name}</p>
                        {brand.country && <p className="text-xs text-gray-400">{brand.country}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setStoreBrands(prev => prev.map(b => b.id === brand.id ? { ...b, status: b.status === 'Active' ? 'Inactive' as const : 'Active' as const } : b))}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Toggle status"
                      >
                        {brand.status === 'Active' ? <ToggleRight className="size-5 text-blue-600" /> : <ToggleLeft className="size-5" />}
                      </button>
                      <button
                        onClick={() => setStoreBrands(prev => prev.filter(b => b.id !== brand.id))}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete brand"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{brand.products} product{brand.products !== 1 ? 's' : ''}</span>
                    <span className={`font-medium px-2 py-0.5 rounded-full ${brand.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{brand.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* Search */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search vendors by name..."
                  value={vendorSearchTerm}
                  onChange={(e) => setVendorSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Vendors Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Vendor</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Profit Agreement</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Products</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Total Sales</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mockVendors
                      .filter(vendor =>
                        vendor.name.toLowerCase().includes(vendorSearchTerm.toLowerCase())
                      )
                      .map(vendor => (
                        <tr key={vendor.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-semibold text-gray-900">{vendor.name}</div>
                              <div className="text-sm text-gray-500">{vendor.id}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm">
                              <div className="text-gray-900">{vendor.email}</div>
                              <div className="text-gray-500">{vendor.phone}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{vendor.location}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {vendor.profitType === 'fixed' ? (
                                <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded">
                                  <DollarSign className="size-4" />
                                  <span className="text-sm font-semibold">TSh {vendor.profitValue.toLocaleString()}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  <Percent className="size-4" />
                                  <span className="text-sm font-semibold">{vendor.profitValue}%</span>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">
                                {vendor.profitScope === 'all' ? '(All Products)' : '(Per Product)'}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedVendor(vendor);
                                setShowProfitModal(true);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
                            >
                              <Edit className="size-3" />
                              Edit Agreement
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-gray-900">{vendor.productsCount}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-gray-900">TSh {(vendor.totalSales / 1000000).toFixed(1)}M</div>
                            <div className="text-xs text-gray-500">Since {vendor.joinedDate}</div>
                          </td>
                          <td className="px-6 py-4">
                            {vendor.status === 'active' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedVendor(vendor);
                                  setShowVendorModal(true);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Edit className="size-5" />
                              </button>
                              <button className="text-red-600 hover:text-red-800">
                                <Trash2 className="size-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Product Modal */}
        {showProductModal && (
          <ProductEditModal
            product={selectedProduct}
            categories={categories}
            onClose={() => setShowProductModal(false)}
          />
        )}

        {/* Vendor Modal */}
        {showVendorModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowVendorModal(false)}>
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </h2>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Vendor Name</label>
                  <input
                    type="text"
                    defaultValue={selectedVendor?.name}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      defaultValue={selectedVendor?.email}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                    <input
                      type="text"
                      defaultValue={selectedVendor?.phone}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                    <input
                      type="text"
                      defaultValue={selectedVendor?.location}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                    <select
                      defaultValue={selectedVendor?.status}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Profit Type</label>
                    <select
                      defaultValue={selectedVendor?.profitType}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="percent">Percent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Profit Value</label>
                    <input
                      type="number"
                      defaultValue={selectedVendor?.profitValue}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Profit Scope</label>
                    <select
                      defaultValue={selectedVendor?.profitScope}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="all">All</option>
                      <option value="per_product">Per Product</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Products Count</label>
                    <input
                      type="number"
                      defaultValue={selectedVendor?.productsCount}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Total Sales</label>
                    <input
                      type="number"
                      defaultValue={selectedVendor?.totalSales}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Joined Date</label>
                    <input
                      type="date"
                      defaultValue={selectedVendor?.joinedDate}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    {selectedVendor ? 'Update Vendor' : 'Add Vendor'}
                  </button>
                  <button
                    onClick={() => setShowVendorModal(false)}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profit Modal */}
        {showProfitModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowProfitModal(false)}>
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-2xl font-bold text-gray-900">Edit Profit Agreement</h2>
                <p className="text-sm text-gray-600 mt-1">Configure profit settings for {selectedVendor?.name}</p>
              </div>

              <div className="p-6 space-y-6">
                {/* Vendor Info Display */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Vendor</p>
                      <p className="font-semibold text-gray-900">{selectedVendor?.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="font-semibold text-gray-900">{selectedVendor?.location}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Products</p>
                      <p className="font-semibold text-gray-900">{selectedVendor?.productsCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Sales</p>
                      <p className="font-semibold text-gray-900">TSh {selectedVendor?.totalSales.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Profit Settings */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Profit Agreement Settings</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Profit Type
                        <span className="text-xs text-gray-500 font-normal ml-2">(How profit is calculated)</span>
                      </label>
                      <select
                        defaultValue={selectedVendor?.profitType}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="fixed">Fixed Amount (TSh)</option>
                        <option value="percent">Percentage (%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Profit Value
                        <span className="text-xs text-gray-500 font-normal ml-2">(Amount or percentage)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          defaultValue={selectedVendor?.profitValue}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                          {selectedVendor?.profitType === 'fixed' ? 'TSh' : '%'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Profit Scope
                      <span className="text-xs text-gray-500 font-normal ml-2">(How profit is applied)</span>
                    </label>
                    <select
                      defaultValue={selectedVendor?.profitScope}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="all">Apply to All Products</option>
                      <option value="per_product">Configure Per Product</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedVendor?.profitScope === 'all' 
                        ? 'This profit rate will be applied uniformly to all vendor products'
                        : 'Each product can have its own custom profit setting'}
                    </p>
                  </div>
                </div>

                {/* Example Calculation */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Example Calculation</p>
                  <div className="text-sm text-blue-800">
                    {selectedVendor?.profitType === 'fixed' ? (
                      <p>For a product sold at TSh 100,000, your profit will be <span className="font-semibold">TSh {selectedVendor?.profitValue.toLocaleString()}</span> (fixed amount per sale)</p>
                    ) : (
                      <p>For a product sold at TSh 100,000, your profit will be <span className="font-semibold">TSh {(100000 * (selectedVendor?.profitValue || 0) / 100).toLocaleString()}</span> ({selectedVendor?.profitValue}% of sale price)</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    Update Profit Agreement
                  </button>
                  <button
                    onClick={() => setShowProfitModal(false)}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}