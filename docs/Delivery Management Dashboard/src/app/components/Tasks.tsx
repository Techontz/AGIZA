import { useState } from 'react';
import { 
  Clock, 
  User, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  X,
  ExternalLink,
  Edit2,
  MessageSquare,
  CheckSquare
} from 'lucide-react';

interface Task {
  taskId: string;
  taskType: 'generate-quote' | 'verify-payment' | 'assign-cargo' | 'follow-up-client' | 'customs-clearance' | 'arrange-delivery' | 'quality-check' | 'pricing-approval';
  linkedItem: {
    id: string;
    type: 'international-order' | 'express-delivery' | 'ecommerce-order' | 'service-order' | 'quote';
  };
  status: 'waiting-for-client' | 'waiting-for-payment' | 'in-progress' | 'blocked' | 'review-required';
  owner: string | null;
  ownerRole?: string;
  department: 'unassigned' | 'procurement' | 'shipping' | 'delivery' | 'finance' | 'support' | 'warehouse';
  slaDeadline: string;
  description: string;
  notes?: string[];
  createdAt: string;
  priority?: 'high' | 'medium' | 'low';
}

const mockTasks: Task[] = [
  {
    taskId: 'TSK-001',
    taskType: 'verify-payment',
    linkedItem: { id: 'INT-001', type: 'international-order' },
    status: 'in-progress',
    owner: 'Sarah Mtui',
    ownerRole: 'Finance',
    department: 'finance',
    slaDeadline: '2026-01-17T18:00:00',
    description: 'Verify partial payment of TSh 1,000,000 for Fatuma Hassan order',
    createdAt: '2026-01-17T08:00:00',
    priority: 'high',
    notes: ['Customer sent payment receipt', 'Awaiting bank confirmation']
  },
  {
    taskId: 'TSK-002',
    taskType: 'follow-up-client',
    linkedItem: { id: 'INT-006', type: 'international-order' },
    status: 'waiting-for-client',
    owner: 'Ahmed Salim',
    ownerRole: 'Sales',
    department: 'support',
    slaDeadline: '2026-01-16T12:00:00',
    description: 'Follow up on unpaid order - Construction Materials for David Lyimo',
    createdAt: '2026-01-15T10:00:00',
    priority: 'high',
    notes: ['Client requested payment extension', 'Waiting for response since yesterday']
  },
  {
    taskId: 'TSK-003',
    taskType: 'generate-quote',
    linkedItem: { id: 'QTE-005', type: 'quote' },
    status: 'in-progress',
    owner: null,
    department: 'procurement',
    slaDeadline: '2026-01-17T20:00:00',
    description: 'Generate custom quote for bulk electronics import from China',
    createdAt: '2026-01-17T10:30:00',
    priority: 'medium'
  },
  {
    taskId: 'TSK-004',
    taskType: 'customs-clearance',
    linkedItem: { id: 'INT-003', type: 'international-order' },
    status: 'blocked',
    owner: 'Emmanuel Mollel',
    ownerRole: 'Logistics',
    department: 'shipping',
    slaDeadline: '2026-01-17T16:00:00',
    description: 'Complete customs documentation for Grace Kimaro refrigerators',
    createdAt: '2026-01-16T14:00:00',
    priority: 'high',
    notes: ['Missing import permit', 'Customer contacted for documents']
  },
  {
    taskId: 'TSK-005',
    taskType: 'arrange-delivery',
    linkedItem: { id: 'DEL-003', type: 'express-delivery' },
    status: 'in-progress',
    owner: 'Hassan Mohammed',
    ownerRole: 'Delivery',
    department: 'delivery',
    slaDeadline: '2026-01-17T14:00:00',
    description: 'Schedule delivery for Mwanza express package',
    createdAt: '2026-01-17T07:00:00',
    priority: 'high'
  },
  {
    taskId: 'TSK-006',
    taskType: 'pricing-approval',
    linkedItem: { id: 'INT-008', type: 'international-order' },
    status: 'review-required',
    owner: null,
    department: 'procurement',
    slaDeadline: '2026-01-17T15:00:00',
    description: 'Approve special pricing for medical equipment order',
    createdAt: '2026-01-17T09:00:00',
    priority: 'high',
    notes: ['Customer requested 15% discount', 'Requires manager approval']
  },
  {
    taskId: 'TSK-007',
    taskType: 'quality-check',
    linkedItem: { id: 'INT-001', type: 'international-order' },
    status: 'waiting-for-payment',
    owner: 'Peter Kimani',
    ownerRole: 'Warehouse',
    department: 'warehouse',
    slaDeadline: '2026-01-18T10:00:00',
    description: 'Quality inspection for smartphones before shipping',
    createdAt: '2026-01-16T16:00:00',
    priority: 'medium',
    notes: ['Waiting for full payment before inspection']
  },
  {
    taskId: 'TSK-008',
    taskType: 'assign-cargo',
    linkedItem: { id: 'INT-005', type: 'international-order' },
    status: 'in-progress',
    owner: 'Sarah Mtui',
    ownerRole: 'Logistics',
    department: 'shipping',
    slaDeadline: '2026-01-17T17:00:00',
    description: 'Assign consolidation warehouse for textile shipment',
    createdAt: '2026-01-17T11:00:00',
    priority: 'medium'
  },
];

