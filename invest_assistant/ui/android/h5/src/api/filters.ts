export type NewsTab = "all" | "sentiment" | "important" | "announcement" | "stock";

export function newsQueryForTab(tab: NewsTab): Record<string, string | boolean> {
  switch (tab) {
    case "sentiment":
      return { source_type: "sentiment" };
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
