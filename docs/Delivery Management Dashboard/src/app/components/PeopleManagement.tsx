import { useState } from 'react';
import { Users, UserPlus, Search, Filter, Ship, Store, Wrench, Truck as TruckIcon, Send, Tag as TagIcon, X, Warehouse, Plus, CheckCircle, MapPin } from 'lucide-react';
import { UserDetailModal, type UserTag, type UserCategory } from './UserDetailModal';
import { CampaignTargetingModal } from './CampaignTargetingModal';
import { allWarehouses } from './WarehouseManagement';

type UserRole = 'customer' | 'staff' | 'shipper' | 'shop-vendor' | 'service-provider' | 'driver';
type StaffLevel = 'sales' | 'finance' | 'procurement' | 'data-entry' | 'admin-level-1' | 'admin-level-2' | 'top-admin';
type ShipperService = 'air-cargo' | 'sea-cargo' | 'local-land-cargo';

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  staffLevel?: StaffLevel;
  shipperServices?: ShipperService[];
  shipperCountries?: string[];
  status: 'active' | 'inactive';
  joinedDate: string;
  totalOrders?: number;
  rating?: number;
  tags?: UserTag[];
  categories?: UserCategory[];
}

const mockPeople: Person[] = [
  // Staff
  {
    id: 'STF-001',
    name: 'Sarah Mtui',
    email: 'sarah.mtui@agiza.co.tz',
    phone: '+255 123 456 789',
    role: 'staff',
    staffLevel: 'admin-level-2',
    status: 'active',
    joinedDate: '2025-06-01'
  },
  {
    id: 'STF-002',
    name: 'Emmanuel Mollel',
    email: 'emmanuel.mollel@agiza.co.tz',
    phone: '+255 123 456 790',
    role: 'staff',
    staffLevel: 'admin-level-1',
    status: 'active',
    joinedDate: '2025-07-15'
  },
  {
    id: 'STF-003',
    name: 'Ahmed Salim',
    email: 'ahmed.salim@agiza.co.tz',
    phone: '+255 123 456 791',
    role: 'staff',
    staffLevel: 'procurement',
    status: 'active',
    joinedDate: '2025-08-10'
  },
  {
    id: 'STF-004',
    name: 'David Lyimo',
    email: 'david.lyimo@agiza.co.tz',
    phone: '+255 123 456 792',
    role: 'staff',
    staffLevel: 'sales',
    status: 'active',
    joinedDate: '2025-09-01'
  },
  
  // Shippers
  {
    id: 'SHP-001',
    name: 'Silent Ocean',
    email: 'ops@silentocean.co.tz',
    phone: '+255 700 000 001',
    role: 'shipper',
    shipperServices: ['sea-cargo'],
    shipperCountries: ['China', 'USA', 'UK'],
    status: 'active',
    joinedDate: '2024-01-10',
    totalOrders: 245,
    rating: 4.8
  },
  {
    id: 'SHP-002',
    name: 'Umoja Cargo',
    email: 'contact@umojacargo.tz',
    phone: '+255 700 000 002',
    role: 'shipper',
    shipperServices: ['air-cargo', 'sea-cargo'],
    shipperCountries: ['USA', 'UK', 'Dubai'],
    status: 'active',
    joinedDate: '2024-02-15',
    totalOrders: 189,
    rating: 4.6
  },
  {
    id: 'SHP-003',
    name: 'Abdulraheem Dubai',
    email: 'info@abdulraheemdubai.ae',
    phone: '+971 50 000 0001',
    role: 'shipper',
    shipperServices: ['air-cargo'],
    shipperCountries: ['Dubai'],
    status: 'active',
    joinedDate: '2024-03-20',
    totalOrders: 312,
    rating: 4.9
  },
  {
    id: 'SHP-004',
    name: 'Inland Strategy',
    email: 'ops@inlandstrategy.co.tz',
    phone: '+255 700 000 003',
    role: 'shipper',
    shipperServices: ['local-land-cargo'],
    shipperCountries: ['Tanzania'],
    status: 'active',
    joinedDate: '2024-04-01',
    totalOrders: 567,
    rating: 4.7
  },

  // Customers
  {
    id: 'CUST-001',
    name: 'Fatuma Hassan',
    email: 'fatuma.hassan@email.com',
    phone: '+255 765 123 456',
    role: 'customer',
    status: 'active',
    joinedDate: '2025-11-15',
    totalOrders: 12,
    tags: [
      { id: 'tag-1', label: 'VIP', type: 'system', createdAt: '2025-12-01T10:00:00Z' },
      { id: 'tag-2', label: 'electronics_buyer', type: 'system', createdAt: '2025-12-01T10:00:00Z' }
    ],
    categories: [
      { id: 'cat-1', label: 'electronics', confidence: 85 },
      { id: 'cat-2', label: 'fashion', confidence: 45 }
    ]
  },
  {
    id: 'CUST-002',
    name: 'John Mwamba',
    email: 'john.mwamba@email.com',
    phone: '+255 765 123 457',
    role: 'customer',
    status: 'active',
    joinedDate: '2025-10-20',
    totalOrders: 8,
    tags: [
      { id: 'tag-3', label: 'repeat_customer', type: 'manual', createdAt: '2025-11-15T10:00:00Z' }
    ],
    categories: [
      { id: 'cat-3', label: 'home_goods', confidence: 65 }
    ]
  },
  {
    id: 'CUST-003',
    name: 'Maria Komba',
    email: 'maria.komba@email.com',
    phone: '+255 765 123 458',
    role: 'customer',
    status: 'inactive',
    joinedDate: '2025-08-01',
    totalOrders: 3,
    tags: [
      { id: 'tag-4', label: 'inactive', type: 'system', createdAt: '2026-01-01T10:00:00Z' }
    ],
    categories: [
      { id: 'cat-4', label: 'fashion', confidence: 72 }
    ]
  },
  {
    id: 'CUST-004',
    name: 'Peter Nyerere',
    email: 'peter.nyerere@email.com',
    phone: '+255 765 123 459',
    role: 'customer',
    status: 'active',
    joinedDate: '2025-12-01',
    totalOrders: 25,
    tags: [
      { id: 'tag-5', label: 'VIP', type: 'system', createdAt: '2026-01-15T10:00:00Z' },
      { id: 'tag-6', label: 'bulk_buyer', type: 'manual', createdAt: '2026-01-20T10:00:00Z' }
    ],
    categories: [
      { id: 'cat-5', label: 'machinery', confidence: 91 },
      { id: 'cat-6', label: 'electronics', confidence: 68 }
    ]
  },

  // Service Providers
  {
    id: 'SERV-001',
    name: 'Juma Plumbing Services',
    email: 'juma.plumbing@email.com',
    phone: '+255 789 111 222',
    role: 'service-provider',
    status: 'active',
    joinedDate: '2025-09-01',
    totalOrders: 45,
    rating: 4.5
  },
  {
    id: 'SERV-002',
    name: 'Grace Cleaning Co.',
    email: 'grace.cleaning@email.com',
    phone: '+255 789 111 223',
    role: 'service-provider',
    status: 'active',
    joinedDate: '2025-08-15',
    totalOrders: 67,
    rating: 4.8
  },

  // Drivers
  {
    id: 'DRV-001',
    name: 'Hassan Mohammed',
    email: 'hassan.driver@agiza.co.tz',
    phone: '+255 754 111 222',
    role: 'driver',
    status: 'active',
    joinedDate: '2025-07-01',
    totalOrders: 234
  },
  {
    id: 'DRV-002',
    name: 'Peter Kimani',
    email: 'peter.driver@agiza.co.tz',
    phone: '+255 754 111 223',
    role: 'driver',
    status: 'active',
    joinedDate: '2025-07-15',
    totalOrders: 189
  },

  // Shop Vendors
  {
    id: 'VEND-001',
    name: 'Mama Saida Shop',
    email: 'mamasaida@shop.tz',
    phone: '+255 788 333 444',
    role: 'shop-vendor',
    status: 'active',
    joinedDate: '2025-06-10',
    totalOrders: 56,
    rating: 4.6
  },
];

