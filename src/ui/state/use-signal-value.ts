import { useSyncExternalStore } from "react";
import type { ReadonlySignal } from "@preact/signals-react";

export const useSignalValue = <T,>(sig: ReadonlySignal<T>): T =>
  useSyncExternalStore(
    (onStoreChange) => sig.subscribe(onStoreChange),
    () => sig.value,
    () => sig.value
  );
