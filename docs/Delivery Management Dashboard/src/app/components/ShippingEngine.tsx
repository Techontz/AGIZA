import { useState } from 'react';
import {
  Globe, Truck, Package, MapPin, Layers, Zap, Users, FlaskConical,
  Settings, Plus, ChevronRight, Search, Filter, MoreHorizontal,
  CheckCircle, XCircle, AlertCircle, Clock, Edit, Trash2, Eye,
  ArrowRight, Weight, Box, DollarSign, Calendar, Info, Star,
  AlertTriangle, RefreshCw, Copy, Activity, TrendingUp
} from 'lucide-react';

interface ShippingEngineProps {
  view: string;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    Active: 'bg-green-100 text-green-700',
    Inactive: 'bg-gray-100 text-gray-500',
    Pending: 'bg-yellow-100 text-yellow-700',
    Draft: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
};

const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between mb-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-3">{actions}</div>}
  </div>
);

const StatCard = ({
  label,
  value,
  icon: Icon,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
};

const Btn = ({
  children,
  variant = 'primary',
  onClick,
  icon: Icon,
  size = 'md',
  type = 'button',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: () => void;
  icon?: React.ElementType;
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
}) => {
  const base = 'inline-flex items-center gap-2 rounded-lg font-medium transition-colors cursor-pointer';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button type={type} onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]}`}>
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
    </button>
  );
};

const SectionCard = ({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
    )}
    {children}
  </div>
);

const FormField = ({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
  </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${props.className ?? ''}`}
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white ${props.className ?? ''}`}
  />
);

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${props.className ?? ''}`}
  />
);

