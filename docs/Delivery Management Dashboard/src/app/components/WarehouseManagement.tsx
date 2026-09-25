import { useState } from 'react';
import {
  Warehouse,
  Plus,
  Search,
  MapPin,
  Globe,
  Building2,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  Phone,
  Package,
  Store,
  Layers,
  AlertCircle,
  ChevronDown
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WarehouseItem {
  id: string;
  name: string;
  type: 'Consolidation' | 'Pickup Point' | 'Fulfillment' | 'Shop';
  country: string;
  city: string;
  address: string;
  contactPerson: string;
  phone: string;
  email: string;
  capacity: string;
  status: 'Active' | 'Inactive' | 'Full';
  lastAudit: string;
}

interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  warehouseId: string;
  warehouseName: string;
  location: string; // shelf/bin code
  qty: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Reserved';
  origin: string;
  lastUpdated: string;
}

interface ShopItem {
  sku: string;
  name: string;
  category: string;
  shopLocation: string;
  shelfPosition: string;
  qty: number;
  price: number;
  status: 'Listed' | 'Hidden' | 'Out of Stock';
  lastUpdated: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

export const allWarehouses: WarehouseItem[] = [
  { id: 'WH-INT-001', name: 'Guangzhou Consolidation Hub', type: 'Consolidation', country: 'China', city: 'Guangzhou', address: 'No. 123 Baiyun District, Guangzhou, Guangdong', contactPerson: 'Chen Wei', phone: '+86 20 1234 5678', email: 'gz-hub@agiza.co.tz', capacity: '85%', status: 'Active', lastAudit: '2024-02-10' },
  { id: 'WH-INT-002', name: 'Dubai Jebel Ali Center', type: 'Consolidation', country: 'Dubai (UAE)', city: 'Dubai', address: 'Jebel Ali Free Zone, South 1, Dubai', contactPerson: 'Ahmed Hassan', phone: '+971 4 881 1234', email: 'dxb-hub@agiza.co.tz', capacity: '60%', status: 'Active', lastAudit: '2024-01-25' },
  { id: 'WH-INT-003', name: 'Mumbai Export Hub', type: 'Consolidation', country: 'India', city: 'Mumbai', address: 'Andheri East, Mumbai, Maharashtra', contactPerson: 'Rajesh Kumar', phone: '+91 22 9876 5432', email: 'mum-hub@agiza.co.tz', capacity: '45%', status: 'Active', lastAudit: '2024-02-01' },
  { id: 'WH-INT-004', name: 'London Gateway Center', type: 'Consolidation', country: 'UK', city: 'London', address: 'Stanford-le-Hope, London', contactPerson: 'Sarah Jones', phone: '+44 20 7946 0000', email: 'uk-hub@agiza.co.tz', capacity: '30%', status: 'Active', lastAudit: '2024-01-15' },
  { id: 'WH-INT-005', name: 'New Jersey East Coast Hub', type: 'Consolidation', country: 'USA', city: 'New Jersey', address: 'Elizabeth, NJ 07201, USA', contactPerson: 'John Smith', phone: '+1 201 555 0123', email: 'nj-hub@agiza.co.tz', capacity: '75%', status: 'Active', lastAudit: '2024-02-05' },
  { id: 'WH-TZ-001', name: 'Dar es Salaam Central Warehouse', type: 'Fulfillment', country: 'Tanzania', city: 'Dar es Salaam', address: 'Plot 45, Nyerere Road, Vingunguti', contactPerson: 'Juma Ramadhani', phone: '+255 712 000 111', email: 'dar-main@agiza.co.tz', capacity: '92%', status: 'Full', lastAudit: '2024-02-12' },
  { id: 'WH-TZ-002', name: 'Arusha Pickup Point', type: 'Pickup Point', country: 'Tanzania', city: 'Arusha', address: 'Sokoine Road, Opposite Clock Tower', contactPerson: 'Mary Mollel', phone: '+255 754 222 333', email: 'arusha-pick@agiza.co.tz', capacity: '20%', status: 'Active', lastAudit: '2024-02-08' },
  { id: 'WH-TZ-003', name: 'Mwanza Lakeside Center', type: 'Fulfillment', country: 'Tanzania', city: 'Mwanza', address: 'Kenyatta Road, Ilemela District', contactPerson: 'Peter Kamau', phone: '+255 788 444 555', email: 'mwanza-hub@agiza.co.tz', capacity: '55%', status: 'Active', lastAudit: '2024-01-20' },
  { id: 'WH-SHOP-001', name: 'Agiza Shop — Dar es Salaam', type: 'Shop', country: 'Tanzania', city: 'Dar es Salaam', address: 'Kariakoo Market Complex, Ground Floor', contactPerson: 'Amina Suleiman', phone: '+255 765 000 222', email: 'shop-dar@agiza.co.tz', capacity: '40%', status: 'Active', lastAudit: '2024-02-11' },
  { id: 'WH-SHOP-002', name: 'Agiza Shop — Mwanza', type: 'Shop', country: 'Tanzania', city: 'Mwanza', address: 'Pamba Road, Mwanza City Centre', contactPerson: 'Grace Shimba', phone: '+255 765 000 333', email: 'shop-mwanza@agiza.co.tz', capacity: '25%', status: 'Active', lastAudit: '2024-02-09' },
];

const inventoryItems: InventoryItem[] = [
  { sku: 'ELEC-SAM-A54', name: 'Samsung Galaxy A54 5G', category: 'Electronics', warehouseId: 'WH-TZ-001', warehouseName: 'Dar es Salaam Central Warehouse', location: 'A-12-3', qty: 15, status: 'In Stock', origin: 'Dubai', lastUpdated: '2026-09-10' },
  { sku: 'ELEC-APPLE-MBA-M2', name: 'MacBook Air M2', category: 'Electronics', warehouseId: 'WH-TZ-001', warehouseName: 'Dar es Salaam Central Warehouse', location: 'A-05-1', qty: 3, status: 'Low Stock', origin: 'China', lastUpdated: '2026-09-12' },
  { sku: 'FASH-NIKE-AM270', name: 'Nike Air Max 270', category: 'Fashion', warehouseId: 'WH-TZ-001', warehouseName: 'Dar es Salaam Central Warehouse', location: 'C-08-2', qty: 8, status: 'In Stock', origin: 'USA', lastUpdated: '2026-09-08' },
  { sku: 'ELEC-DJI-MINI4', name: 'DJI Mini 4 Pro Drone', category: 'Electronics', warehouseId: 'WH-INT-001', warehouseName: 'Guangzhou Consolidation Hub', location: 'DR-01-4', qty: 6, status: 'Reserved', origin: 'China', lastUpdated: '2026-09-14' },
  { sku: 'HOME-AIRFRY-XL', name: 'Air Fryer XL 5.5L', category: 'Home & Garden', warehouseId: 'WH-TZ-003', warehouseName: 'Mwanza Lakeside Center', location: 'B-03-1', qty: 4, status: 'Low Stock', origin: 'China', lastUpdated: '2026-09-09' },
  { sku: 'ELEC-SAM-TV65', name: 'Samsung 65" QLED TV', category: 'Electronics', warehouseId: 'WH-INT-002', warehouseName: 'Dubai Jebel Ali Center', location: 'TV-02-2', qty: 2, status: 'Reserved', origin: 'Dubai', lastUpdated: '2026-09-13' },
  { sku: 'HOME-CHAIR-ERG', name: 'Ergonomic Office Chair', category: 'Home & Office', warehouseId: 'WH-TZ-001', warehouseName: 'Dar es Salaam Central Warehouse', location: 'D-11-5', qty: 0, status: 'Out of Stock', origin: 'China', lastUpdated: '2026-09-01' },
  { sku: 'ELEC-IPHONE-15PM', name: 'iPhone 15 Pro Max 256GB', category: 'Electronics', warehouseId: 'WH-TZ-002', warehouseName: 'Arusha Pickup Point', location: 'P-01-2', qty: 2, status: 'In Stock', origin: 'Dubai', lastUpdated: '2026-09-11' },
];

const shopItems: ShopItem[] = [
  { sku: 'ELEC-SAM-A54', name: 'Samsung Galaxy A54 5G', category: 'Electronics', shopLocation: 'Agiza Shop — Dar es Salaam', shelfPosition: 'Electronics Wall — Bay 3', qty: 5, price: 850000, status: 'Listed', lastUpdated: '2026-09-10' },
  { sku: 'FASH-NIKE-AM270', name: 'Nike Air Max 270', category: 'Fashion', shopLocation: 'Agiza Shop — Dar es Salaam', shelfPosition: 'Footwear Rack — Row 2', qty: 3, price: 180000, status: 'Listed', lastUpdated: '2026-09-08' },
  { sku: 'HOME-AIRFRY-XL', name: 'Air Fryer XL 5.5L', category: 'Home & Garden', shopLocation: 'Agiza Shop — Mwanza', shelfPosition: 'Kitchen Appliances — Bay 1', qty: 2, price: 320000, status: 'Listed', lastUpdated: '2026-09-09' },
  { sku: 'ELEC-APPLE-MBA-M2', name: 'MacBook Air M2', category: 'Electronics', shopLocation: 'Agiza Shop — Dar es Salaam', shelfPosition: 'Laptops — Display Cabinet', qty: 0, price: 2500000, status: 'Out of Stock', lastUpdated: '2026-09-12' },
  { sku: 'HOME-CHAIR-ERG', name: 'Ergonomic Office Chair', category: 'Home & Office', shopLocation: 'Agiza Shop — Dar es Salaam', shelfPosition: 'Office Section — Floor Display', qty: 1, price: 550000, status: 'Hidden', lastUpdated: '2026-09-01' },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inv_status_colors: Record<string, string> = {
  'In Stock': 'bg-green-100 text-green-700',
  'Low Stock': 'bg-orange-100 text-orange-700',
  'Out of Stock': 'bg-red-100 text-red-700',
  'Reserved': 'bg-blue-100 text-blue-700',
  'Listed': 'bg-green-100 text-green-700',
  'Hidden': 'bg-gray-100 text-gray-500',
};

const whTypeColor: Record<string, string> = {
  'Consolidation': 'bg-indigo-100 text-indigo-700',
  'Pickup Point': 'bg-cyan-100 text-cyan-700',
  'Fulfillment': 'bg-amber-100 text-amber-700',
  'Shop': 'bg-purple-100 text-purple-700',
};

// ─── WarehouseManagement ──────────────────────────────────────────────────────

export function WarehouseManagement() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>(allWarehouses);
  const [activeTab, setActiveTab] = useState<'warehouses' | 'inventory' | 'shop'>('warehouses');
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('All');
  const [whTypeFilter, setWhTypeFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState<Partial<WarehouseItem>>({ type: 'Consolidation', status: 'Active', country: 'Tanzania' });

  const countries = ['All', 'China', 'USA', 'UK', 'Dubai (UAE)', 'India', 'Tanzania'];

  const filteredWarehouses = warehouses.filter(wh => {
    const q = searchTerm.toLowerCase();
    const matchSearch = wh.name.toLowerCase().includes(q) || wh.city.toLowerCase().includes(q) || wh.id.toLowerCase().includes(q);
    const matchCountry = countryFilter === 'All' || wh.country === countryFilter;
    const matchType = whTypeFilter === 'All' || wh.type === whTypeFilter;
    return matchSearch && matchCountry && matchType;
  });

  const filteredInventory = inventoryItems.filter(i => {
    const q = searchTerm.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.warehouseName.toLowerCase().includes(q) || i.location.toLowerCase().includes(q);
  });

  const filteredShop = shopItems.filter(i => {
    const q = searchTerm.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.shopLocation.toLowerCase().includes(q);
  });

  const handleAddWarehouse = () => {
    const id = `WH-${newWarehouse.country === 'Tanzania' ? 'TZ' : 'INT'}-${String(warehouses.length + 1).padStart(3, '0')}`;
    setWarehouses([{ id, name: newWarehouse.name || 'New Warehouse', type: newWarehouse.type as any || 'Consolidation', country: newWarehouse.country || 'Tanzania', city: newWarehouse.city || '', address: newWarehouse.address || '', contactPerson: newWarehouse.contactPerson || '', phone: newWarehouse.phone || '', email: '', capacity: '0%', status: 'Active', lastAudit: new Date().toISOString().split('T')[0] }, ...warehouses]);
    setShowAddModal(false);
    setNewWarehouse({ type: 'Consolidation', status: 'Active', country: 'Tanzania' });
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Warehouse className="size-7 text-blue-600" />
              Warehouse & Pick Up Points
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage consolidation hubs, fulfillment centers, pickup points, and shop floors</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium text-sm">
            <Plus className="size-4" />Add Warehouse / Location
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {[
            { id: 'warehouses', label: 'Warehouses & Locations', icon: Warehouse, count: warehouses.length },
            { id: 'inventory', label: 'Inventory', icon: Package, count: inventoryItems.length },
            { id: 'shop', label: 'Shop Floor', icon: Store, count: shopItems.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id as typeof activeTab); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <t.icon className="size-4" />{t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Stats row (warehouses tab) */}
        {activeTab === 'warehouses' && (
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Consolidation Hubs', value: warehouses.filter(w => w.type === 'Consolidation').length, color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Fulfillment Centers', value: warehouses.filter(w => w.type === 'Fulfillment').length, color: 'text-amber-600 bg-amber-50' },
              { label: 'Pickup Points', value: warehouses.filter(w => w.type === 'Pickup Point').length, color: 'text-cyan-600 bg-cyan-50' },
              { label: 'Shop Locations', value: warehouses.filter(w => w.type === 'Shop').length, color: 'text-purple-600 bg-purple-50' },
              { label: 'Pending Audits', value: 2, color: 'text-orange-600 bg-orange-50' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-4 border border-gray-100 ${s.color.split(' ')[1]}`}>
                <p className={`text-2xl font-bold ${s.color.split(' ')[0]}`}>{s.value}</p>
                <p className="text-xs text-gray-600 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search + filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'warehouses' ? 'Search by name, city, ID...' : activeTab === 'inventory' ? 'Search by name, SKU, location...' : 'Search shop items...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          {activeTab === 'warehouses' && (
            <>
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                {countries.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={whTypeFilter} onChange={e => setWhTypeFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="All">All Types</option>
                <option>Consolidation</option><option>Fulfillment</option><option>Pickup Point</option><option>Shop</option>
              </select>
            </>
          )}
        </div>

        {/* ── WAREHOUSES TABLE ── */}
        {activeTab === 'warehouses' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Warehouse', 'Type', 'Location', 'Contact', 'Capacity', 'Status', 'Last Audit', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWarehouses.map(wh => (
                  <tr key={wh.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{wh.name}</p>
                      <span className="font-mono text-xs text-gray-400">{wh.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${whTypeColor[wh.type]}`}>{wh.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-gray-800">{wh.city}, {wh.country}</p>
                          <p className="text-xs text-gray-400 truncate max-w-40">{wh.address}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-800">{wh.contactPerson}</p>
                      <p className="text-xs text-gray-400">{wh.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-20">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">{wh.capacity}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${parseInt(wh.capacity) > 80 ? 'bg-red-500' : parseInt(wh.capacity) > 50 ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: wh.capacity }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${wh.status === 'Active' ? 'bg-green-100 text-green-800' : wh.status === 'Full' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                        <CheckCircle2 className="size-3" />{wh.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{wh.lastAudit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Edit className="size-4 text-gray-400 hover:text-blue-600" /></button>
                        <button className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="size-4 text-gray-400 hover:text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── INVENTORY TAB ── */}
        {activeTab === 'inventory' && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-5">
              {[
                { label: 'Total SKUs', value: inventoryItems.length, color: 'bg-blue-50 text-blue-700' },
                { label: 'In Stock', value: inventoryItems.filter(i => i.status === 'In Stock').length, color: 'bg-green-50 text-green-700' },
                { label: 'Low Stock', value: inventoryItems.filter(i => i.status === 'Low Stock').length, color: 'bg-orange-50 text-orange-700' },
                { label: 'Out of Stock', value: inventoryItems.filter(i => i.status === 'Out of Stock').length, color: 'bg-red-50 text-red-700' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 border border-gray-100 ${s.color.split(' ')[0]}`}>
                  <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{s.value}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['SKU', 'Product', 'Category', 'Warehouse Location', 'Shelf / Bin', 'Qty', 'Origin', 'Status', 'Updated'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInventory.map(item => (
                    <tr key={item.sku} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{item.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-44 truncate">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{item.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-gray-400 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-800">{item.warehouseName}</p>
                            <p className="text-xs text-gray-400 font-mono">{item.warehouseId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700 font-semibold">{item.location}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${item.qty === 0 ? 'text-red-600' : item.qty <= 3 ? 'text-orange-600' : 'text-gray-900'}`}>{item.qty}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{item.origin}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv_status_colors[item.status] || 'bg-gray-100 text-gray-500'}`}>{item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{item.lastUpdated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SHOP FLOOR TAB ── */}
        {activeTab === 'shop' && (
          <div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5 flex items-start gap-3">
              <Store className="size-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-purple-800">Shop floor items are products displayed in physical Agiza shop locations. Stock here is separate from warehouse inventory.</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['SKU', 'Product', 'Category', 'Shop Location', 'Shelf Position', 'Qty', 'Price (TSh)', 'Status', 'Updated'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredShop.map(item => (
                    <tr key={item.sku} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{item.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-44 truncate">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{item.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Store className="size-3.5 text-purple-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-800">{item.shopLocation}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{item.shelfPosition}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${item.qty === 0 ? 'text-red-600' : 'text-gray-900'}`}>{item.qty}</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-700">{item.price.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv_status_colors[item.status] || 'bg-gray-100 text-gray-500'}`}>{item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{item.lastUpdated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Warehouse Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">Add New Warehouse / Location</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-lg">
                <Plus className="size-5 rotate-45" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
                <input type="text" placeholder="e.g. Shanghai Consolidation Hub" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={newWarehouse.name || ''} onChange={e => setNewWarehouse({ ...newWarehouse, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Type *</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={newWarehouse.type} onChange={e => setNewWarehouse({ ...newWarehouse, type: e.target.value as any })}>
                  <option value="Consolidation">Consolidation Hub</option>
                  <option value="Pickup Point">Pickup Point</option>
                  <option value="Fulfillment">Fulfillment Center</option>
                  <option value="Shop">Shop Location</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Country *</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={newWarehouse.country} onChange={e => setNewWarehouse({ ...newWarehouse, country: e.target.value })}>
                  <option>China</option><option>USA</option><option>UK</option><option>Dubai (UAE)</option><option>India</option><option>Tanzania</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">City *</label>
                <input type="text" placeholder="e.g. Guangzhou" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={newWarehouse.city || ''} onChange={e => setNewWarehouse({ ...newWarehouse, city: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Person</label>
                <input type="text" placeholder="Name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={newWarehouse.contactPerson || ''} onChange={e => setNewWarehouse({ ...newWarehouse, contactPerson: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Address</label>
                <textarea rows={2} placeholder="Street name, building, unit..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" value={newWarehouse.address || ''} onChange={e => setNewWarehouse({ ...newWarehouse, address: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <input type="text" placeholder="+86 / +255..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={newWarehouse.phone || ''} onChange={e => setNewWarehouse({ ...newWarehouse, phone: e.target.value })} />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={handleAddWarehouse} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Add Location</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
