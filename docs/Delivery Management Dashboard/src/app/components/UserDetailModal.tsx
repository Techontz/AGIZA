import { X, Tag as TagIcon, TrendingUp, Plus, Trash2, ShoppingBag, RotateCcw, MessageSquare, DollarSign, Package, Clock, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export interface UserTag {
  id: string;
  label: string;
  type: 'manual' | 'system';
  createdAt: string;
}

export interface UserCategory {
  id: string;
  label: string;
  confidence: number;
}

interface UserDetailModalProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    joinedDate: string;
    totalOrders?: number;
    tags?: UserTag[];
    categories?: UserCategory[];
  };
  onClose: () => void;
  onUpdateTags: (userId: string, tags: UserTag[]) => void;
}

// ─── Mock order data per customer ────────────────────────────────────────────

const mockOrderHistory: Record<string, OrderRecord[]> = {
  'CUST-001': [
    { id: 'ORD-4421', type: 'International', date: '2026-09-10', product: 'DJI Mini 4 Pro Drone', category: 'Electronics', subcategory: 'Drones', amount: 2850000, status: 'Delivered', origin: 'China' },
    { id: 'ORD-4388', type: 'International', date: '2026-08-22', product: 'Samsung 65" QLED TV', category: 'Electronics', subcategory: 'TVs', amount: 4200000, status: 'Delivered', origin: 'Dubai' },
    { id: 'ORD-4210', type: 'E-commerce', date: '2026-07-15', product: 'Nike Air Max 270 (x2)', category: 'Fashion', subcategory: 'Shoes', amount: 360000, status: 'Delivered', origin: 'Tanzania' },
    { id: 'ORD-4050', type: 'International', date: '2026-06-01', product: 'MacBook Air M2', category: 'Electronics', subcategory: 'Laptops', amount: 2500000, status: 'Delivered', origin: 'China' },
    { id: 'ORD-3980', type: 'Local Delivery', date: '2026-05-14', product: 'Office Chair (Ergonomic)', category: 'Home & Office', subcategory: 'Furniture', amount: 550000, status: 'Delivered', origin: 'Dar es Salaam' },
  ],
  'CUST-002': [
    { id: 'ORD-4401', type: 'E-commerce', date: '2026-09-05', product: 'iPhone 15 Pro Max', category: 'Electronics', subcategory: 'Smartphones', amount: 3800000, status: 'Processing', origin: 'Tanzania' },
    { id: 'ORD-4310', type: 'International', date: '2026-08-01', product: 'Air Fryer XL', category: 'Home & Garden', subcategory: 'Kitchen', amount: 320000, status: 'Delivered', origin: 'China' },
    { id: 'ORD-4200', type: 'Local Delivery', date: '2026-07-10', product: 'Water Dispenser', category: 'Home & Garden', subcategory: 'Appliances', amount: 280000, status: 'Delivered', origin: 'Dar es Salaam' },
  ],
  'CUST-004': [
    { id: 'ORD-4430', type: 'International', date: '2026-09-12', product: 'Industrial Generator 15KVA', category: 'Machinery', subcategory: 'Power Equipment', amount: 18500000, status: 'Shipping', origin: 'China' },
    { id: 'ORD-4400', type: 'International', date: '2026-09-01', product: 'Solar Panels (20 units)', category: 'Electronics', subcategory: 'Solar', amount: 9200000, status: 'Delivered', origin: 'China' },
    { id: 'ORD-4350', type: 'International', date: '2026-08-15', product: 'Welding Machine Set', category: 'Machinery', subcategory: 'Tools', amount: 2100000, status: 'Delivered', origin: 'China' },
    { id: 'ORD-4290', type: 'E-commerce', date: '2026-07-20', product: 'Safety Helmets (50 pcs)', category: 'Machinery', subcategory: 'Safety', amount: 750000, status: 'Delivered', origin: 'Tanzania' },
  ],
};

const mockReturns: Record<string, ReturnRecord[]> = {
  'CUST-001': [
    { id: 'RET-112', orderId: 'ORD-3801', date: '2026-04-10', product: 'Bluetooth Speaker', amount: 180000, reason: 'Defective unit — no sound from left channel', status: 'Refunded' },
  ],
  'CUST-004': [
    { id: 'RET-098', orderId: 'ORD-4100', date: '2026-07-05', product: 'Electric Drill Set', amount: 420000, reason: 'Wrong voltage — received 110V instead of 220V', status: 'Replaced' },
  ],
};

