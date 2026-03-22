import type React from "react";
import {
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  useCallback,
  useRef,
  useState,
} from "react";

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface FileWithPreview {
  file: File | FileMetadata;
  id: string;
  preview?: string;
}

export interface FileUploadOptions {
  accept?: string;
  initialFiles?: FileMetadata[];
  maxFiles?: number; // Only used when multiple is true, defaults to Infinity
  maxSize?: number; // in bytes
  multiple?: boolean; // Defaults to false
  onError?: (errors: string[]) => void;
  onFilesAdded?: (addedFiles: FileWithPreview[]) => void; // Callback when new files are added
  onFilesChange?: (files: FileWithPreview[]) => void; // Callback when files change
}

export interface FileUploadState {
  errors: string[];
  files: FileWithPreview[];
  isDragging: boolean;
}

export interface FileUploadActions {
  addFiles: (files: FileList | File[]) => void;
  clearErrors: () => void;
  clearFiles: () => void;
  getInputProps: (
    props?: InputHTMLAttributes<HTMLInputElement>
  ) => InputHTMLAttributes<HTMLInputElement> & {
    ref: React.Ref<HTMLInputElement>;
  };
  handleDragEnter: (e: DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>) => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  openFileDialog: () => void;
  removeFile: (id: string) => void;
}

const getFileExtension = (file: File | FileMetadata): string => {
  const extension = file.name.split(".").pop() ?? "";
  return `.${extension}`;
};

const isAcceptedFileType = (
  acceptedTypes: string[],
  fileType: string,
  fileExtension: string
): boolean => {
  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith(".")) {
      return fileExtension.toLowerCase() === acceptedType.toLowerCase();
    }

    if (acceptedType.endsWith("/*")) {
      const baseType = acceptedType.split("/")[0];
      return fileType.startsWith(`${baseType}/`);
    }

    return fileType === acceptedType;
  });
};

const isDuplicateFile = (
  existingFiles: FileWithPreview[],
  candidateFile: File
): boolean => {
  return existingFiles.some((existingFile) => {
    const file = existingFile.file;
    if (!(file instanceof File)) {
      return false;
    }

    return file.name === candidateFile.name && file.size === candidateFile.size;
  });
};

const getMaxSizeError = (maxSize: number, multiple: boolean): string => {
  const maxSizeText = formatBytes(maxSize);
  if (multiple) {
    return `Some files exceed the maximum size of ${maxSizeText}.`;
  }

  return `File exceeds the maximum size of ${maxSizeText}.`;
};

const prepareFilesForUpload = ({
  incomingFiles,
  existingFiles,
  multiple,
  maxSize,
  validateFile,
  createPreview,
  generateUniqueId,
}: {
  incomingFiles: File[];
  existingFiles: FileWithPreview[];
  multiple: boolean;
  maxSize: number;
  validateFile: (file: File | FileMetadata) => string | null;
  createPreview: (file: File | FileMetadata) => string | undefined;
  generateUniqueId: (file: File | FileMetadata) => string;
}): { errors: string[]; validFiles: FileWithPreview[] } => {
  const errors: string[] = [];
  const validFiles: FileWithPreview[] = [];

  for (const file of incomingFiles) {
    if (multiple && isDuplicateFile(existingFiles, file)) {
      continue;
    }

    if (file.size > maxSize) {
      errors.push(getMaxSizeError(maxSize, multiple));
      continue;
    }

    const error = validateFile(file);
    if (error) {
      errors.push(error);
      continue;
    }

    validFiles.push({
      file,
      id: generateUniqueId(file),
      preview: createPreview(file),
    });
  }

  return { errors, validFiles };
};

