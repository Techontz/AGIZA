UPDATE THE EXISTING AGIZA ADMIN — EDIT PRODUCT PAGE

IMPORTANT:
Use the existing Edit Product page shown in the reference design as the starting point.

Do NOT redesign the entire Admin system.
Do NOT change Agiza branding, colors, typography, buttons, sidebar, navigation, or overall visual language.

Improve the existing Edit Product page by reorganizing and adding the product information required by the current Agiza Shop and Shipping Engine architecture.

The page must remain clean and easy for an admin to use.

==================================================
SECTION 1 — BASIC PRODUCT INFORMATION
==================================================

Keep and improve the existing fields:

Product Name
SKU
Brand
Category
Subcategory
Status

Status options:
- Active
- Draft
- Hidden
- Out of Stock

Add:

Product Condition

Options:
- New
- Used
- Refurbished
- Open Box

If Used/Refurbished/Open Box is selected, show:

Condition Description:
[ text field ]

Example:
“Used — minor body marks, fully functional.”

This information will be displayed to customers on the Shop/Product Page.

==================================================
SECTION 2 — PRICE & INVENTORY
==================================================

Keep:

Price (TSh)
Stock

Add:

Compare-at Price / Original Price
Discount
Stock Status

Allow the system to automatically determine:

In Stock
Low Stock
Out of Stock

Add:

Allow “Pata Bei” when out of stock:
○ Yes
○ No

This allows an out-of-stock product to remain visible in Shop while allowing the customer to request a quotation.

==================================================
SECTION 3 — PRODUCT LOCATION
==================================================

Replace the current origin/delivery information with a dedicated product location section.

Add:

PRODUCT LOCATION

Country:
[ Select Country ]

City:
[ Select City ]

Warehouse / Vendor Location:
[ Select Location ]

Example:

Country:
Tanzania

City:
Dar es Salaam

Location:
Agiza Warehouse

This information should be used by the customer-facing Product Page to display:

“Inapatikana: Dar es Salaam”

IMPORTANT:

Product Location is NOT the same thing as the customer's delivery address.

Product Location = where the product currently is.

Customer Delivery Address = where the customer wants the product delivered.

==================================================
SECTION 4 — SHIPPING PROFILE
==================================================

Add a dedicated:

SHIPPING PROFILE

Shipping Profile:
[ Select Shipping Profile ▼ ]

Examples:

- Standard Goods
- Electronics
- Camera
- Laptop
- Drone
- Oversized
- Battery / Restricted

Add a small information note:

“Shipping Profile defines how this product is classified for shipping and its special handling requirements.”

Do NOT add Special Handling checkboxes directly to the Product Edit page if they are already defined inside the Shipping Profile.

The selected Shipping Profile should determine the product's applicable special-handling characteristics.

Example:

Shipping Profile:
Drone

The Drone profile may contain:
- Contains Battery
- Fragile
- Special Handling

==================================================
SECTION 5 — PHYSICAL & SHIPPING DIMENSIONS
==================================================

Add a dedicated:

PHYSICAL INFORMATION

Fields:

Weight (KG)
[          ]

Length (CM)
[          ]

Width (CM)
[          ]

Height (CM)
[          ]

Number of Packages
[          ]

Then automatically calculate and display:

CBM
[ Automatically calculated ]

Volumetric Weight
[ Automatically calculated ]

Do NOT require the admin to manually enter CBM.

Do NOT require the admin to manually enter Volumetric Weight.

CBM should be calculated from:

Length × Width × Height

Volumetric Weight should be calculated using the configurable volumetric divisor from Shipping Engine Settings.

Display the calculated values as read-only fields.

Example:

Weight:
8 KG

Dimensions:
50 × 40 × 30 CM

CBM:
0.06

Volumetric Weight:
10 KG

Add a small note:

“CBM and volumetric weight are calculated automatically from the package dimensions.”

IMPORTANT:

Use PACKAGE dimensions for shipping calculations where applicable, not only the physical dimensions of the product itself.

==================================================
SECTION 6 — SHIPPING INFORMATION
==================================================

Add:

SHIPPING INFORMATION

Origin:
[ Automatically linked to Product Location ]

Available Shipping Methods:

☐ Air Cargo
☐ Sea Freight
☐ Express Courier
☐ Local Delivery
☐ Other

Do NOT allow the admin to enter shipping prices here.

Shipping prices must come from the Shipping Engine.

The product only provides the characteristics needed by the Shipping Engine.

Add:

Ready to Ship:
[        ] days

Optional:

Shipping Notes:
[ text field ]

==================================================
SECTION 7 — VARIATIONS
==================================================

Keep the existing Product Attributes area but improve it.

Allow the admin to enable:

Has Variations:
○ Yes
○ No

If Yes, allow:

Color
Storage
Size
Model
Capacity
Other Custom Attribute

Each variation should be able to have its own:

- SKU
- Price
- Stock
- Weight
- Length
- Width
- Height
- Images

IMPORTANT:

Variation-level physical information should override the parent product's physical information when the variation has different dimensions or weight.

Example:

iPhone 128GB
Weight: 0.5 KG

iPhone 512GB
Weight: 0.55 KG

The Shipping Engine must use the selected variation's shipping information.

==================================================
SECTION 8 — PRODUCT DESCRIPTION
==================================================

Keep:

Description

Make it suitable for the customer-facing Product Page.

Add optional:

Key Features / Specifications

Allow structured product specifications such as:

Display:
6.4"

Storage:
128GB

RAM:
8GB

Condition:
Used

These should be displayed cleanly on the customer Product Page.

