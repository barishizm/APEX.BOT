"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { FeatureFlag, FlagOverview, SignupsMode } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { cn } from "@/lib/utils"
import { ConfirmDialog, Empty, Section, Table, When, button, fill, postJson, primaryButton, tag, td, type Jsonify } from "./detail-ui"
import { WorkspacePicker, type PickedWorkspace } from "./workspace-picker"

// /admin/settings: who can sign up, and the feature flags. Every change goes through the confirm
// dialog (reason and step-up) to /api/admin/settings/<action>; the page then reloads its data.

export interface SettingsJson {
  signupsMode: SignupsMode | null
  signupsUpdatedAt: string | null
  flags: Jsonify<FlagOverview>[]
}

const MODES: SignupsMode[] = ["open", "invite_only", "closed"]

type Pending =
  | { kind: "signups"; mode: SignupsMode }
  | { kind: "flag"; flag: FeatureFlag; enabled: boolean | null; workspace?: PickedWorkspace }

export function SettingsPanel({ settings, defaultMode, canEdit }: { settings: SettingsJson; defaultMode: SignupsMode; canEdit: boolean }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.settings
  const router = useRouter()
  const effective = settings.signupsMode ?? defaultMode
  const [mode, setMode] = useState<SignupsMode>(effective)
  const [pending, setPending] = useState<Pending | null>(null)
  // a workspace picked for a flag, waiting for On or Off
  const [picked, setPicked] = useState<{ flag: FeatureFlag; workspace: PickedWorkspace } | null>(null)

  const state = (on: boolean) => (on ? t.flags.on : t.flags.off).toLowerCase()
  const flagLabel = (f: FeatureFlag) => t.flags.names[f].label

  const dialog = (() => {
    if (!pending) return null
    if (pending.kind === "signups") {
      return {
        title: fill(t.signups.confirmTitle, { mode: t.signups.modes[pending.mode].label }),
        text: t.signups.confirmText,
        submit: (reason: string) => postJson("/api/admin/settings/signups", { mode: pending.mode, reason }),
      }
    }
    const { flag, enabled, workspace } = pending
    const title = !workspace
      ? fill(t.flags.confirmGlobal, { flag: flagLabel(flag), state: state(!!enabled) })
      : enabled === null
        ? fill(t.flags.confirmFollow, { flag: flagLabel(flag), workspace: workspace.name })
        : fill(t.flags.confirmWorkspace, { flag: flagLabel(flag), state: state(enabled), workspace: workspace.name })
    return {
      title,
      text: t.flags.confirmText,
      submit: (reason: string) => postJson("/api/admin/settings/flag", { flag, enabled, organizationId: workspace?.id, reason }),
    }
  })()

  return (
    <div className="flex flex-col gap-6">
      {!canEdit && <p className="m-0 rounded-lg bg-[var(--color-bubble)] px-3 py-2 text-sm text-[var(--color-muted)]">{t.superadminOnly}</p>}

      <Section title={t.signups.title}>
        <p className="m-0 text-sm text-[var(--color-muted)]">{t.signups.text}</p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={!canEdit}>
          <legend className="sr-only">{t.signups.title}</legend>
          {MODES.map((m) => (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                mode === m ? "border-[var(--color-text)] bg-[var(--color-bubble)]/50" : "border-[var(--color-line)] hover:border-[var(--color-muted)]/60",
              )}
            >
              <input type="radio" name="signups" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 accent-[var(--color-text)]" />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {t.signups.modes[m].label}
                  {effective === m && <span className={cn(tag, "bg-green-500/15 text-green-800 dark:text-green-300")}>{t.signups.current}</span>}
                </span>
                <span className="text-sm text-[var(--color-muted)]">{t.signups.modes[m].text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-muted)]">
          {canEdit && (
            <button
              type="button"
              onClick={() => setPending({ kind: "signups", mode })}
              // with nothing stored, choosing the default still pins it here
              disabled={mode === effective && settings.signupsMode !== null}
              className={cn(button, primaryButton)}
            >
              {t.signups.save}
            </button>
          )}
          <span>
            {settings.signupsMode === null ? (
              fill(t.signups.fromEnv, { mode: t.signups.modes[defaultMode].label })
            ) : settings.signupsUpdatedAt ? (
              <>
                {t.updated.split("{when}")[0]}
                <When at={settings.signupsUpdatedAt} locale={locale} />
                {t.updated.split("{when}")[1]}
              </>
            ) : null}
          </span>
          <Link href="/admin/waitlist" className="ml-auto font-medium text-[var(--color-text)]">
            {t.signups.waitlist}
          </Link>
        </div>
      </Section>

      <Section title={t.flags.title}>
        <p className="m-0 text-sm text-[var(--color-muted)]">{t.flags.text}</p>
        <div className="flex flex-col gap-4">
          {settings.flags.map((f) => (
            <div key={f.flag} className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] p-3 sm:p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {flagLabel(f.flag)}
                    <code className="text-xs font-normal text-[var(--color-muted)]">{f.flag}</code>
                  </span>
                  <span className="text-sm text-[var(--color-muted)]">{t.flags.names[f.flag].text}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {fill(t.flags.default, { value: state(f.default) })}
                    {" · "}
                    {f.updatedAt ? (
                      <>
                        {t.updated.split("{when}")[0]}
                        <When at={f.updatedAt} locale={locale} />
                        {t.updated.split("{when}")[1]}
                      </>
                    ) : (
                      t.neverChanged
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-muted)]">{t.flags.global}</span>
                  <OnOff on={f.enabled} labels={t.flags} />
                  {canEdit && (
                    <button type="button" onClick={() => setPending({ kind: "flag", flag: f.flag, enabled: !f.enabled })} className={button}>
                      {f.enabled ? t.flags.turnOff : t.flags.turnOn}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t.flags.workspaces}</span>
                {f.workspaces.length ? (
                  <Table head={[app.admin!.nav.workspaces, "", ""]}>
                    {f.workspaces.map((w) => (
                      <tr key={w.organizationId} className="border-t border-[var(--color-line)]">
                        <td className={td}>
                          <Link href={`/admin/workspaces/${w.organizationId}`} className="font-medium text-[var(--color-text)]">
                            {w.name}
                          </Link>
                          <span className="ml-2 text-xs text-[var(--color-muted)]">{w.plan}</span>
                        </td>
                        <td className={td}>
                          <OnOff on={w.enabled} labels={t.flags} />
                        </td>
                        <td className={cn(td, "text-right")}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setPending({ kind: "flag", flag: f.flag, enabled: null, workspace: { id: w.organizationId, name: w.name, plan: w.plan } })}
                              className={button}
                            >
                              {t.flags.follow}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty>{t.flags.noWorkspaces}</Empty>
                )}
                {canEdit && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-[var(--color-muted)]">{t.flags.add}</span>
                    {picked?.flag === f.flag ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{picked.workspace.name}</span>
                        <button type="button" onClick={() => setPending({ kind: "flag", flag: f.flag, enabled: true, workspace: picked.workspace })} className={button}>
                          {t.flags.addOn}
                        </button>
                        <button type="button" onClick={() => setPending({ kind: "flag", flag: f.flag, enabled: false, workspace: picked.workspace })} className={button}>
                          {t.flags.addOff}
                        </button>
                        <button type="button" onClick={() => setPicked(null)} className={button}>
                          {app.admin!.announcements.editor.cancel}
                        </button>
                      </div>
                    ) : (
                      <div className="sm:max-w-md">
                        <WorkspacePicker onPick={(workspace) => setPicked({ flag: f.flag, workspace })} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {pending && dialog && (
        <ConfirmDialog
          title={dialog.title}
          text={dialog.text}
          stepUp
          submit={dialog.submit}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null)
            setPicked(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function OnOff({ on, labels }: { on: boolean; labels: { on: string; off: string } }) {
  return (
    <span className={cn(tag, on ? "bg-green-500/15 text-green-800 dark:text-green-300" : "bg-[var(--color-bubble)] text-[var(--color-muted)]")}>
      {on ? labels.on : labels.off}
    </span>
  )
}
