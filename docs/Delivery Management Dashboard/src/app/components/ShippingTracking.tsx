import { useState } from 'react';
import { Ship, Package2, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Search, Filter, Plus, Paperclip, FileText, Clock } from 'lucide-react';

interface ReadyOrder {
  orderId: string;
  shipper: string;
  origin: 'china' | 'uk' | 'usa' | 'dubai' | 'india' | 'tanzania';
  destination: string;
  weight: number;
  cbm: number;
  weightType: 'estimated' | 'exact';
  orderType: 'standard' | 'electronic-battery' | 'bulk' | 'machinery' | 'fragile';
  readyDate: string;
  exceptionFlags: string[];
  shippingMethod: 'air-cargo' | 'sea-cargo';
  selected: boolean;
}

interface OrderInShipment {
  orderId: string;
  weight: number;
  cbm: number;
  timeline: { milestone: string; date: string; status: 'completed' | 'pending' }[];
}

interface WaitingToReceiveOrder {
  orderId: string;
  supplierTrackingNumber: string;
  origin: 'china' | 'uk' | 'usa' | 'dubai' | 'india';
  shipper: string;
  orderType: 'simple' | 'bulk' | 'machinery' | 'fragile';
  source: 'agiza-procured' | 'client-purchased';
  itemName: string;
  itemImage?: string;
  description: string;
  packagesQuantity: number;
  estimatedArrival: string;
}

interface Shipment {
  cargoId: string;
  shipmentNumber: string;
  shipper: string;
  status: 'received' | 'created' | 'booked' | 'loaded' | 'export-cleared' | 'shipping-to-destination' | 'clearance' | 'completed';
  weight: number;
  cbm: number;
  shippingMethod: 'air-cargo' | 'sea' | 'road';
  origin: 'china' | 'uk' | 'usa' | 'dubai' | 'india' | 'tanzania';
  destination: string;
  eta: string;
  lastUpdate: string;
  alert?: 'customs-hold' | 'document-missing' | 'carrier-delay' | 'fine';
  orders: OrderInShipment[];
  documents?: { name: string; url: string; notes?: string }[];
}

const mockReadyOrders: ReadyOrder[] = [
  {
    orderId: 'INT-001',
    shipper: 'Silent Ocean',
    origin: 'china',
    destination: 'Dar es Salaam, Tanzania',
    weight: 150,
    cbm: 2.5,
    weightType: 'exact',
    orderType: 'electronic-battery',
    readyDate: '2026-01-15T00:00:00',
    exceptionFlags: [],
    shippingMethod: 'sea-cargo',
    selected: false
  },
  {
    orderId: 'INT-005',
    shipper: 'Freedom Yiwu ZNZ Cargo',
    origin: 'china',
    destination: 'Zanzibar, Tanzania',
    weight: 85,
    cbm: 1.8,
    weightType: 'exact',
    orderType: 'bulk',
    readyDate: '2026-01-14T00:00:00',
    exceptionFlags: [],
    shippingMethod: 'sea-cargo',
    selected: false
  },
  {
    orderId: 'INT-009',
    shipper: 'Abdulraheem Dubai',
    origin: 'dubai',
    destination: 'Dar es Salaam, Tanzania',
    weight: 45,
    cbm: 0.8,
    weightType: 'estimated',
    orderType: 'standard',
    readyDate: '2026-01-16T00:00:00',
    exceptionFlags: ['weight-not-confirmed'],
    shippingMethod: 'air-cargo',
    selected: false
  },
  {
    orderId: 'INT-010',
    shipper: 'KTM India Cargo',
    origin: 'india',
    destination: 'Arusha, Tanzania',
    weight: 220,
    cbm: 3.2,
    weightType: 'exact',
    orderType: 'machinery',
    readyDate: '2026-01-13T00:00:00',
    exceptionFlags: ['payment-pending'],
    shippingMethod: 'sea-cargo',
    selected: false
  },
];

