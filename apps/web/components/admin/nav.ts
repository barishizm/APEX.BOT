import {
  BookOpen,
  Bot,
  Building2,
  Coins,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  ListPlus,
  Megaphone,
  MessageSquareText,
  ScrollText,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { AdminDictionary } from "@/lib/i18n/app"

export type AdminSection = keyof AdminDictionary["nav"]

// The admin area's sections, in rail order. The rail, the command palette and the overview read this.
export const ADMIN_NAV: { key: AdminSection; href: string; icon: LucideIcon; keywords: string }[] = [
  { key: "overview", href: "/admin", icon: LayoutDashboard, keywords: "admin home overview genel bakış" },
  { key: "users", href: "/admin/users", icon: Users, keywords: "admin users accounts suspend kullanıcı hesap askıya" },
  { key: "workspaces", href: "/admin/workspaces", icon: Building2, keywords: "admin workspaces organizations plan çalışma alanı organizasyon" },
  { key: "bots", href: "/admin/bots", icon: Bot, keywords: "admin sites bots widget disable site bot devre dışı" },
  { key: "knowledge", href: "/admin/knowledge", icon: BookOpen, keywords: "admin knowledge sources crawl bilgi kaynak" },
  { key: "conversations", href: "/admin/conversations", icon: MessageSquareText, keywords: "admin conversations chats messages konuşma sohbet mesaj" },
  { key: "usage", href: "/admin/usage", icon: Coins, keywords: "admin usage cost tokens kullanım maliyet token" },
  { key: "billing", href: "/admin/billing", icon: CreditCard, keywords: "admin billing revenue mrr subscriptions paddle webhooks overage faturalama gelir abonelik aşım" },
  { key: "security", href: "/admin/security", icon: ShieldAlert, keywords: "admin security sessions login 2fa güvenlik oturum giriş" },
  { key: "support", href: "/admin/support", icon: LifeBuoy, keywords: "admin support tickets help destek talep" },
  { key: "waitlist", href: "/admin/waitlist", icon: ListPlus, keywords: "admin waitlist invite sign-ups bekleme listesi davet kayıt" },
  { key: "announcements", href: "/admin/announcements", icon: Megaphone, keywords: "admin announcements banner maintenance duyuru bant bakım" },
  { key: "settings", href: "/admin/settings", icon: SlidersHorizontal, keywords: "admin settings sign-ups feature flags ayar kayıt özellik bayrak" },
  { key: "system", href: "/admin/system", icon: Server, keywords: "admin system health database migrations sistem sağlık veritabanı" },
  { key: "audit", href: "/admin/audit", icon: ScrollText, keywords: "admin audit log history kayıt geçmiş" },
]

export const isActiveSection = (href: string, pathname: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`))
