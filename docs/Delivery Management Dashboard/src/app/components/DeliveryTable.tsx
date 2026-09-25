import { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, User, Package2, DollarSign, Calendar, Truck, Image as ImageIcon, FileText, Edit2, Check, X } from 'lucide-react';
import type { Delivery } from '@/app/components/DeliveryDashboard';
import React from 'react';

interface DeliveryTableProps {
  deliveries: Delivery[];
}

export function DeliveryTable({ deliveries }: DeliveryTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'images' | 'size'>('info');
  const [packageSizes, setPackageSizes] = useState<Record<string, 'small' | 'medium' | 'large'>>({});
  const [showQuoteForm, setShowQuoteForm] = useState<string | null>(null);
  const [editingQuote, setEditingQuote] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<Record<string, { fullPrice: string; advancePaymentEnabled: boolean; advanceAmount: string; estimatedDeliveryDate: string }>>({});
  const [detailedStatuses, setDetailedStatuses] = useState<Record<string, Delivery['detailedStatus']>>({});
  const [quoteStatuses, setQuoteStatuses] = useState<Record<string, Delivery['quoteStatus']>>({});

  const toggleRow = (orderId: string) => {
    setExpandedRow(expandedRow === orderId ? null : orderId);
    if (expandedRow !== orderId) {
      setActiveDetailTab('info');
    }
  };

  const setPackageSize = (orderId: string, size: 'small' | 'medium' | 'large') => {
    setPackageSizes(prev => ({
      ...prev,
      [orderId]: size
    }));
  };

  const getPackageSize = (delivery: Delivery) => {
    return packageSizes[delivery.orderId] || delivery.packageSize;
  };

  const getDetailedStatus = (delivery: Delivery) => {
    return detailedStatuses[delivery.orderId] || delivery.detailedStatus || 'picked-up';
  };

  const getQuoteStatus = (delivery: Delivery) => {
    return quoteStatuses[delivery.orderId] || delivery.quoteStatus || 'quoted';
  };

  const setDetailedStatus = (orderId: string, status: Delivery['detailedStatus']) => {
    setDetailedStatuses(prev => ({
      ...prev,
      [orderId]: status
    }));
  };

  const setQuoteStatus = (orderId: string, status: Delivery['quoteStatus']) => {
    setQuoteStatuses(prev => ({
      ...prev,
      [orderId]: status
    }));
  };

  const handleQuoteFormChange = (orderId: string, field: 'fullPrice' | 'advancePaymentEnabled' | 'advanceAmount' | 'estimatedDeliveryDate', value: string | boolean) => {
    setQuoteData(prev => ({
      ...prev,
      [orderId]: {
        fullPrice: prev[orderId]?.fullPrice || '',
        advancePaymentEnabled: prev[orderId]?.advancePaymentEnabled || false,
        advanceAmount: prev[orderId]?.advanceAmount || '',
        estimatedDeliveryDate: prev[orderId]?.estimatedDeliveryDate || '',
        [field]: value
      }
    }));
  };

  const handleSubmitQuote = (orderId: string) => {
    const quote = quoteData[orderId];
    if (quote?.fullPrice && quote?.estimatedDeliveryDate) {
      alert(`Quote submitted for ${orderId}\nFull Price: TSh ${quote.fullPrice}${quote.advancePaymentEnabled ? `\nAdvance Payment: TSh ${quote.advanceAmount}` : ''}\nEstimated Delivery: ${new Date(quote.estimatedDeliveryDate).toLocaleString()}`);
      setShowQuoteForm(null);
      setEditingQuote(null);
    }
  };

  const startEditQuote = (delivery: Delivery) => {
    setEditingQuote(delivery.orderId);
    setQuoteData(prev => ({
      ...prev,
      [delivery.orderId]: {
        fullPrice: delivery.quotedPrice?.toString() || '',
        advancePaymentEnabled: false,
        advanceAmount: '',
        estimatedDeliveryDate: delivery.estimatedDeliveryDate || ''
      }
    }));
  };

  const getStatusBadge = (status: Delivery['deliveryStatus']) => {
    const styles = {
      'in-progress': 'bg-blue-100 text-blue-800',
      'quoted': 'bg-green-100 text-green-800',
      'waiting-quote': 'bg-orange-100 text-orange-800',
    };

    const labels = {
      'in-progress': 'In Progress',
      'quoted': 'Quoted',
      'waiting-quote': 'Waiting Quote',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getDetailedStatusBadge = (status: Delivery['detailedStatus']) => {
    if (!status) return null;
    
    const styles = {
      'picked-up': 'bg-cyan-100 text-cyan-800',
      'at-reroute-center': 'bg-purple-100 text-purple-800',
      'in-transit': 'bg-blue-100 text-blue-800',
      'arrived-destination': 'bg-indigo-100 text-indigo-800',
      'delivered': 'bg-green-100 text-green-800',
    };

    const labels = {
      'picked-up': 'Picked Up',
      'at-reroute-center': 'At Agiza Reroute Center',
      'in-transit': 'In Transit',
      'arrived-destination': 'Arrived at Destination City',
      'delivered': 'Delivered',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getQuoteStatusBadge = (status: Delivery['quoteStatus']) => {
    if (!status) return null;
    
    const styles = {
      'quoted': 'bg-yellow-100 text-yellow-800',
      'accepted': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
    };

    const labels = {
      'quoted': 'Quoted',
      'accepted': 'Accepted',
      'rejected': 'Rejected',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getPriorityBadge = (priority: Delivery['priority']) => {
    const styles = {
      'standard': 'bg-gray-100 text-gray-800',
      'express': 'bg-purple-100 text-purple-800',
      'urgent': 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[priority]}`}>
        {priority.toUpperCase()}
      </span>
    );
  };

  const renderQuoteForm = (delivery: Delivery, isEditing: boolean = false) => {
    return (
      <div className="bg-white border border-gray-300 rounded-lg p-6 shadow-lg">
        <h3 className="font-semibold text-lg text-gray-900 mb-4">
          {isEditing ? `Edit Quote for ${delivery.orderId}` : `Create Quote for ${delivery.orderId}`}
        </h3>
        
        {/* Full Price Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Price (TSh) <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">TSh</span>
            <input
              type="number"
              step="1000"
              min="0"
              placeholder="0"
              value={quoteData[delivery.orderId]?.fullPrice || ''}
              onChange={(e) => handleQuoteFormChange(delivery.orderId, 'fullPrice', e.target.value)}
              className="w-full pl-14 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Estimated Delivery Date Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Estimated Delivery Date <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
            <input
              type="datetime-local"
              value={quoteData[delivery.orderId]?.estimatedDeliveryDate || ''}
              onChange={(e) => handleQuoteFormChange(delivery.orderId, 'estimatedDeliveryDate', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Advance Payment Toggle */}
        <div className="mb-4 bg-gray-50 p-4 rounded-lg">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={quoteData[delivery.orderId]?.advancePaymentEnabled || false}
              onChange={(e) => handleQuoteFormChange(delivery.orderId, 'advancePaymentEnabled', e.target.checked)}
              className="size-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Require Advance Payment
            </span>
          </label>

          {/* Advance Amount Input */}
          {quoteData[delivery.orderId]?.advancePaymentEnabled && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Advance Payment Amount (TSh) <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">TSh</span>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  placeholder="0"
                  value={quoteData[delivery.orderId]?.advanceAmount || ''}
                  onChange={(e) => handleQuoteFormChange(delivery.orderId, 'advanceAmount', e.target.value)}
                  className="w-full pl-14 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Customer will pay this amount upfront before delivery begins
              </p>
            </div>
          )}
        </div>

        {/* Quote Summary */}
        {quoteData[delivery.orderId]?.fullPrice && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">Quote Summary</p>
            <div className="space-y-1 text-sm text-blue-800">
              <div className="flex justify-between">
                <span>Full Price:</span>
                <span className="font-semibold">TSh {parseFloat(quoteData[delivery.orderId].fullPrice).toLocaleString()}</span>
              </div>
              {quoteData[delivery.orderId]?.estimatedDeliveryDate && (
                <div className="flex justify-between">
                  <span>Estimated Delivery:</span>
                  <span className="font-semibold">{new Date(quoteData[delivery.orderId].estimatedDeliveryDate).toLocaleString()}</span>
                </div>
              )}
              {quoteData[delivery.orderId]?.advancePaymentEnabled && quoteData[delivery.orderId]?.advanceAmount && (
                <>
                  <div className="flex justify-between">
                    <span>Advance Payment:</span>
                    <span className="font-semibold">TSh {parseFloat(quoteData[delivery.orderId].advanceAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-blue-300">
                    <span>Remaining Balance:</span>
                    <span className="font-semibold">
                      TSh {(parseFloat(quoteData[delivery.orderId].fullPrice) - parseFloat(quoteData[delivery.orderId].advanceAmount)).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleSubmitQuote(delivery.orderId)}
            disabled={!quoteData[delivery.orderId]?.fullPrice || !quoteData[delivery.orderId]?.estimatedDeliveryDate}
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isEditing ? 'Update Quote' : 'Submit Quote'}
          </button>
          <button
            onClick={() => {
              setShowQuoteForm(null);
              setEditingQuote(null);
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  if (deliveries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <Package2 className="size-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 text-lg">No deliveries found</p>
        <p className="text-gray-500 text-sm mt-2">Try adjusting your filters or search terms</p>
      </div>
    );
  }

  return (
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
                Item Details
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deliveries.map((delivery) => (
              <React.Fragment key={delivery.orderId}>
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">{delivery.orderId}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(delivery.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-gray-400" />
                      <span className="text-gray-900">{delivery.customerName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-900">{delivery.itemDetails}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {getStatusBadge(delivery.deliveryStatus)}
                      {delivery.deliveryStatus === 'in-progress' && getDetailedStatusBadge(getDetailedStatus(delivery))}
                      {delivery.deliveryStatus === 'quoted' && getQuoteStatusBadge(getQuoteStatus(delivery))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getPriorityBadge(delivery.priority)}
                  </td>
                  <td className="px-6 py-4">
                    {delivery.quotedPrice ? (
                      <div className="text-gray-900 font-medium">
                        TSh {delivery.quotedPrice.toLocaleString()}
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleRow(delivery.orderId)}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                    >
                      {expandedRow === delivery.orderId ? (
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
                {expandedRow === delivery.orderId && (
                  <tr key={`${delivery.orderId}-details`}>
                    <td colSpan={7} className="px-6 py-4 bg-gray-50">
                      {delivery.deliveryStatus === 'waiting-quote' ? (
                        // Tabbed interface for waiting-quote orders
                        <div>
                          {/* Tab Navigation */}
                          <div className="flex gap-2 mb-6 border-b border-gray-200">
                            <button
                              onClick={() => setActiveDetailTab('info')}
                              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                                activeDetailTab === 'info'
                                  ? 'border-blue-600 text-blue-600'
                                  : 'border-transparent text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Order Info
                            </button>
                            <button
                              onClick={() => setActiveDetailTab('images')}
                              className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
                                activeDetailTab === 'images'
                                  ? 'border-blue-600 text-blue-600'
                                  : 'border-transparent text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              <ImageIcon className="size-4" />
                              Images/Photos
                              {delivery.images && delivery.images.length > 0 && (
                                <span className="bg-blue-600 text-white text-xs rounded-full size-5 flex items-center justify-center">
                                  {delivery.images.length}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => setActiveDetailTab('size')}
                              className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
                                activeDetailTab === 'size'
                                  ? 'border-blue-600 text-blue-600'
                                  : 'border-transparent text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              <Package2 className="size-4" />
                              Package Size
                              {getPackageSize(delivery) && (
                                <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                                  {getPackageSize(delivery)}
                                </span>
                              )}
                            </button>
                          </div>

                          {/* Tab Content */}
                          {activeDetailTab === 'info' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <MapPin className="size-4 text-green-600" />
                                    Pickup Address
                                  </div>
                                  <p className="text-gray-900 ml-6">{delivery.pickupAddress}</p>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <MapPin className="size-4 text-red-600" />
                                    Delivery Address
                                  </div>
                                  <p className="text-gray-900 ml-6">{delivery.deliveryAddress}</p>
                                </div>
                                {delivery.additionalNotes && (
                                  <div>
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                      <FileText className="size-4 text-blue-600" />
                                      Additional Notes
                                    </div>
                                    <div className="ml-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                      <p className="text-sm text-gray-800">{delivery.additionalNotes}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-4">
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                  <p className="text-sm text-orange-800 font-medium mb-2">Action Required</p>
                                  <p className="text-sm text-orange-700 mb-4">This order is waiting for a quote. Please review package details and generate a quote.</p>
                                  <button 
                                    onClick={() => setShowQuoteForm(delivery.orderId)}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium w-full"
                                  >
                                    Generate Quote
                                  </button>
                                </div>

                                {/* Quote Form */}
                                {showQuoteForm === delivery.orderId && renderQuoteForm(delivery)}
                              </div>
                            </div>
                          )}

                          {activeDetailTab === 'images' && (
                            <div>
                              <p className="text-sm text-gray-700 mb-4">Customer-uploaded package photos:</p>
                              {delivery.images && delivery.images.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  {delivery.images.map((image, index) => (
                                    <div key={index} className="relative group">
                                      <img
                                        src={image}
                                        alt={`Package photo ${index + 1}`}
                                        className="w-full h-40 object-cover rounded-lg border border-gray-200 shadow-sm"
                                      />
                                      <button
                                        onClick={() => window.open(image, '_blank')}
                                        className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center"
                                      >
                                        <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium">
                                          View Full Size
                                        </span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 bg-gray-100 rounded-lg">
                                  <ImageIcon className="size-12 mx-auto mb-2 text-gray-400" />
                                  <p className="text-gray-600">No images provided by customer</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeDetailTab === 'size' && (
                            <div>
                              <p className="text-sm text-gray-700 mb-2">
                                Customer selected package size: <strong className="text-blue-600">{delivery.packageSize?.toUpperCase()}</strong>
                              </p>
                              <p className="text-sm text-gray-600 mb-4">You can adjust the package size if needed for accurate quote calculation:</p>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
                                <button
                                  onClick={() => setPackageSize(delivery.orderId, 'small')}
                                  className={`p-6 rounded-lg border-2 transition-all ${
                                    getPackageSize(delivery) === 'small'
                                      ? 'border-blue-600 bg-blue-50'
                                      : 'border-gray-200 bg-white hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex flex-col items-center">
                                    <Package2 className={`size-12 mb-3 ${
                                      getPackageSize(delivery) === 'small' ? 'text-blue-600' : 'text-gray-400'
                                    }`} />
                                    <h3 className="font-semibold text-lg mb-1">Small</h3>
                                    <p className="text-sm text-gray-600">Up to 5kg</p>
                                    <p className="text-xs text-gray-500 mt-1">30×30×30 cm</p>
                                  </div>
                                </button>

                                <button
                                  onClick={() => setPackageSize(delivery.orderId, 'medium')}
                                  className={`p-6 rounded-lg border-2 transition-all ${
                                    getPackageSize(delivery) === 'medium'
                                      ? 'border-blue-600 bg-blue-50'
                                      : 'border-gray-200 bg-white hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex flex-col items-center">
                                    <Package2 className={`size-16 mb-3 ${
                                      getPackageSize(delivery) === 'medium' ? 'text-blue-600' : 'text-gray-400'
                                    }`} />
                                    <h3 className="font-semibold text-lg mb-1">Medium</h3>
                                    <p className="text-sm text-gray-600">5kg - 15kg</p>
                                    <p className="text-xs text-gray-500 mt-1">50×50×50 cm</p>
                                  </div>
                                </button>

                                <button
                                  onClick={() => setPackageSize(delivery.orderId, 'large')}
                                  className={`p-6 rounded-lg border-2 transition-all ${
                                    getPackageSize(delivery) === 'large'
                                      ? 'border-blue-600 bg-blue-50'
                                      : 'border-gray-200 bg-white hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex flex-col items-center">
                                    <Package2 className={`size-20 mb-3 ${
                                      getPackageSize(delivery) === 'large' ? 'text-blue-600' : 'text-gray-400'
                                    }`} />
                                    <h3 className="font-semibold text-lg mb-1">Large</h3>
                                    <p className="text-sm text-gray-600">Over 15kg</p>
                                    <p className="text-xs text-gray-500 mt-1">100×100×100 cm</p>
                                  </div>
                                </button>
                              </div>

                              {packageSizes[delivery.orderId] && packageSizes[delivery.orderId] !== delivery.packageSize && (
                                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                  <p className="text-sm text-yellow-800">
                                    ⚠ Package size updated to <strong>{packageSizes[delivery.orderId]}</strong> (originally {delivery.packageSize})
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : delivery.deliveryStatus === 'in-progress' ? (
                        // In-progress orders view with detailed status selector
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                  <MapPin className="size-4 text-green-600" />
                                  Pickup Address
                                </div>
                                <p className="text-gray-900 ml-6">{delivery.pickupAddress}</p>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                  <MapPin className="size-4 text-red-600" />
                                  Delivery Address
                                </div>
                                <p className="text-gray-900 ml-6">{delivery.deliveryAddress}</p>
                              </div>
                              {delivery.additionalNotes && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <FileText className="size-4 text-blue-600" />
                                    Additional Notes
                                  </div>
                                  <div className="ml-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm text-gray-800">{delivery.additionalNotes}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-4">
                              {delivery.estimatedDeliveryDate && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <Calendar className="size-4 text-blue-600" />
                                    Estimated Delivery Date
                                  </div>
                                  <p className="text-gray-900 ml-6">{new Date(delivery.estimatedDeliveryDate).toLocaleString()}</p>
                                </div>
                              )}
                              {delivery.driver && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <Truck className="size-4 text-purple-600" />
                                    Assigned Driver
                                  </div>
                                  <p className="text-gray-900 ml-6">{delivery.driver}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Detailed Status Selector */}
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-3">Update Delivery Status</h4>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <button
                                key="picked-up"
                                onClick={() => setDetailedStatus(delivery.orderId, 'picked-up')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getDetailedStatus(delivery) === 'picked-up'
                                    ? 'border-cyan-600 bg-cyan-50 text-cyan-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getDetailedStatus(delivery) === 'picked-up' && <Check className="size-4 mx-auto mb-1" />}
                                Picked Up
                              </button>
                              <button
                                key="at-reroute-center"
                                onClick={() => setDetailedStatus(delivery.orderId, 'at-reroute-center')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getDetailedStatus(delivery) === 'at-reroute-center'
                                    ? 'border-purple-600 bg-purple-50 text-purple-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getDetailedStatus(delivery) === 'at-reroute-center' && <Check className="size-4 mx-auto mb-1" />}
                                At Agiza Center
                              </button>
                              <button
                                key="in-transit"
                                onClick={() => setDetailedStatus(delivery.orderId, 'in-transit')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getDetailedStatus(delivery) === 'in-transit'
                                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getDetailedStatus(delivery) === 'in-transit' && <Check className="size-4 mx-auto mb-1" />}
                                In Transit
                              </button>
                              <button
                                key="arrived-destination"
                                onClick={() => setDetailedStatus(delivery.orderId, 'arrived-destination')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getDetailedStatus(delivery) === 'arrived-destination'
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getDetailedStatus(delivery) === 'arrived-destination' && <Check className="size-4 mx-auto mb-1" />}
                                Arrived
                              </button>
                              <button
                                key="delivered"
                                onClick={() => setDetailedStatus(delivery.orderId, 'delivered')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getDetailedStatus(delivery) === 'delivered'
                                    ? 'border-green-600 bg-green-50 text-green-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getDetailedStatus(delivery) === 'delivered' && <Check className="size-4 mx-auto mb-1" />}
                                Delivered
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Quoted orders view with quote status and edit functionality
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                  <MapPin className="size-4 text-green-600" />
                                  Pickup Address
                                </div>
                                <p className="text-gray-900 ml-6">{delivery.pickupAddress}</p>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                  <MapPin className="size-4 text-red-600" />
                                  Delivery Address
                                </div>
                                <p className="text-gray-900 ml-6">{delivery.deliveryAddress}</p>
                              </div>
                              {delivery.additionalNotes && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <FileText className="size-4 text-blue-600" />
                                    Additional Notes
                                  </div>
                                  <div className="ml-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm text-gray-800">{delivery.additionalNotes}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-4">
                              {delivery.estimatedDeliveryDate && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <Calendar className="size-4 text-blue-600" />
                                    Estimated Delivery Date
                                  </div>
                                  <p className="text-gray-900 ml-6">{new Date(delivery.estimatedDeliveryDate).toLocaleString()}</p>
                                </div>
                              )}
                              {delivery.quotedPrice && (
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                                    <DollarSign className="size-4 text-green-600" />
                                    Quoted Price
                                  </div>
                                  <p className="text-gray-900 ml-6 font-semibold">TSh {delivery.quotedPrice.toLocaleString()}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quote Status Selector */}
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-3">Quote Status</h4>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              <button
                                key="quoted"
                                onClick={() => setQuoteStatus(delivery.orderId, 'quoted')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getQuoteStatus(delivery) === 'quoted'
                                    ? 'border-yellow-600 bg-yellow-50 text-yellow-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getQuoteStatus(delivery) === 'quoted' && <Check className="size-4 mx-auto mb-1" />}
                                Quoted
                              </button>
                              <button
                                key="accepted"
                                onClick={() => setQuoteStatus(delivery.orderId, 'accepted')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getQuoteStatus(delivery) === 'accepted'
                                    ? 'border-green-600 bg-green-50 text-green-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getQuoteStatus(delivery) === 'accepted' && <Check className="size-4 mx-auto mb-1" />}
                                Accepted
                              </button>
                              <button
                                key="rejected"
                                onClick={() => setQuoteStatus(delivery.orderId, 'rejected')}
                                className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                                  getQuoteStatus(delivery) === 'rejected'
                                    ? 'border-red-600 bg-red-50 text-red-800'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {getQuoteStatus(delivery) === 'rejected' && <X className="size-4 mx-auto mb-1" />}
                                Rejected
                              </button>
                            </div>

                            <div className="flex gap-2">
                              <button 
                                onClick={() => startEditQuote(delivery)}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                              >
                                <Edit2 className="size-4" />
                                Edit Quote
                              </button>
                              {getQuoteStatus(delivery) === 'accepted' && (
                                <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium">
                                  Assign Driver
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Edit Quote Form */}
                          {editingQuote === delivery.orderId && (
                            <div className="mt-4">
                              {renderQuoteForm(delivery, true)}
                            </div>
                          )}
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
  );
}