import { X, Send, Users, Tag as TagIcon, TrendingUp, Calendar } from 'lucide-react';
import { useState } from 'react';
import type { UserTag, UserCategory } from './UserDetailModal';

interface CampaignTargetingModalProps {
  onClose: () => void;
  availableTags: string[];
  availableCategories: string[];
}

export function CampaignTargetingModal({
  onClose,
  availableTags,
  availableCategories
}: CampaignTargetingModalProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [minOrders, setMinOrders] = useState<number>(0);
  const [campaignName, setCampaignName] = useState('');

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const estimatedReach = Math.floor(Math.random() * 500) + 50; // Mock calculation

  const handleSendCampaign = () => {
    // Mock campaign send functionality
    alert(`Campaign "${campaignName}" would be sent to approximately ${estimatedReach} users`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Send className="size-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Campaign Targeting</h2>
              <p className="text-sm text-gray-600">Select audience segments for your campaign</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Campaign Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Campaign Name
            </label>
            <input
              type="text"
              placeholder="e.g., Summer Electronics Sale"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tags Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TagIcon className="size-5 text-gray-700" />
              <h3 className="font-bold text-gray-900">Target by Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTags.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No tags available</p>
              ) : (
                availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Categories Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="size-5 text-gray-700" />
              <h3 className="font-bold text-gray-900">Target by Interests</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableCategories.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No categories available</p>
              ) : (
                availableCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategories.includes(category)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    {category}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Activity Filter */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="size-5 text-gray-700" />
              <h3 className="font-bold text-gray-900">Activity Level</h3>
            </div>
            <div className="flex gap-2">
              {(['all', 'active', 'inactive'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setActivityFilter(option)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activityFilter === option
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option === 'all' ? 'All Users' : option === 'active' ? 'Active (30 days)' : 'Inactive (30+ days)'}
                </button>
              ))}
            </div>
          </div>

          {/* Minimum Orders */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Minimum Orders
            </label>
            <input
              type="number"
              min="0"
              value={minOrders}
              onChange={(e) => setMinOrders(parseInt(e.target.value) || 0)}
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Estimated Reach */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Users className="size-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Estimated Reach</p>
                <p className="text-2xl font-bold text-gray-900">{estimatedReach} users</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSendCampaign}
            disabled={!campaignName.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="size-4" />
            Send Campaign
          </button>
        </div>
      </div>
    </div>
  );
}
