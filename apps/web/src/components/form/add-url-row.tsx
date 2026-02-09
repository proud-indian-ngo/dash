import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { useState } from "react";
import z from "zod";

interface AddUrlRowProps {
  onAdd: (url: string) => boolean;
}

export function AddUrlRow({ onAdd }: AddUrlRowProps) {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const validate = (value: string): string | null => {
    if (!value.trim()) {
      return null;
    }

    const result = z
      .string()
      .url("Must be a valid URL")
      .safeParse(value.trim());
    return result.success
      ? null
      : (result.error.issues[0]?.message ?? "Invalid URL");
  };

  const tryAdd = () => {
    const error = validate(urlInput);
    if (error) {
      setUrlError(error);
      setTouched(true);
      return;
    }

    if (onAdd(urlInput)) {
      setUrlInput("");
      setUrlError(null);
      setTouched(false);
    }
  };

  const isDisabled = !urlInput.trim() || urlError !== null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          aria-describedby={urlError !== null ? "add-url-error" : undefined}
          aria-invalid={urlError !== null}
          className="flex-1"
          onBlur={() => {
            setTouched(true);
            setUrlError(validate(urlInput));
          }}
          onChange={(event) => {
            setUrlInput(event.target.value);
            if (touched) {
              setUrlError(validate(event.target.value));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              tryAdd();
            }
          }}
          placeholder="Paste URL and press Enter"
          value={urlInput}
        />
        <Button
          disabled={isDisabled}
          onClick={tryAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          Add
        </Button>
      </div>
      {urlError && (
        <p className="text-destructive text-xs" id="add-url-error">
          {urlError}
        </p>
      )}
    </div>
  );
}
