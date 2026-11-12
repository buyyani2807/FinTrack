import {
  ArchiveRestore, ArrowDownLeft, ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen, Building2, CalendarCheck, CalendarClock, CalendarDays, Contact,
  FileBarChart, FileSearch, FileSpreadsheet, FileText, Gauge, Gavel, GitCompareArrows, Globe, HandCoins, HeartPulse,
  Landmark, LayoutDashboard, Lightbulb, LineChart, ListChecks, ListTree, Lock, MessageCircle, Package,
  PackageSearch, Paperclip, PieChart, Radio, Receipt, ReceiptText, Route, Scale, ScanLine, ScanSearch, ScrollText, ShieldAlert, ShieldCheck,
  ShoppingCart, Sparkles, Sun, TableProperties, Ticket, TrendingUp, UserRound, Users, Wallet, WalletCards, Waves, WifiOff,
} from "lucide-react";

const ICONS = {
  ArchiveRestore, ArrowDownLeft, ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen, Building2, CalendarCheck, CalendarClock, CalendarDays, Contact,
  FileBarChart, FileSearch, FileSpreadsheet, FileText, Gauge, Gavel, GitCompareArrows, Globe, HandCoins, HeartPulse,
  Landmark, LayoutDashboard, Lightbulb, LineChart, ListChecks, ListTree, Lock, MessageCircle, Package,
  PackageSearch, Paperclip, PieChart, Radio, Receipt, ReceiptText, Route, Scale, ScanLine, ScanSearch, ScrollText, ShieldAlert, ShieldCheck,
  ShoppingCart, Sparkles, Sun, TableProperties, Ticket, TrendingUp, UserRound, Users, Wallet, WalletCards, Waves, WifiOff,
};

export function FeatureIcon({ name, size = 20 }) {
  const Icon = ICONS[name] || Sparkles;
  return <Icon size={size} aria-hidden="true" />;
}
