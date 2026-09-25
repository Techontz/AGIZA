import { useState } from 'react';
import React from 'react';
import { RotateCcw, AlertTriangle, DollarSign, Clock, Search, User, Package, ChevronDown, ChevronUp } from 'lucide-react';

interface Return {
  returnId: string;
  orderId: string;
  customerName: string;
  returnType: 'delivery-failed' | 'customer-rejected' | 'damaged-item' | 'wrong-item' | 'cancellation-after-dispatch';
  returnStatus: 'initiated' | 'in-transit-return' | 'received' | 'inspected' | 'approved' | 'rejected' | 'closed';
  currentOwner: 'delivery' | 'warehouse' | 'support' | 'finance';
  assignedHandler: {
    name: string;
    role: 'driver' | 'warehouse-staff' | 'support-agent';
  };
  reasonCode: 'customer-unavailable' | 'address-incorrect' | 'damaged-in-transit' | 'customer-changed-mind' | 'item-mismatch';
  lastUpdate: string;
  lastUpdateDepartment: 'delivery' | 'warehouse' | 'support' | 'finance';
  financialImpact: 'refund-required' | 'replacement-required' | 'no-refund';
  exceptionFlag?: 'dispute' | 'high-value-item' | 'customer-complaint';
  itemDetails?: string;
  returnValue?: number;
}

const mockReturns: Return[] = [
  {
    returnId: 'RET-001',
    orderId: 'INT-001',
    customerName: 'Fatuma Hassan',
    returnType: 'damaged-item',
    returnStatus: 'inspected',
    currentOwner: 'warehouse',
    assignedHandler: {
      name: 'Ahmed Msemo',
      role: 'warehouse-staff'
    },
    reasonCode: 'damaged-in-transit',
    lastUpdate: '2026-01-16T08:30:00',
    lastUpdateDepartment: 'warehouse',
    financialImpact: 'refund-required',
    exceptionFlag: 'high-value-item',
    itemDetails: 'Samsung Galaxy A54 5G',
    returnValue: 850000
  },
  {
    returnId: 'RET-002',
    orderId: 'ECO-002',
    customerName: 'John Mwamba',
    returnType: 'wrong-item',
    returnStatus: 'in-transit-return',
    currentOwner: 'delivery',
    assignedHandler: {
      name: 'Hassan Mohammed',
      role: 'driver'
    },
    reasonCode: 'item-mismatch',
    lastUpdate: '2026-01-16T10:15:00',
    lastUpdateDepartment: 'delivery',
    financialImpact: 'replacement-required',
    itemDetails: 'Nike Air Max 270',
    returnValue: 180000
  },
  {
    returnId: 'RET-003',
    orderId: 'INT-003',
    customerName: 'Grace Kimaro',
    returnType: 'customer-rejected',
    returnStatus: 'approved',
    currentOwner: 'finance',
    assignedHandler: {
      name: 'Sarah Juma',
      role: 'support-agent'
    },
    reasonCode: 'customer-changed-mind',
    lastUpdate: '2026-01-15T16:45:00',
    lastUpdateDepartment: 'finance',
    financialImpact: 'refund-required',
    exceptionFlag: 'dispute',
    itemDetails: 'MacBook Air M2',
    returnValue: 2500000
  },
  {
    returnId: 'RET-004',
    orderId: 'DEL-005',
    customerName: 'Neema Mkwawa',
    returnType: 'delivery-failed',
    returnStatus: 'received',
    currentOwner: 'warehouse',
    assignedHandler: {
      name: 'John Maleko',
      role: 'driver'
    },
    reasonCode: 'customer-unavailable',
    lastUpdate: '2026-01-15T14:30:00',
    lastUpdateDepartment: 'warehouse',
    financialImpact: 'no-refund',
    itemDetails: 'Home Appliances Package',
    returnValue: 500000
  },
  {
    returnId: 'RET-005',
    orderId: 'ECO-005',
    customerName: 'David Lyimo',
    returnType: 'cancellation-after-dispatch',
    returnStatus: 'initiated',
    currentOwner: 'support',
    assignedHandler: {
      name: 'Mary Komba',
      role: 'support-agent'
    },
    reasonCode: 'customer-changed-mind',
    lastUpdate: '2026-01-16T11:20:00',
    lastUpdateDepartment: 'support',
    financialImpact: 'refund-required',
    exceptionFlag: 'customer-complaint',
    itemDetails: 'Canon EOS R6 Camera',
    returnValue: 4500000
  },
  {
    returnId: 'RET-006',
    orderId: 'INT-005',
    customerName: 'Ahmed Salim',
    returnType: 'damaged-item',
    returnStatus: 'closed',
    currentOwner: 'finance',
    assignedHandler: {
      name: 'Peter Kimani',
      role: 'warehouse-staff'
    },
    reasonCode: 'damaged-in-transit',
    lastUpdate: '2026-01-14T09:00:00',
    lastUpdateDepartment: 'finance',
    financialImpact: 'refund-required',
    itemDetails: 'LG 55" 4K Smart TV',
    returnValue: 1200000
  },
  {
    returnId: 'RET-007',
    orderId: 'DEL-006',
    customerName: 'Amina Khamis',
    returnType: 'delivery-failed',
    returnStatus: 'rejected',
    currentOwner: 'support',
    assignedHandler: {
      name: 'Sarah Juma',
      role: 'support-agent'
    },
    reasonCode: 'address-incorrect',
    lastUpdate: '2026-01-15T12:00:00',
    lastUpdateDepartment: 'support',
    financialImpact: 'no-refund',
    itemDetails: 'Electronics Package',
    returnValue: 350000
  },
];