const mockQuotations: Record<string, QuotationRecord[]> = {
  'CUST-001': [
    { id: 'QUO-038', date: '2026-09-14', product: 'DJI Avata 2 FPV Drone', category: 'Electronics', status: 'Unanswered', message: "How much for the DJI Avata 2 with shipping to Dar es Salaam? Need it in 2 weeks." },
    { id: 'QUO-029', date: '2026-09-01', product: 'Studio Lighting Kit (3-point)', category: 'Photography', status: 'Quoted', message: "Looking for a full studio lighting kit for product photography." },
  ],
  'CUST-002': [
    { id: 'QUO-041', date: '2026-09-15', product: 'Samsung Galaxy S25 Ultra', category: 'Electronics', status: 'Unanswered', message: "Is the S25 Ultra available? What is the latest price?" },
  ],
  'CUST-004': [
    { id: 'QUO-035', date: '2026-09-10', product: 'Concrete Mixer 500L', category: 'Machinery', status: 'Unanswered', message: "Need a quote for 2 units of 500L concrete mixers from China. Sea freight." },
    { id: 'QUO-030', date: '2026-08-28', product: 'Backup Generator 30KVA', category: 'Machinery', status: 'Quoted', message: "Requesting price for 30KVA generator, budget around TSh 30M." },
  ],
};

interface OrderRecord {
  id: string;
  type: string;
  date: string;
  product: string;
  category: string;
  subcategory: string;
  amount: number;
  status: string;
  origin: string;
}

interface ReturnRecord {
  id: string;
  orderId: string;
  date: string;
  product: string;
  amount: number;
  reason: string;
  status: string;
}

interface QuotationRecord {
  id: string;
  date: string;
  product: string;
  category: string;
  status: string;
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  Delivered: 'bg-green-100 text-green-700',
  Processing: 'bg-blue-100 text-blue-700',
  Shipping: 'bg-indigo-100 text-indigo-700',
  Cancelled: 'bg-red-100 text-red-700',
  Refunded: 'bg-orange-100 text-orange-700',
  Replaced: 'bg-purple-100 text-purple-700',
  Unanswered: 'bg-red-100 text-red-700',
  Quoted: 'bg-green-100 text-green-700',
};

const typeColors: Record<string, string> = {
  International: 'bg-blue-50 text-blue-700',
  'E-commerce': 'bg-purple-50 text-purple-700',
  'Local Delivery': 'bg-teal-50 text-teal-700',
};

const Badge = ({ label, className }: { label: string; className: string }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>
);

