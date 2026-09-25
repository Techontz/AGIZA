import { useState } from 'react';
import { FileText, Clock, CheckCircle2, MessageSquare, Send, Globe, Zap, Wrench, DollarSign, Calendar } from 'lucide-react';

interface Quote {
  quoteId: string;
  customerName: string;
  serviceType: 'international' | 'express-delivery' | 'service-request';
  description: string;
  requestDate: string;
  status: 'new' | 'answered' | 'waiting-reply';
  quotedAmount?: number;
  estimatedDelivery?: string;
  responseNotes?: string;
  respondedBy?: string;
  responseDate?: string;
  origin?: string;
  destination?: string;
}

const mockQuotes: Quote[] = [
  {
    quoteId: 'Q-2026-001',
    customerName: 'Fatuma Hassan',
    serviceType: 'international',
    description: 'Need quote for importing 10 laptops from China to Dar es Salaam',
    requestDate: '2026-01-16T08:30:00',
    status: 'new',
    origin: 'China',
    destination: 'Dar es Salaam'
  },
  {
    quoteId: 'Q-2026-002',
    customerName: 'John Mwamba',
    serviceType: 'express-delivery',
    description: 'Urgent delivery of documents from Dar to Arusha',
    requestDate: '2026-01-16T09:15:00',
    status: 'new',
    origin: 'Dar es Salaam',
    destination: 'Arusha'
  },
  {
    quoteId: 'Q-2026-003',
    customerName: 'Grace Kimaro',
    serviceType: 'service-request',
    description: 'Home cleaning service for 3-bedroom apartment in Mikocheni',
    requestDate: '2026-01-16T10:00:00',
    status: 'new'
  },
  {
    quoteId: 'Q-2026-004',
    customerName: 'Ahmed Salim',
    serviceType: 'international',
    description: 'Bulk order: 500 phone cases from Dubai',
    requestDate: '2026-01-15T14:20:00',
    status: 'answered',
    quotedAmount: 1250000,
    estimatedDelivery: '2026-02-10',
    responseNotes: 'Quote includes shipping via air cargo and customs clearance',
    respondedBy: 'Sarah Mtui',
    responseDate: '2026-01-15T16:45:00',
    origin: 'Dubai',
    destination: 'Dar es Salaam'
  },
  {
    quoteId: 'Q-2026-005',
    customerName: 'Neema Mkwawa',
    serviceType: 'express-delivery',
    description: 'Package delivery from Mwanza to Dodoma - 15kg',
    requestDate: '2026-01-15T11:30:00',
    status: 'answered',
    quotedAmount: 45000,
    estimatedDelivery: '2026-01-18',
    responseNotes: 'Express delivery, 2-day service',
    respondedBy: 'Emmanuel Mollel',
    responseDate: '2026-01-15T13:00:00',
    origin: 'Mwanza',
    destination: 'Dodoma'
  },
  {
    quoteId: 'Q-2026-006',
    customerName: 'David Lyimo',
    serviceType: 'service-request',
    description: 'Plumbing repair - kitchen sink and bathroom pipes',
    requestDate: '2026-01-14T16:00:00',
    status: 'waiting-reply',
    quotedAmount: 85000,
    estimatedDelivery: '2026-01-17',
    responseNotes: 'Service includes parts and 2 hours labor',
    respondedBy: 'Sarah Mtui',
    responseDate: '2026-01-14T17:30:00'
  },
  {
    quoteId: 'Q-2026-007',
    customerName: 'Sarah Mtui',
    serviceType: 'international',
    description: 'Import medical supplies from USA - 50kg',
    requestDate: '2026-01-14T09:00:00',
    status: 'waiting-reply',
    quotedAmount: 3500000,
    estimatedDelivery: '2026-02-28',
    responseNotes: 'Includes special handling for medical equipment and expedited customs',
    respondedBy: 'David Lyimo',
    responseDate: '2026-01-14T11:00:00',
    origin: 'USA',
    destination: 'Dar es Salaam'
  },
];

