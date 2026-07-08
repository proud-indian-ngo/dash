import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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
      : (result.error.issues[0]?.message ?? "Must be a valid URL");
  };

  const tryAdd = useEventCallback(() => {
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
  });

  const isDisabled = !urlInput.trim() || urlError !== null;
  const stableOnBlur0 = useEventCallback(() => {
    setTouched(true);
    setUrlError(validate(urlInput));
  });
  const stableOnChange1 = useEventCallback(
    (event: { target: { value: string } }) => {
      setUrlInput(event.target.value);
      if (touched) {
        setUrlError(validate(event.target.value));
      }
    }
  );
  const stableOnKeyDown2 = useEventCallback(
    (event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Enter") {
        event.preventDefault();
        tryAdd();
      }
    }
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          aria-describedby={urlError === null ? undefined : "add-url-error"}
          aria-invalid={urlError !== null}
          aria-label="Attachment URL"
          className="flex-1"
          onBlur={stableOnBlur0}
          onChange={stableOnChange1}
          onKeyDown={stableOnKeyDown2}
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
      {Boolean(urlError) && (
        <p className="text-destructive text-xs" id="add-url-error">
          {urlError}
        </p>
      )}
    </div>
  );
}
