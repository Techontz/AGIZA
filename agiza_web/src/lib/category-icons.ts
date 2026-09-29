import {
  Baby,
  Bike,
  BookOpen,
  Car,
  Dumbbell,
  Gamepad2,
  Headphones,
  Home,
  Laptop,
  type LucideIcon,
  Refrigerator,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Tag,
  Tv,
  Watch,
  Wrench,
} from "lucide-react";

/** A friendly icon for a category, picked from its name (categories have no images). */
const RULES: [RegExp, LucideIcon][] = [
  [/phone|mobile|simu/i, Smartphone],
  [/laptop|computer|pc/i, Laptop],
  [/tv|television|electronic/i, Tv],
  [/audio|headphone|speaker/i, Headphones],
  [/fashion|cloth|wear|shoe|dress|nguo/i, Shirt],
  [/furniture|sofa/i, Sofa],
  [/appliance|kitchen|fridge/i, Refrigerator],
  [/home|house|living/i, Home],
  [/beauty|health|cosmetic/i, Sparkles],
  [/sport|fitness|gym/i, Dumbbell],
  [/baby|kid|toy/i, Baby],
  [/game|gaming/i, Gamepad2],
  [/watch|jewel/i, Watch],
  [/car|auto|vehicle/i, Car],
  [/bike|cycle|motor/i, Bike],
  [/book|station/i, BookOpen],
  [/tool|hardware|equipment|machin/i, Wrench],
  [/grocer|food|supermarket/i, ShoppingBasket],
];

export function categoryIcon(name: string): LucideIcon {
  return RULES.find(([re]) => re.test(name))?.[1] ?? Tag;
}
