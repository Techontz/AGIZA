import { useState } from 'react';
import { ShoppingCart, AlertTriangle, CheckCircle2, Clock, Search, DollarSign, User } from 'lucide-react';

interface ProcurementOrder {
  orderId: string;
  itemSummary: string;
  origin: 'china' | 'uk' | 'usa' | 'dubai' | 'india' | 'tanzania';
  supplier: string;
  supplierTrackingNumber?: string;
  status: 'pending-sourcing' | 'supplier-selected' | 'paid' | 'supplier-canceled' | 'received-at-cargo';
  assignedOperator: string;
  itemCost: number;
  lastUpdate: string;
  exceptionFlag?: 'payment-issue' | 'supplier-delay' | 'quality-concern' | 'stock-unavailable';
  expectedDateToCargo?: string;
  createdDate: string;
}

const mockProcurementOrders: ProcurementOrder[] = [
  {
    orderId: 'INT-001',
    itemSummary: 'Electronics - 5x Smartphones, 10x Chargers',
    origin: 'china',
    supplier: 'Shenzhen Tech Co.',
    supplierTrackingNumber: 'SZ-20260115-8842',
    status: 'paid',
    assignedOperator: 'Ahmed Salim',
    itemCost: 1800000,
    lastUpdate: '2026-01-15T14:30:00',
    expectedDateToCargo: '2026-01-25T00:00:00',
    createdDate: '2026-01-10T08:00:00'
  },
  {
    orderId: 'INT-002',
    itemSummary: 'Fashion - 50x Designer T-shirts, 30x Jeans',
    origin: 'dubai',
    supplier: 'Dubai Fashion Hub',
    supplierTrackingNumber: 'DFH-2026-4521',
    status: 'received-at-cargo',
    assignedOperator: 'Sarah Mtui',
    itemCost: 1200000,
    lastUpdate: '2026-01-14T10:00:00',
    expectedDateToCargo: '2026-01-18T00:00:00',
    createdDate: '2026-01-08T10:30:00'
  },
  {
    orderId: 'INT-003',
    itemSummary: 'Home Appliances - 2x Refrigerators, 3x Microwaves',
    origin: 'usa',
    supplier: 'US Home Solutions',
    supplierTrackingNumber: 'USHS-7842-2026',
    status: 'paid',
    assignedOperator: 'Emmanuel Mollel',
    itemCost: 3000000,
    lastUpdate: '2026-01-13T16:20:00',
    expectedDateToCargo: '2026-01-28T00:00:00',
    createdDate: '2026-01-05T14:20:00'
  },
  {
    orderId: 'INT-004',
    itemSummary: 'Machinery Parts - Industrial Equipment',
    origin: 'uk',
    supplier: 'UK Industrial Ltd',
    status: 'supplier-selected',
    assignedOperator: 'David Lyimo',
    itemCost: 6000000,
    lastUpdate: '2026-01-16T09:00:00',
    expectedDateToCargo: '2026-02-15T00:00:00',
    createdDate: '2026-01-12T09:15:00'
  },
  {
    orderId: 'INT-005',
    itemSummary: 'Textiles - 200m Fabric Rolls',
    origin: 'india',
    supplier: 'Mumbai Textiles Export',
    supplierTrackingNumber: 'MTE-IN-5521',
    status: 'received-at-cargo',
    assignedOperator: 'Sarah Mtui',
    itemCost: 600000,
    lastUpdate: '2026-01-12T11:45:00',
    expectedDateToCargo: '2026-01-20T00:00:00',
    createdDate: '2026-01-11T11:00:00'
  },
  {
    orderId: 'INT-006',
    itemSummary: 'Construction Materials - Tiles & Fixtures',
    origin: 'china',
    supplier: 'Guangzhou Building Supplies',
    status: 'pending-sourcing',
    assignedOperator: 'Ahmed Salim',
    itemCost: 2100000,
    lastUpdate: '2026-01-16T08:00:00',
    exceptionFlag: 'payment-issue',
    expectedDateToCargo: '2026-02-10T00:00:00',
    createdDate: '2026-01-13T15:30:00'
  },
  {
    orderId: 'INT-007',
    itemSummary: 'Beauty Products - Cosmetics & Skincare',
    origin: 'dubai',
    supplier: 'Dubai Beauty Trading',
    supplierTrackingNumber: 'DBT-2026-9921',
    status: 'paid',
    assignedOperator: 'Emmanuel Mollel',
    itemCost: 400000,
    lastUpdate: '2026-01-10T15:30:00',
    exceptionFlag: 'supplier-delay',
    expectedDateToCargo: '2026-01-22T00:00:00',
    createdDate: '2026-01-03T12:00:00'
  },
  {
    orderId: 'INT-008',
    itemSummary: 'Medical Equipment - Diagnostic Devices',
    origin: 'usa',
    supplier: 'MedTech USA Inc.',
    status: 'supplier-selected',
    assignedOperator: 'David Lyimo',
    itemCost: 8000000,
    lastUpdate: '2026-01-15T12:00:00',
    exceptionFlag: 'quality-concern',
    expectedDateToCargo: '2026-02-25T00:00:00',
    createdDate: '2026-01-14T08:45:00'
  },
];

