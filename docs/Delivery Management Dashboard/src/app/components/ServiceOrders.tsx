import { useState } from 'react';
import { 
  Wrench, 
  Users, 
  CheckCircle2, 
  Clock, 
  Search, 
  Filter, 
  ChevronRight, 
  MoreHorizontal, 
  AlertCircle, 
  Calendar,
  Settings,
  ShieldCheck,
  Monitor,
  Flame,
  User,
  MapPin,
  CreditCard,
  History,
  CheckCircle,
  XCircle,
  Clock4,
  HardHat,
  Tv
} from 'lucide-react';
import { format } from 'date-fns';

type OrderStatus = 'Pending' | 'Approved' | 'Assigned' | 'On-Site' | 'In-Progress' | 'Testing' | 'Completed' | 'Maintenance Required';
type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Installment';
type Classification = 'Simple' | 'Bulk' | 'Machinery' | 'Fragile';
type ServiceType = 'Installation' | 'Product Setup' | 'Maintenance' | 'Electronic Repair';

interface EquipmentOrder {
  id: string;
  type: ServiceType;
  equipment: string;
  customer: {
    name: string;
    phone: string;
    location: string;
  };
  classification: Classification;
  handler: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  expectedDate: string;
  orderValue: number;
  description: string;
  needsAttention?: boolean;
  priority: 'High' | 'Medium' | 'Low';
}

const mockOrders: EquipmentOrder[] = [
  {
    id: 'EQ-8291',
    type: 'Installation',
    equipment: 'Industrial Bakery Oven X100',
    customer: { name: 'Mawazo Bakery', phone: '+255 712 000 111', location: 'Dar es Salaam' },
    classification: 'Machinery',
    handler: 'John M.',
    status: 'In-Progress',
    paymentStatus: 'Paid',
    createdAt: '2026-02-18T10:00:00Z',
    expectedDate: '2026-02-21T14:00:00Z',
    orderValue: 1250000,
    description: 'Installation of high-capacity industrial oven. Requires electrical bypass setup.',
    priority: 'High'
  },
  {
    id: 'EQ-8292',
    type: 'Product Setup',
    equipment: '8-Camera CCTV System (HIKVision)',
    customer: { name: 'Sarah Juma', phone: '+255 655 222 333', location: 'Arusha' },
    classification: 'Fragile',
    handler: 'Amani K.',
    status: 'Pending',
    paymentStatus: 'Partial',
    createdAt: '2026-02-20T08:30:00Z',
    expectedDate: '2026-02-23T10:00:00Z',
    orderValue: 450000,
    description: 'Full house surveillance setup with remote access configuration.',
    priority: 'Medium'
  },
  {
    id: 'EQ-8293',
    type: 'Maintenance',
    equipment: 'Solar Water Heater 300L',
    customer: { name: 'Beachfront Hotel', phone: '+255 777 444 555', location: 'Zanzibar' },
    classification: 'Simple',
    handler: 'Said H.',
    status: 'Maintenance Required',
    paymentStatus: 'Installment',
    createdAt: '2026-02-15T12:00:00Z',
    expectedDate: '2026-02-20T16:00:00Z',
    orderValue: 150000,
    description: 'Quarterly maintenance check and filter replacement.',
    needsAttention: true,
    priority: 'High'
  },
  {
    id: 'EQ-8294',
    type: 'Electronic Repair',
    equipment: 'LG Smart TV 65"',
    customer: { name: 'Kevin Malima', phone: '+255 688 666 777', location: 'Mwanza' },
    classification: 'Fragile',
    handler: 'Grace L.',
    status: 'Testing',
    paymentStatus: 'Unpaid',
    createdAt: '2026-02-19T09:15:00Z',
    expectedDate: '2026-02-21T12:00:00Z',
    orderValue: 85000,
    description: 'Screen flickering issue repair and software update.',
    priority: 'Medium'
  },
  {
    id: 'EQ-8295',
    type: 'Product Setup',
    equipment: 'Luxury Sauna Room (4 Person)',
    customer: { name: 'Royal Spa', phone: '+255 622 888 999', location: 'Dodoma' },
    classification: 'Machinery',
    handler: 'Bakari T.',
    status: 'Approved',
    paymentStatus: 'Paid',
    createdAt: '2026-02-20T14:45:00Z',
    expectedDate: '2026-02-25T09:00:00Z',
    orderValue: 2800000,
    description: 'Complete build of cedar wood sauna room with digital controls.',
    priority: 'High'
  },
  {
    id: 'EQ-8296',
    type: 'Installation',
    equipment: 'AC Units x5 (Inverter)',
    customer: { name: 'Tanga Office Complex', phone: '+255 644 111 222', location: 'Tanga' },
    classification: 'Bulk',
    handler: 'Josephine S.',
    status: 'Assigned',
    paymentStatus: 'Partial',
    createdAt: '2026-02-21T07:20:00Z',
    expectedDate: '2026-02-22T08:00:00Z',
    orderValue: 650000,
    description: 'Installation of 5 split AC units in the new office wing.',
    priority: 'Medium'
  }
];

