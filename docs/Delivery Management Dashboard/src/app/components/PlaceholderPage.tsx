import { LucideIcon } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export function PlaceholderPage({ title, description, icon: Icon, comingSoon = true }: PlaceholderPageProps) {
  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-16 text-center">
          <div className="bg-gray-100 size-24 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon className="size-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-900 mb-3">{title}</h3>
          <p className="text-gray-600 max-w-lg mx-auto mb-6">{description}</p>
          {comingSoon && (
            <div className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-medium">
              Coming Soon
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