const mockShipments: Shipment[] = [
  {
    cargoId: 'CARGO-2026-001',
    shipmentNumber: 'SH-CN-TZ-240115',
    shipper: 'Silent Ocean',
    status: 'shipping-to-destination',
    weight: 1250,
    cbm: 18.5,
    shippingMethod: 'sea',
    origin: 'china',
    destination: 'Dar es Salaam, Tanzania',
    eta: '2026-02-05T00:00:00',
    lastUpdate: '2026-01-14T10:30:00',
    alert: 'fine',
    orders: [
      { 
        orderId: 'INT-002', 
        weight: 500, 
        cbm: 7.2,
        timeline: [
          { milestone: 'Received at Warehouse', date: '2026-01-10', status: 'completed' },
          { milestone: 'Export Cleared', date: '2026-01-12', status: 'completed' },
          { milestone: 'Loaded on Vessel', date: '2026-01-13', status: 'completed' },
          { milestone: 'Arrive at Port', date: '2026-02-05', status: 'pending' }
        ]
      },
      { 
        orderId: 'INT-003', 
        weight: 750, 
        cbm: 11.3,
        timeline: [
          { milestone: 'Received at Warehouse', date: '2026-01-10', status: 'completed' },
          { milestone: 'Export Cleared', date: '2026-01-12', status: 'completed' },
          { milestone: 'Loaded on Vessel', date: '2026-01-13', status: 'completed' },
          { milestone: 'Arrive at Port', date: '2026-02-05', status: 'pending' }
        ]
      }
    ],
    documents: [
      { name: 'Bill of Lading.pdf', url: '#', notes: 'Original BoL' },
      { name: 'Commercial Invoice.pdf', url: '#' }
    ]
  },
  {
    cargoId: 'CARGO-2026-002',
    shipmentNumber: 'SH-DXB-TZ-240112',
    shipper: 'Swala Dubai',
    status: 'clearance',
    weight: 420,
    cbm: 5.8,
    shippingMethod: 'air-cargo',
    origin: 'dubai',
    destination: 'Dar es Salaam, Tanzania',
    eta: '2026-01-18T00:00:00',
    lastUpdate: '2026-01-15T14:20:00',
    alert: 'document-missing',
    orders: [
      { 
        orderId: 'INT-006', 
        weight: 420, 
        cbm: 5.8,
        timeline: [
          { milestone: 'Received at Warehouse', date: '2026-01-08', status: 'completed' },
          { milestone: 'Loaded on Flight', date: '2026-01-10', status: 'completed' },
          { milestone: 'Arrived at JNIA', date: '2026-01-11', status: 'completed' },
          { milestone: 'Customs Clearance', date: '2026-01-18', status: 'pending' }
        ]
      }
    ]
  },
  {
    cargoId: 'CARGO-2026-003',
    shipmentNumber: 'SH-USA-TZ-240108',
    shipper: 'Umoja Cargo',
    status: 'export-cleared',
    weight: 890,
    cbm: 12.4,
    shippingMethod: 'sea',
    origin: 'usa',
    destination: 'Dar es Salaam, Tanzania',
    eta: '2026-02-20T00:00:00',
    lastUpdate: '2026-01-13T09:15:00',
    alert: 'fine',
    orders: [
      { 
        orderId: 'INT-004', 
        weight: 890, 
        cbm: 12.4,
        timeline: [
          { milestone: 'Received at Warehouse', date: '2026-01-05', status: 'completed' },
          { milestone: 'Export Documentation', date: '2026-01-08', status: 'completed' },
          { milestone: 'Export Cleared', date: '2026-01-13', status: 'completed' },
          { milestone: 'Loading Scheduled', date: '2026-01-18', status: 'pending' }
        ]
      }
    ]
  }
];

