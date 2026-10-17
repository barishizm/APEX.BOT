import type { Locale } from "../config"
import { account } from "./account"
import { admin, type AdminMessages } from "./admin"
import { analytics } from "./analytics"
import { inbox } from "./inbox"
import { knowledge } from "./knowledge"
import { overview } from "./overview"
import { settings } from "./settings"
import { setup } from "./setup"
import { shell } from "./shell"
import { sites } from "./sites"
import { studio } from "./studio"
import { team } from "./team"

// The signed-in app's strings, one namespace per area. Register new namespaces here.
const NAMESPACES = { shell, setup, overview, analytics, account, settings, inbox, knowledge, studio, sites, team }

type Namespaces = typeof NAMESPACES
export type AdminDictionary = AdminMessages
// `admin` is there only for platform staff, so customers never download the admin area's strings
export type AppDictionary = { [K in keyof Namespaces]: Namespaces[K]["en"] } & { admin?: AdminDictionary }

export function getAppDictionary(locale: Locale, options: { admin?: boolean } = {}): AppDictionary {
  const dict = Object.fromEntries(Object.entries(NAMESPACES).map(([key, messages]) => [key, messages[locale]])) as unknown as AppDictionary
  return options.admin ? { ...dict, admin: admin[locale] } : dict
}

/** The admin area's strings, for server code (page titles); the client reads them from useAppI18n(). */
export const getAdminDictionary = (locale: Locale): AdminDictionary => admin[locale]