export function IntakeQuotes() {
  const [activeTab, setActiveTab] = useState<'new' | 'answered' | 'waiting-reply'>('new');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [quotedAmount, setQuotedAmount] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [responseNotes, setResponseNotes] = useState('');

  const getServiceTypeBadge = (type: Quote['serviceType']) => {
    const styles = {
      'international': { bg: 'bg-blue-100 text-blue-800', icon: Globe, label: 'International Order' },
      'express-delivery': { bg: 'bg-green-100 text-green-800', icon: Zap, label: 'Express Delivery' },
      'service-request': { bg: 'bg-purple-100 text-purple-800', icon: Wrench, label: 'Service Request' },
    };

    const config = styles[type];
    const Icon = config.icon;

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} flex items-center gap-1 w-fit`}>
        <Icon className="size-3" />
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (status: Quote['status']) => {
    const styles = {
      'new': 'bg-orange-100 text-orange-800',
      'answered': 'bg-green-100 text-green-800',
      'waiting-reply': 'bg-yellow-100 text-yellow-800',
    };

    const labels = {
      'new': 'New Quotation',
      'answered': 'Answered',
      'waiting-reply': 'Waiting for Reply',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const filteredQuotes = mockQuotes.filter(quote => quote.status === activeTab);
  
  const newCount = mockQuotes.filter(q => q.status === 'new').length;
  const answeredCount = mockQuotes.filter(q => q.status === 'answered').length;
  const waitingCount = mockQuotes.filter(q => q.status === 'waiting-reply').length;

  const handleRespondToQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setShowResponseModal(true);
    setQuotedAmount('');
    setEstimatedDelivery('');
    setResponseNotes('');
  };

  const handleApproveOrder = (quote: Quote, orderType: string) => {
    alert(`Order approved and sent to ${orderType}. Order ID will be generated.`);
    setShowResponseModal(false);
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Intake & Quotes</h1>
          <p className="text-gray-600">Manage quotation requests from all service types</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">New Quotations</p>
                <p className="text-3xl font-bold text-orange-600">{newCount}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <FileText className="size-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Answered</p>
                <p className="text-3xl font-bold text-green-600">{answeredCount}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Waiting for Reply</p>
                <p className="text-3xl font-bold text-yellow-600">{waitingCount}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <Clock className="size-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('new')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'new'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              New Quotations ({newCount})
            </button>
            <button
              onClick={() => setActiveTab('answered')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'answered'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Answered Quotations ({answeredCount})
            </button>
            <button
              onClick={() => setActiveTab('waiting-reply')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'waiting-reply'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Waiting for Reply ({waitingCount})
            </button>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Quote ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Service Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Route</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Request Date</th>
                  {activeTab !== 'new' && (
                    <>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Quoted Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Responded By</th>
                    </>
                  )}
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredQuotes.map((quote) => (
                  <tr key={quote.quoteId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{quote.quoteId}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-900">{quote.customerName}</td>
                    <td className="px-6 py-4">{getServiceTypeBadge(quote.serviceType)}</td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 max-w-xs">{quote.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      {quote.origin && quote.destination ? (
                        <div className="text-sm text-gray-900">
                          <div className="font-medium">{quote.origin}</div>
                          <div className="text-gray-500">→ {quote.destination}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-900 text-sm">
                      {new Date(quote.requestDate).toLocaleString()}
                    </td>
                    {activeTab !== 'new' && (
                      <>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">
                            TSh {quote.quotedAmount?.toLocaleString()}
                          </div>
                          {quote.estimatedDelivery && (
                            <div className="text-xs text-gray-500">
                              ETA: {new Date(quote.estimatedDelivery).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-900 text-sm">
                          {quote.respondedBy || '—'}
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4">
                      {activeTab === 'new' ? (
                        <button
                          onClick={() => handleRespondToQuote(quote)}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-2"
                        >
                          <Send className="size-4" />
                          Respond
                        </button>
                      ) : activeTab === 'answered' ? (
                        <button
                          onClick={() => handleRespondToQuote(quote)}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                        >
                          Approve Order
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-yellow-600">
                          <Clock className="size-4" />
                          <span className="text-sm font-medium">Awaiting Customer</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredQuotes.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <MessageSquare className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No quotations in this category</p>
          </div>
        )}

        {/* Response Modal */}
        {showResponseModal && selectedQuote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowResponseModal(false)}>
            <div className="bg-white rounded-lg max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {activeTab === 'new' ? 'Respond to Quotation' : 'Approve & Create Order'}
                </h2>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Quote ID</p>
                  <p className="text-gray-900">{selectedQuote.quoteId}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Customer</p>
                  <p className="text-gray-900">{selectedQuote.customerName}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Service Type</p>
                  {getServiceTypeBadge(selectedQuote.serviceType)}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
                  <p className="text-gray-900">{selectedQuote.description}</p>
                </div>

                {activeTab === 'new' ? (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Quoted Amount (TSh)
                      </label>
                      <input
                        type="number"
                        value={quotedAmount}
                        onChange={(e) => setQuotedAmount(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter amount in TSh"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Estimated Delivery Date
                      </label>
                      <input
                        type="date"
                        value={estimatedDelivery}
                        onChange={(e) => setEstimatedDelivery(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Response Notes
                      </label>
                      <textarea
                        value={responseNotes}
                        onChange={(e) => setResponseNotes(e.target.value)}
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Add any additional notes or terms..."
                      />
                    </div>
                  </>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 mb-2">
                      <strong>Quoted Amount:</strong> TSh {selectedQuote.quotedAmount?.toLocaleString()}
                    </p>
                    {selectedQuote.estimatedDelivery && (
                      <p className="text-sm text-blue-900 mb-2">
                        <strong>Estimated Delivery:</strong> {new Date(selectedQuote.estimatedDelivery).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-sm text-blue-900">
                      <strong>Notes:</strong> {selectedQuote.responseNotes}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  {activeTab === 'new' ? (
                    <button
                      onClick={() => {
                        alert('Quotation sent to customer');
                        setShowResponseModal(false);
                      }}
                      className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Send Quotation
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApproveOrder(selectedQuote, 
                          selectedQuote.serviceType === 'international' ? 'International Orders' :
                          selectedQuote.serviceType === 'express-delivery' ? 'Express Delivery' :
                          'Service Orders'
                        )}
                        className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        Approve & Create Order
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowResponseModal(false)}
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
    </div>
  );
}
