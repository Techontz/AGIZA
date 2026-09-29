import type { LucideIcon } from "lucide-react";

import { Breadcrumbs } from "./breadcrumbs";
import { Container } from "./ui/container";

export function ServicePage({
  title,
  lead,
  steps,
  form,
  aside,
}: {
  title: string;
  lead: string;
  steps: { icon: LucideIcon; title: string; text: string }[];
  form: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: title }]} />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
        <div>
          <h1 className="text-[28px] leading-tight font-bold text-ink sm:text-[34px]">{title}</h1>
          <p className="mt-3 max-w-xl text-[16px] text-muted">{lead}</p>
          <ol className="mt-8 space-y-5">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-brand">
                  <s.icon className="size-5" aria-hidden />
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
                </span>
                <span>
                  <span className="block text-[16px] font-semibold text-ink">{s.title}</span>
                  <span className="text-[14px] text-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          {aside}
        </div>
        <div className="rounded-lg bg-surface p-5 shadow-card sm:p-7">{form}</div>
      </div>
    </Container>
  );
}

export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <Container className="max-w-3xl py-8 sm:py-10">
      <Breadcrumbs items={[{ label: title }]} />
      <h1 className="text-[28px] font-bold text-ink sm:text-[34px]">{title}</h1>
      {updated ? <p className="mt-1 text-[13px] text-muted">Last updated {updated}</p> : null}
      <div className="mt-6 space-y-4 rounded-lg bg-surface p-5 text-[15px] leading-relaxed text-text shadow-card sm:p-8 [&_a]:font-medium [&_a]:text-primary [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </Container>
  );
}
