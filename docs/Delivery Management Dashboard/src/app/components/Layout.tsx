import { useState } from 'react';
import { Home, Globe, Truck, Package, ShoppingCart, Wrench, Ship, MessageSquare, Users, Wallet, Warehouse, BarChart, FileText, Settings, RotateCcw, Store, CheckSquare, ChevronDown, ChevronRight, X, Menu, Zap, MapPin, Layers, FlaskConical, AlignJustify, ArrowRight, List } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  onPageChange: (page: string) => void;
}

export function Layout({ children, activePage, onPageChange }: LayoutProps) {
  const [ordersExpanded, setOrdersExpanded] = useState(true);
  const [financeExpanded, setFinanceExpanded] = useState(false);
  const [shippingEngineExpanded, setShippingEngineExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navigation = [
    {
      id: 'intake-quotes',
      label: 'Intake & Quotes',
      icon: FileText,
      page: 'intake-quotes'
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: Package,
      expandable: true,
      expanded: ordersExpanded,
      onToggle: () => setOrdersExpanded(!ordersExpanded),
      children: [
        { id: 'international-orders', label: 'International Orders', icon: Globe },
        { id: 'express-delivery', label: 'Express Delivery Management', icon: CheckSquare },
        { id: 'ecommerce-orders', label: 'E-commerce Shop Orders', icon: Store },
      ]
    },
    {
      id: 'deliveries',
      label: 'Deliveries',
      icon: Truck,
      page: 'deliveries'
    },
    {
      id: 'returns',
      label: 'Returns',
      icon: RotateCcw,
      page: 'returns'
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: CheckSquare,
      page: 'tasks'
    },
    {
      id: 'procurement',
      label: 'Procurement',
      icon: ShoppingCart,
      page: 'procurement'
    },
    {
      id: 'shipping',
      label: 'Shipping & Tracking',
      icon: Ship,
      page: 'shipping'
    },
    {
      id: 'chat',
      label: 'Chat & Customer Support',
      icon: MessageSquare,
      page: 'chat'
    },
    {
      id: 'ecommerce-platform',
      label: 'E-commerce Platform',
      icon: Store,
      page: 'ecommerce-platform'
    },
    {
      id: 'people-management',
      label: 'People',
      icon: Users,
      page: 'people-management'
    },
    {
      id: 'finance',
      label: 'Finance',
      icon: Wallet,
      expandable: true,
      expanded: financeExpanded,
      onToggle: () => setFinanceExpanded(!financeExpanded),
      children: [
        { id: 'invoices', label: 'Create Invoice', icon: FileText },
        { id: 'payments', label: 'Order Payments', icon: FileText },
        { id: 'wallets', label: 'Wallets & Installments', icon: Wallet },
      ]
    },
    {
      id: 'warehouse',
      label: 'Warehouse & Pick Up Points',
      icon: Warehouse,
      page: 'warehouse'
    },
    {
      id: 'shipping-engine',
      label: 'Shipping Engine',
      icon: Zap,
      expandable: true,
      expanded: shippingEngineExpanded,
      onToggle: () => setShippingEngineExpanded(!shippingEngineExpanded),
      children: [
        { id: 'shipping-engine-overview', label: 'Overview', icon: BarChart },
        { id: 'shipping-engine-routes', label: 'Routes', icon: ArrowRight },
        { id: 'shipping-engine-zones', label: 'Shipping Zones', icon: MapPin },
        { id: 'shipping-engine-profiles', label: 'Shipping Profiles', icon: Layers },
        { id: 'shipping-engine-rules', label: 'Rules', icon: AlignJustify },
        { id: 'shipping-engine-carriers', label: 'Carriers', icon: Truck },
        { id: 'shipping-engine-overrides', label: 'Overrides', icon: Settings },
        { id: 'shipping-engine-test-rate', label: 'Test Rate', icon: FlaskConical },
        { id: 'shipping-engine-methods', label: 'Shipping Methods', icon: List },
        { id: 'shipping-engine-settings', label: 'Settings', icon: Settings },
      ]
    },
    {
      id: 'reporting',
      label: 'Reporting & Audit Logs',
      icon: BarChart,
      page: 'reporting'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      page: 'settings'
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex-shrink-0`}>
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Package className="size-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl">Agiza Platform</h1>
              <p className="text-xs text-gray-400">Admin Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="p-4 overflow-y-auto h-[calc(100vh-120px)]">
          <div className="space-y-1">
            {navigation.map((item) => (
              <div key={item.id}>
                {item.expandable ? (
                  <>
                    <button
                      onClick={item.onToggle}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white"
                    >
                      <item.icon className="size-5 flex-shrink-0" />
                      <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                      {item.expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                    {item.expanded && item.children && (
                      <div className="ml-4 mt-1 space-y-1">
                        {item.children.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => onPageChange(child.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                              activePage === child.id
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                          >
                            <child.icon className="size-4 flex-shrink-0" />
                            <span>{child.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => onPageChange(item.page || item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activePage === (item.page || item.id)
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <item.icon className="size-5 flex-shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">Admin User</p>
              <p className="text-xs text-gray-500">admin@agiza.co.tz</p>
            </div>
            <div className="size-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
              A
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}