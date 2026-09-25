import { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, User, Package2, Calendar, FileText, AlertCircle, CheckCircle2, Clock, Search, AlertTriangle, Edit2, DollarSign } from 'lucide-react';

interface StatusTimestamp {
  status: string;
  expectedDate: string;
  actualDate?: string;
}

interface StatusUpdate {
  status: string;
  timestamp: string;
  handler: string;
  notes?: string;
}

interface InternationalOrder {
  orderId: string;
  customerName: string;
  itemsName: string;
  sourceOrigin: 'china' | 'uk' | 'usa' | 'dubai' | 'india';
  status: 'pending-payment' | 'issue-pending-payment' | 'supplier-confirmed' | 'paid-supplier' | 'in-production' | 'sent-to-consolidation' | 'shipping-to-destination' | 'clearance' | 'ready-for-collection' | 'completed';
  orderType: 'simple' | 'bulk' | 'machinery' | 'fragile';
  paymentStatus: 'fully-paid' | 'partial' | 'unpaid' | 'installment';
  serviceType: 'full-service' | 'deliver-for-me' | 'local-purchase' | 'marketplace';
  department: 'unassigned' | 'procurement' | 'shipping' | 'delivery';
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  createdAt: string;
  estimatedDelivery?: string;
  supplierName?: string;
  trackingNumber?: string;
  notes?: string;
  handler?: string;
  statusTimestamps?: StatusTimestamp[];
  statusHistory?: StatusUpdate[];
  installmentAllowed?: boolean;
  shippingCost?: number;
  cost?: number;
}

