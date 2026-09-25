import { useState } from 'react';
import { Wallet, DollarSign, Receipt, Search, FileText, Download, Printer, Plus, Edit } from 'lucide-react';

interface OrderPayment {
  orderId: string;
  customerName: string;
  itemName: string;
  totalAmount: number;
  amountPaid: number;
  purchaseCost: number;
  shippingCost: number;
  profit: number;
  orderDate: string;
}

interface WalletBalance {
  customerId: string;
  customerName: string;
  walletBalance: number;
  totalOrders: number;
  totalPaid: number;
  totalDue: number;
  installmentPlan?: {
    orderId: string;
    totalAmount: number;
    amountPaid: number;
    nextPaymentDue: string;
    nextPaymentAmount: number;
  }[];
}

interface Invoice {
  invoiceId: string;
  customerName: string;
  orderQuoteId?: string;
  items: { description: string; amount: number }[];
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid';
  createdDate: string;
  dueDate?: string;
}

const mockOrderPayments: OrderPayment[] = [
  {
    orderId: 'INT-001',
    customerName: 'Fatuma Hassan',
    itemName: 'Electronics - Smartphones & Chargers',
    totalAmount: 2500000,
    amountPaid: 1000000,
    purchaseCost: 1800000,
    shippingCost: 200000,
    profit: 500000,
    orderDate: '2026-01-10'
  },
  {
    orderId: 'INT-002',
    customerName: 'John Mwamba',
    itemName: 'Fashion Items',
    totalAmount: 1800000,
    amountPaid: 1800000,
    purchaseCost: 1200000,
    shippingCost: 300000,
    profit: 300000,
    orderDate: '2026-01-08'
  },
  {
    orderId: 'INT-003',
    customerName: 'Grace Kimaro',
    itemName: 'Home Appliances',
    totalAmount: 4200000,
    amountPaid: 4200000,
    purchaseCost: 3000000,
    shippingCost: 800000,
    profit: 400000,
    orderDate: '2026-01-05'
  },
];

const mockWallets: WalletBalance[] = [
  {
    customerId: 'CUST-001',
    customerName: 'Fatuma Hassan',
    walletBalance: 150000,
    totalOrders: 3,
    totalPaid: 2500000,
    totalDue: 1500000,
    installmentPlan: [
      {
        orderId: 'INT-001',
        totalAmount: 2500000,
        amountPaid: 1000000,
        nextPaymentDue: '2026-02-10',
        nextPaymentAmount: 500000
      }
    ]
  },
  {
    customerId: 'CUST-002',
    customerName: 'Ahmed Salim',
    walletBalance: 75000,
    totalOrders: 2,
    totalPaid: 3000000,
    totalDue: 5500000,
    installmentPlan: [
      {
        orderId: 'INT-004',
        totalAmount: 8500000,
        amountPaid: 3000000,
        nextPaymentDue: '2026-02-12',
        nextPaymentAmount: 1500000
      }
    ]
  },
];

const mockInvoices: Invoice[] = [
  {
    invoiceId: 'INV-2026-001',
    customerName: 'Fatuma Hassan',
    orderQuoteId: 'Q-2026-001',
    items: [
      { description: 'Electronics - Laptops', amount: 2500000 }
    ],
    totalAmount: 2500000,
    status: 'sent',
    createdDate: '2026-01-15',
    dueDate: '2026-01-30'
  },
];

