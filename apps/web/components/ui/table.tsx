// shadcn/ui table (https://ui.shadcn.com/docs/components/table), adapted to this app's CSS variables.

import * as React from "react"
import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:border-[var(--color-line)]", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-b border-[var(--color-line)] transition-colors hover:bg-[var(--color-bubble)]/50", className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("h-9 whitespace-nowrap px-2 text-left align-middle text-xs font-medium text-[var(--color-muted)] first:pl-0 last:pr-0", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("whitespace-nowrap px-2 py-2.5 align-middle first:pl-0 last:pr-0", className)} {...props} />
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow }
