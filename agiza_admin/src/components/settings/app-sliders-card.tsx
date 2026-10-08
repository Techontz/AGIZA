"use client";

import { ImageIcon } from "lucide-react";

import { SlidersSection } from "@/components/ecommerce/sliders-section";
import { Card } from "@/components/ui/card";

/** Home banners of the app and website (managed with Settings or E-commerce permissions). */
export function AppSlidersCard({ canView, canEdit }: { canView: boolean; canEdit: boolean }) {
  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-fuchsia-100 p-2 rounded-lg">
          <ImageIcon className="size-6 text-fuchsia-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Home Banners (app &amp; website)</h2>
          <p className="text-sm text-gray-600">Banners at the top of the AGIZA customer app&apos;s and website&apos;s home page</p>
        </div>
      </div>

      {canView ? (
        <SlidersSection canEdit={canEdit} />
      ) : (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          Your role doesn&apos;t include access to the app sliders.
        </p>
      )}
    </Card>
  );
}
