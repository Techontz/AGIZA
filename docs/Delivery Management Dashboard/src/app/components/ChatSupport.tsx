import { useState } from 'react';
import {
  MessageSquare,
  User,
  Send,
  Search,
  Phone,
  MoreVertical,
  Paperclip,
  UserPlus,
  X,
  Check,
  Clock,
  FileText,
  Package,
  DollarSign,
  TrendingUp,
  Edit3,
  CheckCircle,
  AlertCircle,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Bell,
  Zap,
  Eye,
  ArrowUpCircle,
  Link2,
  UserCheck,
  LogOut,
  Timer,
  MousePointerClick
} from 'lucide-react';

type OrderStatus =
  | 'new_inquiry'
  | 'quoted'
  | 'awaiting_payment'
  | 'paid'
  | 'shipping'
  | 'delivered';

type ResponseStatus = 'waiting_client' | 'waiting_team' | 'urgent' | 'new';

type ClientActionState = 'quote_sent' | 'quote_viewed' | 'awaiting_response' | 'quote_expired';

type ClientValue = 'curious' | 'customer' | 'repeating' | 'high_value';

type UrgencyLevel = 'urgent' | 'waiting' | 'active';

interface QuoteItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  shippingCost: number;
}

interface QuotationCard {
  id: string;
  quoteId: string;
  items: QuoteItem[];
  totalCost: number;
  validUntil: string;
  status: 'draft' | 'sent' | 'accepted' | 'expired';
}

interface InternalNote {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

interface Message {
  id: string;
  text?: string;
  quotation?: QuotationCard;
  sender: 'agent' | 'customer' | 'system' | 'internal';
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  author?: string; // For internal notes
}

interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  clientValue: ClientValue;
  urgencyLevel: UrgencyLevel;
  channel: 'whatsapp' | 'facebook' | 'tiktok' | 'web';
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  assignedAgent: string;
  activeHandler?: string;
  isHandlerActive?: boolean;
  department: 'sales' | 'support' | 'delivery';
  orderStatus: OrderStatus;
  responseStatus: ResponseStatus;
  clientActionState?: ClientActionState;
  followUpTime?: string;
  orderId?: string;
  quoteId?: string;
  messages: Message[];
}