export function Finance() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'order-payments' | 'wallets'>('order-payments');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'quotation' | 'new'>('quotation');
  const [selectedOrder, setSelectedOrder] = useState<OrderPayment | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const stats = {
    totalRevenue: mockOrderPayments.reduce((sum, o) => sum + o.totalAmount, 0),
    totalPaid: mockOrderPayments.reduce((sum, o) => sum + o.amountPaid, 0),
    totalProfit: mockOrderPayments.reduce((sum, o) => sum + o.profit, 0),
    totalDue: mockWallets.reduce((sum, w) => sum + w.totalDue, 0),
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Finance Management</h1>
          <p className="text-gray-600">Track payments, invoices, and customer wallets</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-sm border border-blue-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-blue-600 p-3 rounded-full">
                <DollarSign className="size-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-blue-800 mb-1">Total Revenue</p>
            <p className="text-3xl font-bold text-blue-900">
              TSh {(stats.totalRevenue / 1000000).toFixed(1)}M
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-sm border border-green-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-green-600 p-3 rounded-full">
                <Wallet className="size-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-green-800 mb-1">Total Paid</p>
            <p className="text-3xl font-bold text-green-900">
              TSh {(stats.totalPaid / 1000000).toFixed(1)}M
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow-sm border border-purple-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-purple-600 p-3 rounded-full">
                <DollarSign className="size-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-purple-800 mb-1">Total Profit</p>
            <p className="text-3xl font-bold text-purple-900">
              TSh {(stats.totalProfit / 1000000).toFixed(1)}M
            </p>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-sm border border-red-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-red-600 p-3 rounded-full">
                <Receipt className="size-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-red-800 mb-1">Amount Due</p>
            <p className="text-3xl font-bold text-red-900">
              TSh {(stats.totalDue / 1000000).toFixed(1)}M
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'invoices'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FileText className="size-5" />
            Create Invoice
          </button>
          <button
            onClick={() => setActiveTab('order-payments')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'order-payments'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Receipt className="size-5" />
            Order Payments
          </button>
          <button
            onClick={() => setActiveTab('wallets')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'wallets'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Wallet className="size-5" />
            Wallets & Installments
          </button>
        </div>

        {/* Content */}
        {activeTab === 'invoices' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Invoice Management</h2>
                <button
                  onClick={() => setShowCreateInvoice(true)}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Plus className="size-5" />
                  Create New Invoice
                </button>
              </div>

              {/* Invoices List */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Invoice ID</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Quote/Order ID</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Due Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mockInvoices.map((invoice) => (
                      <tr key={invoice.invoiceId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-semibold text-gray-900">{invoice.invoiceId}</td>
                        <td className="px-6 py-4 text-gray-900">{invoice.customerName}</td>
                        <td className="px-6 py-4 text-gray-900">{invoice.orderQuoteId || '—'}</td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          TSh {invoice.totalAmount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                            invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {invoice.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{invoice.dueDate || '—'}</td>
                        <td className="px-6 py-4">
                          <button className="text-blue-600 hover:text-blue-800 font-medium text-sm mr-3">
                            View
                          </button>
                          <button className="text-gray-600 hover:text-gray-800 font-medium text-sm">
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create Invoice Modal */}
            {showCreateInvoice && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateInvoice(false)}>
                <div className="bg-white rounded-lg max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="border-b border-gray-200 px-6 py-4">
                    <h2 className="text-2xl font-bold text-gray-900">Create New Invoice</h2>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Type</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setInvoiceType('quotation')}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            invoiceType === 'quotation'
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <p className="font-semibold text-gray-900">From Quotation</p>
                          <p className="text-sm text-gray-600">Create from existing quote</p>
                        </button>
                        <button
                          onClick={() => setInvoiceType('new')}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            invoiceType === 'new'
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <p className="font-semibold text-gray-900">New Invoice</p>
                          <p className="text-sm text-gray-600">Create completely new</p>
                        </button>
                      </div>
                    </div>

                    {invoiceType === 'quotation' ? (
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Quotation</label>
                        <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option>Q-2026-001 - Fatuma Hassan</option>
                          <option>Q-2026-002 - John Mwamba</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name</label>
                          <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter customer name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                          <textarea
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={3}
                            placeholder="Invoice description"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Amount (TSh)</label>
                          <input
                            type="number"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </div>
                      </>
                    )}

                    <div className="flex gap-3 pt-4">
                      <button className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                        Create Invoice
                      </button>
                      <button
                        onClick={() => setShowCreateInvoice(false)}
                        className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'order-payments' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Order ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Item Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Paid</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Purchase Cost</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Shipping Cost</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Profit</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mockOrderPayments.map((order) => (
                    <tr key={order.orderId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{order.orderId}</div>
                        <div className="text-xs text-gray-500">{order.orderDate}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{order.itemName}</div>
                        <div className="text-xs text-gray-500">{order.customerName}</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        TSh {order.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-semibold text-green-600">
                        TSh {order.amountPaid.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-900">
                        TSh {order.purchaseCost.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-900">
                        TSh {order.shippingCost.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-green-600">
                            TSh {order.profit.toLocaleString()}
                          </span>
                          <button className="text-gray-400 hover:text-gray-600">
                            <Edit className="size-4" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-500">
                          {((order.profit / order.totalAmount) * 100).toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowReceipt(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                        >
                          <Printer className="size-4" />
                          Print Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Receipt Modal */}
            {showReceipt && selectedOrder && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowReceipt(false)}>
                <div className="bg-white rounded-lg max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="p-8">
                    <div className="text-center mb-6">
                      <h1 className="text-3xl font-bold text-gray-900 mb-2">PAYMENT RECEIPT</h1>
                      <p className="text-gray-600">Agiza Platform</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div>
                        <p className="text-sm text-gray-600">Order ID</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.orderId}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Date</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.orderDate}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Customer</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.customerName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Item</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.itemName}</p>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-700">Total Amount:</span>
                        <span className="font-semibold">TSh {selectedOrder.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-green-600">
                        <span>Amount Paid:</span>
                        <span className="font-semibold">TSh {selectedOrder.amountPaid.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-red-600 pt-2 border-t">
                        <span className="font-semibold">Balance:</span>
                        <span className="font-bold">TSh {(selectedOrder.totalAmount - selectedOrder.amountPaid).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="mt-8 flex gap-3">
                      <button
                        onClick={() => window.print()}
                        className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <Printer className="size-5" />
                        Print
                      </button>
                      <button
                        onClick={() => setShowReceipt(false)}
                        className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Wallets Tab */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Wallet Balance</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total Orders</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total Paid</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total Due</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Installments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mockWallets.map((wallet) => (
                    <tr key={wallet.customerId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{wallet.customerName}</div>
                        <div className="text-xs text-gray-500">{wallet.customerId}</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-blue-600">
                        TSh {wallet.walletBalance.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-900">{wallet.totalOrders}</td>
                      <td className="px-6 py-4 font-semibold text-green-600">
                        TSh {wallet.totalPaid.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-semibold text-red-600">
                        TSh {wallet.totalDue.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        {wallet.installmentPlan && wallet.installmentPlan.length > 0 ? (
                          <div className="space-y-2">
                            {wallet.installmentPlan.map((plan, index) => (
                              <div key={index} className="text-sm">
                                <div className="font-medium text-gray-900">{plan.orderId}</div>
                                <div className="text-xs text-gray-600">
                                  Next: TSh {plan.nextPaymentAmount.toLocaleString()} on {plan.nextPaymentDue}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </td>
                    </tr>
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