const mockWaitingOrders: WaitingToReceiveOrder[] = [
  {
    orderId: 'INT-007',
    supplierTrackingNumber: 'CN-YW-2026-4521',
    origin: 'china',
    shipper: 'Silent Ocean',
    orderType: 'bulk',
    source: 'agiza-procured',
    itemName: 'Fashion Items - Assorted Clothing',
    itemImage: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200',
    description: '100 pieces of assorted fashion clothing including t-shirts, jeans, and dresses',
    packagesQuantity: 5,
    estimatedArrival: '2026-01-22T00:00:00'
  },
  {
    orderId: 'INT-011',
    supplierTrackingNumber: 'DXB-2026-8934',
    origin: 'dubai',
    shipper: 'Abdulraheem Dubai',
    orderType: 'simple',
    source: 'client-purchased',
    itemName: 'Electronics - Laptops',
    itemImage: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=200',
    description: '10 laptops purchased by client from Dubai supplier',
    packagesQuantity: 2,
    estimatedArrival: '2026-01-20T00:00:00'
  },
  {
    orderId: 'INT-012',
    supplierTrackingNumber: 'USA-SF-2026-1122',
    origin: 'usa',
    shipper: 'Umoja Cargo',
    orderType: 'machinery',
    source: 'agiza-procured',
    itemName: 'Industrial Equipment - CNC Machine Parts',
    itemImage: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=200',
    description: 'Heavy machinery parts for industrial manufacturing',
    packagesQuantity: 8,
    estimatedArrival: '2026-01-25T00:00:00'
  },
  {
    orderId: 'INT-013',
    supplierTrackingNumber: 'UK-LON-2026-6633',
    origin: 'uk',
    shipper: 'Inland Strategy',
    orderType: 'fragile',
    source: 'agiza-procured',
    itemName: 'Medical Equipment - Laboratory Glassware',
    itemImage: 'https://images.unsplash.com/photo-1583911860205-72f8ac8ddcbe?w=200',
    description: 'Fragile laboratory equipment including microscopes and test tubes',
    packagesQuantity: 3,
    estimatedArrival: '2026-01-23T00:00:00'
  },
  {
    orderId: 'INT-014',
    supplierTrackingNumber: 'IN-MUM-2026-3344',
    origin: 'india',
    shipper: 'KTM India Cargo',
    orderType: 'bulk',
    source: 'client-purchased',
    itemName: 'Textiles - Fabric Rolls',
    itemImage: 'https://images.unsplash.com/photo-1524041255072-7da0525d6b34?w=200',
    description: '500 meters of assorted textile fabrics for clothing manufacturing',
    packagesQuantity: 12,
    estimatedArrival: '2026-01-24T00:00:00'
  }
];

