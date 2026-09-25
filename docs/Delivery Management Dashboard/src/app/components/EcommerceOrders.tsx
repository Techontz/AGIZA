import { useState } from 'react';
import React from 'react';
import { Package2, ShoppingCart, TrendingUp, Clock, Search, User, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

interface EcommerceOrder {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: { name: string; quantity: number; price: number }[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus: 'paid' | 'pending' | 'failed';
  orderDate: string;
  shippingAddress: string;
}

const mockEcommerceOrders: EcommerceOrder[] = [
  {
    orderId: 'ECO-001',
    customerName: 'Fatuma Hassan',
    customerEmail: 'fatuma@email.com',
    items: [
      { name: 'Samsung Galaxy A54 5G', quantity: 1, price: 850000 },
      { name: 'Sony WH-1000XM5 Headphones', quantity: 1, price: 650000 }
    ],
    totalAmount: 1500000,
    status: 'processing',
    paymentStatus: 'paid',
    orderDate: '2026-01-16T08:30:00',
    shippingAddress: 'Mikocheni, Sam Nujoma Road, Dar es Salaam'
  },
  {
    orderId: 'ECO-002',
    customerName: 'John Mwamba',
    customerEmail: 'john.mwamba@email.com',
    items: [
      { name: 'Nike Air Max 270', quantity: 2, price: 180000 }
    ],
    totalAmount: 360000,
    status: 'shipped',
    paymentStatus: 'paid',
    orderDate: '2026-01-15T14:20:00',
    shippingAddress: 'Njiro, Arusha'
  },
  {
    orderId: 'ECO-003',
    customerName: 'Grace Kimaro',
    customerEmail: 'grace.k@email.com',
    items: [
      { name: 'MacBook Air M2', quantity: 1, price: 2500000 }
    ],
    totalAmount: 2500000,
    status: 'pending',
    paymentStatus: 'pending',
    orderDate: '2026-01-16T10:15:00',
    shippingAddress: 'Masaki, Dar es Salaam'
  },
  {
    orderId: 'ECO-004',
    customerName: 'Ahmed Salim',
    customerEmail: 'ahmed.s@email.com',
    items: [
      { name: 'LG 55" 4K Smart TV', quantity: 1, price: 1200000 },
      { name: 'Sony WH-1000XM5 Headphones', quantity: 1, price: 650000 }
    ],
    totalAmount: 1850000,
    status: 'delivered',
    paymentStatus: 'paid',
    orderDate: '2026-01-14T09:00:00',
    shippingAddress: 'Isamilo, Mwanza'
  },
  {
    orderId: 'ECO-005',
    customerName: 'Neema Mkwawa',
    customerEmail: 'neema.m@email.com',
    items: [
      { name: 'Levi\'s 501 Original Jeans', quantity: 3, price: 95000 },
      { name: 'Adidas Ultraboost 22', quantity: 1, price: 220000 }
    ],
    totalAmount: 505000,
    status: 'processing',
    paymentStatus: 'paid',
    orderDate: '2026-01-15T16:45:00',
    shippingAddress: 'Msasani, Dodoma'
  },
  {
    orderId: 'ECO-006',
    customerName: 'David Lyimo',
    customerEmail: 'david.l@email.com',
    items: [
      { name: 'Canon EOS R6 Camera', quantity: 1, price: 4500000 }
    ],
    totalAmount: 4500000,
    status: 'pending',
    paymentStatus: 'paid',
    orderDate: '2026-01-16T11:20:00',
    shippingAddress: 'Kinondoni, Dar es Salaam'
  },
];

export function EcommerceOrders() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const getStatusBadge = (status: EcommerceOrder['status']) => {
    const styles = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'processing': 'bg-blue-100 text-blue-800',
      'shipped': 'bg-purple-100 text-purple-800',
      'delivered': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const getPaymentStatusBadge = (status: EcommerceOrder['paymentStatus']) => {
    const styles = {
      'paid': 'bg-green-100 text-green-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'failed': 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const filteredOrders = mockEcommerceOrders.filter(order => {
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    pending: mockEcommerceOrders.filter(o => o.status === 'pending').length,
    processing: mockEcommerceOrders.filter(o => o.status === 'processing').length,
    shipped: mockEcommerceOrders.filter(o => o.status === 'shipped').length,
    revenue: mockEcommerceOrders.reduce((sum, o) => sum + o.totalAmount, 0),
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">E-commerce Shop Orders</h1>
          <p className="text-gray-600">Manage orders from your online store</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending Orders</p>
                <p className="text-3xl font-bold text-orange-600">{stats.pending}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <Clock className="size-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Processing</p>
                <p className="text-3xl font-bold text-blue-600">{stats.processing}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Package2 className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Shipped</p>
                <p className="text-3xl font-bold text-green-600">{stats.shipped}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <ShoppingCart className="size-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-purple-600">
                  TSh {(stats.revenue / 1000000).toFixed(1)}M
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <TrendingUp className="size-6 text-purple-600" />
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
                placeholder="Search by Order ID, Customer, or Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Items</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Payment</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <React.Fragment key={order.orderId}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{order.orderId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <User className="size-4 text-gray-400 mt-1" />
                          <div>
                            <div className="text-gray-900 font-medium">{order.customerName}</div>
                            <div className="text-xs text-gray-500">{order.customerEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{order.items.length} item(s)</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">
                          TSh {order.totalAmount.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                      <td className="px-6 py-4">{getPaymentStatusBadge(order.paymentStatus)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(order.orderDate).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setExpandedRow(expandedRow === order.orderId ? null : order.orderId)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                        >
                          {expandedRow === order.orderId ? (
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

                    {/* Expanded Row */}
                    {expandedRow === order.orderId && (
                      <tr>
                        <td colSpan={8} className="px-6 py-4 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3">Order Items</h4>
                              <div className="space-y-2">
                                {order.items.map((item, index) => (
                                  <div key={index} className="flex justify-between items-center bg-white p-3 rounded border border-gray-200">
                                    <div>
                                      <p className="font-medium text-gray-900">{item.name}</p>
                                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                                    </div>
                                    <p className="font-semibold text-gray-900">
                                      TSh {(item.price * item.quantity).toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3">Shipping Address</h4>
                              <div className="bg-white p-4 rounded border border-gray-200">
                                <div className="flex items-start gap-2">
                                  <MapPin className="size-5 text-gray-400 mt-0.5" />
                                  <p className="text-gray-900">{order.shippingAddress}</p>
                                </div>
                              </div>
                              <div className="mt-4">
                                <h4 className="font-semibold text-gray-900 mb-2">Order Summary</h4>
                                <div className="bg-white p-4 rounded border border-gray-200 space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Subtotal:</span>
                                    <span className="text-gray-900">TSh {order.totalAmount.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between font-semibold pt-2 border-t border-gray-200">
                                    <span className="text-gray-900">Total:</span>
                                    <span className="text-gray-900">TSh {order.totalAmount.toLocaleString()}</span>
                                  </div>
                                </div>
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
      </div>
    </div>
  );
}