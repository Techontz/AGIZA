import { useState } from 'react';
import React from 'react';
import { Truck, Package, CheckCircle2, XCircle, Clock, AlertTriangle, Search, ChevronDown, ChevronUp, User, MapPin, Image as ImageIcon } from 'lucide-react';

interface Delivery {
  deliveryId: string;
  orderId: string;
  customerName: string;
  destinationCity: string;
  destinationArea: string;
  deliveryType: 'standard' | 'express' | 'same-day' | 'inter-city';
  assignedDriver: string;
  deliveryStatus: 'pending' | 'assigned-driver' | 'out-for-delivery' | 'delivered' | 'failed' | 'rescheduled' | 'returned';
  scheduleDate: string;
  lastUpdate: string;
  exceptionFlag?: 'customer-unavailable' | 'payment-issue' | 'address-unclear';
  orderSource: 'international' | 'shop' | 'local-delivery';
  pickupPoint?: string; // For local deliveries
  deliveryPoint?: string; // Destination address
  deliveryProof?: {
    signatureName?: string;
    signatureImage?: string;
    photos?: string[];
    notes?: string;
    completedAt?: string;
  };
}

const mockDeliveries: Delivery[] = [
  {
    deliveryId: 'DEL-001',
    orderId: 'EXP-001',
    customerName: 'Fatuma Hassan',
    destinationCity: 'Dar es Salaam',
    destinationArea: 'Mikocheni',
    deliveryType: 'express',
    assignedDriver: 'Hassan Mohammed',
    deliveryStatus: 'out-for-delivery',
    scheduleDate: '2026-01-16T10:00:00',
    lastUpdate: '2026-01-16T09:30:00',
    orderSource: 'local-delivery',
    pickupPoint: 'Agiza Warehouse - Kariakoo',
    deliveryPoint: 'House #45, Mikocheni Beach Road'
  },
  {
    deliveryId: 'DEL-002',
    orderId: 'INT-007',
    customerName: 'John Mwamba',
    destinationCity: 'Arusha',
    destinationArea: 'Njiro',
    deliveryType: 'inter-city',
    assignedDriver: 'Peter Kimani',
    deliveryStatus: 'assigned-driver',
    scheduleDate: '2026-01-17T08:00:00',
    lastUpdate: '2026-01-16T08:00:00',
    orderSource: 'international',
    deliveryPoint: 'Arusha Business Center, Plot 123'
  },
  {
    deliveryId: 'DEL-003',
    orderId: 'SHOP-045',
    customerName: 'Grace Kimaro',
    destinationCity: 'Dar es Salaam',
    destinationArea: 'Masaki',
    deliveryType: 'same-day',
    assignedDriver: 'Hassan Mohammed',
    deliveryStatus: 'pending',
    scheduleDate: '2026-01-16T14:00:00',
    lastUpdate: '2026-01-16T07:00:00',
    exceptionFlag: 'payment-issue',
    orderSource: 'shop',
    deliveryPoint: 'Peninsula Apartments, Flat 3B'
  },
  {
    deliveryId: 'DEL-004',
    orderId: 'INT-012',
    customerName: 'Ahmed Salim',
    destinationCity: 'Mwanza',
    destinationArea: 'Isamilo',
    deliveryType: 'inter-city',
    assignedDriver: 'David Mwita',
    deliveryStatus: 'delivered',
    scheduleDate: '2026-01-15T10:00:00',
    lastUpdate: '2026-01-15T16:45:00',
    orderSource: 'international',
    deliveryPoint: 'Mwanza Industrial Estate, Unit 8',
    deliveryProof: {
      signatureName: 'Ahmed Salim',
      signatureImage: 'https://images.unsplash.com/photo-1589330273594-fade1ee91647?w=300&h=150&fit=crop',
      photos: [
        'https://images.unsplash.com/photo-1615719413546-198b25453f85?w=400&h=300&fit=crop',
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&h=300&fit=crop'
      ],
      notes: 'Package delivered to customer at door. Customer verified ID.',
      completedAt: '2026-01-15T16:45:00'
    }
  },
  {
    deliveryId: 'DEL-005',
    orderId: 'SHOP-028',
    customerName: 'Neema Mkwawa',
    destinationCity: 'Dodoma',
    destinationArea: 'Msasani',
    deliveryType: 'standard',
    assignedDriver: 'John Maleko',
    deliveryStatus: 'failed',
    scheduleDate: '2026-01-15T11:00:00',
    lastUpdate: '2026-01-15T14:30:00',
    exceptionFlag: 'customer-unavailable',
    orderSource: 'shop',
    deliveryPoint: 'Central Market Area, Shop 67'
  },
  {
    deliveryId: 'DEL-006',
    orderId: 'EXP-015',
    customerName: 'David Lyimo',
    destinationCity: 'Dar es Salaam',
    destinationArea: 'Kinondoni',
    deliveryType: 'express',
    assignedDriver: 'Hassan Mohammed',
    deliveryStatus: 'rescheduled',
    scheduleDate: '2026-01-17T10:00:00',
    lastUpdate: '2026-01-16T10:15:00',
    exceptionFlag: 'address-unclear',
    orderSource: 'local-delivery',
    pickupPoint: 'Agiza Hub - Ubungo',
    deliveryPoint: 'Kinondoni Road, Near Police Station'
  },
  {
    deliveryId: 'DEL-007',
    orderId: 'EXP-022',
    customerName: 'Amina Juma',
    destinationCity: 'Dar es Salaam',
    destinationArea: 'Posta',
    deliveryType: 'same-day',
    assignedDriver: 'Hassan Mohammed',
    deliveryStatus: 'pending',
    scheduleDate: '2026-01-16T16:00:00',
    lastUpdate: '2026-01-16T11:00:00',
    orderSource: 'local-delivery',
    pickupPoint: 'Client Location - Msasani',
    deliveryPoint: 'Posta Office Complex'
  },
  {
    deliveryId: 'DEL-008',
    orderId: 'SHOP-056',
    customerName: 'Charles Mbwana',
    destinationCity: 'Dar es Salaam',
    destinationArea: 'Mbezi Beach',
    deliveryType: 'express',
    assignedDriver: 'Juma Kamara',
    deliveryStatus: 'assigned-driver',
    scheduleDate: '2026-01-16T13:00:00',
    lastUpdate: '2026-01-16T09:00:00',
    orderSource: 'shop',
    deliveryPoint: 'Mbezi Beach Villas, Villa 12'
  },
];

