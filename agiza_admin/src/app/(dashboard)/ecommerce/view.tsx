"use client";

import { useCallback } from "react";

import { BrandsSection } from "@/components/ecommerce/brands-section";
import { CategoriesSection } from "@/components/ecommerce/categories-section";
import { LabelsSection } from "@/components/ecommerce/labels-section";
import { EcommerceMenu, type Section } from "@/components/ecommerce/menu";
import { OptionsSection } from "@/components/ecommerce/options-section";
import { ProductsSection } from "@/components/ecommerce/products/products-section";
import { SettingsSection } from "@/components/ecommerce/settings-section";
import { SectionHeader } from "@/components/ecommerce/shared";
import { VendorsSection } from "@/components/ecommerce/vendors-section";
import { PageContainer } from "@/components/ui/page";
import { useUrlFilters } from "@/hooks/use-url-filters";

const SECTIONS: Record<Section, { title: string; description: string }> = {
  products: { title: "Products Management", description: "Manage your product catalog with brands and attributes" },
  categories: { title: "Categories", description: "Organize products into categories" },
  settings: { title: "Store Settings", description: "Configure your store preferences" },
  vendors: { title: "Vendors", description: "Manage vendors and their profit settings" },
  options: { title: "Product Options", description: "Global option sets applied to product variations" },
  labels: { title: "Product Labels", description: "Create labels to highlight products in the store" },
  brands: { title: "Brands", description: "Manage product brands displayed on the store" },
};

const isSection = (v: string): v is Section => v in SECTIONS;

export function EcommerceView() {
  const [f, setF] = useUrlFilters({ section: "", vq: "", vpage: "" });
  const section = isSection(f.section) ? f.section : null;
  const open = useCallback((s: Section) => setF({ section: s }), [setF]);
  // Leaving a section drops its own filters (vendor search/page).
  const back = useCallback(() => setF({ section: "", vq: "", vpage: "" }), [setF]);

  if (!section) {
    return (
      <PageContainer>
        <EcommerceMenu onOpen={open} />
      </PageContainer>
    );
  }

  const meta = SECTIONS[section];
  return (
    <PageContainer>
      {section === "vendors" ? (
        <VendorsSection title={meta.title} description={meta.description} onBack={back} />
      ) : (
        <>
          <SectionHeader title={meta.title} description={meta.description} onBack={back} />
          {section === "products" && <ProductsSection />}
          {section === "categories" && <CategoriesSection />}
          {section === "settings" && <SettingsSection />}
          {section === "options" && <OptionsSection />}
          {section === "labels" && <LabelsSection />}
          {section === "brands" && <BrandsSection />}
        </>
      )}
    </PageContainer>
  );
}
