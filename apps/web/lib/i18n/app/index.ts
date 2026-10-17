import type { Locale } from "../config"
import { account } from "./account"
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
export type AppDictionary = { [K in keyof Namespaces]: Namespaces[K]["en"] }

export function getAppDictionary(locale: Locale): AppDictionary {
  return Object.fromEntries(Object.entries(NAMESPACES).map(([key, messages]) => [key, messages[locale]])) as AppDictionary
}