export const useFileUpload = (
  options: FileUploadOptions = {}
): [FileUploadState, FileUploadActions] => {
  const {
    maxFiles = Number.POSITIVE_INFINITY,
    maxSize = Number.POSITIVE_INFINITY,
    accept = "*",
    multiple = false,
    initialFiles = [],
    onFilesChange,
    onFilesAdded,
    onError,
  } = options;

  const [state, setState] = useState<FileUploadState>({
    files: initialFiles.map((file) => ({
      file,
      id: file.id,
      preview: file.url,
    })),
    isDragging: false,
    errors: [],
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File | FileMetadata): string | null => {
      if (accept !== "*") {
        const acceptedTypes = accept.split(",").map((type) => type.trim());
        const fileType = file.type;
        const fileExtension = getFileExtension(file);
        const isAccepted = isAcceptedFileType(
          acceptedTypes,
          fileType,
          fileExtension
        );

        if (!isAccepted) {
          return `File "${file.name}" is not an accepted file type.`;
        }
      }

      return null;
    },
    [accept]
  );

  const createPreview = useCallback(
    (file: File | FileMetadata): string | undefined => {
      if (file instanceof File) {
        return URL.createObjectURL(file);
      }
      return file.url;
    },
    []
  );

  const generateUniqueId = useCallback((file: File | FileMetadata): string => {
    if (file instanceof File) {
      return `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return file.id;
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => {
      // Clean up object URLs
      for (const file of prev.files) {
        if (file.preview && file.file instanceof File) {
          URL.revokeObjectURL(file.preview);
        }
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      const newState = {
        ...prev,
        files: [],
        errors: [],
      };

      onFilesChange?.(newState.files);
      return newState;
    });
  }, [onFilesChange]);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      if (!newFiles || newFiles.length === 0) {
        return;
      }

      const newFilesArray = Array.from(newFiles);

      // In single file mode, clear existing files first
      if (!multiple) {
        clearFiles();
      }

      setState((prev) => {
        // Check if adding these files would exceed maxFiles (only in multiple mode)
        if (
          multiple &&
          maxFiles !== Number.POSITIVE_INFINITY &&
          prev.files.length + newFilesArray.length > maxFiles
        ) {
          const errors = [
            `You can only upload a maximum of ${maxFiles} files.`,
          ];
          onError?.(errors);
          return { ...prev, errors };
        }

        const { errors, validFiles } = prepareFilesForUpload({
          incomingFiles: newFilesArray,
          existingFiles: prev.files,
          multiple,
          maxSize,
          validateFile,
          createPreview,
          generateUniqueId,
        });

        // Only update state if we have valid files to add
        if (validFiles.length > 0) {
          onFilesAdded?.(validFiles);

          const updatedFiles = multiple
            ? [...prev.files, ...validFiles]
            : validFiles;
          onFilesChange?.(updatedFiles);
          return {
            ...prev,
            files: updatedFiles,
            errors,
          };
        }

        if (errors.length > 0) {
          onError?.(errors);
          return { ...prev, errors };
        }

        return { ...prev, errors: [] };
      });

      // Reset input value after handling files
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [
      maxFiles,
      multiple,
      maxSize,
      validateFile,
      createPreview,
      generateUniqueId,
      clearFiles,
      onFilesChange,
      onFilesAdded,
      onError,
    ]
  );

  const removeFile = useCallback(
    (id: string) => {
      setState((prev) => {
        const fileToRemove = prev.files.find((file) => file.id === id);
        if (fileToRemove?.preview && fileToRemove.file instanceof File) {
          URL.revokeObjectURL(fileToRemove.preview);
        }

        const newFiles = prev.files.filter((file) => file.id !== id);
        onFilesChange?.(newFiles);

        return {
          ...prev,
          files: newFiles,
          errors: [],
        };
      });
    },
    [onFilesChange]
  );

  const clearErrors = useCallback(() => {
    setState((prev) => ({
      ...prev,
      errors: [],
    }));
  }, []);

  const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => ({ ...prev, isDragging: true }));
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }

    setState((prev) => ({ ...prev, isDragging: false }));
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setState((prev) => ({ ...prev, isDragging: false }));

      // Don't process files if the input is disabled
      if (inputRef.current?.disabled) {
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // In single file mode, only use the first file
        if (multiple) {
          addFiles(e.dataTransfer.files);
        } else {
          const file = e.dataTransfer.files[0];
          if (file) {
            addFiles([file]);
          }
        }
      }
    },
    [addFiles, multiple]
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
    },
    [addFiles]
  );

  const openFileDialog = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  }, []);

  const getInputProps = useCallback(
    (props: InputHTMLAttributes<HTMLInputElement> = {}) => {
      return {
        ...props,
        type: "file" as const,
        onChange: handleFileChange,
        accept: props.accept || accept,
        multiple: props.multiple === undefined ? multiple : props.multiple,
        ref: inputRef,
      };
    },
    [accept, multiple, handleFileChange]
  );

  return [
    state,
    {
      addFiles,
      removeFile,
      clearFiles,
      clearErrors,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      handleFileChange,
      openFileDialog,
      getInputProps,
    },
  ];
};

// Helper function to format bytes to human-readable format
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    Number.parseFloat((bytes / k ** i).toFixed(dm)) + (sizes[i] ?? "Bytes")
  );
};
