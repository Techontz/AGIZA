import { useState } from 'react';
import { Package, Clock, CheckCircle2, AlertCircle, Search, Filter } from 'lucide-react';
import { DeliveryTable } from '@/app/components/DeliveryTable';

export interface Delivery {
  orderId: string;
  customerName: string;
  itemDetails: string;
  pickupAddress: string;
  deliveryAddress: string;
  deliveryStatus: 'in-progress' | 'quoted' | 'waiting-quote';
  detailedStatus?: 'picked-up' | 'at-reroute-center' | 'in-transit' | 'arrived-destination' | 'delivered';
  quoteStatus?: 'quoted' | 'accepted' | 'rejected';
  priority: 'standard' | 'express' | 'urgent';
  quotedPrice?: number;
  estimatedDeliveryDate?: string;
  driver?: string;
  createdAt: string;
  packageSize?: 'small' | 'medium' | 'large';
  images?: string[];
  additionalNotes?: string;
}

const mockDeliveries: Delivery[] = [
  {
    orderId: 'ORD-001',
    customerName: 'Juma Mwangi',
    itemDetails: '2x Electronics Package (5kg)',
    pickupAddress: 'Kariakoo Market, Msimbazi St, Dar es Salaam',
    deliveryAddress: 'Mwenge, Sam Nujoma Rd, Dar es Salaam',
    deliveryStatus: 'in-progress',
    detailedStatus: 'in-transit',
    priority: 'express',
    quotedPrice: 25000,
    estimatedDeliveryDate: '2026-01-15T14:30:00',
    driver: 'Hassan Mohamed',
    createdAt: '2026-01-15T09:30:00'
  },
  {
    orderId: 'ORD-002',
    customerName: 'Amina Khamis',
    itemDetails: '1x Document Envelope',
    pickupAddress: 'Mlimani City, Sam Nujoma Rd, Dar es Salaam',
    deliveryAddress: 'Clock Tower, India St, Arusha',
    deliveryStatus: 'in-progress',
    detailedStatus: 'at-reroute-center',
    priority: 'urgent',
    quotedPrice: 35000,
    estimatedDeliveryDate: '2026-01-15T12:45:00',
    driver: 'Baraka Mushi',
    createdAt: '2026-01-15T10:15:00',
    additionalNotes: 'Handle with care - important legal documents'
  },
  {
    orderId: 'ORD-003',
    customerName: 'David Mapunda',
    itemDetails: '3x Food Containers (8kg)',
    pickupAddress: 'Ubungo Plaza, Morogoro Rd, Dar es Salaam',
    deliveryAddress: 'Mwanza City Center, Kenyatta Rd, Mwanza',
    deliveryStatus: 'quoted',
    quoteStatus: 'quoted',
    priority: 'standard',
    quotedPrice: 45000,
    estimatedDeliveryDate: '2026-01-16T10:00:00',
    createdAt: '2026-01-15T10:45:00'
  },
  {
    orderId: 'ORD-004',
    customerName: 'Grace Mollel',
    itemDetails: '1x Furniture Item (25kg)',
    pickupAddress: 'Arusha Declaration Museum Rd, Arusha',
    deliveryAddress: 'Zanzibar Stone Town, Kenyatta Rd, Zanzibar',
    deliveryStatus: 'quoted',
    quoteStatus: 'accepted',
    priority: 'standard',
    quotedPrice: 75000,
    estimatedDeliveryDate: '2026-01-16T15:00:00',
    createdAt: '2026-01-15T11:00:00'
  },
  {
    orderId: 'ORD-005',
    customerName: 'Michael Lwiza',
    itemDetails: '5x Small Parcels (3kg total)',
    pickupAddress: 'Quality Center Mall, Morogoro Rd, Dar es Salaam',
    deliveryAddress: 'Dodoma Business District, Nyerere Rd, Dodoma',
    deliveryStatus: 'waiting-quote',
    priority: 'standard',
    createdAt: '2026-01-15T11:20:00',
    packageSize: 'small',
    images: [
      'https://images.unsplash.com/photo-1757837593538-b4a8654132f1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYWNrYWdlJTIwYm94fGVufDF8fHx8MTc2ODQ4ODcwM3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1605882174146-a464b70cf691?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZWxpdmVyeSUyMHBhcmNlbHxlbnwxfHx8fDE3Njg0ODg3MDN8MA&ixlib=rb-4.1.0&q=80&w=1080'
    ],
    additionalNotes: 'Multiple small items - books and office supplies'
  },
  {
    orderId: 'ORD-006',
    customerName: 'Neema Kileo',
    itemDetails: '1x Artwork (Fragile, 10kg)',
    pickupAddress: 'Tingatinga Arts Center, Haile Selassie Rd, Dar es Salaam',
    deliveryAddress: 'Cultural Heritage Center, Arusha-Moshi Rd, Arusha',
    deliveryStatus: 'waiting-quote',
    priority: 'express',
    createdAt: '2026-01-15T11:35:00',
    packageSize: 'medium',
    images: [
      'https://images.unsplash.com/photo-1713103659721-9bb3d355fefb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhcnR3b3JrJTIwcGFpbnRpbmd8ZW58MXx8fHwxNzY4NDA2Mzc1fDA&ixlib=rb-4.1.0&q=80&w=1080'
    ],
    additionalNotes: 'Fragile painting - requires special handling'
  },
  {
    orderId: 'ORD-007',
    customerName: 'Emmanuel Shayo',
    itemDetails: '2x Medical Supplies (Temperature Controlled)',
    pickupAddress: 'Muhimbili Hospital, United Nations Rd, Dar es Salaam',
    deliveryAddress: 'Mount Meru Regional Hospital, Sokoine Rd, Arusha',
    deliveryStatus: 'in-progress',
    detailedStatus: 'picked-up',
    priority: 'urgent',
    quotedPrice: 80000,
    estimatedDeliveryDate: '2026-01-15T12:00:00',
    driver: 'Joseph Kimaro',
    createdAt: '2026-01-15T11:40:00',
    additionalNotes: 'Must maintain temperature control - urgent medical supplies'
  },
];

