import {
  ArrowDownLeft, ArrowUpRight, BarChart3, Bell, BookOpen, Building2, CalendarDays, Contact,
  FileSpreadsheet, FileText, Gauge, Gavel, HandCoins, Landmark, LayoutDashboard, Lightbulb,
  LineChart, ListChecks, ListTree, Lock, MessageCircle, Package, PieChart, Radio, Receipt,
  ReceiptText, Route, Scale, ScanLine, ScrollText, ShieldAlert, Sparkles, Sun, TableProperties,
  Ticket, TrendingUp, UserRound, Users, Wallet, WalletCards, Waves,
} from "lucide-react";

const ICONS = {
  ArrowDownLeft, ArrowUpRight, BarChart3, Bell, BookOpen, Building2, CalendarDays, Contact,
  FileSpreadsheet, FileText, Gauge, Gavel, HandCoins, Landmark, LayoutDashboard, Lightbulb,
  LineChart, ListChecks, ListTree, Lock, MessageCircle, Package, PieChart, Radio, Receipt,
  ReceiptText, Route, Scale, ScanLine, ScrollText, ShieldAlert, Sparkles, Sun, TableProperties,
  Ticket, TrendingUp, UserRound, Users, Wallet, WalletCards, Waves,
};

export function FeatureIcon({ name, size = 20 }) {
  const Icon = ICONS[name] || Sparkles;
  return <Icon size={size} aria-hidden="true" />;
}