==================================================
SECTION 9 — VENDOR / SOURCE
==================================================

Add:

Vendor / Seller:
[ Select Vendor ]

Vendor SKU:
[          ]

Vendor Location:
[          ]

Verified Vendor:
○ Yes
○ No

This is important for products sourced from vendors and future marketplace functionality.

==================================================
SECTION 10 — SHOP & DISCOVERY
==================================================

Add a section for Shop visibility and discovery.

Fields:

Featured Product:
○ Yes
○ No

Ofa Kali:
○ Yes
○ No

Allow Customer Save:
○ Yes
○ No

Allow Customer Chat:
○ Yes
○ No

Search Keywords / Tags:
[ tags ]

Do NOT make the admin manually select every recommendation.

Recommendations should eventually be generated from:

- Customer interests
- Previous purchases
- Recently viewed products
- Saved products
- Product category
- Related products

==================================================
SECTION 11 — RELATED PRODUCTS
==================================================

Add:

RELATED PRODUCTS

Allow admin to optionally select related products.

[ + Add Related Product ]

These products appear below the main product information on the customer Product Page.

Label:

“Bidhaa Zinazohusiana”

IMPORTANT:

Related Products are for product discovery.

They should NOT appear inside the Buy Now flow.

==================================================
SECTION 12 — FREQUENTLY BOUGHT TOGETHER
==================================================

Add:

FREQUENTLY BOUGHT TOGETHER

Allow admin to optionally select products commonly purchased together.

[ + Add Product ]

Example:

Camera
+
Memory Card
+
Camera Bag

These products appear AFTER the customer presses:

“NUNUA SASA”

Do NOT show this section as general recommendations on the Product Page.

==================================================
SECTION 13 — GIFTS
==================================================

Add:

GIFT ELIGIBILITY

Gift Eligible:
○ Yes
○ No

If Yes:

Eligible Gift Products:
[ + Add Gift ]

These gifts appear after the customer presses:

“NUNUA SASA”

alongside the Frequently Bought Together step.

==================================================
SECTION 14 — TAX
==================================================

Add:

TAX CATEGORY

Tax Category:
[ Select Tax Category ▼ ]

VAT Applicable:
○ Yes
○ No

Do NOT make the admin manually enter the final tax amount.

Actual tax calculation should be handled by the Agiza tax/checkout system.

==================================================
SECTION 15 — SHIPPING ENGINE CONNECTION
==================================================

Add a small read-only Shipping Engine summary.

Display:

SHIPPING ENGINE

Shipping Profile:
Camera

Product Location:
Dubai, UAE

Weight:
1.2 KG

CBM:
0.008

Volumetric Weight:
1.6 KG

Available Methods:
Air Cargo

Then show:

“Shipping cost and delivery estimates are calculated automatically by the Shipping Engine based on the customer's destination, shipping method, product profile, weight, dimensions, CBM, and applicable shipping rules.”

Add a button:

“TEST SHIPPING RATE”

This should open the Shipping Engine Test Rate tool using this product's information as the starting data.

DO NOT place shipping prices directly on the Product Edit page.

==================================================
SECTION 16 — DELIVERY ESTIMATION
==================================================

Remove the current manually configured “Delivery Estimation Settings” / “Delivery Estimator” concept from the product page if it is being used to manually define route pricing or ETA.

Instead, delivery estimates should come from the Shipping Engine.

The Product Edit page should only provide the product information required by the Shipping Engine.

The Shipping Engine determines:

Route
+
Shipping Method
+
Shipping Profile
+
Weight / CBM / Volumetric Weight
+
Conditions
=
Shipping Cost + Delivery Estimate

The product page should NOT manually override this unless an explicit product-specific shipping rule exists.

==================================================
FINAL DATA RELATIONSHIP
==================================================

The Product Edit page should provide the facts:

WHAT IS IT?
→ Product information

WHERE IS IT?
→ Product Location

WHAT CONDITION IS IT IN?
→ Condition

HOW MUCH IS IT?
→ Price

HOW MANY ARE AVAILABLE?
→ Stock

WHAT KIND OF SHIPMENT IS IT?
→ Shipping Profile

HOW BIG/HEAVY IS IT?
→ Weight + Dimensions + CBM + Volumetric Weight

WHAT CAN THE CUSTOMER BUY WITH IT?
→ Related Products + Frequently Bought Together

CAN THE CUSTOMER GET A GIFT?
→ Gift Eligibility

WHAT TAX CATEGORY DOES IT BELONG TO?
→ Tax Category

The Shipping Engine then uses these facts to determine:

WHERE IS IT GOING?
→ Customer destination

HOW WILL IT TRAVEL?
→ Shipping Method

WHICH RULE APPLIES?
→ Shipping Rule

HOW MUCH DOES SHIPPING COST?
→ Calculated Shipping Cost

WHEN WILL IT ARRIVE?
→ Estimated Delivery

==================================================
UI REQUIREMENT
==================================================

Keep the page organized into clear collapsible or visually separated sections.

Do not make the page feel like one giant form.

Use clear section headers:

1. Basic Information
2. Price & Inventory
3. Product Location
4. Shipping Profile
5. Physical & Shipping Dimensions
6. Shipping Information
7. Variations
8. Description & Specifications
9. Vendor / Source
10. Shop & Discovery
11. Related Products
12. Frequently Bought Together
13. Gifts
14. Tax
15. Shipping Engine

Keep the existing “Update Product” and “Cancel” actions at the bottom.

The final page should provide all product data required by the current Agiza Shop, Product Page, Checkout, Shipping Engine, personalization system, and future marketplace functionality without duplicating shipping rules or shipping prices.