const clientValueLabel = (totalOrders: number, totalSpend: number) => {
  if (totalOrders === 0) return { label: 'Curious Client', color: 'bg-gray-100 text-gray-600' };
  if (totalOrders < 3) return { label: 'Customer', color: 'bg-blue-100 text-blue-700' };
  if (totalSpend >= 10_000_000) return { label: 'High Value Client', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Repeating Customer', color: 'bg-green-100 text-green-700' };
};

// ─── Main component ───────────────────────────────────────────────────────────

export function UserDetailModal({ user, onClose, onUpdateTags }: UserDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'returns' | 'quotations' | 'interests'>('overview');
  const [newTagLabel, setNewTagLabel] = useState('');
  const [currentTags, setCurrentTags] = useState<UserTag[]>(user.tags || []);

  const orders = mockOrderHistory[user.id] || [];
  const returns = mockReturns[user.id] || [];
  const quotations = mockQuotations[user.id] || [];

  const totalSpend = orders.reduce((s, o) => s + o.amount, 0);
  const unansweredCount = quotations.filter(q => q.status === 'Unanswered').length;
  const clientValue = clientValueLabel(user.totalOrders || 0, totalSpend);

  // Category interest aggregation from real orders
  const categorySpend: Record<string, number> = {};
  orders.forEach(o => {
    categorySpend[o.category] = (categorySpend[o.category] || 0) + o.amount;
  });
  const topCategories = Object.entries(categorySpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const handleAddTag = () => {
    if (!newTagLabel.trim()) return;
    const newTag: UserTag = { id: `tag-${Date.now()}`, label: newTagLabel.trim().toLowerCase(), type: 'manual', createdAt: new Date().toISOString() };
    const updated = [...currentTags, newTag];
    setCurrentTags(updated);
    onUpdateTags(user.id, updated);
    setNewTagLabel('');
  };

  const handleRemoveTag = (tagId: string) => {
    const updated = currentTags.filter(t => t.id !== tagId);
    setCurrentTags(updated);
    onUpdateTags(user.id, updated);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'orders', label: `Orders (${orders.length})` },
    { id: 'returns', label: `Returns (${returns.length})` },
    { id: 'quotations', label: `Quotations${unansweredCount > 0 ? ` · ${unansweredCount} unanswered` : ''}` },
    { id: 'interests', label: 'Interests & Tags' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="size-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${clientValue.color}`}>{clientValue.label}</span>
                {unansweredCount > 0 && (
                  <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">{unansweredCount} unanswered</span>
                )}
              </div>
              <p className="text-sm text-gray-500">{user.email} · {user.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6 flex gap-0 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-5">
              {/* KPI row */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Total Orders', value: user.totalOrders || orders.length, icon: ShoppingBag, color: 'bg-blue-50 text-blue-600' },
                  { label: 'Total Spent', value: `TSh ${totalSpend.toLocaleString()}`, icon: DollarSign, color: 'bg-green-50 text-green-600' },
                  { label: 'Returns', value: returns.length, icon: RotateCcw, color: 'bg-orange-50 text-orange-600' },
                  { label: 'Unanswered Quotes', value: unansweredCount, icon: MessageSquare, color: unansweredCount > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${color}`}><Icon className="size-4" /></div>
                    <div>
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-lg font-bold text-gray-900">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Profile fields */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  ['Customer ID', user.id],
                  ['Status', user.status],
                  ['Member Since', new Date(user.joinedDate).toLocaleDateString()],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">{k}</p>
                    <p className="text-sm font-semibold text-gray-900 capitalize">{v}</p>
                  </div>
                ))}
              </div>

              {/* Recent orders preview */}
              {orders.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Recent Orders</h3>
                    <button onClick={() => setActiveTab('orders')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">View all <ChevronRight className="size-3" /></button>
                  </div>
                  <div className="space-y-2">
                    {orders.slice(0, 3).map(o => (
                      <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Package className="size-4 text-gray-400 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{o.product}</p>
                            <p className="text-xs text-gray-400">{o.id} · {o.date}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-800">TSh {o.amount.toLocaleString()}</span>
                          <Badge label={o.status} className={statusColors[o.status] || 'bg-gray-100 text-gray-600'} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unanswered quotations alert */}
              {unansweredCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="size-4 text-red-600" />
                    <p className="text-sm font-semibold text-red-700">{unansweredCount} Unanswered Quotation{unansweredCount > 1 ? 's' : ''}</p>
                  </div>
                  {quotations.filter(q => q.status === 'Unanswered').map(q => (
                    <div key={q.id} className="bg-white border border-red-100 rounded-lg px-3 py-2 mb-2 last:mb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700">{q.product}</span>
                        <span className="text-xs text-gray-400">{q.date}</span>
                      </div>
                      <p className="text-xs text-gray-600 italic">"{q.message}"</p>
                    </div>
                  ))}
                  <button onClick={() => setActiveTab('quotations')} className="mt-2 text-xs text-red-600 font-semibold hover:underline">Respond now →</button>
                </div>
              )}

              {/* Top spend categories */}
              {topCategories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Spending Categories</h3>
                  <div className="space-y-2">
                    {topCategories.map(([cat, spend]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 w-32 truncate">{cat}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (spend / totalSpend) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-28 text-right">TSh {spend.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Order History ── */}
          {activeTab === 'orders' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">All Orders — {user.name}</h3>
                <span className="text-sm text-gray-500">Total spent: <span className="font-bold text-gray-800">TSh {totalSpend.toLocaleString()}</span></span>
              </div>
              {orders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <ShoppingBag className="size-10 mx-auto mb-3 opacity-30" />
                  <p>No orders yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Order ID', 'Date', 'Product', 'Category', 'Type', 'Amount', 'Status'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 pb-3 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs text-gray-500">{o.id}</td>
                        <td className="py-3 pr-4 text-gray-600 text-xs whitespace-nowrap">{o.date}</td>
                        <td className="py-3 pr-4 font-medium text-gray-900 max-w-48 truncate">{o.product}</td>
                        <td className="py-3 pr-4">
                          <div>
                            <span className="text-xs text-gray-700">{o.category}</span>
                            <span className="block text-xs text-gray-400">{o.subcategory}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4"><Badge label={o.type} className={typeColors[o.type] || 'bg-gray-100 text-gray-600'} /></td>
                        <td className="py-3 pr-4 font-bold text-gray-800 whitespace-nowrap">TSh {o.amount.toLocaleString()}</td>
                        <td className="py-3"><Badge label={o.status} className={statusColors[o.status] || 'bg-gray-100 text-gray-600'} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={5} className="pt-3 text-sm font-semibold text-gray-600">Total</td>
                      <td className="pt-3 font-bold text-blue-700">TSh {totalSpend.toLocaleString()}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* ── Returns ── */}
          {activeTab === 'returns' && (
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Returns & Refunds — {user.name}</h3>
              {returns.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <RotateCcw className="size-10 mx-auto mb-3 opacity-30" />
                  <p>No returns on record</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {returns.map(r => (
                    <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-gray-400">{r.id}</span>
                            <span className="text-xs text-gray-400">→ {r.orderId}</span>
                            <Badge label={r.status} className={statusColors[r.status] || 'bg-gray-100 text-gray-600'} />
                          </div>
                          <p className="font-semibold text-gray-900">{r.product}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">{r.date}</p>
                          <p className="font-bold text-orange-600">TSh {r.amount.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-800">
                        <span className="font-semibold">Reason: </span>{r.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Quotations ── */}
          {activeTab === 'quotations' && (
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Quotation Requests — {user.name}</h3>
              {quotations.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <MessageSquare className="size-10 mx-auto mb-3 opacity-30" />
                  <p>No quotation requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quotations.map(q => (
                    <div key={q.id} className={`border rounded-xl p-4 ${q.status === 'Unanswered' ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400">{q.id}</span>
                          <span className="font-semibold text-gray-900">{q.product}</span>
                          <span className="text-xs text-gray-500">{q.category}</span>
                          <Badge label={q.status} className={statusColors[q.status] || 'bg-gray-100 text-gray-600'} />
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{q.date}</span>
                      </div>
                      <p className="text-sm text-gray-700 bg-white border border-gray-100 rounded-lg px-3 py-2 italic">"{q.message}"</p>
                      {q.status === 'Unanswered' && (
                        <div className="mt-3 flex gap-2">
                          <button className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700">Reply with Quote</button>
                          <button className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-200">Open in Chat</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Interests & Tags ── */}
          {activeTab === 'interests' && (
            <div className="p-6 space-y-6">
              {/* Tags */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TagIcon className="size-4 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Tags</h3>
                </div>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Add tag..."
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button onClick={handleAddTag} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5">
                    <Plus className="size-4" />Add
                  </button>
                </div>
                <div className="space-y-2">
                  {currentTags.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No tags assigned</p>
                  ) : (
                    currentTags.map(tag => (
                      <div key={tag.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${tag.type === 'system' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                            {tag.label}
                          </span>
                          <span className="text-xs text-gray-400">{tag.type === 'system' ? 'System' : 'Manual'}</span>
                        </div>
                        {tag.type === 'manual' && (
                          <button onClick={() => handleRemoveTag(tag.id)} className="p-1 hover:bg-gray-200 rounded">
                            <Trash2 className="size-3.5 text-gray-500" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Behaviour-detected interests */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="size-4 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Detected Interests</h3>
                  <span className="text-xs text-gray-400">(from order & browsing history)</span>
                </div>
                <div className="space-y-2">
                  {(user.categories && user.categories.length > 0 ? user.categories : []).length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No interests detected yet</p>
                  ) : (
                    user.categories?.map(cat => (
                      <div key={cat.id} className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold text-gray-900 capitalize">{cat.label}</span>
                          <span className="text-xs text-indigo-700 font-medium">{cat.confidence}% confidence</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${cat.confidence}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Category spend breakdown */}
              {topCategories.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="size-4 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">Category Spend Breakdown</h3>
                  </div>
                  <div className="space-y-2.5">
                    {topCategories.map(([cat, spend]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 w-36 truncate capitalize">{cat}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                          <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (spend / totalSpend) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 w-32 text-right">TSh {spend.toLocaleString()}</span>
                        <span className="text-xs text-gray-400 w-10 text-right">{Math.round((spend / totalSpend) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
