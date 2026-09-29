import { ProductEditor } from "@/components/seller/product-editor";

export default function NewProductPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Add a product</h1>
      <p className="-mt-2 text-muted">Save it first; you can add photos on the next screen.</p>
      <ProductEditor />
    </>
  );
}