const mockInternationalOrders: InternationalOrder[] = [
  {
    orderId: 'INT-001',
    customerName: 'Fatuma Hassan',
    itemsName: 'Electronics - 5x Smartphones, 10x Chargers',
    sourceOrigin: 'china',
    status: 'in-production',
    orderType: 'simple',
    paymentStatus: 'partial',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 2500000,
    amountPaid: 1000000,
    amountDue: 1500000,
    cost: 1800000,
    shippingCost: 200000,
    createdAt: '2026-01-10T08:00:00',
    estimatedDelivery: '2026-02-15T00:00:00',
    supplierName: 'Shenzhen Tech Co.',
    handler: 'Sarah Mtui',
    notes: 'Customer requested quality check before shipping',
    statusHistory: [
      { status: 'pending-payment', timestamp: '2026-01-10T08:00:00', handler: 'Sarah Mtui', notes: 'Order created' },
      { status: 'paid-supplier', timestamp: '2026-01-11T10:30:00', handler: 'Sarah Mtui', notes: 'Partial payment received' },
      { status: 'in-production', timestamp: '2026-01-12T14:20:00', handler: 'Sarah Mtui', notes: 'Production started' }
    ]
  },
  {
    orderId: 'INT-002',
    customerName: 'John Mwamba',
    itemsName: 'Fashion - 50x Designer T-shirts, 30x Jeans',
    sourceOrigin: 'dubai',
    status: 'shipping-to-destination',
    orderType: 'bulk',
    paymentStatus: 'fully-paid',
    serviceType: 'deliver-for-me',
    department: 'shipping',
    totalAmount: 1800000,
    amountPaid: 1800000,
    amountDue: 0,
    cost: 1200000,
    shippingCost: 300000,
    createdAt: '2026-01-08T10:30:00',
    estimatedDelivery: '2026-01-25T00:00:00',
    supplierName: 'Dubai Fashion Hub',
    trackingNumber: 'DXB-TZ-2026-0845',
    handler: 'Ahmed Salim'
  },
  {
    orderId: 'INT-003',
    customerName: 'Grace Kimaro',
    itemsName: 'Home Appliances - 2x Refrigerators, 3x Microwaves',
    sourceOrigin: 'usa',
    status: 'clearance',
    orderType: 'machinery',
    paymentStatus: 'fully-paid',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 4200000,
    amountPaid: 4200000,
    amountDue: 0,
    cost: 3000000,
    shippingCost: 800000,
    createdAt: '2026-01-05T14:20:00',
    estimatedDelivery: '2026-01-20T00:00:00',
    supplierName: 'US Home Solutions',
    trackingNumber: 'USA-TZ-2026-1234',
    handler: 'Emmanuel Mollel',
    notes: 'Customs clearance in progress - documentation submitted'
  },
  {
    orderId: 'INT-004',
    customerName: 'Ahmed Salim',
    itemsName: 'Machinery Parts - Industrial Equipment',
    sourceOrigin: 'uk',
    status: 'paid-supplier',
    orderType: 'machinery',
    paymentStatus: 'installment',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 8500000,
    amountPaid: 3000000,
    amountDue: 5500000,
    cost: 6000000,
    shippingCost: 1200000,
    createdAt: '2026-01-12T09:15:00',
    estimatedDelivery: '2026-02-20T00:00:00',
    supplierName: 'UK Industrial Ltd',
    handler: 'David Lyimo',
    installmentAllowed: true
  },
  {
    orderId: 'INT-005',
    customerName: 'Neema Mkwawa',
    itemsName: 'Textiles - 200m Fabric Rolls',
    sourceOrigin: 'india',
    status: 'sent-to-consolidation',
    orderType: 'bulk',
    paymentStatus: 'fully-paid',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 950000,
    amountPaid: 950000,
    amountDue: 0,
    cost: 600000,
    shippingCost: 150000,
    createdAt: '2026-01-11T11:00:00',
    estimatedDelivery: '2026-02-01T00:00:00',
    supplierName: 'Mumbai Textiles Export',
    trackingNumber: 'IND-TZ-2026-5678',
    handler: 'Sarah Mtui'
  },
  {
    orderId: 'INT-006',
    customerName: 'David Lyimo',
    itemsName: 'Construction Materials - Tiles & Fixtures',
    sourceOrigin: 'china',
    status: 'pending-payment',
    orderType: 'bulk',
    paymentStatus: 'unpaid',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 3200000,
    amountPaid: 0,
    amountDue: 3200000,
    cost: 2100000,
    shippingCost: 400000,
    createdAt: '2026-01-13T15:30:00',
    estimatedDelivery: '2026-02-25T00:00:00',
    supplierName: 'Guangzhou Building Supplies',
    handler: 'Ahmed Salim'
  },
  {
    orderId: 'INT-007',
    customerName: 'Sarah Mtui',
    itemsName: 'Beauty Products - Cosmetics & Skincare',
    sourceOrigin: 'dubai',
    status: 'ready-for-collection',
    orderType: 'fragile',
    paymentStatus: 'fully-paid',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 650000,
    amountPaid: 650000,
    amountDue: 0,
    cost: 400000,
    shippingCost: 100000,
    createdAt: '2026-01-03T12:00:00',
    supplierName: 'Dubai Beauty Trading',
    trackingNumber: 'DXB-TZ-2026-9012',
    handler: 'Emmanuel Mollel'
  },
  {
    orderId: 'INT-008',
    customerName: 'Emmanuel Mollel',
    itemsName: 'Medical Equipment - Diagnostic Devices',
    sourceOrigin: 'usa',
    status: 'issue-pending-payment',
    orderType: 'fragile',
    paymentStatus: 'installment',
    serviceType: 'full-service',
    department: 'procurement',
    totalAmount: 12000000,
    amountPaid: 2000000,
    amountDue: 10000000,
    cost: 8000000,
    shippingCost: 1500000,
    createdAt: '2026-01-14T08:45:00',
    estimatedDelivery: '2026-03-01T00:00:00',
    supplierName: 'MedTech USA Inc.',
    handler: 'David Lyimo',
    notes: 'Payment verification issue - customer contacted',
    installmentAllowed: false
  },
];