export function Procurement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [originFilter, setOriginFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [operatorFilter, setOperatorFilter] = useState('all');

  const getOriginBadge = (origin: ProcurementOrder['origin']) => {
    const styles = {
      'china': 'bg-red-100 text-red-800',
      'uk': 'bg-blue-100 text-blue-800',
      'usa': 'bg-indigo-100 text-indigo-800',
      'dubai': 'bg-amber-100 text-amber-800',
      'india': 'bg-orange-100 text-orange-800',
      'tanzania': 'bg-green-100 text-green-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${styles[origin]}`}>
        {origin}
      </span>
    );
  };

  const getStatusBadge = (status: ProcurementOrder['status']) => {
    const styles = {
      'pending-sourcing': 'bg-yellow-100 text-yellow-800',
      'supplier-selected': 'bg-blue-100 text-blue-800',
      'paid': 'bg-green-100 text-green-800',
      'supplier-canceled': 'bg-red-100 text-red-800',
      'received-at-cargo': 'bg-purple-100 text-purple-800',
    };

    const labels = {
      'pending-sourcing': 'Pending Sourcing',
      'supplier-selected': 'Supplier Selected',
      'paid': 'Paid',
      'supplier-canceled': 'Supplier Canceled',
      'received-at-cargo': 'Received at Cargo',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getExceptionBadge = (flag: ProcurementOrder['exceptionFlag']) => {
    if (!flag) {
      return (
        <span className="text-green-600 text-sm flex items-center gap-1">
          <CheckCircle2 className="size-4" />
          No Issues
        </span>
      );
    }

    const styles = {
      'payment-issue': { bg: 'bg-red-100 text-red-800', label: 'Payment Issue' },
      'supplier-delay': { bg: 'bg-orange-100 text-orange-800', label: 'Supplier Delay' },
      'quality-concern': { bg: 'bg-yellow-100 text-yellow-800', label: 'Quality Concern' },
      'stock-unavailable': { bg: 'bg-red-100 text-red-800', label: 'Stock Unavailable' },
    };

    const config = styles[flag];

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} flex items-center gap-1 w-fit`}>
        <AlertTriangle className="size-3" />
        {config.label}
      </span>
    );
  };

  const filteredOrders = mockProcurementOrders.filter(order => {
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.itemSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrigin = originFilter === 'all' || order.origin === originFilter;
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesOperator = operatorFilter === 'all' || order.assignedOperator === operatorFilter;
    
    return matchesSearch && matchesOrigin && matchesStatus && matchesOperator;
  });

  const operators = Array.from(new Set(mockProcurementOrders.map(o => o.assignedOperator)));

  const stats = {
    total: mockProcurementOrders.length,
    pendingSourcing: mockProcurementOrders.filter(o => o.status === 'pending-sourcing').length,
    paid: mockProcurementOrders.filter(o => o.status === 'paid').length,
    receivedAtCargo: mockProcurementOrders.filter(o => o.status === 'received-at-cargo').length,
    totalValue: mockProcurementOrders.reduce((sum, o) => sum + o.itemCost, 0),
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Procurement Management</h1>
          <p className="text-gray-600">Manage supplier orders and international sourcing</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Orders</p>
                <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <ShoppingCart className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending Sourcing</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pendingSourcing}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <Clock className="size-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Paid</p>
                <p className="text-3xl font-bold text-green-600">{stats.paid}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">At Cargo</p>
                <p className="text-3xl font-bold text-purple-600">{stats.receivedAtCargo}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <ShoppingCart className="size-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Value</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {(stats.totalValue / 1000000).toFixed(1)}M
                </p>
              </div>
              <div className="bg-indigo-100 p-3 rounded-full">
                <DollarSign className="size-6 text-indigo-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Order ID, Item, or Supplier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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
                <option value="tanzania">Tanzania</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending-sourcing">Pending Sourcing</option>
                <option value="supplier-selected">Supplier Selected</option>
                <option value="paid">Paid</option>
                <option value="received-at-cargo">Received at Cargo</option>
              </select>

              <select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Operators</option>
                {operators.map(operator => (
                  <option key={operator} value={operator}>{operator}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Item/Summary</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Origin</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Supplier</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Tracking #</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Assigned Operator</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Costs</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Last Update</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Exception Flag</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Expected to Cargo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{order.orderId}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(order.createdDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 max-w-xs">{order.itemSummary}</div>
                    </td>
                    <td className="px-6 py-4">{getOriginBadge(order.origin)}</td>
                    <td className="px-6 py-4 text-gray-900">{order.supplier}</td>
                    <td className="px-6 py-4">
                      {order.supplierTrackingNumber ? (
                        <div className="font-mono text-sm text-gray-900">{order.supplierTrackingNumber}</div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-900">
                        <User className="size-4 text-gray-400" />
                        <span className="text-sm">{order.assignedOperator}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">
                        TSh {order.itemCost.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(order.lastUpdate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">{getExceptionBadge(order.exceptionFlag)}</td>
                    <td className="px-6 py-4">
                      {order.expectedDateToCargo ? (
                        <div className="text-sm text-gray-900">
                          {new Date(order.expectedDateToCargo).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredOrders.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <ShoppingCart className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No procurement orders found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
