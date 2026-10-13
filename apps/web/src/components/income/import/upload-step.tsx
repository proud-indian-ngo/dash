import { CloudUploadIcon, FileImportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { GENERAL_FUND_ID, PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { CONTRIBUTION_CHANNEL_LABELS } from "@pi-dash/shared/income";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import z from "zod";

import { ComboboxField } from "@/components/form/combobox-field";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { useApp } from "@/context/app-context";
import { createContributionImport } from "@/functions/income-import";
import {
  AVAILABLE_IMPORT_SOURCES,
  defaultGiveDoAccount,
  GIVE_DO_HEADERS,
  IMPORT_CHANNEL_VALUES,
  IMPORT_SOURCE_LABELS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  sourceRules,
} from "@/lib/income-import/fields";
import { CsvParseError, parseCsv } from "@/lib/income-import/parse-csv";

import type { WizardBatch } from "./wizard-types";

const pick = (message: string) =>
  z
    .string()
    .optional()
    .refine((value) => Boolean(value), message);

const formSchema = z.object({
  defaultChannel: z.enum(IMPORT_CHANNEL_VALUES),
  fundId: pick("Pick a fund"),
  orgAccountId: pick("Pick the account the money was deposited into"),
  programmeId: z.string().optional(),
  projectId: z.string().optional(),
  source: z.enum(AVAILABLE_IMPORT_SOURCES),
});

type FormValues = z.input<typeof formSchema>;

const sourceOptions = AVAILABLE_IMPORT_SOURCES.map((value) => ({
  label: IMPORT_SOURCE_LABELS[value],
  value,
}));
const channelOptions = IMPORT_CHANNEL_VALUES.map((value) => ({
  label: CONTRIBUTION_CHANNEL_LABELS[value],
  value,
}));

function FileDrop({
  error,
  file,
  onFile,
}: {
  error: string | null;
  file: File | null;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const handleDrop = useEventCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      onFile(dropped);
    }
  });
  const handleChange = useEventCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const chosen = event.target.files?.[0];
      if (chosen) {
        onFile(chosen);
      }
      event.target.value = "";
    }
  );
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">CSV file</span>
      <button
        aria-label={
          file
            ? `CSV file ${file.name}; choose another`
            : "Drop a CSV file here or click to choose one"
        }
        className={cn(
          "hover:bg-muted/50 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          dragging && "border-primary bg-muted/50",
          error && "border-destructive"
        )}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={handleDrop}
        type="button"
      >
        <HugeiconsIcon
          className="text-muted-foreground size-6"
          icon={file ? FileImportIcon : CloudUploadIcon}
          strokeWidth={1.75}
        />
        {file ? (
          <span className="text-sm font-medium">{file.name}</span>
        ) : (
          <span className="text-sm">
            Drop a CSV file here, or{" "}
            <span className="text-primary font-medium">choose one</span>
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          Up to 5 MB and {MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows. Save
          Excel sheets as CSV first.
        </span>
      </button>
      <input
        accept=".csv,text/csv"
        className="sr-only"
        data-testid="import-file-input"
        onChange={handleChange}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FileNeeds({ source }: { source: FormValues["source"] }) {
  if (source === "give_do_csv") {
    return (
      <div className="bg-muted/40 rounded-lg p-4 text-sm">
        <p className="font-medium">What the file needs</p>
        <p className="text-muted-foreground mt-1">
          The donations export from the give.do dashboard, unchanged. Its
          columns are matched for you: {GIVE_DO_HEADERS.join(", ")}. Gifts in a
          currency other than INR are not imported.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-muted/40 rounded-lg p-4 text-sm">
      <p className="font-medium">What the file needs</p>
      <p className="text-muted-foreground mt-1">
        One row per donation with a header row. Required: donor name, amount and
        the date it was received. Recommended: the donation or transaction ID
        (so uploading the same file twice never doubles a gift), PAN, email,
        phone and address. You match the columns in the next step.
      </p>
    </div>
  );
}

/** Step 1: where the money went and the file itself. Stores the upload as a draft batch. */
export function UploadStep({
  formId,
  onUploaded,
  onBusyChange,
}: {
  formId: string;
  onBusyChange: (busy: boolean) => void;
  onUploaded: (batch: WizardBatch) => void;
}) {
  const { hasPermission } = useApp();
  const upload = useServerFn(createContributionImport);
  const [accounts] = useQuery(queries.orgAccount.active());
  const [funds] = useQuery(queries.fund.active());
  const [programmes] = useQuery(queries.programme.active());
  const [projects] = useQuery(queries.project.all(), {
    enabled: hasPermission("finance.view"),
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const defaultFundId =
    funds.find((f) => f.id === GENERAL_FUND_ID)?.id ?? funds[0]?.id;

  const giveDoAccountId = defaultGiveDoAccount(accounts)?.id;

  // give.do is the usual source, so an upload starts as one.
  const form = useForm({
    defaultValues: {
      defaultChannel: "give_do",
      fundId: defaultFundId,
      orgAccountId: giveDoAccountId,
      source: "give_do_csv",
    } as FormValues,
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        if (fieldApi.name === "source") {
          const source = formApi.getFieldValue("source");
          const fixed = sourceRules(source).fixedChannel;
          if (fixed) {
            formApi.setFieldValue("defaultChannel", fixed);
          } else if (formApi.getFieldValue("defaultChannel") === "give_do") {
            formApi.setFieldValue("defaultChannel", "upi");
          }
          const giveDo = defaultGiveDoAccount(accounts);
          if (
            source === "give_do_csv" &&
            giveDo &&
            !formApi.getFieldValue("orgAccountId")
          ) {
            formApi.setFieldValue("orgAccountId", giveDo.id);
          }
        }
        if (fieldApi.name === "projectId") {
          const project = projects.find(
            (p) => p.id === formApi.getFieldValue("projectId")
          );
          if (project) {
            formApi.setFieldValue("programmeId", project.programmeId);
          }
        }
      },
    },
    onSubmit: async ({ value }) => {
      if (!file) {
        setFileError("Choose a CSV file");
        return;
      }
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setFileError("The file is larger than 5 MB; split it and try again.");
        return;
      }
      const text = await file.text();
      let parsed: ReturnType<typeof parseCsv>;
      try {
        parsed = parseCsv(text);
      } catch (error) {
        setFileError(
          error instanceof CsvParseError
            ? error.message
            : "The file could not be read."
        );
        return;
      }
      onBusyChange(true);
      try {
        const result = await upload({
          data: {
            csv: text,
            defaultChannel: value.defaultChannel,
            fileName: file.name,
            fundId: value.fundId ?? "",
            orgAccountId: value.orgAccountId ?? "",
            programmeId: value.programmeId ?? null,
            projectId: value.projectId ?? null,
            source: value.source,
          },
        });
        onUploaded({
          batchId: result.batchId,
          columns: parsed.headers.map((header) => ({
            header,
            samples: parsed.rows
              .map((row) => row[header] ?? "")
              .filter(Boolean)
              .slice(0, 3),
          })),
          dateFormat: null,
          defaultChannel: value.defaultChannel,
          earlierUpload: result.earlierUpload,
          fileName: file.name,
          mapping: result.mapping,
          rowCount: result.rowCount,
          source: value.source,
        });
      } catch (error) {
        setFileError(
          error instanceof Error ? error.message : "The upload failed."
        );
      } finally {
        onBusyChange(false);
      }
    },
    validators: { onSubmit: formSchema },
  });

  // Accounts can sync after the form mounts; fill the give.do account then.
  useEffect(() => {
    if (
      giveDoAccountId &&
      form.getFieldValue("source") === "give_do_csv" &&
      !form.getFieldValue("orgAccountId")
    ) {
      form.setFieldValue("orgAccountId", giveDoAccountId);
    }
  }, [form, giveDoAccountId]);

  const handleFile = useEventCallback((chosen: File) => {
    setFile(chosen);
    setFileError(null);
  });

  return (
    <FormLayout form={form} id={formId}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Source"
          name="source"
          options={sourceOptions}
        />
        <form.Subscribe selector={(state) => state.values.source}>
          {(source) => (
            <ComboboxField
              description={
                source === "give_do_csv" && !defaultGiveDoAccount(accounts) ? (
                  <>
                    No give.do clearing account yet. Add one of kind gateway
                    clearing named for give.do in{" "}
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      to="/settings/org-accounts"
                    >
                      Settings → Organisation accounts
                    </Link>
                    , or pick the account the money reached.
                  </>
                ) : undefined
              }
              emptyMessage="No active accounts. Add one in Settings → Organisation accounts."
              isRequired
              label="Deposited into"
              name="orgAccountId"
              options={accounts.map((a) => ({ label: a.name, value: a.id }))}
              placeholder="Search accounts..."
            />
          )}
        </form.Subscribe>
        {funds.length > 1 ? (
          <SelectField
            isRequired
            label="Fund"
            name="fundId"
            options={funds.map((f) => ({ label: f.name, value: f.id }))}
          />
        ) : null}
        <form.Subscribe selector={(state) => state.values.source}>
          {(source) =>
            sourceRules(source).fixedChannel ? null : (
              <SelectField
                description="Used for rows without a channel column."
                isRequired
                label="Channel"
                name="defaultChannel"
                options={channelOptions}
              />
            )
          }
        </form.Subscribe>
        <form.Subscribe selector={(state) => state.values.projectId}>
          {(projectId) => (
            <ComboboxField
              description={
                projectId
                  ? "Set by the project."
                  : "Optional; applies to every row."
              }
              disabled={Boolean(projectId)}
              label="Programme"
              name="programmeId"
              options={programmes
                .filter((p) => p.id !== PROGRAMME_IDS.unallocated)
                .map((p) => ({ label: p.name, value: p.id }))}
              placeholder="Search programmes..."
            />
          )}
        </form.Subscribe>
        {projects.length > 0 ? (
          <ComboboxField
            description="Optional; applies to every row."
            label="Project"
            name="projectId"
            options={projects
              .filter((p) => p.status !== "closed")
              .map((p) => ({ label: p.name, value: p.id }))}
            placeholder="Search projects..."
          />
        ) : null}
      </div>
      <FileDrop error={fileError} file={file} onFile={handleFile} />
      <form.Subscribe selector={(state) => state.values.source}>
        {(source) => <FileNeeds source={source} />}
      </form.Subscribe>
    </FormLayout>
  );
}
