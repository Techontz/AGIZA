"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Save, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import {
  operatorsFor,
  settingsApi,
  settingsKeys,
  type RuleField,
  type RuleOperator,
  type TagRule,
  type TagRuleInput,
} from "@/lib/api/services/settings";
import { cn } from "@/lib/cn";

interface DraftCondition {
  key: number;
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

const PLACEHOLDERS: Record<RuleField, string> = {
  total_spent: "e.g. 1000000",
  total_orders: "e.g. 5",
  inactive_days: "e.g. 30",
  category: "e.g. electronics",
  last_order_days: "e.g. 60",
};

let seq = 0;
const newKey = () => ++seq;

const control =
  "px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full";
const input = "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Mirrors backend services.condition_q so mistakes are caught before saving. */
function conditionError(c: DraftCondition): string | null {
  const v = c.value.trim();
  if (!v) return "Enter a value.";
  if (c.operator === "includes" && c.field !== "category") return "“Includes” only applies to User Interest Category.";
  if (c.field === "category") return c.operator === "includes" || c.operator === "=" ? null : "Use “Includes” or “Equals” with the interest category.";
  const n = Number(v);
  if (!Number.isFinite(n)) return `“${v}” isn't a number.`;
  if (n < 0) return "Use a positive number.";
  if (c.field !== "total_spent" && !Number.isInteger(n)) return "Use a whole number.";
  return null;
}

/** Create / edit dialog from the Settings design, wired to crm/tag-rules. */
export function RuleEditorModal({ rule, onClose }: { rule: TagRule | null; onClose: () => void }) {
  const isNew = rule === null;
  const ids = useId();

  const [name, setName] = useState(rule?.name ?? "");
  const [tag, setTag] = useState(rule?.tag ?? "");
  const [conditions, setConditions] = useState<DraftCondition[]>(() =>
    rule?.conditions.length
      ? rule.conditions.map((c) => ({ key: newKey(), field: c.field, operator: c.operator, value: c.value }))
      : [{ key: newKey(), field: "total_spent", operator: ">", value: "" }],
  );
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const choices = useQuery({ queryKey: settingsKeys.ruleChoices, queryFn: settingsApi.tagRules.choices, staleTime: Infinity });
  const fieldLabel = (v: RuleField) => choices.data?.fields.find((f) => f.value === v)?.label ?? v;
  const operatorLabel = (v: RuleOperator) => choices.data?.operators.find((o) => o.value === v)?.label ?? v;

  const save = useApiMutation(
    (data: TagRuleInput) => (rule ? settingsApi.tagRules.update(rule.id, data) : settingsApi.tagRules.create(data)),
    {
      invalidate: [settingsKeys.tagRules],
      success: (r) => `Rule “${r.name}” saved — it now matches ${r.last_matched.toLocaleString()} customer${r.last_matched === 1 ? "" : "s"}`,
      onSuccess: onClose,
      onError: (e) => setApiError(errorText(e)),
    },
  );

  const update = (key: number, patch: Partial<DraftCondition>) =>
    setConditions((cs) =>
      cs.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, ...patch };
        if (patch.field && !operatorsFor(next.field).includes(next.operator)) next.operator = operatorsFor(next.field)[0];
        if (patch.field && (patch.field === "category") !== (c.field === "category")) next.value = "";
        return next;
      }),
    );

  const nameError = !name.trim() ? "Enter a rule name." : null;
  const tagError = !tag.trim() ? "Enter the tag to assign." : null;
  const condErrors = conditions.map(conditionError);
  const invalid = Boolean(nameError || tagError || condErrors.some(Boolean));

  const submit = () => {
    setSubmitted(true);
    setApiError(null);
    if (invalid) return;
    save.mutate({
      name: name.trim(),
      tag: tag.trim(),
      enabled: rule?.enabled ?? true,
      conditions: conditions.map(({ field, operator, value }) => ({ field, operator, value: value.trim() })),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title={<span className="text-xl">{isNew ? "Create New Rule" : "Edit Rule"}</span>}
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
          >
            Cancel
          </button>
          <Button className="px-6" loading={save.isPending} disabled={!choices.data} onClick={submit}>
            {!save.isPending && <Save className="size-4" />}
            Save Rule
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor={`${ids}-name`} className="block text-sm font-semibold text-gray-700 mb-2">
            Rule Name
          </label>
          <input
            id={`${ids}-name`}
            type="text"
            value={name}
            maxLength={120}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VIP Customers"
            aria-invalid={submitted && Boolean(nameError)}
            className={cn(input, submitted && nameError && "border-red-400")}
          />
          {submitted && nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-semibold text-gray-700">Conditions</span>
            <button
              type="button"
              onClick={() => setConditions((cs) => [...cs, { key: newKey(), field: "total_orders", operator: ">", value: "" }])}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add Condition
            </button>
          </div>
          {choices.isLoading ? (
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : choices.isError ? (
            <p className="text-sm text-red-600" role="alert">
              Couldn&apos;t load the rule fields. {errorText(choices.error)}{" "}
              <button type="button" className="underline font-medium" onClick={() => choices.refetch()}>
                Retry
              </button>
            </p>
          ) : (
            <div className="space-y-3">
              {conditions.map((c, index) => {
                const err = submitted ? condErrors[index] : null;
                const label = `Condition ${index + 1}`;
                return (
                  <div key={c.key}>
                    <div className="flex gap-2 items-start">
                      {index > 0 && <span className="text-sm font-semibold text-gray-700 pt-2">AND</span>}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          aria-label={`${label} field`}
                          value={c.field}
                          onChange={(e) => update(c.key, { field: e.target.value as RuleField })}
                          className={control}
                        >
                          {choices.data?.fields.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`${label} operator`}
                          value={c.operator}
                          onChange={(e) => update(c.key, { operator: e.target.value as RuleOperator })}
                          className={control}
                        >
                          {operatorsFor(c.field).map((op) => (
                            <option key={op} value={op}>
                              {operatorLabel(op)}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${label} value (${fieldLabel(c.field)})`}
                          type={c.field === "category" ? "text" : "number"}
                          inputMode={c.field === "category" ? "text" : "numeric"}
                          min={0}
                          step={c.field === "total_spent" ? "any" : 1}
                          maxLength={80}
                          value={c.value}
                          placeholder={PLACEHOLDERS[c.field]}
                          aria-invalid={Boolean(err)}
                          onChange={(e) => update(c.key, { value: e.target.value })}
                          className={cn(control, err && "border-red-400")}
                        />
                      </div>
                      {conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setConditions((cs) => cs.filter((x) => x.key !== c.key))}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          aria-label={`Remove ${label.toLowerCase()}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    {err && <p className={cn("text-xs text-red-600 mt-1", index > 0 && "ml-11")}>{err}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label htmlFor={`${ids}-tag`} className="block text-sm font-semibold text-gray-700 mb-2">
            Tag to Assign
          </label>
          <input
            id={`${ids}-tag`}
            type="text"
            value={tag}
            maxLength={60}
            onChange={(e) => setTag(e.target.value)}
            aria-invalid={submitted && Boolean(tagError)}
            className={cn(input, submitted && tagError && "border-red-400")}
            placeholder="e.g., VIP, high_value, at_risk"
          />
          {submitted && tagError ? (
            <p className="text-xs text-red-600 mt-1">{tagError}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Saving runs the rule immediately: matching customers get this tag, others lose it.
            </p>
          )}
        </div>

        {apiError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            {apiError}
          </div>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