export function Tasks() {
  const [activeFilter, setActiveFilter] = useState<'my-tasks' | 'unassigned' | 'overdue' | 'due-today' | 'all'>('my-tasks');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingOwner, setEditingOwner] = useState(false);
  const [newNote, setNewNote] = useState('');

  const getTaskTypeBadge = (type: Task['taskType']) => {
    const styles = {
      'generate-quote': 'bg-blue-100 text-blue-800',
      'verify-payment': 'bg-green-100 text-green-800',
      'assign-cargo': 'bg-purple-100 text-purple-800',
      'follow-up-client': 'bg-orange-100 text-orange-800',
      'customs-clearance': 'bg-red-100 text-red-800',
      'arrange-delivery': 'bg-cyan-100 text-cyan-800',
      'quality-check': 'bg-indigo-100 text-indigo-800',
      'pricing-approval': 'bg-yellow-100 text-yellow-800',
    };

    const labels = {
      'generate-quote': 'Generate Quote',
      'verify-payment': 'Verify Payment',
      'assign-cargo': 'Assign Cargo',
      'follow-up-client': 'Follow Up Client',
      'customs-clearance': 'Customs Clearance',
      'arrange-delivery': 'Arrange Delivery',
      'quality-check': 'Quality Check',
      'pricing-approval': 'Pricing Approval',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[type]}`}>
        {labels[type]}
      </span>
    );
  };

  const getStatusBadge = (status: Task['status']) => {
    const styles = {
      'waiting-for-client': 'bg-yellow-100 text-yellow-800',
      'waiting-for-payment': 'bg-orange-100 text-orange-800',
      'in-progress': 'bg-blue-100 text-blue-800',
      'blocked': 'bg-red-100 text-red-800',
      'review-required': 'bg-purple-100 text-purple-800',
    };

    const labels = {
      'waiting-for-client': 'Waiting for Client',
      'waiting-for-payment': 'Waiting for Payment',
      'in-progress': 'In Progress',
      'blocked': 'Blocked',
      'review-required': 'Review Required',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getDepartmentBadge = (department: Task['department']) => {
    const styles = {
      'unassigned': 'bg-gray-100 text-gray-800',
      'procurement': 'bg-blue-100 text-blue-800',
      'shipping': 'bg-purple-100 text-purple-800',
      'delivery': 'bg-green-100 text-green-800',
      'finance': 'bg-orange-100 text-orange-800',
      'support': 'bg-cyan-100 text-cyan-800',
      'warehouse': 'bg-indigo-100 text-indigo-800',
    };

    const labels = {
      'unassigned': 'Unassigned',
      'procurement': 'Procurement',
      'shipping': 'Shipping',
      'delivery': 'Delivery',
      'finance': 'Finance',
      'support': 'Support',
      'warehouse': 'Warehouse',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[department]}`}>
        {labels[department]}
      </span>
    );
  };

  const getSLAStatus = (deadline: string) => {
    const now = new Date();
    const slaDate = new Date(deadline);
    const diffMs = slaDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let color = 'text-green-600 bg-green-50';
    let icon = <CheckCircle2 className="size-4" />;

    if (diffMs < 0) {
      color = 'text-red-600 bg-red-50';
      icon = <AlertTriangle className="size-4" />;
    } else if (diffHours < 2) {
      color = 'text-red-600 bg-red-50';
      icon = <AlertTriangle className="size-4" />;
    } else if (diffHours < 4) {
      color = 'text-yellow-600 bg-yellow-50';
      icon = <Clock className="size-4" />;
    }

    let timeText = '';
    if (diffMs < 0) {
      const overdueMins = Math.abs(diffMinutes);
      const overdueHours = Math.abs(diffHours);
      if (overdueHours > 24) {
        timeText = `${Math.floor(overdueHours / 24)}d overdue`;
      } else if (overdueHours > 0) {
        timeText = `${overdueHours}h overdue`;
      } else {
        timeText = `${overdueMins}m overdue`;
      }
    } else if (diffHours > 24) {
      timeText = `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      timeText = `${diffHours}h ${diffMinutes}m`;
    } else {
      timeText = `${diffMinutes}m`;
    }

    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${color} font-medium text-sm`}>
        {icon}
        <span>{timeText}</span>
      </div>
    );
  };

  const isOverdue = (deadline: string) => {
    return new Date(deadline) < new Date();
  };

  const isDueToday = (deadline: string) => {
    const today = new Date().toDateString();
    return new Date(deadline).toDateString() === today;
  };

  const filteredTasks = mockTasks.filter(task => {
    const matchesSearch = 
      task.taskId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.linkedItem.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = 
      activeFilter === 'my-tasks' ? task.owner !== null :
      activeFilter === 'unassigned' ? task.owner === null :
      activeFilter === 'overdue' ? isOverdue(task.slaDeadline) :
      activeFilter === 'due-today' ? isDueToday(task.slaDeadline) :
      true;

    return matchesSearch && matchesFilter;
  });

  const stats = {
    myTasks: mockTasks.filter(t => t.owner !== null).length,
    unassigned: mockTasks.filter(t => t.owner === null).length,
    overdue: mockTasks.filter(t => isOverdue(t.slaDeadline)).length,
    dueToday: mockTasks.filter(t => isDueToday(t.slaDeadline)).length,
  };

  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tasks</h1>
          <p className="text-gray-600">Track and manage operational tasks across all orders and deliveries</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Assigned to Me</p>
                <p className="text-3xl font-bold text-blue-600">{stats.myTasks}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <CheckSquare className="size-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Unassigned</p>
                <p className="text-3xl font-bold text-orange-600">{stats.unassigned}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-full">
                <User className="size-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Overdue</p>
                <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="size-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Due Today</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.dueToday}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <Clock className="size-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Task ID, Order ID, or Description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveFilter('my-tasks')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  activeFilter === 'my-tasks'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Assigned to Me ({stats.myTasks})
              </button>
              <button
                onClick={() => setActiveFilter('unassigned')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  activeFilter === 'unassigned'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Unassigned ({stats.unassigned})
              </button>
              <button
                onClick={() => setActiveFilter('overdue')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  activeFilter === 'overdue'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Overdue ({stats.overdue})
              </button>
              <button
                onClick={() => setActiveFilter('due-today')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  activeFilter === 'due-today'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Due Today ({stats.dueToday})
              </button>
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Tasks
              </button>
            </div>
          </div>
        </div>

        {/* Tasks Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Task ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Task Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Linked Item</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Department</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Owner</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">SLA Timer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTasks.map((task) => (
                  <tr 
                    key={task.taskId} 
                    className={`hover:bg-gray-50 transition-colors ${
                      isOverdue(task.slaDeadline) ? 'bg-red-50' : ''
                    } ${!task.owner ? 'bg-orange-50' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{task.taskId}</div>
                      {task.priority === 'high' && (
                        <div className="flex items-center gap-1 text-red-600 text-xs mt-1">
                          <AlertTriangle className="size-3" />
                          <span>High Priority</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">{getTaskTypeBadge(task.taskType)}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-blue-600">{task.linkedItem.id}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {task.linkedItem.type.replace('-', ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(task.status)}</td>
                    <td className="px-6 py-4">
                      {getDepartmentBadge(task.department)}
                    </td>
                    <td className="px-6 py-4">
                      {task.owner ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-gray-400" />
                            <span className="text-gray-900 font-medium">{task.owner}</span>
                          </div>
                          {task.ownerRole && (
                            <div className="text-xs text-gray-500 ml-6">{task.ownerRole}</div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-orange-600 font-medium">
                          <AlertTriangle className="size-4" />
                          <span>Unassigned</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getSLAStatus(task.slaDeadline)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedTask(task)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredTasks.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <CheckSquare className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No tasks found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}

        {/* Task Detail Slide-in Panel */}
        {selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-end">
            <div className="bg-white h-full w-full max-w-2xl shadow-2xl overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedTask.taskId}</h2>
                  <p className="text-sm text-gray-500 mt-1">Created {new Date(selectedTask.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="size-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* SLA Warning Banner */}
                {isOverdue(selectedTask.slaDeadline) && (
                  <div className="bg-red-100 border border-red-300 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-900">This task is overdue!</p>
                      <p className="text-sm text-red-800 mt-1">
                        Deadline was {new Date(selectedTask.slaDeadline).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {/* Unassigned Warning */}
                {!selectedTask.owner && (
                  <div className="bg-orange-100 border border-orange-300 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="size-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-orange-900">Task is unassigned!</p>
                      <p className="text-sm text-orange-800 mt-1">Assign an owner to proceed</p>
                    </div>
                  </div>
                )}

                {/* Task Type & Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Task Type</p>
                    {getTaskTypeBadge(selectedTask.taskType)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Status</p>
                    {getStatusBadge(selectedTask.status)}
                  </div>
                </div>

                {/* Linked Order */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Linked Item</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-lg font-bold text-blue-900">{selectedTask.linkedItem.id}</p>
                      <p className="text-sm text-blue-700 capitalize">
                        {selectedTask.linkedItem.type.replace('-', ' ')}
                      </p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                      <ExternalLink className="size-4" />
                      View Order
                    </button>
                  </div>
                </div>

                {/* SLA Countdown */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">SLA Timer</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Deadline</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {new Date(selectedTask.slaDeadline).toLocaleString()}
                      </p>
                    </div>
                    {getSLAStatus(selectedTask.slaDeadline)}
                  </div>
                </div>

                {/* Assigned Owner */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-700">Assigned Owner</p>
                    <button
                      onClick={() => setEditingOwner(!editingOwner)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                    >
                      <Edit2 className="size-3" />
                      {editingOwner ? 'Cancel' : 'Change'}
                    </button>
                  </div>
                  
                  {editingOwner ? (
                    <div className="space-y-2">
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option>Select Owner...</option>
                        <option>Sarah Mtui</option>
                        <option>Ahmed Salim</option>
                        <option>Emmanuel Mollel</option>
                        <option>Hassan Mohammed</option>
                        <option>Peter Kimani</option>
                      </select>
                      <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                        Save Owner
                      </button>
                    </div>
                  ) : (
                    <div>
                      {selectedTask.owner ? (
                        <div className="flex items-center gap-3">
                          <div className="size-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                            {selectedTask.owner.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{selectedTask.owner}</p>
                            {selectedTask.ownerRole && (
                              <p className="text-sm text-gray-600">{selectedTask.ownerRole}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-orange-600 font-medium">Unassigned - Assign someone to proceed</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Task Description */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Description</p>
                  <p className="text-gray-900">{selectedTask.description}</p>
                </div>

                {/* Notes */}
                {selectedTask.notes && selectedTask.notes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">Internal Notes</p>
                    <div className="space-y-2">
                      {selectedTask.notes.map((note, index) => (
                        <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="size-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-gray-900">{note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Note */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Add Internal Note</p>
                  <div className="space-y-2">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note about this task..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    />
                    <button className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium">
                      Add Note
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                  <button className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    Change Status
                  </button>
                  <button className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2">
                    <CheckCircle2 className="size-5" />
                    Mark as Completed
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