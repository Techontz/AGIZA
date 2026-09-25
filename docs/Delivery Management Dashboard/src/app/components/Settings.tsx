import { useState } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, Save, Tag as TagIcon } from 'lucide-react';

interface TagRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  tagToAssign: string;
  enabled: boolean;
}

interface RuleCondition {
  id: string;
  field: 'total_spent' | 'total_orders' | 'inactive_days' | 'category' | 'last_order_days';
  operator: '>' | '<' | '=' | 'includes';
  value: string | number;
}

const mockRules: TagRule[] = [
  {
    id: 'rule-1',
    name: 'VIP Customers',
    conditions: [
      { id: 'cond-1', field: 'total_spent', operator: '>', value: 1000000 }
    ],
    tagToAssign: 'VIP',
    enabled: true
  },
  {
    id: 'rule-2',
    name: 'Electronics Buyers',
    conditions: [
      { id: 'cond-2', field: 'category', operator: 'includes', value: 'electronics' }
    ],
    tagToAssign: 'electronics_buyer',
    enabled: true
  },
  {
    id: 'rule-3',
    name: 'Inactive Users',
    conditions: [
      { id: 'cond-3', field: 'inactive_days', operator: '>', value: 30 }
    ],
    tagToAssign: 'inactive',
    enabled: true
  }
];

export function Settings() {
  const [rules, setRules] = useState<TagRule[]>(mockRules);
  const [editingRule, setEditingRule] = useState<TagRule | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const fieldLabels = {
    'total_spent': 'Total Spent (TSh)',
    'total_orders': 'Total Orders',
    'inactive_days': 'Inactive for (days)',
    'category': 'User Interest Category',
    'last_order_days': 'Days Since Last Order'
  };

  const operatorLabels = {
    '>': 'Greater than',
    '<': 'Less than',
    '=': 'Equals',
    'includes': 'Includes'
  };

  const handleAddRule = () => {
    const newRule: TagRule = {
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      conditions: [
        { id: `cond-${Date.now()}`, field: 'total_orders', operator: '>', value: 0 }
      ],
      tagToAssign: 'new_tag',
      enabled: true
    };
    setEditingRule(newRule);
    setIsCreatingNew(true);
  };

  const handleSaveRule = () => {
    if (!editingRule) return;

    if (isCreatingNew) {
      setRules([...rules, editingRule]);
    } else {
      setRules(rules.map(r => r.id === editingRule.id ? editingRule : r));
    }
    setEditingRule(null);
    setIsCreatingNew(false);
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleToggleRule = (ruleId: string) => {
    setRules(rules.map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
  };

  const addCondition = () => {
    if (!editingRule) return;
    const newCondition: RuleCondition = {
      id: `cond-${Date.now()}`,
      field: 'total_orders',
      operator: '>',
      value: 0
    };
    setEditingRule({
      ...editingRule,
      conditions: [...editingRule.conditions, newCondition]
    });
  };

  const removeCondition = (conditionId: string) => {
    if (!editingRule) return;
    setEditingRule({
      ...editingRule,
      conditions: editingRule.conditions.filter(c => c.id !== conditionId)
    });
  };

  const updateCondition = (conditionId: string, updates: Partial<RuleCondition>) => {
    if (!editingRule) return;
    setEditingRule({
      ...editingRule,
      conditions: editingRule.conditions.map(c =>
        c.id === conditionId ? { ...c, ...updates } : c
      )
    });
  };

  return (
    <div className="p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
            <p className="text-gray-600">Configure tag rules and system settings</p>
          </div>
        </div>

        {/* Tag Rules Engine */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <TagIcon className="size-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Tag Rules Engine</h2>
                <p className="text-sm text-gray-600">Automatically assign tags based on user behavior</p>
              </div>
            </div>
            <button
              onClick={handleAddRule}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <Plus className="size-5" />
              Add Rule
            </button>
          </div>

          {/* Rules List */}
          <div className="space-y-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`border rounded-lg p-4 ${
                  rule.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900">{rule.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rule.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {rule.conditions.map((condition, index) => (
                        <div key={condition.id} className="text-sm text-gray-600">
                          {index > 0 && <span className="font-semibold text-gray-700">AND </span>}
                          <span className="font-medium">{fieldLabels[condition.field]}</span>
                          {' '}
                          <span className="text-gray-500">{operatorLabels[condition.operator]}</span>
                          {' '}
                          <span className="font-semibold text-gray-900">{condition.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <span className="text-sm text-gray-600">→ Assigns tag: </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {rule.tagToAssign}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors font-medium"
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit Rule Modal */}
        {editingRule && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">
                  {isCreatingNew ? 'Create New Rule' : 'Edit Rule'}
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Rule Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={editingRule.name}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Conditions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Conditions
                    </label>
                    <button
                      onClick={addCondition}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Add Condition
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editingRule.conditions.map((condition, index) => (
                      <div key={condition.id} className="flex gap-2 items-start">
                        {index > 0 && (
                          <span className="text-sm font-semibold text-gray-700 pt-2">AND</span>
                        )}
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <select
                            value={condition.field}
                            onChange={(e) => updateCondition(condition.id, { field: e.target.value as any })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            {Object.entries(fieldLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <select
                            value={condition.operator}
                            onChange={(e) => updateCondition(condition.id, { operator: e.target.value as any })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            {Object.entries(operatorLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <input
                            type={condition.field === 'category' ? 'text' : 'number'}
                            value={condition.value}
                            onChange={(e) => updateCondition(condition.id, {
                              value: condition.field === 'category' ? e.target.value : parseInt(e.target.value) || 0
                            })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        {editingRule.conditions.length > 1 && (
                          <button
                            onClick={() => removeCondition(condition.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tag to Assign */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tag to Assign
                  </label>
                  <input
                    type="text"
                    value={editingRule.tagToAssign}
                    onChange={(e) => setEditingRule({ ...editingRule, tagToAssign: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., VIP, high_value, at_risk"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setEditingRule(null);
                    setIsCreatingNew(false);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRule}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Save className="size-4" />
                  Save Rule
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