export function ShippingTracking() {
  const [activeTab, setActiveTab] = useState<'ready' | 'shipments' | 'waiting'>('shipments');
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [shipperFilter, setShipperFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [readyOrders, setReadyOrders] = useState(mockReadyOrders);
  const [showCreateShipment, setShowCreateShipment] = useState(false);

  const shippers = [
    'Silent Ocean',
    'Umoja Cargo',
    'Inland Strategy',
    'Abdulraheem Dubai',
    'Swala Dubai',
    'Wakina Bady Dubai',
    'KTM India Cargo',
    'Freedom Yiwu ZNZ Cargo'
  ];

  const getStatusBadge = (status: Shipment['status']) => {
    const styles = {
      'received': 'bg-blue-100 text-blue-800',
      'created': 'bg-purple-100 text-purple-800',
      'booked': 'bg-indigo-100 text-indigo-800',
      'loaded': 'bg-cyan-100 text-cyan-800',
      'export-cleared': 'bg-green-100 text-green-800',
      'shipping-to-destination': 'bg-yellow-100 text-yellow-800',
      'clearance': 'bg-orange-100 text-orange-800',
      'completed': 'bg-gray-100 text-gray-800',
    };

    const labels = {
      'received': 'Received',
      'created': 'Created',
      'booked': 'Booked',
      'loaded': 'Loaded',
      'export-cleared': 'Export Cleared',
      'shipping-to-destination': 'Shipping to Destination',
      'clearance': 'Clearance',
      'completed': 'Completed',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getAlertBadge = (alert: Shipment['alert']) => {
    if (!alert || alert === 'fine') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center gap-1">
          <CheckCircle2 className="size-3" />
          All Good
        </span>
      );
    }

    const styles = {
      'customs-hold': { bg: 'bg-red-100 text-red-800', label: 'Customs Hold' },
      'document-missing': { bg: 'bg-red-100 text-red-800', label: 'Document Missing' },
      'carrier-delay': { bg: 'bg-red-100 text-red-800', label: 'Carrier Delay' },
    };

    const config = styles[alert];

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} flex items-center gap-1`}>
        <AlertTriangle className="size-3" />
        {config.label}
      </span>
    );
  };

  const getOrderTypeBadge = (type: ReadyOrder['orderType']) => {
    const styles = {
      'standard': 'bg-gray-100 text-gray-800',
      'electronic-battery': 'bg-yellow-100 text-yellow-800',
      'bulk': 'bg-blue-100 text-blue-800',
      'machinery': 'bg-purple-100 text-purple-800',
      'fragile': 'bg-red-100 text-red-800',
    };

    const labels = {
      'standard': 'Standard',
      'electronic-battery': 'Electronic w/ Battery',
      'bulk': 'Bulk',
      'machinery': 'Machinery',
      'fragile': 'Fragile',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[type]}`}>
        {labels[type]}
      </span>
    );
  };

  const toggleOrderSelection = (orderId: string) => {
    setReadyOrders(prev => prev.map(order => 
      order.orderId === orderId ? { ...order, selected: !order.selected } : order
    ));
  };

  const selectedOrders = readyOrders.filter(o => o.selected);

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Shipping & Tracking</h1>
          <p className="text-gray-600">Manage shipments and track cargo across all routes</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Active Shipments</p>
                <p className="text-3xl font-bold text-blue-600">{mockShipments.filter(s => s.status !== 'completed').length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Ship className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Ready for Shipment</p>
                <p className="text-3xl font-bold text-orange-600">{mockReadyOrders.length}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <Package2 className="size-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">In Transit</p>
                <p className="text-3xl font-bold text-cyan-600">
                  {mockShipments.filter(s => s.status === 'shipping-to-destination').length}
                </p>
              </div>
              <div className="bg-cyan-100 p-3 rounded-full">
                <Ship className="size-6 text-cyan-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Alerts</p>
                <p className="text-3xl font-bold text-red-600">
                  {mockShipments.filter(s => s.alert && s.alert !== 'fine').length}
                </p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="size-6 text-red-600" />
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
                placeholder="Search shipments or orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <select
                value={shipperFilter}
                onChange={(e) => setShipperFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Shippers</option>
                {shippers.map(shipper => (
                  <option key={shipper} value={shipper}>{shipper}</option>
                ))}
              </select>

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
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Methods</option>
                <option value="air-cargo">Air Cargo</option>
                <option value="sea">Sea Cargo</option>
                <option value="road">Road</option>
              </select>

              {activeTab === 'shipments' && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="shipping-to-destination">In Transit</option>
                  <option value="clearance">Clearance</option>
                  <option value="completed">Completed</option>
                </select>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => setActiveTab('ready')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'ready'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Ready for Shipment ({mockReadyOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('shipments')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'shipments'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Shipments ({mockShipments.length})
            </button>
            <button
              onClick={() => setActiveTab('waiting')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'waiting'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Waiting to Receive ({mockWaitingOrders.length})
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'ready' ? (
          <>
            {/* Bulk Actions */}
            {selectedOrders.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
                <p className="text-blue-900 font-medium">{selectedOrders.length} order(s) selected</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCreateShipment(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                  >
                    <Plus className="size-4" />
                    Create New Shipment
                  </button>
                  <button className="bg-white text-blue-600 border border-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium">
                    Add to Existing Shipment
                  </button>
                </div>
              </div>
            )}

            {/* Ready Orders Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left">
                        <input type="checkbox" className="rounded" />
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Shipper</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Origin</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Destination</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Weight/CBM</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Ready Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Exception Flags</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Shipping Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {readyOrders.map((order) => (
                      <tr key={order.orderId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            className="rounded"
                            checked={order.selected}
                            onChange={() => toggleOrderSelection(order.orderId)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <button className="font-semibold text-blue-600 hover:text-blue-800">{order.orderId}</button>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{order.shipper}</td>
                        <td className="px-6 py-4">
                          <span className="text-gray-900 uppercase text-sm">{order.origin}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{order.destination}</td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">
                            <div>{order.weight}kg / {order.cbm}m³</div>
                            <div className="text-xs text-gray-500">({order.weightType})</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{getOrderTypeBadge(order.orderType)}</td>
                        <td className="px-6 py-4 text-gray-900 text-sm">
                          {new Date(order.readyDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          {order.exceptionFlags.length > 0 ? (
                            <div className="space-y-1">
                              {order.exceptionFlags.map((flag, index) => (
                                <span key={index} className="inline-block px-2 py-1 bg-red-100 text-red-800 text-xs rounded mr-1">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-green-600 text-sm">✓ No issues</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {order.shippingMethod === 'air-cargo' ? 'Air Cargo' : 'Sea Cargo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : activeTab === 'waiting' ? (
          /* Waiting Orders Table */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Supplier Tracking #</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Origin</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Shipper</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Source</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Item Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Packages Quantity</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Estimated Arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mockWaitingOrders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <button className="font-semibold text-blue-600 hover:text-blue-800">{order.orderId}</button>
                      </td>
                      <td className="px-6 py-4">{order.supplierTrackingNumber}</td>
                      <td className="px-6 py-4">
                        <span className="text-gray-900 uppercase text-sm">{order.origin}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-900">{order.shipper}</td>
                      <td className="px-6 py-4">{getOrderTypeBadge(order.orderType)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          order.source === 'agiza-procured' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {order.source === 'agiza-procured' ? 'Agiza Procured' : 'Client Purchased'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {order.itemImage && (
                            <img 
                              src={order.itemImage} 
                              alt={order.itemName} 
                              className="size-10 rounded object-cover"
                            />
                          )}
                          <span className="text-gray-900 font-medium">{order.itemName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-900 text-sm">{order.description}</td>
                      <td className="px-6 py-4 text-gray-900 text-sm">{order.packagesQuantity}</td>
                      <td className="px-6 py-4 text-gray-900 text-sm">
                        {new Date(order.estimatedArrival).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Shipments Table */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Cargo ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Shipment #</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Shipper</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Weight/CBM</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Method</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Route</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">ETA</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Alert</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mockShipments.map((shipment) => (
                    <>
                      <tr key={shipment.cargoId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{shipment.cargoId}</div>
                          <div className="text-xs text-gray-500">{shipment.orders.length} order(s)</div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setExpandedShipment(expandedShipment === shipment.cargoId ? null : shipment.cargoId)}
                            className="font-mono text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                          >
                            {shipment.shipmentNumber}
                            {expandedShipment === shipment.cargoId ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{shipment.shipper}</td>
                        <td className="px-6 py-4">{getStatusBadge(shipment.status)}</td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">
                            <div>{shipment.weight}kg</div>
                            <div className="text-sm text-gray-600">{shipment.cbm}m³</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium uppercase">
                            {shipment.shippingMethod}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900 text-sm">
                            <div className="uppercase font-medium">{shipment.origin}</div>
                            <div className="text-gray-500">→ {shipment.destination}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 text-sm">
                          {new Date(shipment.eta).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">{getAlertBadge(shipment.alert)}</td>
                        <td className="px-6 py-4">
                          <button className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1">
                            <Paperclip className="size-4" />
                            Documents
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {expandedShipment === shipment.cargoId && (
                        <tr>
                          <td colSpan={10} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <h4 className="font-semibold text-gray-900">Orders in Shipment</h4>
                              {shipment.orders.map((order) => (
                                <div key={order.orderId} className="bg-white border border-gray-200 rounded-lg p-4">
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <span className="font-semibold text-gray-900">{order.orderId}</span>
                                      <span className="text-gray-600 ml-3">
                                        {order.weight}kg / {order.cbm}m³
                                      </span>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-700">Timeline:</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      {order.timeline.map((milestone, index) => (
                                        <div key={index} className={`p-2 rounded-lg ${milestone.status === 'completed' ? 'bg-green-50' : 'bg-gray-100'}`}>
                                          <div className="flex items-center gap-2">
                                            {milestone.status === 'completed' ? (
                                              <CheckCircle2 className="size-4 text-green-600" />
                                            ) : (
                                              <Clock className="size-4 text-gray-400" />
                                            )}
                                            <span className="text-xs font-medium text-gray-900">{milestone.milestone}</span>
                                          </div>
                                          <p className="text-xs text-gray-600 mt-1">{milestone.date}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {shipment.documents && shipment.documents.length > 0 && (
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-2">Documents</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {shipment.documents.map((doc, index) => (
                                      <div key={index} className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg">
                                        <FileText className="size-5 text-blue-600" />
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                                          {doc.notes && <p className="text-xs text-gray-500">{doc.notes}</p>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}