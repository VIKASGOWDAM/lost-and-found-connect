import {
  Laptop, Smartphone, FileText, CreditCard, Gem, Wallet,
  Briefcase, GraduationCap, Car, Shirt, Book, Package, Tv,
} from 'lucide-react';
import type { ComponentType } from 'react';

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  'Electronics': Tv,
  'Mobile Phones': Smartphone,
  'Laptops': Laptop,
  'Documents': FileText,
  'ATM/Bank Cards': CreditCard,
  'Jewellery': Gem,
  'Wallets': Wallet,
  'Bags': Briefcase,
  'Student Items': GraduationCap,
  'Vehicles': Car,
  'Clothing': Shirt,
  'Books': Book,
  'Other': Package,
};

export function getCategoryIcon(name: string): ComponentType<{ className?: string }> {
  return iconMap[name] ?? Package;
}
