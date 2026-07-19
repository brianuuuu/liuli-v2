export type NewsTab = "all" | "important" | "announcement" | "stock";
export type AlertTab = "all" | "unread" | "handled";

export function newsQueryForTab(tab: NewsTab): Record<string, string | boolean> {
  switch (tab) {
    case "important":
      return { important_only: true };
    case "announcement":
      return { source_type: "announcement" };
    case "stock":
      return { source_name: "东方财富" };
    default:
      return {};
  }
}

export function alertMatchesTab(tab: AlertTab, event: { status: string }): boolean {
  if (tab === "all") return true;
  return event.status === tab;
}
