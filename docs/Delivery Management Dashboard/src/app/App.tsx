import { useState } from 'react';
import { Layout } from '@/app/components/Layout';
import { DeliveryDashboard } from '@/app/components/DeliveryDashboard';
import { DeliveriesManagement } from '@/app/components/DeliveriesManagement';
import { InternationalOrders } from '@/app/components/InternationalOrders';
import { EcommerceOrders } from '@/app/components/EcommerceOrders';
import { EcommercePlatform } from '@/app/components/EcommercePlatform';
import { ServiceOrders } from '@/app/components/ServiceOrders';
import { Returns } from '@/app/components/Returns';
import { Tasks } from '@/app/components/Tasks';
import { ChatSupport } from '@/app/components/ChatSupport';
import { ShippingTracking } from '@/app/components/ShippingTracking';
import { IntakeQuotes } from '@/app/components/IntakeQuotes';
import { PeopleManagement } from '@/app/components/PeopleManagement';
import { Procurement } from '@/app/components/Procurement';
import { WarehouseManagement } from '@/app/components/WarehouseManagement';
import { Finance } from '@/app/components/Finance';
import { Settings } from '@/app/components/Settings';
import { PlaceholderPage } from '@/app/components/PlaceholderPage';
import { ShippingEngine } from '@/app/components/ShippingEngine';
import { 
  RotateCcw, 
  Truck, 
  ShoppingCart, 
  Ship, 
  MessageSquare, 
  Users, 
  Wallet, 
  Receipt, 
  FileText, 
  Warehouse, 
  BarChart3 
} from 'lucide-react';

export default function App() {
  const [activePage, setActivePage] = useState('express-delivery');

  const renderPage = () => {
    switch (activePage) {
      case 'international-orders':
        return <InternationalOrders />;
      case 'express-delivery':
        return <DeliveryDashboard />;
      case 'ecommerce-orders':
        return <EcommerceOrders />;
      case 'service-orders':
        return <ServiceOrders />;
      case 'returns':
        return <Returns />;
      case 'tasks':
        return <Tasks />;
      case 'deliveries':
        return <DeliveriesManagement />;
      case 'procurement':
        return <Procurement />;
      case 'shipping':
        return <ShippingTracking />;
      case 'chat':
        return <ChatSupport />;
      case 'ecommerce-platform':
        return <EcommercePlatform onNavigate={setActivePage} />;
      case 'user-roles':
        return (
          <PlaceholderPage
            title="User Roles & Permissions"
            description="Manage team members, roles, and access permissions across the platform"
            icon={Users}
          />
        );
      case 'wallets':
        return <Finance />;
      case 'payments':
        return <Finance />;
      case 'invoices':
        return <Finance />;
      case 'warehouse':
        return <WarehouseManagement />;
      case 'reporting':
        return (
          <PlaceholderPage
            title="Reporting & Audit Logs"
            description="View detailed reports, analytics, and audit trails for all platform activities"
            icon={BarChart3}
          />
        );
      case 'intake-quotes':
        return <IntakeQuotes />;
      case 'people-management':
        return <PeopleManagement />;
      case 'settings':
        return <Settings />;
      case 'shipping-engine-overview':
      case 'shipping-engine-routes':
      case 'shipping-engine-zones':
      case 'shipping-engine-profiles':
      case 'shipping-engine-rules':
      case 'shipping-engine-carriers':
      case 'shipping-engine-overrides':
      case 'shipping-engine-test-rate':
      case 'shipping-engine-methods':
      case 'shipping-engine-settings':
        return <ShippingEngine view={activePage} />;
      default:
        return <DeliveryDashboard />;
    }
  };

  return (
    <div className="size-full">
      <Layout activePage={activePage} onPageChange={setActivePage}>
        {renderPage()}
      </Layout>
    </div>
  );
}