export function DeliveryDashboard() {
  const [activeTab, setActiveTab] = useState<'all' | 'in-progress' | 'quoted' | 'waiting-quote'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDeliveries = mockDeliveries.filter(delivery => {
    const matchesTab = activeTab === 'all' || delivery.deliveryStatus === activeTab;
    const matchesSearch = 
      delivery.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.itemDetails.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const inProgressCount = mockDeliveries.filter(d => d.deliveryStatus === 'in-progress').length;
  const quotedCount = mockDeliveries.filter(d => d.deliveryStatus === 'quoted').length;
  const waitingQuoteCount = mockDeliveries.filter(d => d.deliveryStatus === 'waiting-quote').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Express Delivery Management</h1>
          <p className="text-gray-600">Manage and track all local deliveries</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">In Progress</p>
                <p className="text-3xl font-bold text-blue-600">{inProgressCount}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Package className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Quoted</p>
                <p className="text-3xl font-bold text-green-600">{quotedCount}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Waiting Quote</p>
                <p className="text-3xl font-bold text-orange-600">{waitingQuoteCount}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <Clock className="size-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Order ID, Customer, or Item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Tab Filters */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Orders
              </button>
              <button
                onClick={() => setActiveTab('in-progress')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'in-progress'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                In Progress
              </button>
              <button
                onClick={() => setActiveTab('quoted')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'quoted'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Quoted
              </button>
              <button
                onClick={() => setActiveTab('waiting-quote')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'waiting-quote'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Waiting Quote
              </button>
            </div>
          </div>
        </div>

        {/* Delivery Table */}
        <DeliveryTable deliveries={filteredDeliveries} />
      </div>
    </div>
  );
}