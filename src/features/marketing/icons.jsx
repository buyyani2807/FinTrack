import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen, Building2, CalendarCheck, CalendarDays, Contact,
  FileBarChart, FileSearch, FileSpreadsheet, FileText, Gauge, Gavel, GitCompareArrows, Globe, HandCoins, HeartPulse,
  Landmark, LayoutDashboard, Lightbulb, LineChart, ListChecks, ListTree, Lock, MessageCircle, Package,
  PackageSearch, PieChart, Radio, Receipt, ReceiptText, Route, Scale, ScanLine, ScrollText, ShieldAlert, ShieldCheck,
  Sparkles, Sun, TableProperties, Ticket, TrendingUp, UserRound, Users, Wallet, WalletCards, Waves,
} from "lucide-react";

const ICONS = {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen, Building2, CalendarCheck, CalendarDays, Contact,
  FileBarChart, FileSearch, FileSpreadsheet, FileText, Gauge, Gavel, GitCompareArrows, Globe, HandCoins, HeartPulse,
  Landmark, LayoutDashboard, Lightbulb, LineChart, ListChecks, ListTree, Lock, MessageCircle, Package,
  PackageSearch, PieChart, Radio, Receipt, ReceiptText, Route, Scale, ScanLine, ScrollText, ShieldAlert, ShieldCheck,
  Sparkles, Sun, TableProperties, Ticket, TrendingUp, UserRound, Users, Wallet, WalletCards, Waves,
};

export function FeatureIcon({ name, size = 20 }) {
  const Icon = ICONS[name] || Sparkles;
  return <Icon size={size} aria-hidden="true" />;
}