const Tabs = ({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) => (
  <div className="flex border-b border-gray-200 mb-6">
    {tabs.map((t) => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
          active === t.id
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

// ─── Overview ────────────────────────────────────────────────────────────────

const recentRules = [
  { id: 'R001', name: 'China → Tanzania Air Cargo (Electronics)', route: 'China → Tanzania', method: 'Air Cargo', profile: 'Electronics', pricing: 'Per KG', rate: '$25/KG', status: 'Active', updated: '2 hours ago' },
  { id: 'R002', name: 'Dar → Mwanza Bus (Standard)', route: 'Dar es Salaam → Mwanza', method: 'Bus', profile: 'Standard Goods', pricing: 'Per KG', rate: 'TSh 1,200/KG', status: 'Active', updated: '1 day ago' },
  { id: 'R003', name: 'Dubai → Tanzania (Drones)', route: 'Dubai → Tanzania', method: 'Air Cargo', profile: 'Drone — Special Air Cargo', pricing: 'Per Item', rate: '$80/Item', status: 'Active', updated: '2 days ago' },
  { id: 'R004', name: 'Dar → Zone C (Oversized)', route: 'Dar es Salaam → Zone C', method: 'Bus', profile: 'Oversized', pricing: 'Per KG', rate: 'TSh 2,000/KG', status: 'Inactive', updated: '3 days ago' },
  { id: 'R005', name: 'USA → Tanzania (Manual Quote)', route: 'USA → Tanzania', method: 'Sea Freight', profile: 'All Products', pricing: 'Manual Quote', rate: '—', status: 'Active', updated: '5 days ago' },
];

function OverviewPage() {
  const [tab, setTab] = useState('local');

  return (
    <div className="p-6">
      <PageHeader
        title="Shipping Engine"
        description="Manage shipping rules, zones, routes, carriers, and pricing logic"
        actions={
          <>
            <Btn variant="secondary" icon={FlaskConical}>Test Rate</Btn>
            <Btn variant="secondary" icon={MapPin}>+ Add Route</Btn>
            <Btn variant="secondary" icon={Layers}>+ Create Zone</Btn>
            <Btn variant="primary" icon={Plus}>+ Create Shipping Rule</Btn>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-7 gap-4 mb-6">
        <StatCard label="Active Routes" value={14} icon={ArrowRight} color="blue" />
        <StatCard label="Shipping Zones" value={7} icon={MapPin} color="purple" />
        <StatCard label="Active Rules" value={38} icon={Zap} color="green" />
        <StatCard label="Profiles" value={9} icon={Layers} color="indigo" />
        <StatCard label="Carriers" value={6} icon={Truck} color="orange" />
        <StatCard label="Manual Quotes" value={3} icon={Clock} color="yellow" />
        <StatCard label="Overrides" value={5} icon={AlertTriangle} color="red" />
      </div>

      {/* Priority Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Info className="size-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Rule Priority Order</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-blue-700">
          {['1. Specific Product Rule', '2. Shipping Profile Rule', '3. General Route Rule'].map((item, i, arr) => (
            <span key={item} className="flex items-center gap-1">
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full">{item}</span>
              {i < arr.length - 1 && <ChevronRight className="size-3 text-blue-400" />}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[{ id: 'local', label: 'Local Delivery (Tanzania)' }, { id: 'international', label: 'International Shipping' }]}
        active={tab}
        onChange={setTab}
      />

      {/* Recent Rules */}
      <SectionCard title="Recent Shipping Rules">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Rule', 'Route', 'Method', 'Profile', 'Pricing', 'Rate', 'Status', 'Updated', 'Actions'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tab === 'local' ? recentRules.slice(1, 4) : recentRules.filter((_, i) => i !== 1 && i !== 3)).map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1">
                      {r.route.split('→').map((p, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">{p.trim()}</span>
                          {i < arr.length - 1 && <ArrowRight className="size-3 text-gray-400" />}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.method}</td>
                  <td className="px-4 py-3 text-gray-600">{r.profile}</td>
                  <td className="px-4 py-3 text-gray-600">{r.pricing}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.rate}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.updated}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button className="p-1 hover:bg-gray-100 rounded"><Edit className="size-3.5 text-gray-400" /></button>
                      <button className="p-1 hover:bg-gray-100 rounded"><MoreHorizontal className="size-3.5 text-gray-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const routeData = [
  { id: 1, origin: 'Dar es Salaam', dest: 'Mwanza', methods: ['Bus'], rules: 3, delivery: '1–2 days', status: 'Active', type: 'local' },
  { id: 2, origin: 'Dar es Salaam', dest: 'Dodoma', methods: ['Bus', 'Courier'], rules: 4, delivery: '1 day', status: 'Active', type: 'local' },
  { id: 3, origin: 'Dar es Salaam', dest: 'Zone C', methods: ['Bus'], rules: 5, delivery: '2–3 days', status: 'Active', type: 'local' },
  { id: 4, origin: 'Dar es Salaam', dest: 'Zone D', methods: ['Bus'], rules: 2, delivery: '3–5 days', status: 'Active', type: 'local' },
  { id: 5, origin: 'Mwanza', dest: 'Dar es Salaam', methods: ['Bus', 'Rider'], rules: 3, delivery: '1–2 days', status: 'Active', type: 'local' },
  { id: 6, origin: 'China', dest: 'Tanzania', methods: ['Air Cargo', 'Sea Freight'], rules: 12, delivery: '7–21 days', status: 'Active', type: 'international' },
  { id: 7, origin: 'Dubai', dest: 'Tanzania', methods: ['Air Cargo', 'Express Courier'], rules: 6, delivery: '5–10 days', status: 'Active', type: 'international' },
  { id: 8, origin: 'USA', dest: 'Tanzania', methods: ['Air Cargo', 'Sea Freight'], rules: 4, delivery: '14–30 days', status: 'Active', type: 'international' },
  { id: 9, origin: 'UK', dest: 'Tanzania', methods: ['Air Cargo'], rules: 3, delivery: '10–18 days', status: 'Active', type: 'international' },
  { id: 10, origin: 'India', dest: 'Tanzania', methods: ['Air Cargo', 'Sea Freight'], rules: 5, delivery: '10–20 days', status: 'Active', type: 'international' },
];

function CreateRouteForm({ onClose }: { onClose: () => void }) {
  const [routeType, setRouteType] = useState('local');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Create Route</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle className="size-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Route Type" required>
            <div className="flex gap-3">
              {['local', 'international'].map((t) => (
                <button
                  key={t}
                  onClick={() => setRouteType(t)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${routeType === t ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {t === 'local' ? 'Local Delivery' : 'International Shipping'}
                </button>
              ))}
            </div>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Origin" required>
              <Select>
                <option>Select origin...</option>
                {routeType === 'local' ? (
                  <>
                    <option>Dar es Salaam</option>
                    <option>Mwanza</option>
                    <option>Arusha</option>
                    <option>Dodoma</option>
                  </>
                ) : (
                  <>
                    <option>China</option>
                    <option>Dubai</option>
                    <option>USA</option>
                    <option>UK</option>
                    <option>India</option>
                  </>
                )}
              </Select>
            </FormField>
            <FormField label="Destination" required hint="Routes are directional — create separately for return">
              <Select>
                <option>Select destination...</option>
                {routeType === 'local' ? (
                  <>
                    <option>Mwanza</option>
                    <option>Dodoma</option>
                    <option>Zone B — Medium Distance</option>
                    <option>Zone C — Long Distance</option>
                    <option>Zone D — Remote</option>
                  </>
                ) : (
                  <option>Tanzania</option>
                )}
              </Select>
            </FormField>
          </div>
          <FormField label="Available Shipping Methods" required>
            <div className="grid grid-cols-2 gap-2">
              {(routeType === 'local' ? ['Bus', 'Rider', 'Courier', 'Pickup'] : ['Air Cargo', 'Sea Freight', 'Express Courier', 'Other']).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
                  {m}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Notes">
            <Textarea rows={2} placeholder="Optional notes about this route..." />
          </FormField>
          <FormField label="Status" required>
            <Select>
              <option>Active</option>
              <option>Inactive</option>
            </Select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create Route</Btn>
        </div>
      </div>
    </div>
  );
}

function RoutesPage() {
  const [tab, setTab] = useState('local');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = routeData.filter((r) => r.type === tab && (r.origin.toLowerCase().includes(search.toLowerCase()) || r.dest.toLowerCase().includes(search.toLowerCase())));
  return (
    <div className="p-6">
      {showCreate && <CreateRouteForm onClose={() => setShowCreate(false)} />}
      <PageHeader
        title="Routes"
        description="Manage directional shipping routes. Each direction is treated independently."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Add Route</Btn>}
      />
      <Tabs
        tabs={[{ id: 'local', label: 'Local Delivery (Tanzania)' }, { id: 'international', label: 'International Shipping' }]}
        active={tab}
        onChange={setTab}
      />
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="size-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input placeholder="Search routes..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Btn variant="secondary" icon={Filter} size="sm">Filter</Btn>
      </div>
      <SectionCard>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Route', 'Methods', 'Rules', 'Est. Delivery', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium text-gray-900">
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{r.origin}</span>
                    <ArrowRight className="size-3.5 text-gray-400" />
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{r.dest}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {r.methods.map((m) => (
                      <span key={m} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{m}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{r.rules} rules</td>
                <td className="px-4 py-3 text-gray-600">{r.delivery}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Btn variant="ghost" size="sm">Manage</Btn>
                    <button className="p-1 hover:bg-gray-100 rounded"><MoreHorizontal className="size-4 text-gray-400" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ─── Shipping Zones ──────────────────────────────────────────────────────────

const zonesData = [
  { id: 'Z1', name: 'Zone A — Short Distance', type: 'Local', desc: 'Cities within 100km of Dar es Salaam', destinations: ['Bagamoyo', 'Kibaha', 'Morogoro', 'Kisarawe'], rules: 6, status: 'Active' },
  { id: 'Z2', name: 'Zone B — Medium Distance', type: 'Local', desc: 'Cities 100–400km from Dar es Salaam', destinations: ['Dodoma', 'Iringa', 'Tanga', 'Arusha'], rules: 8, status: 'Active' },
  { id: 'Z3', name: 'Zone C — Long Distance', type: 'Local', desc: 'Cities 400km+ from Dar es Salaam', destinations: ['Mwanza', 'Geita', 'Tabora', 'Shinyanga', 'Kagera'], rules: 5, status: 'Active' },
  { id: 'Z4', name: 'Zone D — Remote', type: 'Local', desc: 'Remote regions with limited transport access', destinations: ['Rukwa', 'Katavi', 'Mahali', 'Gombe'], rules: 3, status: 'Active' },
  { id: 'Z5', name: 'Zone E — Islands', type: 'Local', desc: 'Island destinations requiring ferry or air', destinations: ['Zanzibar', 'Pemba', 'Mafia'], rules: 4, status: 'Active' },
  { id: 'Z6', name: 'East Africa', type: 'International', desc: 'East African Community member countries', destinations: ['Kenya', 'Uganda', 'Rwanda', 'Burundi'], rules: 2, status: 'Draft' },
];

function CreateZoneForm({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(['Mwanza', 'Geita', 'Tabora']);
  const allCities = ['Bagamoyo', 'Kibaha', 'Morogoro', 'Kisarawe', 'Dodoma', 'Iringa', 'Tanga', 'Arusha', 'Mwanza', 'Geita', 'Tabora', 'Shinyanga', 'Kagera', 'Rukwa', 'Katavi', 'Zanzibar', 'Pemba'];
  const toggle = (c: string) => setSelected((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Create Shipping Zone</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle className="size-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Zone Name" required><Input placeholder="e.g. Zone C — Long Distance" /></FormField>
          <FormField label="Zone Type" required>
            <Select><option>Local</option><option>International</option></Select>
          </FormField>
          <FormField label="Description"><Textarea rows={2} placeholder="Describe what this zone covers..." /></FormField>
          <FormField label="Add Destinations" required hint="Select cities, regions, or destinations included in this zone">
            <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
              {allCities.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                  <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} className="rounded border-gray-300 text-blue-600" />
                  {c}
                </label>
              ))}
            </div>
          </FormField>
          {selected.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Selected ({selected.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.map((c) => (
                  <span key={c} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                    {c}
                    <button onClick={() => toggle(c)}><XCircle className="size-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <FormField label="Status" required>
            <Select><option>Active</option><option>Inactive</option><option>Draft</option></Select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create Zone</Btn>
        </div>
      </div>
    </div>
  );
}

function ZonesPage() {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="p-6">
      {showCreate && <CreateZoneForm onClose={() => setShowCreate(false)} />}
      <PageHeader
        title="Shipping Zones"
        description="Group destinations into zones to simplify rule creation. A destination can have specific overrides without rebuilding zones."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create Zone</Btn>}
      />
      <div className="grid grid-cols-1 gap-4">
        {zonesData.map((z) => (
          <SectionCard key={z.id}>
            <div className="flex items-start justify-between p-5">
              <div className="flex items-start gap-4">
                <div className="bg-purple-50 p-2.5 rounded-lg">
                  <MapPin className="size-5 text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900">{z.name}</h3>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{z.type}</span>
                    <StatusBadge status={z.status} />
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{z.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {z.destinations.map((d) => (
                      <span key={d} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{d}</span>
                    ))}
                    <button className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs hover:bg-blue-100">+ Add</button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{z.rules}</p>
                  <p className="text-xs text-gray-500">rules</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><Edit className="size-4 text-gray-400" /></button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><MoreHorizontal className="size-4 text-gray-400" /></button>
                </div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

// ─── Shipping Profiles ────────────────────────────────────────────────────────

const profilesData = [
  { id: 'P1', name: 'Standard Goods', desc: 'General merchandise with no special handling requirements', type: 'Standard', handling: [], products: 142, status: 'Active' },
  { id: 'P2', name: 'Electronics', desc: 'Electronic devices requiring careful handling', type: 'Specialized', handling: ['Fragile'], products: 58, status: 'Active' },
  { id: 'P3', name: 'Laptops', desc: 'Laptop computers and accessories', type: 'Specialized', handling: ['Fragile', 'Special documentation'], products: 24, status: 'Active' },
  { id: 'P4', name: 'Drone — Special Air Cargo', desc: 'Products such as drones requiring special international shipping treatment', type: 'Restricted', handling: ['Contains battery', 'Special documentation', 'Restricted handling'], products: 8, status: 'Active' },
  { id: 'P5', name: 'Battery / Restricted', desc: 'Items containing lithium batteries or restricted materials', type: 'Restricted', handling: ['Contains battery', 'Hazardous material', 'Restricted handling'], products: 31, status: 'Active' },
  { id: 'P6', name: 'Oversized', desc: 'Items exceeding standard size limits requiring special logistics', type: 'Oversized', handling: ['Special documentation'], products: 15, status: 'Active' },
  { id: 'P7', name: 'Manual Quote', desc: 'Items that require manual pricing — no automatic rate applied', type: 'Manual', handling: [], products: 7, status: 'Active' },
  { id: 'P8', name: 'Cameras', desc: 'Camera equipment and photography gear', type: 'Specialized', handling: ['Fragile', 'Special documentation'], products: 19, status: 'Active' },
  { id: 'P9', name: 'Fragile Items', desc: 'Glassware, ceramics, and other fragile products', type: 'Specialized', handling: ['Fragile'], products: 33, status: 'Active' },
];

const handlingColors: Record<string, string> = {
  'Contains battery': 'bg-orange-50 text-orange-700',
  'Special documentation': 'bg-blue-50 text-blue-700',
  'Restricted handling': 'bg-red-50 text-red-700',
  'Fragile': 'bg-yellow-50 text-yellow-700',
  'Hazardous material': 'bg-red-50 text-red-700',
};

function CreateProfileForm({ onClose }: { onClose: () => void }) {
  const handlingOptions = ['Contains battery', 'Fragile', 'Hazardous material', 'Restricted item', 'Special shipping documentation', 'Temperature controlled', 'Other'];
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Create Shipping Profile</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle className="size-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Profile Name" required><Input placeholder="e.g. Drone — Special Air Cargo" /></FormField>
          <FormField label="Description"><Textarea rows={2} placeholder="Describe what products this profile applies to..." /></FormField>
          <FormField label="Shipping Type" required>
            <Select>
              <option>Standard</option>
              <option>Specialized</option>
              <option>Restricted</option>
              <option>Oversized</option>
              <option>Manual</option>
            </Select>
          </FormField>
          <FormField label="Special Handling Requirements" hint="Check all that apply to products in this profile">
            <div className="space-y-2">
              {handlingOptions.map((h) => (
                <label key={h} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
                  {h}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Restrictions / Notes"><Textarea rows={2} placeholder="Any additional notes or restrictions for this profile..." /></FormField>
          <FormField label="Status" required>
            <Select><option>Active</option><option>Inactive</option></Select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create Profile</Btn>
        </div>
      </div>
    </div>
  );
}

function ProfilesPage() {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="p-6">
      {showCreate && <CreateProfileForm onClose={() => setShowCreate(false)} />}
      <PageHeader
        title="Shipping Profiles"
        description="Profiles determine how a product is treated by the shipping engine. Assign a profile to any product instead of creating individual rules."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create Profile</Btn>}
      />
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info className="size-4 text-yellow-700 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-yellow-800">
          A product's <strong>weight</strong> and <strong>CBM</strong> are always stored on the product — the Shipping Profile determines <strong>which pricing rule applies</strong>, not the physical dimensions.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {profilesData.map((p) => (
          <SectionCard key={p.id}>
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-lg ${p.type === 'Restricted' ? 'bg-red-50' : p.type === 'Oversized' ? 'bg-orange-50' : p.type === 'Manual' ? 'bg-gray-50' : 'bg-indigo-50'}`}>
                  <Layers className={`size-5 ${p.type === 'Restricted' ? 'text-red-600' : p.type === 'Oversized' ? 'text-orange-600' : p.type === 'Manual' ? 'text-gray-500' : 'text-indigo-600'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.type === 'Restricted' ? 'bg-red-100 text-red-700' : p.type === 'Oversized' ? 'bg-orange-100 text-orange-700' : p.type === 'Manual' ? 'bg-gray-100 text-gray-600' : 'bg-indigo-100 text-indigo-700'}`}>{p.type}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{p.desc}</p>
                  {p.handling.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.handling.map((h) => (
                        <span key={h} className={`px-2 py-0.5 rounded text-xs font-medium ${handlingColors[h] ?? 'bg-gray-100 text-gray-600'}`}>{h}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{p.products}</p>
                  <p className="text-xs text-gray-500">products</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><Edit className="size-4 text-gray-400" /></button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><Copy className="size-4 text-gray-400" /></button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><MoreHorizontal className="size-4 text-gray-400" /></button>
                </div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

// ─── Shipping Rules ──────────────────────────────────────────────────────────

const rulesData = [
  { id: 'SR001', origin: 'China', dest: 'Tanzania', appliesTo: 'All Products', profile: 'All Products', method: 'Air Cargo', pricing: 'Per KG', rate: '$12/KG', min: '$30', delivery: '7–14 days', carrier: 'SF Express', status: 'Active', priority: 5, type: 'international' },
  { id: 'SR002', origin: 'China', dest: 'Tanzania', appliesTo: 'Shipping Profile', profile: 'Electronics', method: 'Air Cargo', pricing: 'Per KG', rate: '$25/KG', min: '$50', delivery: '7–14 days', carrier: 'SF Express', status: 'Active', priority: 2, type: 'international' },
  { id: 'SR003', origin: 'China', dest: 'Tanzania', appliesTo: 'Shipping Profile', profile: 'Drone — Special Air Cargo', method: 'Air Cargo', pricing: 'Per Item', rate: '$50/Item', min: '$50', delivery: '7–14 days', carrier: 'SF Express', status: 'Active', priority: 1, type: 'international' },
  { id: 'SR004', origin: 'Dubai', dest: 'Tanzania', appliesTo: 'All Products', profile: 'All Products', method: 'Air Cargo', pricing: 'Per KG', rate: '$18/KG', min: '$40', delivery: '5–10 days', carrier: 'Emirates Air Cargo', status: 'Active', priority: 5, type: 'international' },
  { id: 'SR005', origin: 'USA', dest: 'Tanzania', appliesTo: 'All Products', profile: 'All Products', method: 'Sea Freight', pricing: 'Manual Quote', rate: 'Manual', min: '—', delivery: '21–30 days', carrier: 'Any', status: 'Active', priority: 6, type: 'international' },
  { id: 'SR006', origin: 'Dar es Salaam', dest: 'Zone A', appliesTo: 'All Products', profile: 'Standard Goods', method: 'Rider', pricing: 'Per KG', rate: 'TSh 800/KG', min: 'TSh 3,000', delivery: 'Same day', carrier: 'Rider', status: 'Active', priority: 5, type: 'local' },
  { id: 'SR007', origin: 'Dar es Salaam', dest: 'Zone C', appliesTo: 'All Products', profile: 'Standard Goods', method: 'Bus', pricing: 'Per KG', rate: 'TSh 1,500/KG', min: 'TSh 8,000', delivery: '2–3 days', carrier: 'Bus Partner', status: 'Active', priority: 5, type: 'local' },
  { id: 'SR008', origin: 'Dar es Salaam', dest: 'Zone E', appliesTo: 'All Products', profile: 'All Products', method: 'Bus', pricing: 'Manual Quote', rate: 'Manual', min: '—', delivery: '3–5 days', carrier: 'Ferry + Bus', status: 'Active', priority: 6, type: 'local' },
];

function CreateRuleForm({ onClose, type }: { onClose: () => void; type: 'local' | 'international' }) {
  const [pricing, setPricing] = useState('per_kg');
  const [appliesTo, setAppliesTo] = useState('all');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">Create {type === 'local' ? 'Local Delivery' : 'International Shipping'} Rule</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle className="size-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-6">
          {/* Section 1 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 1 — Route</p>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Origin" required>
                <Select>
                  <option>Select origin...</option>
                  {type === 'local' ? <><option>Dar es Salaam</option><option>Mwanza</option><option>Arusha</option></> : <><option>China</option><option>Dubai</option><option>USA</option><option>UK</option><option>India</option></>}
                </Select>
              </FormField>
              <FormField label="Destination / Zone" required>
                <Select>
                  <option>Select destination...</option>
                  {type === 'local' ? <><option>Zone A — Short Distance</option><option>Zone B — Medium Distance</option><option>Zone C — Long Distance</option><option>Zone D — Remote</option><option>Zone E — Islands</option><option>Mwanza (specific city)</option></> : <option>Tanzania</option>}
                </Select>
              </FormField>
            </div>
          </div>
          {/* Section 2 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 2 — Shipping Method</p>
            <Select>
              <option>Select method...</option>
              {type === 'local' ? <><option>Bus</option><option>Rider</option><option>Courier</option><option>Pickup</option></> : <><option>Air Cargo</option><option>Sea Freight</option><option>Express Courier</option><option>Other</option></>}
            </Select>
          </div>
          {/* Section 3 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 3 — Applies To</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'profile', label: 'Shipping Profile' }, { id: 'product', label: 'Specific Product' }].map((opt) => (
                <button key={opt.id} onClick={() => setAppliesTo(opt.id)} className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors text-center ${appliesTo === opt.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{opt.label}</button>
              ))}
            </div>
            {appliesTo === 'profile' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Shipping Profile</label>
                <Select>
                  <option>Select profile...</option>
                  {profilesData.map((p) => <option key={p.id}>{p.name}</option>)}
                </Select>
                <p className="mt-1.5 text-xs text-gray-400">This rule applies to all products assigned to the selected Shipping Profile. Special handling requirements come from the profile.</p>
              </div>
            )}
            {appliesTo === 'product' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Product</label>
                <Input placeholder="Search product by name or SKU..." />
                <p className="mt-1.5 text-xs text-gray-400">A specific product rule overrides the Shipping Profile rule for this product only.</p>
              </div>
            )}
          </div>
          {/* Section 4 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 4 — Pricing Model</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { id: 'per_kg', label: 'Per KG' },
                { id: 'per_cbm', label: 'Per CBM' },
                { id: 'per_vol_weight', label: 'Per Vol. Weight' },
                { id: 'per_item', label: 'Per Item' },
                { id: 'fixed', label: 'Fixed Shipment' },
                { id: 'manual', label: 'Manual Quote' },
              ].map((opt) => (
                <button key={opt.id} onClick={() => setPricing(opt.id)} className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors text-center ${pricing === opt.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{opt.label}</button>
              ))}
            </div>
            {pricing === 'per_kg' && (
              <div className="flex items-center gap-2">
                <Input placeholder="Rate" className="max-w-32" />
                <span className="text-sm text-gray-500">per KG (actual weight)</span>
              </div>
            )}
            {pricing === 'per_cbm' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Rate" className="max-w-32" />
                  <span className="text-sm text-gray-500">per CBM (m³)</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-start gap-1.5">
                  <Info className="size-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                  CBM is calculated from product dimensions: <strong className="ml-1">L × W × H ÷ 1,000,000</strong>. Set dimensions on each product.
                </div>
              </div>
            )}
            {pricing === 'per_vol_weight' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Rate" className="max-w-32" />
                  <span className="text-sm text-gray-500">per volumetric KG</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500">Divisor:</span>
                  <select className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="5000">5,000 (standard air)</option>
                    <option value="6000">6,000 (IATA standard)</option>
                    <option value="3000">3,000 (sea/express)</option>
                    <option value="4000">4,000 (custom)</option>
                  </select>
                  <span className="text-xs text-gray-400">Vol. KG = L×W×H ÷ divisor</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-start gap-1.5">
                  <Info className="size-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                  The engine automatically uses <strong>whichever is greater</strong> — actual weight or volumetric weight — when applying this rate.
                </div>
              </div>
            )}
            {pricing === 'per_item' && (
              <div className="flex items-center gap-2">
                <Input placeholder="Rate" className="max-w-32" />
                <span className="text-sm text-gray-500">per item</span>
              </div>
            )}
            {pricing === 'fixed' && (
              <div className="flex items-center gap-2">
                <Input placeholder="Fixed price" className="max-w-48" />
                <span className="text-sm text-gray-500">per shipment (flat rate)</span>
              </div>
            )}
            {pricing === 'manual' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700 flex items-center gap-2">
                <AlertCircle className="size-4 flex-shrink-0" />
                Manual quotation will be required for each shipment using this rule.
              </div>
            )}
          </div>
          {/* Section 5 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 5 — Conditions (Optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Weight Range</p>
                <div className="flex items-center gap-2">
                  <Input placeholder="Min KG" /><span className="text-sm text-gray-400">—</span><Input placeholder="Max KG" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Volume Range (CBM)</p>
                <div className="flex items-center gap-2">
                  <Input placeholder="Min CBM" /><span className="text-sm text-gray-400">—</span><Input placeholder="Max CBM" />
                </div>
              </div>
            </div>
          </div>
          {/* Section 6 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 6 — Minimum Charge</p>
            <div className="flex items-center gap-2"><Input placeholder="e.g. TSh 5,000" className="max-w-48" /><span className="text-sm text-gray-500">minimum shipping charge</span></div>
          </div>
          {/* Section 7 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 7 — Delivery Estimate</p>
            <div className="flex items-center gap-2">
              <Input placeholder="Min" className="max-w-24" /><span className="text-sm text-gray-500">to</span><Input placeholder="Max" className="max-w-24" /><span className="text-sm text-gray-500">days</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Displayed to customer as: 3–7 days</p>
          </div>
          {/* Section 8 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 8 — Carrier (Optional)</p>
            <Select>
              <option>No specific carrier</option>
              <option>SF Express</option>
              <option>DHL</option>
              <option>FedEx</option>
              <option>Emirates Air Cargo</option>
              <option>Bus Partner</option>
              <option>Local Rider</option>
            </Select>
          </div>
          {/* Section 9 — Special Handling removed: inherited from Shipping Profile */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <Info className="size-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800">Special handling requirements (battery, fragile, restricted, etc.) are automatically inherited from the product's <strong>Shipping Profile</strong>. No need to repeat them here.</p>
          </div>
          {/* Section 10 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Section 9 — Status</p>
            <div className="flex gap-3">
              {['Active', 'Inactive'].map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="status" defaultChecked={s === 'Active'} className="text-blue-600" />{s}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="secondary" onClick={onClose}>Save & Add Another</Btn>
          <Btn variant="primary" onClick={onClose}>Save Rule</Btn>
        </div>
      </div>
    </div>
  );
}

function RulesPage() {
  const [tab, setTab] = useState('local');
  const [showCreate, setShowCreate] = useState(false);
  const filtered = rulesData.filter((r) => r.type === tab);
  return (
    <div className="p-6">
      {showCreate && <CreateRuleForm onClose={() => setShowCreate(false)} type={tab as 'local' | 'international'} />}
      <PageHeader
        title="Shipping Rules"
        description="Rules define pricing logic. The engine selects the most specific applicable rule for each shipment."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create Rule</Btn>}
      />

      {/* Priority reference */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rule Priority — system automatically picks the most specific rule</p>
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {['1 — Specific Product', '2 — Shipping Profile', '3 — General Route'].map((item, i) => (
            <span key={item} className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded font-medium ${i === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{item}</span>
              {i < 2 && <ChevronRight className="size-3 text-gray-400" />}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">Special handling (battery, fragile, etc.) is automatically inherited from the product's Shipping Profile — no need to set it on the rule.</p>
      </div>

      <Tabs
        tabs={[{ id: 'local', label: 'Local Delivery Rules' }, { id: 'international', label: 'International Shipping Rules' }]}
        active={tab}
        onChange={setTab}
      />
      <SectionCard>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['ID', 'Route', 'Applies To', 'Profile/Category', 'Method', 'Pricing', 'Rate', 'Min Charge', 'Delivery', 'Carrier', 'Status', ''].map((h) => (
                <th key={h} className="text-left text-xs font-medium text-gray-500 px-3 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 font-mono text-xs text-gray-400">{r.id}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-1 text-xs">
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded">{r.origin}</span>
                    <ArrowRight className="size-3 text-gray-400" />
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded">{r.dest}</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-600 text-xs">{r.appliesTo}</td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.priority === 1 ? 'bg-blue-100 text-blue-700' : r.priority === 2 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{r.profile}</span>
                </td>
                <td className="px-3 py-3 text-gray-600 text-xs">{r.method}</td>
                <td className="px-3 py-3 text-gray-600 text-xs">{r.pricing}</td>
                <td className="px-3 py-3 font-medium text-gray-900 text-xs">{r.rate}</td>
                <td className="px-3 py-3 text-gray-500 text-xs">{r.min}</td>
                <td className="px-3 py-3 text-gray-600 text-xs">{r.delivery}</td>
                <td className="px-3 py-3 text-gray-500 text-xs">{r.carrier}</td>
                <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <button className="p-1 hover:bg-gray-100 rounded"><Edit className="size-3.5 text-gray-400" /></button>
                    <button className="p-1 hover:bg-gray-100 rounded"><MoreHorizontal className="size-3.5 text-gray-400" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ─── Carriers ────────────────────────────────────────────────────────────────

const carriersData = [
  { id: 'C1', name: 'SF Express', type: 'International Air', origins: ['China'], routes: 8, contact: 'logistics@sfexpress.com', status: 'Active', specializations: ['Electronics', 'Standard Goods'] },
  { id: 'C2', name: 'DHL', type: 'International Air', origins: ['UAE', 'USA', 'UK'], routes: 12, contact: 'api@dhl.com', status: 'Active', specializations: ['All Types'] },
  { id: 'C3', name: 'FedEx', type: 'International Air', origins: ['USA', 'UK'], routes: 6, contact: 'partners@fedex.com', status: 'Active', specializations: ['Electronics', 'Express'] },
  { id: 'C4', name: 'Emirates Air Cargo', type: 'International Air', origins: ['Dubai'], routes: 4, contact: 'cargo@emirates.com', status: 'Active', specializations: ['All Types'] },
  { id: 'C5', name: 'Local Bus Partner', type: 'Local Ground', origins: ['All Tanzania'], routes: 18, contact: 'ops@agiza.co.tz', status: 'Active', specializations: ['Standard Goods', 'Oversized'] },
  { id: 'C6', name: 'Agiza Riders', type: 'Local Delivery', origins: ['Dar es Salaam'], routes: 3, contact: 'riders@agiza.co.tz', status: 'Active', specializations: ['Standard Goods', 'Small Packages'] },
];

function CreateCarrierForm({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Add Carrier</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle className="size-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Carrier Name" required><Input placeholder="e.g. SF Express" /></FormField>
          <FormField label="Carrier Type" required>
            <Select>
              <option>International Air</option>
              <option>International Sea</option>
              <option>Local Ground</option>
              <option>Local Delivery</option>
              <option>Express Courier</option>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contact Email"><Input type="email" placeholder="contact@carrier.com" /></FormField>
            <FormField label="Contact Phone"><Input placeholder="+255..." /></FormField>
          </div>
          <FormField label="Supported Origins" hint="Which countries/cities this carrier ships from">
            <Textarea rows={2} placeholder="e.g. China, Dubai, USA" />
          </FormField>
          <FormField label="Supported Destinations" hint="Which countries/cities this carrier ships to">
            <Textarea rows={2} placeholder="e.g. Tanzania, Kenya" />
          </FormField>
          <FormField label="Specializations"><Textarea rows={2} placeholder="e.g. Electronics, Restricted goods, Oversized..." /></FormField>
          <FormField label="Notes"><Textarea rows={2} placeholder="Any additional notes about this carrier..." /></FormField>
          <FormField label="Status" required>
            <Select><option>Active</option><option>Inactive</option></Select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Add Carrier</Btn>
        </div>
      </div>
    </div>
  );
}

function CarriersPage() {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="p-6">
      {showCreate && <CreateCarrierForm onClose={() => setShowCreate(false)} />}
      <PageHeader
        title="Carriers"
        description="Manage shipping carriers used across local delivery and international routes"
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Add Carrier</Btn>}
      />
      <div className="grid grid-cols-1 gap-4">
        {carriersData.map((c) => (
          <SectionCard key={c.id}>
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-xl">
                  <Truck className="size-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{c.name}</h3>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{c.type}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{c.contact}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-gray-500">Origins: {c.origins.join(', ')}</span>
                    <span className="text-gray-300">|</span>
                    {c.specializations.map((s) => (
                      <span key={s} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{c.routes}</p>
                  <p className="text-xs text-gray-500">routes</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><Edit className="size-4 text-gray-400" /></button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg"><MoreHorizontal className="size-4 text-gray-400" /></button>
                </div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

// ─── Overrides ───────────────────────────────────────────────────────────────

const overridesData = [
  { id: 'OV001', route: 'Dar → Zone C', dest: 'Kagera', profile: 'Standard Goods', originalRule: 'TSh 1,500/KG', overridePrice: 'TSh 2,000/KG', reason: 'Carrier price increase for Kagera region', start: '20 Sept 2024', end: '30 Sept 2024', status: 'Active' },
  { id: 'OV002', route: 'China → Tanzania', dest: 'Tanzania', profile: 'Electronics', originalRule: '$25/KG', overridePrice: '$22/KG', reason: 'Promotional rate for Q4 electronics season', start: '1 Oct 2024', end: '31 Dec 2024', status: 'Active' },
  { id: 'OV003', route: 'Dar → Zone D', dest: 'Katavi', profile: 'Standard Goods', originalRule: 'TSh 2,000/KG', overridePrice: 'TSh 2,500/KG', reason: 'Road access disruption — fuel surcharge', start: '15 Sept 2024', end: '15 Oct 2024', status: 'Active' },
  { id: 'OV004', route: 'Dubai → Tanzania', dest: 'Tanzania', profile: 'All Products', originalRule: '$18/KG', overridePrice: '$16/KG', reason: 'Volume deal with Emirates Air Cargo', start: '1 Aug 2024', end: '31 Aug 2024', status: 'Inactive' },
  { id: 'OV005', route: 'Dar → Zone E', dest: 'Zanzibar', profile: 'Oversized', originalRule: 'Manual Quote', overridePrice: 'TSh 45,000 flat', reason: 'Fixed ferry rate agreement', start: '1 Sept 2024', end: '30 Nov 2024', status: 'Active' },
];

function OverridesPage() {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="p-6">
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Create Override</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle className="size-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Route" required><Select><option>Dar → Zone C</option><option>China → Tanzania</option><option>Dubai → Tanzania</option></Select></FormField>
                <FormField label="Specific Destination" hint="Override just this city without changing the zone"><Input placeholder="e.g. Kagera" /></FormField>
              </div>
              <FormField label="Shipping Profile / Category"><Select><option>Standard Goods</option><option>Electronics</option><option>All Products</option></Select></FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Original Rule Rate" hint="For reference only"><Input placeholder="e.g. TSh 1,500/KG" disabled className="bg-gray-50" /></FormField>
                <FormField label="Override Price" required><Input placeholder="e.g. TSh 2,000/KG" /></FormField>
              </div>
              <FormField label="Reason" required><Textarea rows={2} placeholder="Explain why this override is needed..." /></FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Start Date" required><Input type="date" /></FormField>
                <FormField label="End Date" required><Input type="date" /></FormField>
              </div>
              <FormField label="Status" required><Select><option>Active</option><option>Inactive</option></Select></FormField>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={() => setShowCreate(false)}>Create Override</Btn>
            </div>
          </div>
        </div>
      )}
      <PageHeader
        title="Overrides"
        description="Create exceptions to existing rules for specific destinations, time periods, or promotions — without rebuilding zones."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create Override</Btn>}
      />
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="size-4 text-yellow-700 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-yellow-800">Overrides take priority over general zone rules for the specified destination and period. All overrides are audited automatically.</p>
      </div>
      <SectionCard title="Active Overrides & Audit Trail">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['ID', 'Route', 'Destination', 'Profile', 'Original Rule', 'Override Price', 'Reason', 'Valid Period', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overridesData.map((o) => (
              <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{o.id}</td>
                <td className="px-4 py-3 text-xs text-gray-700 font-medium">{o.route}</td>
                <td className="px-4 py-3 text-xs text-gray-700">{o.dest}</td>
                <td className="px-4 py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">{o.profile}</span></td>
                <td className="px-4 py-3 text-xs text-gray-500 line-through">{o.originalRule}</td>
                <td className="px-4 py-3 text-xs font-bold text-gray-900">{o.overridePrice}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-40">{o.reason}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{o.start} – {o.end}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button className="p-1 hover:bg-gray-100 rounded"><Edit className="size-3.5 text-gray-400" /></button>
                    <button className="p-1 hover:bg-gray-100 rounded"><Trash2 className="size-3.5 text-gray-400" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ─── Test Rate ────────────────────────────────────────────────────────────────

function TestRatePage() {
  const [result, setResult] = useState<null | 'matched'>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setResult('matched'); }, 900);
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Test Shipping Rate"
        description="Enter a shipment scenario to see which rule the engine selects — and why. Use this to debug incorrect shipping calculations without a developer."
      />
      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 space-y-5">
          <SectionCard title="Shipment Details">
            <div className="p-5 space-y-4">
              <FormField label="Origin" required>
                <Select>
                  <option>China</option>
                  <option>Dubai</option>
                  <option>USA</option>
                  <option>UK</option>
                  <option>India</option>
                  <option>Dar es Salaam</option>
                  <option>Mwanza</option>
                </Select>
              </FormField>
              <FormField label="Destination" required>
                <Select>
                  <option>Tanzania</option>
                  <option>Zone A — Short Distance</option>
                  <option>Zone B — Medium Distance</option>
                  <option>Zone C — Long Distance</option>
                  <option>Mwanza</option>
                </Select>
              </FormField>
              <FormField label="Shipping Method" required>
                <Select>
                  <option>Air Cargo</option>
                  <option>Sea Freight</option>
                  <option>Express Courier</option>
                  <option>Bus</option>
                  <option>Rider</option>
                </Select>
              </FormField>
              <FormField label="Shipping Profile / Product">
                <Select>
                  <option>Drone — Special Air Cargo</option>
                  <option>Electronics</option>
                  <option>Laptops</option>
                  <option>Standard Goods</option>
                  <option>Manual Quote</option>
                </Select>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Weight (KG)"><Input placeholder="e.g. 1.5" defaultValue="1.5" /></FormField>
                <FormField label="Quantity"><Input placeholder="e.g. 1" defaultValue="1" /></FormField>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Length (cm)"><Input placeholder="30" defaultValue="30" /></FormField>
                <FormField label="Width (cm)"><Input placeholder="25" defaultValue="25" /></FormField>
                <FormField label="Height (cm)"><Input placeholder="15" defaultValue="15" /></FormField>
              </div>
              <FormField label="CBM (auto-calculated)" hint="Length × Width × Height ÷ 1,000,000">
                <Input value="0.011" disabled className="bg-gray-50 font-mono" />
              </FormField>
              <Btn variant="primary" onClick={handleTest} icon={loading ? RefreshCw : FlaskConical}>
                {loading ? 'Calculating...' : 'Calculate Shipping'}
              </Btn>
            </div>
          </SectionCard>
        </div>

        <div className="col-span-3">
          {!result && !loading && (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl h-full flex items-center justify-center">
              <div className="text-center text-gray-400">
                <FlaskConical className="size-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Enter shipment details and click Calculate</p>
                <p className="text-sm mt-1">The engine will show you exactly which rule applies and why</p>
              </div>
            </div>
          )}
          {loading && (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl h-full flex items-center justify-center">
              <div className="text-center text-gray-400">
                <RefreshCw className="size-10 mx-auto mb-3 opacity-40 animate-spin" />
                <p className="font-medium">Calculating...</p>
              </div>
            </div>
          )}
          {result === 'matched' && (
            <div className="space-y-4">
              {/* Matched Rule */}
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="size-5 text-green-600" />
                  <span className="font-semibold text-green-800">Rule Matched</span>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    ['Route', 'China → Tanzania'],
                    ['Shipping Profile', 'Drone — Special Air Cargo'],
                    ['Method', 'Air Cargo'],
                    ['Carrier', 'SF Express'],
                    ['Pricing Model', 'Per Item'],
                    ['Rate', '$50 / Item'],
                    ['Quantity', '1'],
                    ['Minimum Charge', '$50'],
                    ['Special Handling', 'Contains battery, Docs required'],
                    ['Estimated Delivery', '7–14 days'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-green-600 font-medium">{k}</p>
                      <p className="text-sm font-semibold text-green-900">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-green-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-600">Total Shipping Cost</p>
                    <p className="text-3xl font-bold text-green-800">$50.00</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-600">In TSh (approx.)</p>
                    <p className="text-2xl font-bold text-green-800">TSh 127,500</p>
                  </div>
                </div>
              </div>

              {/* Why this rule */}
              <SectionCard title="Why This Rule Was Selected">
                <div className="p-5 space-y-2.5">
                  {[
                    { label: 'Product Profile matched: Drone — Special Air Cargo', ok: true },
                    { label: 'Route matched: China → Tanzania', ok: true },
                    { label: 'Shipping method matched: Air Cargo', ok: true },
                    { label: 'Priority: Shipping Profile rule (priority 2) selected over general route rule ($12/KG, priority 5)', ok: true },
                    { label: 'Minimum charge check: $50 ≥ $50 minimum — passed', ok: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-2">
                      <CheckCircle className="size-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">{item.label}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Other considered rules */}
              <SectionCard title="Other Rules Considered (Not Applied)">
                <div className="p-5 space-y-2">
                  {[
                    { rule: 'SR001 — China → Tanzania (General)', pricing: '$12/KG', reason: 'Overridden by more specific profile rule (SR002)' },
                    { rule: 'SR002 — Electronics (General)', pricing: '$25/KG', reason: 'Overridden by more specific Drone profile rule (SR003)' },
                  ].map((item) => (
                    <div key={item.rule} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                      <XCircle className="size-4 text-gray-300 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">{item.rule} — <span className="text-gray-500">{item.pricing}</span></p>
                        <p className="text-xs text-gray-400">{item.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

function ShippingSettingsPage() {
  return (
    <div className="p-6">
      <PageHeader title="Shipping Engine Settings" description="Configure global defaults and engine behavior" />
      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="Default Currency">
          <div className="p-5 space-y-4">
            <FormField label="Local Delivery Currency" required>
              <Select defaultValue="TZS"><option value="TZS">TSh — Tanzanian Shilling (TZS)</option></Select>
            </FormField>
            <FormField label="International Shipping Currency" required>
              <Select defaultValue="USD"><option value="USD">USD — US Dollar</option><option value="AED">AED — UAE Dirham</option><option value="CNY">CNY — Chinese Yuan</option></Select>
            </FormField>
            <FormField label="Display Currency (Customer-facing)" required>
              <Select defaultValue="TZS"><option value="TZS">TSh — Tanzanian Shilling (TZS)</option></Select>
            </FormField>
            <FormField label="Exchange Rate Source">
              <Select><option>Manual (set rate below)</option><option>Auto (live rate API)</option></Select>
            </FormField>
            <FormField label="USD to TSh Rate" hint="Used to convert international shipping costs to TSh">
              <Input defaultValue="2,550" />
            </FormField>
          </div>
        </SectionCard>
        <SectionCard title="Engine Behavior">
          <div className="p-5 space-y-4">
            <FormField label="No Rule Fallback">
              <Select><option>Return Manual Quote</option><option>Block checkout</option><option>Return error to API</option></Select>
            </FormField>
            <FormField label="CBM Calculation Method">
              <Select><option>Length × Width × Height ÷ 1,000,000</option><option>Manual input only</option></Select>
            </FormField>
            <FormField label="Weight Rounding">
              <Select><option>Round up to nearest 0.5 KG</option><option>Round up to nearest 1 KG</option><option>Exact weight</option></Select>
            </FormField>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Apply minimum charge automatically</p>
                <p className="text-xs text-gray-400">Engine enforces minimum charge without admin action</p>
              </div>
              <div className="relative"><input type="checkbox" defaultChecked className="sr-only" id="toggle-min" /><label htmlFor="toggle-min" className="flex w-11 h-6 bg-blue-600 rounded-full cursor-pointer relative after:absolute after:top-0.5 after:left-5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-all" /></div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Show shipping details to customers</p>
                <p className="text-xs text-gray-400">Customers see cost + delivery estimate only (not zones or rules)</p>
              </div>
              <div className="relative"><input type="checkbox" defaultChecked className="sr-only" id="toggle-show" /><label htmlFor="toggle-show" className="flex w-11 h-6 bg-blue-600 rounded-full cursor-pointer relative after:absolute after:top-0.5 after:left-5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-all" /></div>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="API Configuration" className="col-span-2">
          <div className="p-5">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Shipping Engine API Response Format</p>
              <pre className="text-xs text-gray-600 font-mono overflow-x-auto">{`{
  "shipping_cost": 127500,
  "shipping_cost_display": "TSh 127,500",
  "shipping_method": "Air Cargo",
  "estimated_delivery": "7–14 days",
  "applicable_rule": "SR003",
  "carrier": "SF Express",
  "requires_special_handling": true
}`}</pre>
            </div>
            <p className="text-xs text-gray-400">The mobile app and website request shipping information from this engine. Customers <strong>never</strong> see internal zones, rules, or pricing logic.</p>
          </div>
        </SectionCard>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Btn variant="secondary">Reset to Defaults</Btn>
        <Btn variant="primary">Save Settings</Btn>
      </div>
    </div>
  );
}

// ─── Shipping Methods Page ────────────────────────────────────────────────────

interface ShippingMethod {
  id: string;
  name: string;
  code: string;
  category: 'air' | 'sea' | 'land' | 'local';
  carriers: string[];
  estimatedDays: string;
  status: 'Active' | 'Inactive';
  description: string;
  maxWeightKg: number | null;
  requiresSpecialHandling: boolean;
}

const initialMethods: ShippingMethod[] = [
  { id: 'SM-001', name: 'Air Cargo', code: 'AIR', category: 'air', carriers: ['Ethiopian Airlines', 'Kenya Airways', 'SF Express'], estimatedDays: '5–10 days', status: 'Active', description: 'Standard air freight for general goods. Fast and reliable.', maxWeightKg: null, requiresSpecialHandling: false },
  { id: 'SM-002', name: 'Air Cargo — Sensitive', code: 'AIR-SENS', category: 'air', carriers: ['Ethiopian Airlines', 'SF Express'], estimatedDays: '5–10 days', status: 'Active', description: 'Air freight for electronics, fragile, and battery items. Special handling included.', maxWeightKg: null, requiresSpecialHandling: true },
  { id: 'SM-003', name: 'Sea Freight', code: 'SEA', category: 'sea', carriers: ['MSC', 'Evergreen', 'COSCO'], estimatedDays: '25–40 days', status: 'Active', description: 'Standard sea freight via container. Best for large, heavy, and non-urgent shipments.', maxWeightKg: null, requiresSpecialHandling: false },
  { id: 'SM-004', name: 'Sea Freight — Sensitive', code: 'SEA-SENS', category: 'sea', carriers: ['MSC', 'COSCO'], estimatedDays: '25–40 days', status: 'Active', description: 'Sea freight for electronics and fragile items. Climate-controlled containers.', maxWeightKg: null, requiresSpecialHandling: true },
  { id: 'SM-005', name: 'Bus Cargo', code: 'BUS', category: 'land', carriers: ['Dar Express', 'Kilimanjaro Bus', 'Scandinavian'], estimatedDays: '1–3 days', status: 'Active', description: 'Local inter-city bus cargo within Tanzania. Economical for domestic routes.', maxWeightKg: 50, requiresSpecialHandling: false },
  { id: 'SM-006', name: 'Rider Delivery', code: 'RIDER', category: 'local', carriers: ['Agiza Riders', 'MaxMalipo Riders'], estimatedDays: 'Same day – 24 hrs', status: 'Active', description: 'Motorcycle courier for last-mile delivery within city limits.', maxWeightKg: 15, requiresSpecialHandling: false },
  { id: 'SM-007', name: 'Courier (DHL / FedEx)', code: 'COURIER', category: 'air', carriers: ['DHL', 'FedEx', 'Aramex'], estimatedDays: '3–7 days', status: 'Active', description: 'Door-to-door express courier service. Premium pricing, fastest delivery.', maxWeightKg: null, requiresSpecialHandling: false },
  { id: 'SM-008', name: 'Pickup In Store', code: 'PICKUP', category: 'local', carriers: ['Agiza Shop DSM', 'Agiza Shop MWZ'], estimatedDays: 'Ready in 1–2 hrs', status: 'Active', description: 'Customer collects from an Agiza physical shop location. No shipping cost.', maxWeightKg: null, requiresSpecialHandling: false },
  { id: 'SM-009', name: 'Manual Quote', code: 'MANUAL', category: 'air', carriers: [], estimatedDays: 'TBD', status: 'Active', description: 'Custom shipping arrangement requiring admin to provide a manual quote to the customer.', maxWeightKg: null, requiresSpecialHandling: false },
];

const categoryColors: Record<string, string> = {
  air: 'bg-sky-100 text-sky-700',
  sea: 'bg-blue-100 text-blue-700',
  land: 'bg-amber-100 text-amber-700',
  local: 'bg-green-100 text-green-700',
};

const categoryLabels: Record<string, string> = {
  air: 'Air',
  sea: 'Sea',
  land: 'Land',
  local: 'Local',
};

function AddMethodModal({ onClose, onSave }: { onClose: () => void; onSave: (m: ShippingMethod) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<ShippingMethod['category']>('air');
  const [description, setDescription] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [maxWeight, setMaxWeight] = useState('');
  const [carriersText, setCarriersText] = useState('');
  const [requiresSpecial, setRequiresSpecial] = useState(false);

  const handleSave = () => {
    if (!name.trim() || !code.trim()) return;
    onSave({
      id: `SM-${Date.now()}`,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      category,
      description,
      estimatedDays: estimatedDays || 'TBD',
      maxWeightKg: maxWeight ? parseFloat(maxWeight) : null,
      carriers: carriersText.split(',').map(c => c.trim()).filter(Boolean),
      status: 'Active',
      requiresSpecialHandling: requiresSpecial,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Add Shipping Method</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <AlertCircle className="size-5 text-gray-400 hidden" />
            <svg className="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Method Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Air Cargo" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Code *</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. AIR" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as ShippingMethod['category'])} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="air">Air</option>
                <option value="sea">Sea</option>
                <option value="land">Land</option>
                <option value="local">Local</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Estimated Delivery</label>
              <input value={estimatedDays} onChange={e => setEstimatedDays(e.target.value)} placeholder="e.g. 5–10 days" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description of this shipping method..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Max Weight (KG)</label>
              <input type="number" value={maxWeight} onChange={e => setMaxWeight(e.target.value)} placeholder="Leave blank for unlimited" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Carriers (comma-separated)</label>
              <input value={carriersText} onChange={e => setCarriersText(e.target.value)} placeholder="e.g. DHL, FedEx" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={requiresSpecial} onChange={e => setRequiresSpecial(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Requires Special Handling</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || !code.trim()} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Add Method</button>
        </div>
      </div>
    </div>
  );
}

function ShippingMethodsPage() {
  const [methods, setMethods] = useState<ShippingMethod[]>(initialMethods);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = methods.filter(m => {
    const matchesCat = filterCat === 'all' || m.category === filterCat;
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const toggleStatus = (id: string) => {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, status: m.status === 'Active' ? 'Inactive' : 'Active' } : m));
  };

  const deleteMethod = (id: string) => {
    setMethods(prev => prev.filter(m => m.id !== id));
  };

  const addMethod = (m: ShippingMethod) => {
    setMethods(prev => [...prev, m]);
    setShowAddModal(false);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Shipping Methods"
        subtitle="Manage the available shipping methods that can be assigned to routes, zones, and rules."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setShowAddModal(true)}>Add Method</Btn>}
      />

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['air', 'sea', 'land', 'local'] as const).map(cat => {
          const count = methods.filter(m => m.category === cat && m.status === 'Active').length;
          return (
            <StatCard
              key={cat}
              label={`${categoryLabels[cat]} Methods`}
              value={String(count)}
              color={cat === 'air' ? 'blue' : cat === 'sea' ? 'blue' : cat === 'land' ? 'yellow' : 'green'}
            />
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search methods..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2">
          {(['all', 'air', 'sea', 'land', 'local'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterCat === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat === 'all' ? 'All' : categoryLabels[cat]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} method{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Methods table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Method</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Category</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Carriers</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Delivery Time</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Max Weight</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Special</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(method => (
              <tr key={method.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{method.name}</span>
                      <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded font-mono">{method.code}</span>
                    </div>
                    {method.description && <p className="text-xs text-gray-400 mt-0.5 max-w-xs">{method.description}</p>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${categoryColors[method.category]}`}>
                    {categoryLabels[method.category]}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1">
                    {method.carriers.length > 0 ? method.carriers.map(c => (
                      <span key={c} className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">{c}</span>
                    )) : <span className="text-gray-400 text-xs italic">None assigned</span>}
                  </div>
                </td>
                <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{method.estimatedDays}</td>
                <td className="px-4 py-4 text-gray-600">{method.maxWeightKg !== null ? `${method.maxWeightKg} KG` : <span className="text-gray-400">Unlimited</span>}</td>
                <td className="px-4 py-4">
                  {method.requiresSpecialHandling ? (
                    <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">Yes</span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={method.status} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleStatus(method.id)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                      title={method.status === 'Active' ? 'Deactivate' : 'Activate'}
                    >
                      {method.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => deleteMethod(method.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete method"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                  <Box className="size-10 mx-auto mb-3 text-gray-200" />
                  <p className="text-sm">No shipping methods found.</p>
                  <button onClick={() => setShowAddModal(true)} className="mt-2 text-blue-600 text-sm hover:underline">Add one now</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Info className="size-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">Shipping Methods defined here are referenced in <strong>Routes</strong>, <strong>Zones</strong>, and <strong>Rules</strong>. Deactivating a method will hide it from new rule assignments but will not affect existing active routes.</p>
      </div>

      {showAddModal && <AddMethodModal onClose={() => setShowAddModal(false)} onSave={addMethod} />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShippingEngine({ view }: ShippingEngineProps) {
  switch (view) {
    case 'shipping-engine-overview': return <OverviewPage />;
    case 'shipping-engine-routes': return <RoutesPage />;
    case 'shipping-engine-zones': return <ZonesPage />;
    case 'shipping-engine-profiles': return <ProfilesPage />;
    case 'shipping-engine-rules': return <RulesPage />;
    case 'shipping-engine-carriers': return <CarriersPage />;
    case 'shipping-engine-overrides': return <OverridesPage />;
    case 'shipping-engine-test-rate': return <TestRatePage />;
    case 'shipping-engine-methods': return <ShippingMethodsPage />;
    case 'shipping-engine-settings': return <ShippingSettingsPage />;
    default: return <OverviewPage />;
  }
}