const mockConversations: Conversation[] = [
  {
    id: 'CHAT-001',
    customerName: 'Fatuma Hassan',
    customerPhone: '+255 712 345 678',
    clientValue: 'repeating',
    urgencyLevel: 'waiting',
    channel: 'whatsapp',
    lastMessage: 'Can you help me with a quote for importing electronics from China?',
    lastMessageTime: '2026-04-18T14:30:00',
    unreadCount: 2,
    assignedAgent: 'Sarah Mtui',
    activeHandler: 'Sarah Mtui',
    isHandlerActive: true,
    department: 'sales',
    orderStatus: 'quoted',
    responseStatus: 'waiting_client',
    clientActionState: 'quote_viewed',
    orderId: 'ORD-2045',
    quoteId: 'Q-1023',
    messages: [
      {
        id: 'MSG-001',
        text: 'Hello! I need help importing 50 smartphones from China',
        sender: 'customer',
        timestamp: '2026-04-18T14:25:00',
        status: 'read'
      },
      {
        id: 'MSG-002',
        text: 'Hi Fatuma! I\'d be happy to help you with that. Let me prepare a detailed quotation for you.',
        sender: 'agent',
        timestamp: '2026-04-18T14:26:00',
        status: 'read'
      },
      {
        id: 'MSG-002B',
        text: 'Client is a returning customer. Previously ordered 30 units in March. Good payment record.',
        sender: 'internal',
        author: 'Sarah Mtui',
        timestamp: '2026-04-18T14:27:00'
      },
      {
        id: 'MSG-002C',
        text: 'Quotation Created',
        sender: 'system',
        timestamp: '2026-04-18T14:27:30'
      },
      {
        id: 'MSG-002D',
        text: 'Quote Sent',
        sender: 'system',
        timestamp: '2026-04-18T14:28:05'
      },
      {
        id: 'MSG-002E',
        text: 'Quote Viewed by Client',
        sender: 'system',
        timestamp: '2026-04-18T14:29:15'
      },
      {
        id: 'MSG-003',
        sender: 'agent',
        timestamp: '2026-04-18T14:28:00',
        status: 'read',
        quotation: {
          id: 'QUOT-001',
          quoteId: 'Q-1023',
          items: [
            {
              productName: 'Smartphone Model X Pro',
              quantity: 50,
              unitPrice: 450000,
              shippingCost: 375000
            }
          ],
          totalCost: 23250000,
          validUntil: '2026-04-25',
          status: 'sent'
        }
      },
      {
        id: 'MSG-004',
        text: 'Thank you! This looks good. How do I proceed with payment?',
        sender: 'customer',
        timestamp: '2026-04-18T14:30:00',
        status: 'delivered'
      }
    ]
  },
  {
    id: 'CHAT-001B',
    customerName: 'Fatuma Hassan',
    customerPhone: '+255 712 345 678',
    clientValue: 'repeating',
    urgencyLevel: 'active',
    channel: 'whatsapp',
    lastMessage: 'Thank you for the update',
    lastMessageTime: '2026-04-18T15:10:00',
    unreadCount: 0,
    assignedAgent: 'Sarah Mtui',
    activeHandler: 'Sarah Mtui',
    isHandlerActive: true,
    department: 'sales',
    orderStatus: 'shipping',
    responseStatus: 'waiting_client',
    orderId: 'ORD-2091',
    quoteId: 'Q-1025',
    messages: []
  },
  {
    id: 'CHAT-002',
    customerName: 'John Mwamba',
    customerPhone: '+255 754 987 654',
    clientValue: 'customer',
    urgencyLevel: 'waiting',
    channel: 'facebook',
    lastMessage: 'Where is my delivery? Order #ORD-3012',
    lastMessageTime: '2026-04-18T14:15:00',
    unreadCount: 1,
    assignedAgent: 'Hassan Mohammed',
    activeHandler: 'Hassan Mohammed',
    isHandlerActive: false,
    department: 'sales',
    orderStatus: 'shipping',
    responseStatus: 'waiting_team',
    followUpTime: '2026-04-18T16:00:00',
    orderId: 'ORD-3012',
    quoteId: 'Q-1020',
    messages: [
      {
        id: 'MSG-005',
        text: 'Hi, I paid yesterday. When will my order ship?',
        sender: 'customer',
        timestamp: '2026-04-18T14:10:00',
        status: 'read'
      },
      {
        id: 'MSG-006',
        text: 'Hello John! Your order ORD-2045 is currently in transit. Expected delivery: April 22.',
        sender: 'agent',
        timestamp: '2026-04-18T14:11:00',
        status: 'read'
      },
      {
        id: 'MSG-006B',
        text: 'Payment verified. Procurement confirmed shipment departed from warehouse on April 17.',
        sender: 'internal',
        author: 'Hassan Mohammed',
        timestamp: '2026-04-18T14:12:00'
      },
      {
        id: 'MSG-007',
        text: 'Where is my delivery? Order #ORD-2045',
        sender: 'customer',
        timestamp: '2026-04-18T14:15:00',
        status: 'delivered'
      }
    ]
  },
  {
    id: 'CHAT-003',
    customerName: 'Grace Kimaro',
    customerPhone: '+255 765 432 109',
    clientValue: 'curious',
    urgencyLevel: 'urgent',
    channel: 'tiktok',
    lastMessage: 'I\'m interested in ordering beauty products',
    lastMessageTime: '2026-04-18T13:45:00',
    unreadCount: 3,
    assignedAgent: 'Ahmed Salim',
    department: 'sales',
    orderStatus: 'new_inquiry',
    responseStatus: 'urgent',
    quoteId: 'Q-1026',
    messages: [
      {
        id: 'MSG-008',
        text: 'Hi! I saw your TikTok video about beauty product imports. Can you help me?',
        sender: 'customer',
        timestamp: '2026-04-18T13:40:00',
        status: 'read'
      },
      {
        id: 'MSG-009',
        text: 'Hello Grace! Absolutely! What products are you looking for?',
        sender: 'agent',
        timestamp: '2026-04-18T13:42:00',
        status: 'read'
      },
      {
        id: 'MSG-010',
        text: 'I\'m interested in ordering beauty products',
        sender: 'customer',
        timestamp: '2026-04-18T13:45:00',
        status: 'delivered'
      }
    ]
  },
  {
    id: 'CHAT-004',
    customerName: 'David Lyimo',
    customerPhone: '+255 713 567 890',
    clientValue: 'high_value',
    urgencyLevel: 'active',
    channel: 'whatsapp',
    lastMessage: 'Payment completed! Thank you',
    lastMessageTime: '2026-04-18T13:20:00',
    unreadCount: 0,
    assignedAgent: 'Sarah Mtui',
    department: 'sales',
    orderStatus: 'paid',
    responseStatus: 'waiting_team',
    orderId: 'ORD-2041',
    quoteId: 'Q-1019',
    messages: [
      {
        id: 'MSG-011A',
        text: 'Converted to Order',
        sender: 'system',
        timestamp: '2026-04-18T13:19:00'
      },
      {
        id: 'MSG-011',
        text: 'Payment completed! Thank you',
        sender: 'customer',
        timestamp: '2026-04-18T13:20:00',
        status: 'read'
      }
    ]
  },
  {
    id: 'CHAT-005',
    customerName: 'Amina Juma',
    customerPhone: '+255 789 012 345',
    clientValue: 'customer',
    urgencyLevel: 'urgent',
    channel: 'web',
    lastMessage: 'Can I get a discount for bulk orders?',
    lastMessageTime: '2026-04-18T12:50:00',
    unreadCount: 1,
    assignedAgent: 'Emmanuel Mollel',
    department: 'sales',
    orderStatus: 'awaiting_payment',
    responseStatus: 'new',
    clientActionState: 'quote_expired',
    orderId: 'ORD-2043',
    quoteId: 'Q-1021',
    messages: [
      {
        id: 'MSG-012',
        text: 'Can I get a discount for bulk orders?',
        sender: 'customer',
        timestamp: '2026-04-18T12:50:00',
        status: 'delivered'
      }
    ]
  }
];

