import { Package } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center max-w-md w-full">
        <Package className="size-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-900 text-lg font-medium">Page not found</p>
        <p className="text-gray-500 text-sm mt-2">The page you are looking for doesn&apos;t exist.</p>
        <Link
          href="/"
          className="mt-6 inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
