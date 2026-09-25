UPDATE THE EXISTING AGIZA ADMIN SHIPPING ENGINE DESIGN

IMPORTANT:
Do NOT redesign the Shipping Engine.
Do NOT change the existing Agiza Admin sidebar, branding, colors, typography, navigation, spacing, or overall UI structure.

Only make the following structural changes to the Shipping Profiles and Shipping Rules.

==================================================
1. SHIPPING PROFILES — SPECIAL HANDLING
==================================================

Keep Special Handling inside the Shipping Profile.

Shipping Profile defines the characteristics and handling requirements of the product.

Examples:

Standard Goods
- Normal goods
- No special handling

Camera
- Electronics
- Fragile

Drone
- Electronics
- Contains Battery
- Fragile

Laptop
- Electronics
- Contains Battery

Oversized
- Oversized
- Special handling

Keep the existing Special Handling options inside the Shipping Profile.

These attributes should be stored as part of the product's Shipping Profile.

==================================================
2. SHIPPING RULES — REMOVE SPECIAL HANDLING
==================================================

Remove the Special Handling section from Shipping Rules.

Do NOT ask the admin to select:

- Fragile
- Contains Battery
- Hazardous
- Restricted
- Oversized
- etc.

again when creating a Shipping Rule.

The Shipping Rule should obtain these characteristics from the product's assigned Shipping Profile.

This avoids duplicate data entry and prevents inconsistent information.

Example:

Shipping Profile:
“Drone”

Special Handling:
☑ Contains Battery
☑ Fragile

Then the Shipping Rule simply targets:

Shipping Profile:
“Drone”

The rule does not need to ask again whether it contains a battery or is fragile.

==================================================
3. SHIPPING RULES — CHANGE “APPLIES TO”
==================================================

In the Shipping Rule creation form, update:

“Applies To”

Remove:

- All Products
- Product Category

Keep only:

- Shipping Profile
- Specific Product

The new options should be:

APPLIES TO

○ Shipping Profile
○ Specific Product

==================================================
4. SHIPPING PROFILE RULE
==================================================

When the admin selects:

“Shipping Profile”

show a dropdown:

Shipping Profile:
[ Select Shipping Profile ▼ ]

Example:

[ Drone ]

The rule then applies to all products assigned to that Shipping Profile.

Example:

Route:
China → Tanzania

Method:
Air Cargo

Applies To:
Shipping Profile

Profile:
Drone

Pricing Model:
Per Item

Rate:
$50 / Item

ETA:
7–14 days

Any product assigned to the Drone Shipping Profile can automatically use this rule.

==================================================
5. SPECIFIC PRODUCT RULE
==================================================

When the admin selects:

“Specific Product”

show:

Product:
[ Search and select product ]

Example:

Product:
DJI Mavic 3

This allows a specific product to have its own shipping rule even if it belongs to a broader Shipping Profile.

Example:

Shipping Profile:
Drone

General Drone Rule:
$50 / Item

Specific Product:
DJI Mavic 3

Specific Product Rate:
$65 / Item

The specific product rule takes precedence over the Shipping Profile rule.

==================================================
6. RULE PRIORITY
==================================================

Keep the automatic rule hierarchy simple.

The system should prioritize:

1. Specific Product Rule
2. Shipping Profile Rule
3. General Route Rule

Do NOT ask the admin to manually enter priority numbers at this stage.

The system should automatically determine which rule is more specific.

==================================================
7. CONDITIONS
==================================================

Keep weight, CBM, volumetric weight, and other pricing conditions inside the Shipping Rule.

Section 5 should continue to define WHEN the rule applies.

For example:

Weight:
0–20 KG

CBM:
0–0.20 CBM

Volumetric Weight:
0–25 KG

These conditions are separate from the Shipping Profile.

Shipping Profile tells the system:

“WHAT KIND OF PRODUCT IS THIS?”

Shipping Rule tells the system:

“HOW SHOULD THIS PRODUCT BE SHIPPED AND PRICED ON THIS ROUTE?”

==================================================
8. EXAMPLE OF THE FINAL SYSTEM
==================================================

PRODUCT:

DJI Drone

Shipping Profile:
Drone

Special Handling:
☑ Contains Battery
☑ Fragile

--------------------------------------------------

SHIPPING RULE:

Route:
China → Tanzania

Shipping Method:
Air Cargo

Applies To:
Shipping Profile

Shipping Profile:
Drone

Pricing Model:
Per Item

Rate:
$50 / Item

ETA:
7–14 days

Conditions:
Maximum weight: 10 KG

--------------------------------------------------

The system sees:

Product
↓
Shipping Profile = Drone
↓
Special Handling = Battery + Fragile
↓
China → Tanzania
↓
Air Cargo
↓
Matching Shipping Profile Rule
↓
$50 / Item

==================================================
9. IMPORTANT DESIGN PRINCIPLE
==================================================

Do not duplicate product characteristics in Shipping Rules.

Shipping Profile = PRODUCT CHARACTERISTICS

Shipping Rule = SHIPPING & PRICING LOGIC

Specific Product Rule = EXCEPTION / SPECIAL PRICE FOR ONE PRODUCT

Route = WHERE

Shipping Method = HOW

Pricing Model = HOW PRICE IS CALCULATED

Conditions = WHEN THE RULE APPLIES

Keep the interface simple enough for a non-technical Agiza administrator to understand.

Do not introduce additional complexity at this stage.