const teamMembers = [
  { name: 'Sarah Mtui', department: 'sales', status: 'online' },
  { name: 'Ahmed Salim', department: 'sales', status: 'online' },
  { name: 'Hassan Mohammed', department: 'sales', status: 'busy' },
  { name: 'Emmanuel Mollel', department: 'sales', status: 'online' },
  { name: 'Peter Kimani', department: 'sales', status: 'offline' },
];

const quickReplies = [
  'Let me prepare a quote for you',
  'Please confirm the quantity',
  'Payment instructions will follow',
  'Your order is being processed',
  'I\'ll check with our procurement team',
  'Expected delivery time is 3-5 days'
];

export function ChatSupport() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(mockConversations[0]);
  const [messageInput, setMessageInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [currentUser] = useState('Sarah Mtui');

  const getChannelIcon = (channel: Conversation['channel']) => {
    const icons = {
      whatsapp: '💬',
      facebook: '📘',
      tiktok: '🎵',
      web: '🌐'
    };
    return icons[channel];
  };

  const getChannelColor = (channel: Conversation['channel']) => {
    const colors = {
      whatsapp: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      facebook: 'bg-blue-50 text-blue-700 border border-blue-200',
      tiktok: 'bg-pink-50 text-pink-700 border border-pink-200',
      web: 'bg-violet-50 text-violet-700 border border-violet-200'
    };
    return colors[channel];
  };

  const getStatusConfig = (status: OrderStatus) => {
    const configs = {
      new_inquiry: {
        label: 'New Inquiry',
        color: 'bg-slate-100 text-slate-700 border border-slate-300',
        icon: AlertCircle
      },
      quoted: {
        label: 'Quoted',
        color: 'bg-blue-100 text-blue-700 border border-blue-300',
        icon: FileText
      },
      awaiting_payment: {
        label: 'Awaiting Payment',
        color: 'bg-amber-100 text-amber-700 border border-amber-300',
        icon: DollarSign
      },
      paid: {
        label: 'Paid',
        color: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
        icon: CheckCircle
      },
      shipping: {
        label: 'Shipping',
        color: 'bg-indigo-100 text-indigo-700 border border-indigo-300',
        icon: Package
      },
      delivered: {
        label: 'Delivered',
        color: 'bg-green-100 text-green-700 border border-green-300',
        icon: CheckCircle
      }
    };
    return configs[status];
  };

  const filteredConversations = mockConversations.filter(conv => {
    const matchesSearch = conv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         conv.customerPhone.includes(searchTerm);
    const matchesChannel = channelFilter === 'all' || conv.channel === channelFilter;
    return matchesSearch && matchesChannel;
  });

  const handleSendMessage = () => {
    if (messageInput.trim() && selectedConversation) {
      if (isInternalNote) {
        console.log('Adding internal note:', messageInput);
      } else {
        console.log('Sending message:', messageInput);
      }
      setMessageInput('');
    }
  };

  const getContextActions = (status: OrderStatus) => {
    switch (status) {
      case 'new_inquiry':
        return [
          { label: 'Create Quote', icon: FileText, variant: 'primary' as const },
          { label: 'Convert to Quotation', icon: TrendingUp, variant: 'secondary' as const }
        ];
      case 'quoted':
        return [
          { label: 'Update Quote', icon: Edit3, variant: 'primary' as const },
          { label: 'Resend Quote', icon: Send, variant: 'secondary' as const }
        ];
      case 'awaiting_payment':
        return [
          { label: 'Mark as Paid', icon: CheckCircle, variant: 'primary' as const },
          { label: 'Send Payment Reminder', icon: AlertCircle, variant: 'secondary' as const }
        ];
      case 'paid':
        return [
          { label: 'Move to Shipping', icon: Package, variant: 'primary' as const },
          { label: 'View Order Details', icon: FileText, variant: 'secondary' as const }
        ];
      case 'shipping':
        return [
          { label: 'Mark as Delivered', icon: CheckCircle, variant: 'primary' as const },
          { label: 'Update Tracking', icon: Package, variant: 'secondary' as const }
        ];
      case 'delivered':
        return [
          { label: 'Archive Conversation', icon: Check, variant: 'secondary' as const }
        ];
    }
  };

  const getLifecycleSteps = () => {
    return [
      { key: 'new_inquiry', label: 'New Inquiry' },
      { key: 'quoted', label: 'Quoted' },
      { key: 'awaiting_payment', label: 'Awaiting Payment' },
      { key: 'paid', label: 'Paid' },
      { key: 'shipping', label: 'Shipping' },
      { key: 'delivered', label: 'Delivered' }
    ];
  };

  const getCurrentStepIndex = (status: OrderStatus) => {
    const steps = getLifecycleSteps();
    return steps.findIndex(step => step.key === status);
  };

  const getResponseStatusConfig = (status: ResponseStatus) => {
    const configs = {
      waiting_client: {
        label: 'Waiting for Client',
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        icon: Clock
      },
      waiting_team: {
        label: 'Waiting for Team',
        color: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: AlertCircle
      },
      urgent: {
        label: 'Urgent',
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: Zap
      },
      new: {
        label: 'New',
        color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        icon: AlertCircle
      }
    };
    return configs[status];
  };

  const getClientActionConfig = (state?: ClientActionState) => {
    if (!state) return null;
    const configs = {
      quote_sent: {
        label: 'Quote Sent',
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        icon: Send
      },
      quote_viewed: {
        label: 'Quote Viewed',
        color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        icon: Eye
      },
      awaiting_response: {
        label: 'Awaiting Response',
        color: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: Clock
      },
      quote_expired: {
        label: 'Quote Expired',
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: AlertCircle
      }
    };
    return configs[state];
  };

  const handleTakeOver = () => {
    console.log('Taking over conversation');
  };

  const handleRelease = () => {
    console.log('Releasing conversation');
  };

  const handleSetFollowUp = (duration: string) => {
    console.log('Setting follow-up:', duration);
    setShowFollowUpModal(false);
  };

  const handleEscalate = (to: string) => {
    console.log('Escalating to:', to);
    setShowEscalateModal(false);
  };

  const insertQuickReply = (reply: string) => {
    setMessageInput(reply);
  };

  const getClientValueConfig = (value: ClientValue) => {
    const configs = {
      curious: {
        label: 'Curious Client',
        color: 'bg-purple-100 text-purple-700 border-purple-200',
        textColor: 'text-purple-700'
      },
      customer: {
        label: 'Customer',
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        textColor: 'text-blue-700'
      },
      repeating: {
        label: 'Repeating Customer',
        color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        textColor: 'text-emerald-700'
      },
      high_value: {
        label: 'High Value Client',
        color: 'bg-amber-100 text-amber-700 border-amber-200',
        textColor: 'text-amber-700'
      }
    };
    return configs[value];
  };

  const getUrgencyConfig = (level: UrgencyLevel) => {
    const configs = {
      urgent: {
        label: 'Urgent',
        color: 'bg-red-500',
        dotColor: 'bg-red-500',
        icon: '🔴'
      },
      waiting: {
        label: 'Waiting',
        color: 'bg-amber-500',
        dotColor: 'bg-amber-500',
        icon: '🟡'
      },
      active: {
        label: 'Active',
        color: 'bg-emerald-500',
        dotColor: 'bg-emerald-500',
        icon: '🟢'
      }
    };
    return configs[level];
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-slate-900">Transaction Chat</h1>
        <p className="text-slate-600 mt-1 text-sm">Multi-channel customer conversations with order management</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Conversations Sidebar */}
        <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
          {/* Search & Filters */}
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50"
              />
            </div>

            {/* Channel Filter Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              <button
                onClick={() => setChannelFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs transition-all whitespace-nowrap ${
                  channelFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setChannelFilter('whatsapp')}
                className={`px-3 py-1.5 rounded-md text-xs transition-all whitespace-nowrap ${
                  channelFilter === 'whatsapp'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                💬 WhatsApp
              </button>
              <button
                onClick={() => setChannelFilter('facebook')}
                className={`px-3 py-1.5 rounded-md text-xs transition-all whitespace-nowrap ${
                  channelFilter === 'facebook'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                📘 Facebook
              </button>
              <button
                onClick={() => setChannelFilter('tiktok')}
                className={`px-3 py-1.5 rounded-md text-xs transition-all whitespace-nowrap ${
                  channelFilter === 'tiktok'
                    ? 'bg-pink-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                🎵 TikTok
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map((conv) => {
              const statusConfig = getStatusConfig(conv.orderStatus);
              const StatusIcon = statusConfig.icon;
              const urgencyConfig = getUrgencyConfig(conv.urgencyLevel);
              const valueConfig = getClientValueConfig(conv.clientValue);

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full p-3 pl-0 border-b border-slate-100 hover:bg-slate-50 transition-all text-left relative ${
                    selectedConversation?.id === conv.id
                      ? 'bg-slate-100'
                      : ''
                  }`}
                >
                  {/* Urgency Color Strip */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${urgencyConfig.color}`} />

                  <div className="flex items-start gap-3 pl-4">
                    <div className="size-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                      <span className="text-xs">{conv.customerName.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Client Name + Value Badge + Urgency */}
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm text-slate-900 truncate">{conv.customerName}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${valueConfig.color} flex-shrink-0`}>
                          {valueConfig.label}
                        </span>
                        <span className="text-xs flex-shrink-0">{urgencyConfig.icon}</span>
                        {conv.unreadCount > 0 && (
                          <span className="bg-slate-900 text-white text-xs rounded-full size-5 flex items-center justify-center flex-shrink-0 ml-auto">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>

                      {/* Order/Quote ID - Primary Identifier */}
                      <div className="mb-1.5">
                        {conv.orderId && (
                          <span className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {conv.orderId}
                          </span>
                        )}
                        {conv.quoteId && !conv.orderId && (
                          <span className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {conv.quoteId}
                          </span>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md ${getChannelColor(conv.channel)}`}>
                          {getChannelIcon(conv.channel)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${statusConfig.color}`}>
                          <StatusIcon className="size-3" />
                          {statusConfig.label}
                        </span>
                      </div>

                      {/* Last Message */}
                      <p className="text-xs text-slate-600 truncate mb-1">{conv.lastMessage}</p>

                      {/* Time + Follow-up */}
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>{new Date(conv.lastMessageTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {conv.followUpTime && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <Bell className="size-3" />
                            <span>Follow-up due</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat Area */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-white">
            {/* Context Bar */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 border-b border-slate-700">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="size-12 bg-white/10 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0 relative">
                    <span className="text-lg">{selectedConversation.customerName.charAt(0)}</span>
                    {/* Urgency Indicator on Avatar */}
                    <div className={`absolute -top-1 -right-1 size-3 rounded-full ${getUrgencyConfig(selectedConversation.urgencyLevel).dotColor} ring-2 ring-slate-900`} />
                  </div>
                  <div className="flex-1">
                    {/* Combined Client Status Block */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-white">{selectedConversation.customerName}</h2>
                        {(() => {
                          const valueConfig = getClientValueConfig(selectedConversation.clientValue);
                          return (
                            <span className={`text-xs px-2 py-0.5 rounded border ${valueConfig.color}`}>
                              {valueConfig.label}
                            </span>
                          );
                        })()}
                        {(() => {
                          const urgencyConfig = getUrgencyConfig(selectedConversation.urgencyLevel);
                          return (
                            <span className="text-xs bg-white/10 px-2 py-0.5 rounded inline-flex items-center gap-1">
                              <span>{urgencyConfig.icon}</span>
                              <span className="text-white">{urgencyConfig.label}</span>
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Phone className="size-3.5" />
                          <span className="font-mono">{selectedConversation.customerPhone}</span>
                        </div>

                        <span className={`px-2 py-0.5 rounded ${getChannelColor(selectedConversation.channel)}`}>
                          {getChannelIcon(selectedConversation.channel)} {selectedConversation.channel}
                        </span>

                        {selectedConversation.orderId && (
                          <div className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded">
                            <Package className="size-3.5" />
                            <span className="font-mono text-white">{selectedConversation.orderId}</span>
                          </div>
                        )}

                        {selectedConversation.quoteId && (
                          <div className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded">
                            <FileText className="size-3.5" />
                            <span className="font-mono text-white">{selectedConversation.quoteId}</span>
                          </div>
                        )}

                        {(() => {
                          const statusConfig = getStatusConfig(selectedConversation.orderStatus);
                          const StatusIcon = statusConfig.icon;
                          return (
                            <span className={`px-2 py-0.5 rounded border inline-flex items-center gap-1 ${statusConfig.color}`}>
                              <StatusIcon className="size-3.5" />
                              {statusConfig.label}
                            </span>
                          );
                        })()}

                        {(() => {
                          const clientActionConfig = getClientActionConfig(selectedConversation.clientActionState);
                          if (!clientActionConfig) return null;
                          const ClientActionIcon = clientActionConfig.icon;
                          return (
                            <span className={`px-2 py-0.5 rounded border inline-flex items-center gap-1 ${clientActionConfig.color}`}>
                              <ClientActionIcon className="size-3.5" />
                              {clientActionConfig.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <Phone className="size-4 text-white" />
                  </button>
                  <button
                    onClick={() => setShowMergeModal(true)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    title="Link to existing client"
                  >
                    <Link2 className="size-4 text-white" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <MoreVertical className="size-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Ownership Control */}
              <div className="bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {selectedConversation.isHandlerActive ? (
                      <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                    ) : (
                      <div className="size-2 rounded-full bg-slate-500" />
                    )}
                    <span className="text-xs text-slate-300">
                      Handled by: <span className="text-white">{selectedConversation.activeHandler || 'Unassigned'}</span>
                      {selectedConversation.isHandlerActive && (
                        <span className="ml-1 text-emerald-400">(Active)</span>
                      )}
                    </span>
                  </div>
                  {selectedConversation.followUpTime && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/20 px-2 py-1 rounded">
                      <Bell className="size-3" />
                      <span>Follow-up: {new Date(selectedConversation.followUpTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedConversation.activeHandler === currentUser ? (
                    <button
                      onClick={handleRelease}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-all inline-flex items-center gap-1.5"
                    >
                      <LogOut className="size-3" />
                      Release
                    </button>
                  ) : (
                    <button
                      onClick={handleTakeOver}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-all inline-flex items-center gap-1.5"
                    >
                      <UserCheck className="size-3" />
                      Take Over
                    </button>
                  )}
                  <button
                    onClick={() => setShowFollowUpModal(true)}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-all inline-flex items-center gap-1.5"
                  >
                    <Timer className="size-3" />
                    Set Follow-Up
                  </button>
                  <button
                    onClick={() => setShowEscalateModal(true)}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-all inline-flex items-center gap-1.5"
                  >
                    <ArrowUpCircle className="size-3" />
                    Escalate
                  </button>
                </div>
              </div>

              {/* Lifecycle Progression Bar */}
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3">
                <div className="flex items-center justify-between">
                  {getLifecycleSteps().map((step, index) => {
                    const currentIndex = getCurrentStepIndex(selectedConversation.orderStatus);
                    const isActive = index === currentIndex;
                    const isCompleted = index < currentIndex;
                    const isLast = index === getLifecycleSteps().length - 1;

                    return (
                      <div key={step.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center">
                          <div className={`size-8 rounded-full flex items-center justify-center text-xs transition-all ${
                            isActive
                              ? 'bg-white text-slate-900'
                              : isCompleted
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white/10 text-slate-400'
                          }`}>
                            {isCompleted ? <Check className="size-4" /> : index + 1}
                          </div>
                          <span className={`text-xs mt-1.5 whitespace-nowrap ${
                            isActive ? 'text-white' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                        {!isLast && (
                          <div className={`flex-1 h-0.5 mx-2 mb-6 transition-all ${
                            isCompleted ? 'bg-emerald-500' : 'bg-white/10'
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Dynamic Action Panel */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getContextActions(selectedConversation.orderStatus).map((action, index) => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={index}
                        className={`px-3 py-1.5 rounded-md text-xs transition-all inline-flex items-center gap-1.5 ${
                          action.variant === 'primary'
                            ? 'bg-slate-900 hover:bg-slate-800 text-white'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <ActionIcon className="size-3.5" />
                        {action.label}
                      </button>
                    );
                  })}
                  <button className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs transition-all inline-flex items-center gap-1.5">
                    <Paperclip className="size-3.5" />
                    Attach Files
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <User className="size-4" />
                    <span>Assigned: <span className="text-slate-900">{selectedConversation.assignedAgent}</span></span>
                  </div>
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs transition-all inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="size-3.5" />
                    Reassign
                  </button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <div className="space-y-4 max-w-4xl mx-auto">
                {selectedConversation.messages.map((message) => (
                  <div key={message.id}>
                    {message.sender === 'system' ? (
                      <div className="flex justify-center my-4">
                        <div className="bg-slate-200 text-slate-700 px-4 py-2 rounded-full text-xs inline-flex items-center gap-2">
                          <CheckCircle className="size-3.5 text-emerald-600" />
                          <span>{message.text}</span>
                        </div>
                      </div>
                    ) : message.sender === 'internal' ? (
                      <div className="flex justify-start my-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-w-lg">
                          <div className="flex items-center gap-2 mb-1.5">
                            <StickyNote className="size-3.5 text-amber-600" />
                            <span className="text-xs text-amber-700">Internal Note</span>
                            <span className="text-xs text-amber-600">• Not visible to client</span>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed mb-2">{message.text}</p>
                          <div className="flex items-center gap-2 text-xs text-amber-600">
                            <span>{message.author}</span>
                            <span>•</span>
                            <Clock className="size-3" />
                            <span>{new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    ) : message.quotation ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="size-5 text-blue-600" />
                                <h3 className="text-slate-900">Quotation</h3>
                              </div>
                              <p className="text-sm text-slate-500">Quote ID: <span className="font-mono text-slate-700">{message.quotation.quoteId}</span></p>
                            </div>
                            <span className={`text-xs px-2.5 py-1 rounded-md ${
                              message.quotation.status === 'sent'
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {message.quotation.status}
                            </span>
                          </div>

                          {message.quotation.items.map((item, idx) => (
                            <div key={idx} className="mb-4 pb-4 border-b border-slate-100 last:border-0 last:mb-0 last:pb-0">
                              <p className="text-slate-900 mb-3">{item.productName}</p>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Quantity:</span>
                                  <span className="text-slate-900">{item.quantity} units</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Unit Price:</span>
                                  <span className="text-slate-900 font-mono">TSh {item.unitPrice.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Product Total:</span>
                                  <span className="text-slate-900 font-mono">TSh {(item.quantity * item.unitPrice).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Shipping:</span>
                                  <span className="text-slate-900 font-mono">TSh {item.shippingCost.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}

                          <div className="bg-slate-50 rounded-lg p-4 mt-4">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-900">Total Cost</span>
                              <span className="text-slate-900 font-mono">TSh {message.quotation.totalCost.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                              Valid until: {new Date(message.quotation.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>

                          {/* Action Buttons Inside Card */}
                          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                            <button className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm transition-all inline-flex items-center justify-center gap-1.5">
                              <CheckCircle className="size-4" />
                              Accept Quote
                            </button>
                            <button className="flex-1 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm transition-all inline-flex items-center justify-center gap-1.5">
                              <Edit3 className="size-4" />
                              Request Changes
                            </button>
                          </div>

                          <div className="flex items-center gap-1 mt-4 text-xs text-slate-400">
                            <Clock className="size-3" />
                            <span>{new Date(message.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</span>
                          </div>
                        </div>
                    ) : (
                      <div className={`flex ${message.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-lg ${
                          message.sender === 'agent'
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-900 border border-slate-200'
                        } rounded-xl px-4 py-3 shadow-sm`}>
                          <p className="text-sm leading-relaxed">{message.text}</p>
                          <div className={`flex items-center gap-1 mt-2 text-xs ${
                            message.sender === 'agent' ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            <Clock className="size-3" />
                            <span>{new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            {message.sender === 'agent' && message.status === 'read' && (
                              <Check className="size-3 ml-1" />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Replies */}
            <div className="bg-white border-t border-slate-200 px-4 py-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
                  <Zap className="size-3" />
                  Quick:
                </span>
                {quickReplies.map((reply, index) => (
                  <button
                    key={index}
                    onClick={() => insertQuickReply(reply)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs transition-all whitespace-nowrap inline-flex items-center gap-1"
                  >
                    <MousePointerClick className="size-3" />
                    {reply}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-slate-200 p-4">
              {isInternalNote && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <StickyNote className="size-4" />
                    <span>Composing internal note (not visible to client)</span>
                  </div>
                  <button
                    onClick={() => setIsInternalNote(false)}
                    className="text-xs text-amber-600 hover:text-amber-800 transition-colors"
                  >
                    Switch to client message
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                  <Paperclip className="size-5 text-slate-600" />
                </button>
                <button
                  onClick={() => setIsInternalNote(!isInternalNote)}
                  className={`p-2 rounded-lg transition-colors ${
                    isInternalNote ? 'bg-amber-100 text-amber-700' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                  title="Toggle internal note"
                >
                  <StickyNote className="size-5" />
                </button>
                <input
                  type="text"
                  placeholder={isInternalNote ? "Add internal note (staff only)..." : "Type your message..."}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                />
                <button
                  onClick={handleSendMessage}
                  className={`p-2.5 rounded-lg transition-colors ${
                    isInternalNote
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  <Send className="size-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <MessageSquare className="size-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-slate-900 mb-2">No Conversation Selected</h3>
              <p className="text-slate-600 text-sm">Select a conversation from the left to start</p>
            </div>
          </div>
        )}
      </div>

      {/* Follow-Up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">Set Follow-Up Reminder</h2>
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="size-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-2">
              <button
                onClick={() => handleSetFollowUp('1 hour')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Timer className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">In 1 hour</span>
                </div>
              </button>
              <button
                onClick={() => handleSetFollowUp('3 hours')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Timer className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">In 3 hours</span>
                </div>
              </button>
              <button
                onClick={() => handleSetFollowUp('tomorrow')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Timer className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">Tomorrow</span>
                </div>
              </button>
              <button
                onClick={() => handleSetFollowUp('custom')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Clock className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">Custom time...</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">Escalate Conversation</h2>
              <button
                onClick={() => setShowEscalateModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="size-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-2">
              <button
                onClick={() => handleEscalate('Manager')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <ArrowUpCircle className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">To Manager</span>
                </div>
              </button>
              <button
                onClick={() => handleEscalate('Procurement')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Package className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">To Procurement</span>
                </div>
              </button>
              <button
                onClick={() => handleEscalate('Finance')}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <DollarSign className="size-5 text-slate-600" />
                  <span className="text-sm text-slate-900">To Finance</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge/Link Modal */}
      {showMergeModal && selectedConversation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">Link to Existing Client</h2>
              <button
                onClick={() => setShowMergeModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="size-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Search for an existing client to merge this conversation with:
              </p>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50"
                />
              </div>
              <div className="space-y-2">
                {mockConversations.filter(c => c.id !== selectedConversation.id).slice(0, 3).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      console.log('Merging with:', conv.customerName);
                      setShowMergeModal(false);
                    }}
                    className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-white">
                        <span className="text-sm">{conv.customerName.charAt(0)}</span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-slate-900">{conv.customerName}</p>
                        <p className="text-xs text-slate-600 font-mono">{conv.customerPhone}</p>
                      </div>
                    </div>
                    <Link2 className="size-4 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedConversation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">Reassign Conversation</h2>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="size-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Currently assigned to: <span className="text-slate-900">{selectedConversation.assignedAgent}</span>
              </p>

              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <button
                    key={member.name}
                    onClick={() => {
                      console.log('Assigning to:', member.name);
                      setShowAssignModal(false);
                    }}
                    className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-white">
                        <span className="text-sm">{member.name.charAt(0)}</span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-600 capitalize">{member.department}</p>
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-md text-xs ${
                      member.status === 'online' ? 'bg-emerald-100 text-emerald-700' :
                      member.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {member.status}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