export function ServiceOrders() {
  const [activeTab, setActiveTab] = useState<'all' | 'attention' | 'progress' | 'completed'>('all');
  const [selectedOrder, setSelectedOrder] = useState<EquipmentOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingDate, setIsEditingDate] = useState<string | null>(null);
  const [editedDate, setEditedDate] = useState('');

  const filteredOrders = mockOrders.filter(order => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.equipment.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === 'attention') return matchesSearch && order.needsAttention;
    if (activeTab === 'progress') return matchesSearch && (order.status === 'In-Progress' || order.status === 'On-Site' || order.status === 'Testing');
    if (activeTab === 'completed') return matchesSearch && order.status === 'Completed';
    return matchesSearch;
  });

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'In-Progress': 
      case 'On-Site':
      case 'Testing': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Maintenance Required': return 'bg-red-100 text-red-700 border-red-200';
      case 'Approved': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Assigned': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPaymentColor = (status: PaymentStatus) => {
    switch (status) {
      case 'Paid': return 'text-green-600 font-medium';
      case 'Unpaid': return 'text-red-600 font-medium';
      case 'Partial': return 'text-orange-600 font-medium';
      case 'Installment': return 'text-blue-600 font-medium';
      default: return 'text-gray-600';
    }
  };

  const getClassificationIcon = (type: Classification) => {
    switch (type) {
      case 'Machinery': return <Settings className="size-4" />;
      case 'Fragile': return <ShieldCheck className="size-4" />;
      case 'Bulk': return <Users className="size-4" />;
      case 'Simple': return <Wrench className="size-4" />;
    }
  };

  const getServiceIcon = (type: ServiceType) => {
    switch (type) {
      case 'Installation': return <HardHat className="size-5" />;
      case 'Product Setup': return <Tv className="size-5" />;
      case 'Maintenance': return <Wrench className="size-5" />;
      case 'Electronic Repair': return <Monitor className="size-5" />;
    }
  };

  const handleDateEdit = (id: string, current: string) => {
    setIsEditingDate(id);
    setEditedDate(current.split('T')[0]);
  };

  const saveDate = (id: string) => {
    // In a real app, update state or API
    setIsEditingDate(null);
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Equipment Support Orders</h1>
            <p className="text-gray-600">Installation, Setup, Maintenance, and Repairs Management</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              <History className="size-4" />
              History
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
              <Wrench className="size-4" />
              New Support Request
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Active Requests', value: '42', icon: Clock4, color: 'blue' },
            { label: 'Pending Approval', value: '12', icon: AlertCircle, color: 'orange' },
            { label: 'In Progress', value: '18', icon: Wrench, color: 'purple' },
            { label: 'Maintenance Alerts', value: '5', icon: AlertCircle, color: 'red' }
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl bg-${stat.color}-50 text-${stat.color}-600`}>
                  <stat.icon className="size-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs & Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="border-b border-gray-200 px-6">
            <div className="flex items-center justify-between overflow-x-auto no-scrollbar">
              <div className="flex gap-8">
                {[
                  { id: 'all', label: 'All Requests' },
                  { id: 'attention', label: 'Needs Attention', count: mockOrders.filter(o => o.needsAttention).length },
                  { id: 'progress', label: 'In Progress' },
                  { id: 'completed', label: 'Completed' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-4 text-sm font-medium relative transition-colors ${
                      activeTab === tab.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                        {tab.count}
                      </span>
                    )}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 group-focus-within:text-blue-500" />
                  <input
                    type="text"
                    placeholder="Search orders, customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64"
                  />
                </div>
                <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
                  <Filter className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID & Type</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Classification</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer & Location</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Handler</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expected Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          order.type === 'Installation' ? 'bg-blue-50 text-blue-600' :
                          order.type === 'Product Setup' ? 'bg-purple-50 text-purple-600' :
                          order.type === 'Maintenance' ? 'bg-orange-50 text-orange-600' :
                          'bg-indigo-50 text-indigo-600'
                        }`}>
                          {getServiceIcon(order.type)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{order.id}</p>
                          <p className="text-xs text-gray-500">{order.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 rounded-md w-fit">
                        <span className="text-gray-500">{getClassificationIcon(order.classification)}</span>
                        <span className="text-xs font-medium text-gray-700">{order.classification}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="size-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                          {order.customer.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{order.customer.name}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="size-3" />
                            {order.customer.location}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="size-6 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center">
                          <User className="size-3 text-blue-600" />
                        </div>
                        <span className="text-sm text-gray-600 font-medium">{order.handler}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                        {order.needsAttention && (
                          <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isEditingDate === order.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={editedDate}
                            onChange={(e) => setEditedDate(e.target.value)}
                            className="text-xs border border-gray-300 rounded p-1 focus:ring-1 focus:ring-blue-500"
                          />
                          <button onClick={() => saveDate(order.id)} className="text-blue-600 hover:text-blue-700">
                            <CheckCircle2 className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <div 
                          className="flex items-center gap-2 text-sm text-gray-600 group-hover:text-blue-600 cursor-pointer transition-colors"
                          onClick={() => handleDateEdit(order.id, order.expectedDate)}
                        >
                          <Calendar className="size-4 opacity-40" />
                          <span>{format(new Date(order.expectedDate), 'MMM dd, HH:mm')}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`text-sm ${getPaymentColor(order.paymentStatus)}`}>
                          {order.paymentStatus}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => {
                          setSelectedOrder(order);
                          setIsModalOpen(true);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${
                  selectedOrder.type === 'Installation' ? 'bg-blue-100 text-blue-600' :
                  selectedOrder.type === 'Product Setup' ? 'bg-purple-100 text-purple-600' :
                  selectedOrder.type === 'Maintenance' ? 'bg-orange-100 text-orange-600' :
                  'bg-indigo-100 text-indigo-600'
                }`}>
                  {getServiceIcon(selectedOrder.type)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedOrder.id}</h3>
                  <p className="text-sm text-gray-500">{selectedOrder.equipment}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600 shadow-sm"
              >
                <XCircle className="size-6" />
              </button>
            </div>

            <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Customer Details</p>
                    <p className="font-bold text-gray-900">{selectedOrder.customer.name}</p>
                    <p className="text-sm text-gray-600">{selectedOrder.customer.phone}</p>
                    <p className="text-sm text-gray-600">{selectedOrder.customer.location}, Tanzania</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Assigned Technician</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="size-8 bg-blue-50 rounded-full flex items-center justify-center">
                        <User className="size-4 text-blue-600" />
                      </div>
                      <p className="font-medium text-gray-900">{selectedOrder.handler}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                    <p className="text-xs text-blue-600 uppercase font-bold tracking-wider mb-1">Total Service Value</p>
                    <p className="text-2xl font-black text-blue-700">TSh {selectedOrder.orderValue.toLocaleString()}</p>
                    <div className={`mt-2 text-xs font-bold px-2 py-1 rounded w-fit ${
                      selectedOrder.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {selectedOrder.paymentStatus.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Service Type</p>
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">
                      {selectedOrder.type} - {selectedOrder.classification}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Requirement Description</p>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-700 leading-relaxed">
                  {selectedOrder.description}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Service Timeline</p>
                <div className="space-y-4">
                  {[
                    { label: 'Request Logged', time: selectedOrder.createdAt, icon: Clock, done: true },
                    { label: 'Technician Assigned', time: '2026-02-21T08:00:00Z', icon: User, done: true },
                    { label: 'On-Site Work', time: selectedOrder.expectedDate, icon: MapPin, done: selectedOrder.status === 'On-Site' || selectedOrder.status === 'Completed' },
                    { label: 'Completion & Testing', time: 'Estimated Pending', icon: CheckCircle, done: selectedOrder.status === 'Completed' }
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${
                        step.done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <step.icon className="size-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-bold ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                          <p className="text-xs text-gray-500">
                            {step.time.includes('T') ? format(new Date(step.time), 'MMM dd, HH:mm') : step.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4">
              <button 
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-colors"
              >
                <CreditCard className="size-4" />
                Update Payment
              </button>
              <button 
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                <Users className="size-4" />
                Change Technician
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