export function Returns() {
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const getReturnTypeBadge = (type: Return['returnType']) => {
    const styles = {
      'delivery-failed': 'bg-orange-100 text-orange-800',
      'customer-rejected': 'bg-red-100 text-red-800',
      'damaged-item': 'bg-red-100 text-red-800',
      'wrong-item': 'bg-yellow-100 text-yellow-800',
      'cancellation-after-dispatch': 'bg-purple-100 text-purple-800',
    };

    const labels = {
      'delivery-failed': 'Delivery Failed',
      'customer-rejected': 'Customer Rejected',
      'damaged-item': 'Damaged Item',
      'wrong-item': 'Wrong Item',
      'cancellation-after-dispatch': 'Cancellation After Dispatch',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[type]}`}>
        {labels[type]}
      </span>
    );
  };

  const getStatusBadge = (status: Return['returnStatus']) => {
    const styles = {
      'initiated': 'bg-blue-100 text-blue-800',
      'in-transit-return': 'bg-purple-100 text-purple-800',
      'received': 'bg-yellow-100 text-yellow-800',
      'inspected': 'bg-orange-100 text-orange-800',
      'approved': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'closed': 'bg-gray-100 text-gray-800',
    };

    const labels = {
      'initiated': 'Initiated',
      'in-transit-return': 'In Transit (Return)',
      'received': 'Received',
      'inspected': 'Inspected',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'closed': 'Closed',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getOwnerBadge = (owner: Return['currentOwner']) => {
    const styles = {
      'delivery': 'bg-blue-100 text-blue-800',
      'warehouse': 'bg-purple-100 text-purple-800',
      'support': 'bg-green-100 text-green-800',
      'finance': 'bg-orange-100 text-orange-800',
    };

    const labels = {
      'delivery': 'Delivery',
      'warehouse': 'Warehouse',
      'support': 'Support',
      'finance': 'Finance',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[owner]}`}>
        {labels[owner]}
      </span>
    );
  };

  const getReasonCodeBadge = (code: Return['reasonCode']) => {
    const labels = {
      'customer-unavailable': 'Customer Unavailable',
      'address-incorrect': 'Address Incorrect',
      'damaged-in-transit': 'Damaged in Transit',
      'customer-changed-mind': 'Customer Changed Mind',
      'item-mismatch': 'Item Mismatch',
    };

    return (
      <span className="text-sm text-gray-700">
        {labels[code]}
      </span>
    );
  };

  const getFinancialImpactBadge = (impact: Return['financialImpact']) => {
    const styles = {
      'refund-required': 'bg-red-100 text-red-800',
      'replacement-required': 'bg-yellow-100 text-yellow-800',
      'no-refund': 'bg-green-100 text-green-800',
    };

    const labels = {
      'refund-required': 'Refund Required',
      'replacement-required': 'Replacement Required',
      'no-refund': 'No Refund',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[impact]}`}>
        {labels[impact]}
      </span>
    );
  };

  const getExceptionBadge = (flag: Return['exceptionFlag']) => {
    if (!flag) return null;

    const styles = {
      'dispute': { bg: 'bg-red-100 text-red-800', label: 'Dispute' },
      'high-value-item': { bg: 'bg-purple-100 text-purple-800', label: 'High-Value Item' },
      'customer-complaint': { bg: 'bg-orange-100 text-orange-800', label: 'Customer Complaint' },
    };

    const config = styles[flag];

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} flex items-center gap-1 w-fit`}>
        <AlertTriangle className="size-3" />
        {config.label}
      </span>
    );
  };

  const getLastUpdateText = (lastUpdate: string, department: string) => {
    const now = new Date();
    const updateDate = new Date(lastUpdate);
    const diffMs = now.getTime() - updateDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let timeText = '';
    if (diffHours < 24) {
      timeText = `${diffHours}h ago`;
    } else {
      timeText = `${diffDays}d ago`;
    }

    const deptLabel = department.charAt(0).toUpperCase() + department.slice(1);
    return `${timeText} – ${deptLabel}`;
  };

  const filteredReturns = mockReturns.filter(ret => {
    const isActive = ret.returnStatus !== 'closed' && ret.returnStatus !== 'rejected';
    const matchesTab = activeTab === 'active' ? isActive : !isActive;
    
    const matchesSearch = 
      ret.returnId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ret.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ret.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || ret.returnStatus === statusFilter;
    const matchesOwner = ownerFilter === 'all' || ret.currentOwner === ownerFilter;
    
    return matchesTab && matchesSearch && matchesStatus && matchesOwner;
  });

  const activeCount = mockReturns.filter(r => 
    r.returnStatus !== 'closed' && r.returnStatus !== 'rejected'
  ).length;
  
  const completedCount = mockReturns.filter(r => 
    r.returnStatus === 'closed' || r.returnStatus === 'rejected'
  ).length;

  const stats = {
    totalReturns: mockReturns.length,
    active: activeCount,
    completed: completedCount,
    refundValue: mockReturns
      .filter(r => r.financialImpact === 'refund-required')
      .reduce((sum, r) => sum + (r.returnValue || 0), 0),
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Returns Management</h1>
          <p className="text-gray-600">Track and process product returns and refunds</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Active Returns</p>
                <p className="text-3xl font-bold text-blue-600">{stats.active}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <RotateCcw className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Completed/Closed</p>
                <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <Package className="size-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending Refunds</p>
                <p className="text-2xl font-bold text-red-600">
                  TSh {(stats.refundValue / 1000000).toFixed(1)}M
                </p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <DollarSign className="size-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">With Exceptions</p>
                <p className="text-3xl font-bold text-orange-600">
                  {mockReturns.filter(r => r.exceptionFlag).length}
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <AlertTriangle className="size-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Active Returns ({activeCount})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Completed/Closed ({completedCount})
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between pt-4 border-t border-gray-200">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Return ID, Order ID, or Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Departments</option>
                <option value="delivery">Delivery</option>
                <option value="warehouse">Warehouse</option>
                <option value="support">Support</option>
                <option value="finance">Finance</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Statuses</option>
                {activeTab === 'active' ? (
                  <>
                    <option value="initiated">Initiated</option>
                    <option value="in-transit-return">In Transit (Return)</option>
                    <option value="received">Received</option>
                    <option value="inspected">Inspected</option>
                    <option value="approved">Approved</option>
                  </>
                ) : (
                  <>
                    <option value="rejected">Rejected</option>
                    <option value="closed">Closed</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Returns Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Return ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Return Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Return Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Current Owner</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Assigned Handler</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Reason Code</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Last Update</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Financial Impact</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Exception Flag</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredReturns.map((ret) => (
                  <React.Fragment key={ret.returnId}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{ret.returnId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{ret.orderId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-gray-400" />
                          <span className="text-gray-900">{ret.customerName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getReturnTypeBadge(ret.returnType)}</td>
                      <td className="px-6 py-4">{getStatusBadge(ret.returnStatus)}</td>
                      <td className="px-6 py-4">{getOwnerBadge(ret.currentOwner)}</td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-gray-900 font-medium">{ret.assignedHandler.name}</div>
                          <div className="text-xs text-gray-500 capitalize">
                            {ret.assignedHandler.role.replace('-', ' ')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getReasonCodeBadge(ret.reasonCode)}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {getLastUpdateText(ret.lastUpdate, ret.lastUpdateDepartment)}
                        </div>
                      </td>
                      <td className="px-6 py-4">{getFinancialImpactBadge(ret.financialImpact)}</td>
                      <td className="px-6 py-4">{getExceptionBadge(ret.exceptionFlag)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setExpandedRow(expandedRow === ret.returnId ? null : ret.returnId)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                        >
                          {expandedRow === ret.returnId ? (
                            <>
                              <ChevronUp className="size-4" />
                              Less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-4" />
                              Details
                            </>
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Row - Return Details */}
                    {expandedRow === ret.returnId && (
                      <tr>
                        <td colSpan={12} className="px-6 py-4 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3">Item Details</h4>
                              <div className="bg-white p-4 rounded border border-gray-200 space-y-2">
                                <div>
                                  <p className="text-sm text-gray-600">Item</p>
                                  <p className="font-medium text-gray-900">{ret.itemDetails}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600">Return Value</p>
                                  <p className="font-semibold text-gray-900">
                                    TSh {ret.returnValue?.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3">Status Timeline</h4>
                              <div className="bg-white p-4 rounded border border-gray-200">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`size-3 rounded-full ${
                                      ret.returnStatus === 'initiated' ? 'bg-blue-600' : 'bg-gray-300'
                                    }`} />
                                    <span className="text-sm text-gray-700">Initiated</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={`size-3 rounded-full ${
                                      ret.returnStatus === 'in-transit-return' ? 'bg-purple-600' : 'bg-gray-300'
                                    }`} />
                                    <span className="text-sm text-gray-700">In Transit (Return)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={`size-3 rounded-full ${
                                      ret.returnStatus === 'received' ? 'bg-yellow-600' : 'bg-gray-300'
                                    }`} />
                                    <span className="text-sm text-gray-700">Received</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={`size-3 rounded-full ${
                                      ret.returnStatus === 'inspected' ? 'bg-orange-600' : 'bg-gray-300'
                                    }`} />
                                    <span className="text-sm text-gray-700">Inspected</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={`size-3 rounded-full ${
                                      ret.returnStatus === 'approved' || ret.returnStatus === 'closed' ? 'bg-green-600' : 
                                      ret.returnStatus === 'rejected' ? 'bg-red-600' : 'bg-gray-300'
                                    }`} />
                                    <span className="text-sm text-gray-700">
                                      {ret.returnStatus === 'rejected' ? 'Rejected' : 
                                       ret.returnStatus === 'closed' ? 'Closed' : 'Approved'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3">Actions</h4>
                              <div className="space-y-2">
                                {ret.returnStatus !== 'closed' && ret.returnStatus !== 'rejected' && (
                                  <>
                                    <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                                      Update Status
                                    </button>
                                    <button className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                                      Reassign Handler
                                    </button>
                                  </>
                                )}
                                <button className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                                  View Full History
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredReturns.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <RotateCcw className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No returns found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
