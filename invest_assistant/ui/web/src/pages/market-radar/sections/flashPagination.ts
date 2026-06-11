export const FLASH_PAGE_SIZE = 100;

export type FlashScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

export function shouldLoadNextFlashPage(metrics: FlashScrollMetrics, threshold = 48) {
  return metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - threshold;
}