export function InternationalOrders() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'needs-attention' | 'completed'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<string>('all');
  const [handlerFilter, setHandlerFilter] = useState<string>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [viewDetailsModal, setViewDetailsModal] = useState<InternationalOrder | null>(null);

  const toggleRow = (orderId: string) => {
    setExpandedRow(expandedRow === orderId ? null : orderId);
  };

  const getOriginBadge = (origin: InternationalOrder['sourceOrigin']) => {
    const styles = {
      'china': 'bg-red-100 text-red-800',
      'uk': 'bg-blue-100 text-blue-800',
      'usa': 'bg-indigo-100 text-indigo-800',
      'dubai': 'bg-amber-100 text-amber-800',
      'india': 'bg-orange-100 text-orange-800',
    };

    const labels = {
      'china': 'China',
      'uk': 'United Kingdom',
      'usa': 'United States',
      'dubai': 'Dubai, UAE',
      'india': 'India',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[origin]}`}>
        {labels[origin]}
      </span>
    );
  };

  const getStatusBadge = (status: InternationalOrder['status']) => {
    const styles = {
      'pending-payment': 'bg-yellow-100 text-yellow-800',
      'issue-pending-payment': 'bg-red-100 text-red-800',
      'supplier-confirmed': 'bg-blue-100 text-blue-800',
      'paid-supplier': 'bg-green-100 text-green-800',
      'in-production': 'bg-purple-100 text-purple-800',
      'sent-to-consolidation': 'bg-indigo-100 text-indigo-800',
      'shipping-to-destination': 'bg-cyan-100 text-cyan-800',
      'clearance': 'bg-orange-100 text-orange-800',
      'ready-for-collection': 'bg-emerald-100 text-emerald-800',
      'completed': 'bg-gray-100 text-gray-800',
    };

    const labels = {
      'pending-payment': 'Pending Payment',
      'issue-pending-payment': 'Issue - Pending Payment',
      'supplier-confirmed': 'Supplier Confirmed',
      'paid-supplier': 'Paid Supplier',
      'in-production': 'In Production',
      'sent-to-consolidation': 'Sent to Consolidation',
      'shipping-to-destination': 'Shipping to Tanzania',
      'clearance': 'Customs Clearance',
      'ready-for-collection': 'Ready for Collection',
      'completed': 'Completed',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getOrderTypeBadge = (type: InternationalOrder['orderType']) => {
    const styles = {
      'simple': 'bg-gray-100 text-gray-800',
      'bulk': 'bg-blue-100 text-blue-800',
      'machinery': 'bg-purple-100 text-purple-800',
      'fragile': 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[type]}`}>
        {type.toUpperCase()}
      </span>
    );
  };

  const getPaymentStatusBadge = (status: InternationalOrder['paymentStatus']) => {
    const styles = {
      'fully-paid': 'bg-green-100 text-green-800',
      'partial': 'bg-yellow-100 text-yellow-800',
      'unpaid': 'bg-red-100 text-red-800',
      'installment': 'bg-blue-100 text-blue-800',
    };

    const labels = {
      'fully-paid': 'Fully Paid',
      'partial': 'Partial',
      'unpaid': 'Unpaid',
      'installment': 'Installment',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getServiceTypeBadge = (serviceType: InternationalOrder['serviceType']) => {
    const styles = {
      'full-service': 'bg-blue-100 text-blue-800',
      'deliver-for-me': 'bg-green-100 text-green-800',
      'local-purchase': 'bg-purple-100 text-purple-800',
      'marketplace': 'bg-orange-100 text-orange-800',
    };

    const labels = {
      'full-service': 'Full Service (Agiza sourcing)',
      'deliver-for-me': 'Deliver for Me',
      'local-purchase': 'Local Purchase',
      'marketplace': 'Marketplace',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[serviceType]}`}>
        {labels[serviceType]}
      </span>
    );
  };

  const getDepartmentBadge = (department: InternationalOrder['department']) => {
    const styles = {
      'unassigned': 'bg-gray-100 text-gray-800',
      'procurement': 'bg-blue-100 text-blue-800',
      'shipping': 'bg-purple-100 text-purple-800',
      'delivery': 'bg-green-100 text-green-800',
    };

    const labels = {
      'unassigned': 'Unassigned',
      'procurement': 'Procurement',
      'shipping': 'Shipping',
      'delivery': 'Delivery',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[department]}`}>
        {labels[department]}
      </span>
    );
  };

  const needsAttention = (order: InternationalOrder) => {
    return order.status === 'issue-pending-payment' || 
           (order.paymentStatus === 'installment' && !order.installmentAllowed);
  };

  const filteredOrders = mockInternationalOrders.filter(order => {
    const matchesTab = 
      activeTab === 'active' ? (order.status !== 'completed' && !needsAttention(order)) : 
      activeTab === 'needs-attention' ? needsAttention(order) :
      order.status === 'completed';
    
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.itemsName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesOrigin = originFilter === 'all' || order.sourceOrigin === originFilter;
    const matchesHandler = handlerFilter === 'all' || order.handler === handlerFilter;
    const matchesServiceType = serviceTypeFilter === 'all' || order.serviceType === serviceTypeFilter;
    const matchesDepartment = departmentFilter === 'all' || order.department === departmentFilter;
    
    return matchesTab && matchesSearch && matchesStatus && matchesOrigin && matchesHandler && matchesServiceType && matchesDepartment;
  });

  const activeCount = mockInternationalOrders.filter(o => o.status !== 'completed' && !needsAttention(o)).length;
  const needsAttentionCount = mockInternationalOrders.filter(o => needsAttention(o)).length;
  const completedCount = mockInternationalOrders.filter(o => o.status === 'completed').length;

  const handlers = Array.from(new Set(mockInternationalOrders.map(o => o.handler).filter(Boolean)));

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">International Orders</h1>
          <p className="text-gray-600">Manage product sourcing from China, USA, UK, Dubai, and India</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Active Orders</p>
                <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Package2 className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Needs Attention</p>
                <p className="text-3xl font-bold text-red-600">{needsAttentionCount}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="size-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">In Production</p>
                <p className="text-3xl font-bold text-purple-600">
                  {mockInternationalOrders.filter(o => o.status === 'in-production').length}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <Clock className="size-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Completed</p>
                <p className="text-3xl font-bold text-green-600">{completedCount}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Order ID, Customer, or Items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Origins</option>
                <option value="china">China</option>
                <option value="usa">USA</option>
                <option value="uk">UK</option>
                <option value="dubai">Dubai</option>
                <option value="india">India</option>
              </select>

              <select
                value={handlerFilter}
                onChange={(e) => setHandlerFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Handlers</option>
                {handlers.map(handler => (
                  <option key={handler} value={handler}>{handler}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending-payment">Pending Payment</option>
                <option value="paid-supplier">Paid Supplier</option>
                <option value="in-production">In Production</option>
                <option value="shipping-to-destination">Shipping</option>
                <option value="clearance">Clearance</option>
                <option value="ready-for-collection">Ready for Collection</option>
              </select>

              <select
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Service Types</option>
                <option value="full-service">Full Service</option>
                <option value="deliver-for-me">Deliver for Me</option>
                <option value="local-purchase">Local Purchase</option>
                <option value="marketplace">Marketplace</option>
              </select>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Departments</option>
                <option value="unassigned">Unassigned</option>
                <option value="procurement">Procurement</option>
                <option value="shipping">Shipping</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Active Orders ({activeCount})
            </button>
            <button
              onClick={() => setActiveTab('needs-attention')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'needs-attention'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <AlertTriangle className="size-4" />
              Needs Attention ({needsAttentionCount})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Completed ({completedCount})
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Items Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Service Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Origin
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Order Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Handler
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <>
                    <tr key={order.orderId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{order.orderId}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-gray-400" />
                          <span className="text-gray-900">{order.customerName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900 max-w-xs truncate">{order.itemsName}</div>
                      </td>
                      <td className="px-6 py-4">
                        {getServiceTypeBadge(order.serviceType)}
                      </td>
                      <td className="px-6 py-4">
                        {getDepartmentBadge(order.department)}
                      </td>
                      <td className="px-6 py-4">
                        {getOriginBadge(order.sourceOrigin)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {getStatusBadge(order.status)}
                          {needsAttention(order) && (
                            <div className="flex items-center gap-1 text-red-600">
                              <AlertTriangle className="size-3" />
                              <span className="text-xs">Attention Required</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getOrderTypeBadge(order.orderType)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {getPaymentStatusBadge(order.paymentStatus)}
                          {order.paymentStatus === 'installment' && !order.installmentAllowed && (
                            <div className="text-xs text-red-600">⚠ Not Allowed</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900 text-sm">{order.handler || 'Unassigned'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setViewDetailsModal(order)}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                          >
                            View Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredOrders.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <Package2 className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No orders found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters or search terms</p>
          </div>
        )}

        {/* View Full Details Modal */}
        {viewDetailsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setViewDetailsModal(null)}>
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Order Details - {viewDetailsModal.orderId}</h2>
                <button onClick={() => setViewDetailsModal(null)} className="text-gray-500 hover:text-gray-700">
                  <ChevronUp className="size-6" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Payment Summary */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <DollarSign className="size-5 text-blue-600" />
                    Payment Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Amount</p>
                      <p className="text-xl font-bold text-gray-900">TSh {viewDetailsModal.totalAmount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Amount Paid</p>
                      <p className="text-xl font-bold text-green-600">TSh {viewDetailsModal.amountPaid.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Amount Due</p>
                      <p className="text-xl font-bold text-red-600">TSh {viewDetailsModal.amountDue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Payment Status</p>
                      <div className="mt-1">{getPaymentStatusBadge(viewDetailsModal.paymentStatus)}</div>
                    </div>
                  </div>
                  {viewDetailsModal.paymentStatus === 'installment' && (
                    <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Installment Status:</strong> {viewDetailsModal.installmentAllowed ? '✓ Allowed to proceed' : '⚠ Waiting for admin approval or required advance payment'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Order Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Customer Name</p>
                      <p className="text-gray-900">{viewDetailsModal.customerName}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Items</p>
                      <p className="text-gray-900">{viewDetailsModal.itemsName}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Source Origin</p>
                      <div className="mt-1">{getOriginBadge(viewDetailsModal.sourceOrigin)}</div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Order Type</p>
                      <div className="mt-1">{getOrderTypeBadge(viewDetailsModal.orderType)}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Supplier</p>
                      <p className="text-gray-900">{viewDetailsModal.supplierName || 'Not assigned'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Handler</p>
                      <p className="text-gray-900">{viewDetailsModal.handler || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Current Status</p>
                      <div className="mt-1">{getStatusBadge(viewDetailsModal.status)}</div>
                    </div>
                    {viewDetailsModal.trackingNumber && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700">Tracking Number</p>
                        <p className="text-gray-900 font-mono">{viewDetailsModal.trackingNumber}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost Breakdown */}
                {viewDetailsModal.cost && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Item Cost:</span>
                        <span className="font-medium">TSh {viewDetailsModal.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Shipping Cost:</span>
                        <span className="font-medium">TSh {viewDetailsModal.shippingCost?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-300">
                        <span className="font-semibold text-gray-900">Total Amount:</span>
                        <span className="font-bold text-gray-900">TSh {viewDetailsModal.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status History */}
                {viewDetailsModal.statusHistory && viewDetailsModal.statusHistory.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Status History</h3>
                    <div className="space-y-3">
                      {viewDetailsModal.statusHistory.map((update, index) => (
                        <div key={index} className="flex gap-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex-shrink-0">
                            <div className="size-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">{update.status}</span>
                              <span className="text-xs text-gray-500">by {update.handler}</span>
                            </div>
                            <p className="text-sm text-gray-600">{new Date(update.timestamp).toLocaleString()}</p>
                            {update.notes && (
                              <p className="text-sm text-gray-700 mt-1 italic">{update.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewDetailsModal.notes && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-semibold text-yellow-900 mb-1">Notes:</p>
                    <p className="text-sm text-yellow-800">{viewDetailsModal.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}