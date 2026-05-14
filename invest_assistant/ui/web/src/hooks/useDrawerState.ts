import { useState } from "react";

export function useDrawerState<T>() {
  const [record, setRecord] = useState<T | null>(null);
  return {
    record,
    open: Boolean(record),
    show: setRecord,
    close: () => setRecord(null)
  };
}
