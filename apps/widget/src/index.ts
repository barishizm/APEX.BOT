// Entry point loaded by <script src=".../widget.js" data-site-key="apex_pk_..." async>.
import { ApiClient, ApiError } from "./api.ts";
import { Widget, hiddenHere, type UserOptions } from "./ui.ts";

type Method = "open" | "close" | "toggle" | "send" | "identify" | "on" | "off";
const METHODS: Method[] = ["open", "close", "toggle", "send", "identify", "on", "off"];

declare global {
  interface Window {
    Apex?: (UserOptions & { version?: undefined }) | ({ version: string } & Record<Method, (...args: any[]) => void>);
  }
}

// Read synchronously: currentScript is only set while this file is executing.
const script = (document.currentScript ?? document.querySelector("script[data-site-key]")) as HTMLScriptElement | null;
const siteKey = script?.dataset.siteKey;

if (!siteKey) {
  console.warn("[Apex] Missing data-site-key on the widget script tag.");
} else if (!window.Apex?.version) {
  const base = (script!.dataset.api || new URL(script!.src, location.href).origin).replace(/\/+$/, "");
  const options: UserOptions = window.Apex && !window.Apex.version ? (window.Apex as UserOptions) : {};
  const api = new ApiClient(base, siteKey);

  // Calls made before the widget is ready are queued and replayed.
  let widget: Widget | null = null;
  const queue: [Method, unknown[]][] = [];
  const facade = { version: "1" } as { version: string } & Record<Method, (...args: any[]) => void>;
  for (const method of METHODS) {
    facade[method] = (...args) => {
      if (widget) (widget[method] as (...a: unknown[]) => unknown)(...args);
      else queue.push([method, args]);
    };
  }
  window.Apex = facade;

  const start = async () => {
    try {
      const config = await api.config();
      // "Hide on these pages": calls queued for a hidden widget are dropped
      if (hiddenHere(config.ui)) return;
      widget = new Widget(api, config, options, siteKey);
      widget.mount();
      for (const [method, args] of queue.splice(0)) (widget[method] as (...a: unknown[]) => unknown)(...args);
    } catch (error) {
      console.warn("[Apex] Widget disabled:", error instanceof ApiError ? error.code : error);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else void start();
}