// ─── Shipper Edit Modal ───────────────────────────────────────────────────────

const consolidationWarehouses = allWarehouses.filter(w => w.type === 'Consolidation');

function ShipperEditModal({ shipper, onClose }: { shipper: Person; onClose: () => void }) {
  const [linkedWHs, setLinkedWHs] = useState<string[]>(
    shipper.id === 'SHP-001' ? ['WH-INT-001', 'WH-INT-003'] :
    shipper.id === 'SHP-002' ? ['WH-INT-004', 'WH-INT-005'] :
    shipper.id === 'SHP-003' ? ['WH-INT-002'] :
    []
  );

  const toggleWH = (id: string) =>
    setLinkedWHs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{shipper.name}</h2>
            <p className="text-xs text-gray-500">{shipper.id} · {shipper.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="size-5 text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Company / Name</label>
              <input defaultValue={shipper.name} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
              <input defaultValue={shipper.email} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Phone</label>
              <input defaultValue={shipper.phone} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
              <select defaultValue={shipper.status} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Shipping Services</label>
            <div className="flex flex-wrap gap-2">
              {['air-cargo', 'sea-cargo', 'local-land-cargo'].map(s => (
                <label key={s} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors">
                  <input type="checkbox" defaultChecked={shipper.shipperServices?.includes(s as any)} className="rounded text-blue-600" />
                  {s.replace(/-/g, ' ')}
                </label>
              ))}
            </div>
          </div>

          {/* Countries */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Origin Countries</label>
            <div className="flex flex-wrap gap-2">
              {['China', 'Dubai', 'USA', 'UK', 'India', 'Tanzania'].map(c => (
                <label key={c} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors">
                  <input type="checkbox" defaultChecked={shipper.shipperCountries?.includes(c)} className="rounded text-blue-600" />
                  {c}
                </label>
              ))}
            </div>
          </div>

          {/* Consolidation Warehouses */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Warehouse className="size-4 text-gray-600" />
              <label className="text-sm font-semibold text-gray-700">Consolidation Warehouses</label>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Link this shipper to consolidation warehouses. When orders arrive at a linked warehouse, the shipper is automatically notified and the order tracking reflects the warehouse as a confirmed checkpoint.
            </p>
            <div className="space-y-2">
              {consolidationWarehouses.map(wh => {
                const linked = linkedWHs.includes(wh.id);
                return (
                  <label
                    key={wh.id}
                    className={`flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-colors ${linked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={linked} onChange={() => toggleWH(wh.id)} className="rounded text-blue-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{wh.name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${linked ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{wh.id}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{wh.city}, {wh.country} — {wh.address}</span>
                        </div>
                      </div>
                    </div>
                    {linked && <CheckCircle className="size-4 text-blue-600 flex-shrink-0" />}
                  </label>
                );
              })}
            </div>
            {linkedWHs.length > 0 && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <CheckCircle className="size-4 text-green-600 flex-shrink-0" />
                <p className="text-xs text-green-700">
                  <strong>{linkedWHs.length} warehouse{linkedWHs.length > 1 ? 's' : ''} linked.</strong> Orders received at these locations will show this shipper as the responsible party in tracking.
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Internal Notes</label>
            <textarea rows={2} placeholder="Any notes about this shipper..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 rounded-b-xl">
          <button className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700">Save Changes</button>
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function PeopleManagement() {
  const [activeTab, setActiveTab] = useState<UserRole>('customer');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<Person | null>(null);
  const [selectedShipper, setSelectedShipper] = useState<Person | null>(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [people, setPeople] = useState<Person[]>(mockPeople);

  const getRoleBadge = (role: UserRole) => {
    const styles = {
      'customer': 'bg-blue-100 text-blue-800',
      'staff': 'bg-purple-100 text-purple-800',
      'shipper': 'bg-green-100 text-green-800',
      'shop-vendor': 'bg-orange-100 text-orange-800',
      'service-provider': 'bg-indigo-100 text-indigo-800',
      'driver': 'bg-cyan-100 text-cyan-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[role]}`}>
        {role.replace('-', ' ').toUpperCase()}
      </span>
    );
  };

  const getStaffLevelBadge = (level: StaffLevel) => {
    const styles = {
      'sales': 'bg-blue-100 text-blue-800',
      'finance': 'bg-green-100 text-green-800',
      'procurement': 'bg-purple-100 text-purple-800',
      'data-entry': 'bg-gray-100 text-gray-800',
      'admin-level-1': 'bg-orange-100 text-orange-800',
      'admin-level-2': 'bg-red-100 text-red-800',
      'top-admin': 'bg-indigo-100 text-indigo-800',
    };

    const labels = {
      'sales': 'Sales',
      'finance': 'Finance',
      'procurement': 'Procurement',
      'data-entry': 'Data Entry',
      'admin-level-1': 'Admin Level 1',
      'admin-level-2': 'Admin Level 2',
      'top-admin': 'Top Admin',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[level]}`}>
        {labels[level]}
      </span>
    );
  };

  // Get all unique tags from customers
  const allTags = Array.from(
    new Set(
      people
        .filter(p => p.role === 'customer')
        .flatMap(p => p.tags?.map(t => t.label) || [])
    )
  );

  // Get all unique categories from customers
  const allCategories = Array.from(
    new Set(
      people
        .filter(p => p.role === 'customer')
        .flatMap(p => p.categories?.map(c => c.label) || [])
    )
  );

  const handleUpdateTags = (userId: string, tags: UserTag[]) => {
    setPeople(people.map(p =>
      p.id === userId ? { ...p, tags } : p
    ));
  };

  const filteredPeople = people.filter(person => {
    const matchesTab = person.role === activeTab;
    const matchesSearch =
      person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      person.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      person.phone.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || person.status === statusFilter;
    const matchesTag = tagFilter === 'all' || person.tags?.some(t => t.label === tagFilter);

    return matchesTab && matchesSearch && matchesStatus && matchesTag;
  });

  const counts = {
    customer: people.filter(p => p.role === 'customer').length,
    staff: people.filter(p => p.role === 'staff').length,
    shipper: people.filter(p => p.role === 'shipper').length,
    'shop-vendor': people.filter(p => p.role === 'shop-vendor').length,
    'service-provider': people.filter(p => p.role === 'service-provider').length,
    driver: people.filter(p => p.role === 'driver').length,
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">People Management</h1>
            <p className="text-gray-600">Manage all users across the platform</p>
          </div>
          <div className="flex gap-3">
            {activeTab === 'customer' && (
              <button
                onClick={() => setShowCampaignModal(true)}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
              >
                <Send className="size-5" />
                Send Campaign
              </button>
            )}
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2">
              <UserPlus className="size-5" />
              Add New Person
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          {Object.entries(counts).map(([role, count]) => {
            const icons = {
              customer: Users,
              staff: Users,
              shipper: Ship,
              'shop-vendor': Store,
              'service-provider': Wrench,
              driver: TruckIcon,
            };
            const Icon = icons[role as UserRole];

            return (
              <div key={role} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">{role.replace('-', ' ')}</p>
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                  </div>
                  <div className="bg-blue-100 p-2 rounded-full">
                    <Icon className="size-5 text-blue-600" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              {activeTab === 'customer' && allTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">All Tags</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              )}

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

          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            {(['customer', 'staff', 'shipper', 'shop-vendor', 'service-provider', 'driver'] as UserRole[]).map(role => (
              <button
                key={role}
                onClick={() => setActiveTab(role)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === role
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {role.replace('-', ' ')} ({counts[role]})
              </button>
            ))}
          </div>
        </div>

        {/* People Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Contact</th>
                  {activeTab === 'staff' && (
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Staff Level</th>
                  )}
                  {activeTab === 'shipper' && (
                    <>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Services</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Countries</th>
                    </>
                  )}
                  {(activeTab === 'customer' || activeTab === 'service-provider' || activeTab === 'driver' || activeTab === 'shop-vendor') && (
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total Orders</th>
                  )}
                  {(activeTab === 'service-provider' || activeTab === 'shop-vendor' || activeTab === 'shipper') && (
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Rating</th>
                  )}
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Joined Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPeople.map((person) => (
                  <tr
                    key={person.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (activeTab === 'customer') setSelectedUser(person);
                      else if (activeTab === 'shipper') setSelectedShipper(person);
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{person.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{person.name}</div>
                      {activeTab === 'customer' && person.tags && person.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {person.tags.slice(0, 3).map(tag => (
                            <span
                              key={tag.id}
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                tag.type === 'system'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {tag.label}
                            </span>
                          ))}
                          {person.tags.length > 3 && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                              +{person.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{person.email}</div>
                      <div className="text-sm text-gray-500">{person.phone}</div>
                    </td>
                    {activeTab === 'staff' && person.staffLevel && (
                      <td className="px-6 py-4">{getStaffLevelBadge(person.staffLevel)}</td>
                    )}
                    {activeTab === 'shipper' && (
                      <>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {person.shipperServices?.map((service, index) => (
                              <div key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded inline-block mr-1">
                                {service.replace('-', ' ')}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {person.shipperCountries?.join(', ')}
                          </div>
                        </td>
                      </>
                    )}
                    {(activeTab === 'customer' || activeTab === 'service-provider' || activeTab === 'driver' || activeTab === 'shop-vendor') && (
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{person.totalOrders || 0}</div>
                      </td>
                    )}
                    {(activeTab === 'service-provider' || activeTab === 'shop-vendor' || activeTab === 'shipper') && (
                      <td className="px-6 py-4">
                        {person.rating ? (
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500">★</span>
                            <span className="font-semibold text-gray-900">{person.rating}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        person.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {person.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(person.joinedDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeTab === 'customer') {
                            setSelectedUser(person);
                          } else if (activeTab === 'shipper') {
                            setSelectedShipper(person);
                          }
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        {activeTab === 'customer' ? 'View Details' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredPeople.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <Users className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No people found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your search or filters</p>
          </div>
        )}

        {/* User Detail Modal */}
        {selectedUser && (
          <UserDetailModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onUpdateTags={handleUpdateTags}
          />
        )}

        {/* Shipper Edit Modal */}
        {selectedShipper && (
          <ShipperEditModal
            shipper={selectedShipper}
            onClose={() => setSelectedShipper(null)}
          />
        )}

        {/* Campaign Targeting Modal */}
        {showCampaignModal && (
          <CampaignTargetingModal
            onClose={() => setShowCampaignModal(false)}
            availableTags={allTags}
            availableCategories={allCategories}
          />
        )}
      </div>
    </div>
  );
}