export function DeliveriesManagement() {
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [driverFilter, setDriverFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderSourceFilter, setOrderSourceFilter] = useState<'all' | 'international' | 'shop' | 'local-delivery'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const getStatusBadge = (status: Delivery['deliveryStatus']) => {
    const styles = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'assigned-driver': 'bg-blue-100 text-blue-800',
      'out-for-delivery': 'bg-purple-100 text-purple-800',
      'delivered': 'bg-green-100 text-green-800',
      'failed': 'bg-red-100 text-red-800',
      'rescheduled': 'bg-orange-100 text-orange-800',
      'returned': 'bg-gray-100 text-gray-800',
    };

    const labels = {
      'pending': 'Pending',
      'assigned-driver': 'Assigned Driver',
      'out-for-delivery': 'Out for Delivery',
      'delivered': 'Delivered',
      'failed': 'Failed',
      'rescheduled': 'Rescheduled',
      'returned': 'Returned',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getDeliveryTypeBadge = (type: Delivery['deliveryType']) => {
    const styles = {
      'standard': 'bg-gray-100 text-gray-800',
      'express': 'bg-blue-100 text-blue-800',
      'same-day': 'bg-purple-100 text-purple-800',
      'inter-city': 'bg-green-100 text-green-800',
    };

    const labels = {
      'standard': 'Standard',
      'express': 'Express',
      'same-day': 'Same Day',
      'inter-city': 'Inter-City',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[type]}`}>
        {labels[type].toUpperCase()}
      </span>
    );
  };

  const getExceptionBadge = (flag: Delivery['exceptionFlag']) => {
    if (!flag) return null;

    const styles = {
      'customer-unavailable': { bg: 'bg-orange-100 text-orange-800', label: 'Customer Unavailable' },
      'payment-issue': { bg: 'bg-red-100 text-red-800', label: 'Payment Issue' },
      'address-unclear': { bg: 'bg-yellow-100 text-yellow-800', label: 'Address Unclear' },
    };

    const config = styles[flag];

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} flex items-center gap-1 w-fit`}>
        <AlertTriangle className="size-3" />
        {config.label}
      </span>
    );
  };

  const getOrderSourceBadge = (source: Delivery['orderSource']) => {
    const styles = {
      'international': 'bg-blue-100 text-blue-800',
      'shop': 'bg-green-100 text-green-800',
      'local-delivery': 'bg-purple-100 text-purple-800',
    };

    const labels = {
      'international': 'International',
      'shop': 'Shop',
      'local-delivery': 'Local Delivery',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[source]}`}>
        {labels[source]}
      </span>
    );
  };

  const filteredDeliveries = mockDeliveries.filter(delivery => {
    const isCompleted = delivery.deliveryStatus === 'delivered' || delivery.deliveryStatus === 'failed' || delivery.deliveryStatus === 'returned';
    const matchesTab = activeTab === 'pending' ? !isCompleted : isCompleted;
    
    const matchesSearch = 
      delivery.deliveryId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDriver = driverFilter === 'all' || delivery.assignedDriver === driverFilter;
    const matchesStatus = statusFilter === 'all' || delivery.deliveryStatus === statusFilter;
    const matchesOrderSource = orderSourceFilter === 'all' || delivery.orderSource === orderSourceFilter;
    
    return matchesTab && matchesSearch && matchesDriver && matchesStatus && matchesOrderSource;
  });

  const drivers = Array.from(new Set(mockDeliveries.map(d => d.assignedDriver)));

  const pendingCount = mockDeliveries.filter(d => 
    d.deliveryStatus !== 'delivered' && d.deliveryStatus !== 'failed' && d.deliveryStatus !== 'returned'
  ).length;
  
  const completedCount = mockDeliveries.filter(d => 
    d.deliveryStatus === 'delivered' || d.deliveryStatus === 'failed' || d.deliveryStatus === 'returned'
  ).length;

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Deliveries Management</h1>
          <p className="text-gray-600">Track and manage all delivery operations</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending Deliveries</p>
                <p className="text-3xl font-bold text-blue-600">{pendingCount}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Clock className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Out for Delivery</p>
                <p className="text-3xl font-bold text-purple-600">
                  {mockDeliveries.filter(d => d.deliveryStatus === 'out-for-delivery').length}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <Truck className="size-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Delivered Today</p>
                <p className="text-3xl font-bold text-green-600">
                  {mockDeliveries.filter(d => d.deliveryStatus === 'delivered').length}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Failed/Issues</p>
                <p className="text-3xl font-bold text-red-600">
                  {mockDeliveries.filter(d => d.exceptionFlag || d.deliveryStatus === 'failed').length}
                </p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <XCircle className="size-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Pending Deliveries ({pendingCount})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Completed/Failed ({completedCount})
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between pt-4 border-t border-gray-200">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Delivery ID, Order ID, or Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Drivers</option>
                {drivers.map(driver => (
                  <option key={driver} value={driver}>{driver}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Statuses</option>
                {activeTab === 'pending' ? (
                  <>
                    <option value="pending">Pending</option>
                    <option value="assigned-driver">Assigned Driver</option>
                    <option value="out-for-delivery">Out for Delivery</option>
                    <option value="rescheduled">Rescheduled</option>
                  </>
                ) : (
                  <>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="returned">Returned</option>
                  </>
                )}
              </select>

              <select
                value={orderSourceFilter}
                onChange={(e) => setOrderSourceFilter(e.target.value as 'all' | 'international' | 'shop' | 'local-delivery')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Order Sources</option>
                <option value="international">International</option>
                <option value="shop">Shop</option>
                <option value="local-delivery">Local Delivery</option>
              </select>
            </div>
          </div>
        </div>

        {/* Deliveries Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Delivery ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order Source</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Pickup/Delivery Point</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Destination</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Delivery Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Assigned Driver</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Exception Flag</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDeliveries.map((delivery) => (
                  <React.Fragment key={delivery.deliveryId}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{delivery.deliveryId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{delivery.orderId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{getOrderSourceBadge(delivery.orderSource)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-gray-400" />
                          <span className="text-gray-900">{delivery.customerName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="size-4 text-gray-400" />
                          <div>
                            <div className="text-gray-900 font-medium">{delivery.destinationCity}</div>
                            <div className="text-xs text-gray-500">{delivery.destinationArea}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">
                          {delivery.pickupPoint ? (
                            <div className="flex items-center gap-2">
                              <ImageIcon className="size-4 text-gray-400" />
                              <span className="text-gray-900">{delivery.pickupPoint}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <MapPin className="size-4 text-gray-400" />
                              <span className="text-gray-900">{delivery.deliveryPoint}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">{getDeliveryTypeBadge(delivery.deliveryType)}</td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{delivery.assignedDriver}</div>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(delivery.deliveryStatus)}</td>
                      <td className="px-6 py-4">{getExceptionBadge(delivery.exceptionFlag)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setExpandedRow(expandedRow === delivery.deliveryId ? null : delivery.deliveryId)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                        >
                          {expandedRow === delivery.deliveryId ? (
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

                    {/* Expanded Row - Delivery Proof */}
                    {expandedRow === delivery.deliveryId && (
                      <tr>
                        <td colSpan={11} className="px-6 py-4 bg-gray-50">
                          {delivery.deliveryProof ? (
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-4">Delivery Proof</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                  <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Signature</p>
                                    <p className="text-gray-900">{delivery.deliveryProof.signatureName}</p>
                                    {delivery.deliveryProof.signatureImage && (
                                      <img 
                                        src={delivery.deliveryProof.signatureImage} 
                                        alt="Signature" 
                                        className="mt-2 border border-gray-200 rounded max-w-xs"
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Completed At</p>
                                    <p className="text-gray-900">{delivery.deliveryProof.completedAt && new Date(delivery.deliveryProof.completedAt).toLocaleString()}</p>
                                  </div>
                                  {delivery.deliveryProof.notes && (
                                    <div>
                                      <p className="text-sm font-semibold text-gray-700 mb-1">Notes</p>
                                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-sm text-gray-800">{delivery.deliveryProof.notes}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {delivery.deliveryProof.photos && delivery.deliveryProof.photos.length > 0 && (
                                  <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-2">Delivery Photos</p>
                                    <div className="grid grid-cols-2 gap-3">
                                      {delivery.deliveryProof.photos.map((photo, index) => (
                                        <div key={index} className="relative group">
                                          <img 
                                            src={photo} 
                                            alt={`Delivery proof ${index + 1}`} 
                                            className="w-full h-40 object-cover rounded-lg border border-gray-200 shadow-sm"
                                          />
                                          <button
                                            onClick={() => window.open(photo, '_blank')}
                                            className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center"
                                          >
                                            <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium">
                                              View Full Size
                                            </span>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 bg-gray-100 rounded-lg">
                              <Package className="size-12 mx-auto mb-2 text-gray-400" />
                              <p className="text-gray-600">No delivery proof available</p>
                              <p className="text-sm text-gray-500 mt-1">
                                {delivery.deliveryStatus === 'pending' || delivery.deliveryStatus === 'assigned-driver' 
                                  ? 'Delivery has not started yet' 
                                  : 'Delivery in progress'}
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredDeliveries.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <Truck className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No deliveries found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}