import { createContext } from "react";

// Pauses camera ownership without discarding the selected station or captured attempt.
export const ScanCaptureContext = createContext(true);
