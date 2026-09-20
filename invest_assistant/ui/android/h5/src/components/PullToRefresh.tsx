import { RefreshCw } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from "react";

const TRIGGER_DISTANCE = 64;
const MAX_DISTANCE = 88;
const AXIS_LOCK_DISTANCE = 8;
const VERTICAL_BIAS = 1.2;
const ERROR_DURATION = 1200;
// 和横滑一个约定：可点区域照样能起手，点还是拉交给轴锁判，
// 拉出来之后再把那一次误触的点击吃掉。只有自己要吃掉纵向拖拽的元素才退出。
const INTERACTIVE_TARGETS = "input, textarea, select, [contenteditable], [data-swipe-ignore=\"true\"]";

type PullStatus = "idle" | "pulling" | "ready" | "refreshing" | "error";
type GestureAxis = "pending" | "vertical" | "horizontal";

export type PullToRefreshProps = {
  children: ReactNode;
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
  ariaLabel?: string;
};

function isDocumentAtTop() {
  return window.scrollY <= 0
    && document.documentElement.scrollTop <= 0
    && document.body.scrollTop <= 0;
}

function isIgnoredTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_TARGETS));
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  ariaLabel = "下拉刷新"
}: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  const statusRef = useRef<PullStatus>("idle");
  const gestureRef = useRef({
    tracking: false,
    axis: "pending" as GestureAxis,
    startX: 0,
    startY: 0,
    deltaY: 0
  });
  const errorTimerRef = useRef<number | null>(null);
  // 只记手势起手落在哪个元素上：要吃掉的是这一次下拉自己带出来的那个点击，
  // 不是下拉之后用户另外点的任何东西，所以不能用时间窗一刀切。
  const pullStartTarget = useRef<Element | null>(null);
  const suppressClickFor = useRef<Element | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<PullStatus>("idle");
  const [distance, setDistance] = useState(0);

  onRefreshRef.current = onRefresh;
  disabledRef.current = disabled;
  statusRef.current = status;

  useEffect(() => {
    mountedRef.current = true;
    const root = rootRef.current;
    if (!root) return;

    const resetGesture = () => {
      gestureRef.current = {
        tracking: false,
        axis: "pending",
        startX: 0,
        startY: 0,
        deltaY: 0
      };
    };

    const settleToIdle = () => {
      statusRef.current = "idle";
      setStatus("idle");
      setDistance(0);
    };

    const refresh = async () => {
      statusRef.current = "refreshing";
      setStatus("refreshing");
      setDistance(40);
      try {
        await onRefreshRef.current();
        if (mountedRef.current) settleToIdle();
      } catch {
        if (!mountedRef.current) return;
        statusRef.current = "error";
        setStatus("error");
        setDistance(40);
        errorTimerRef.current = window.setTimeout(settleToIdle, ERROR_DURATION);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (
        disabledRef.current
        || statusRef.current !== "idle"
        || !isDocumentAtTop()
        || isIgnoredTarget(event.target)
        || event.touches.length !== 1
      ) {
        resetGesture();
        return;
      }
      const touch = event.touches[0];
      pullStartTarget.current = event.target instanceof Element ? event.target : null;
      suppressClickFor.current = null;
      gestureRef.current = {
        tracking: true,
        axis: "pending",
        startX: touch.clientX,
        startY: touch.clientY,
        deltaY: 0
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      gesture.deltaY = deltaY;

      if (gesture.axis === "pending") {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_DISTANCE) return;
        gesture.axis = deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX) * VERTICAL_BIAS
          ? "vertical"
          : "horizontal";
      }
      if (gesture.axis !== "vertical") return;

      event.preventDefault();
      suppressClickFor.current = pullStartTarget.current;
      const resistedDistance = Math.min(MAX_DISTANCE, Math.max(0, deltaY) * 0.55);
      setDistance(resistedDistance);
      const nextStatus: PullStatus = deltaY >= TRIGGER_DISTANCE ? "ready" : "pulling";
      statusRef.current = nextStatus;
      setStatus(nextStatus);
    };

    const onTouchEnd = () => {
      const gesture = gestureRef.current;
      const shouldRefresh = gesture.tracking
        && gesture.axis === "vertical"
        && gesture.deltaY >= TRIGGER_DISTANCE;
      resetGesture();
      if (shouldRefresh) {
        void refresh();
      } else if (statusRef.current === "pulling" || statusRef.current === "ready") {
        settleToIdle();
      }
    };

    const onTouchCancel = () => {
      resetGesture();
      if (statusRef.current === "pulling" || statusRef.current === "ready") settleToIdle();
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchCancel);
    return () => {
      mountedRef.current = false;
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
      if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  const message = status === "ready"
    ? "释放刷新"
    : status === "refreshing"
      ? "正在刷新"
      : status === "error"
        ? "刷新失败，请重试"
        : status === "pulling"
          ? "下拉刷新"
          : "";

  return (
    <div
      ref={rootRef}
      className={`pull-to-refresh pull-to-refresh--${status}`}
      onClickCapture={(event) => {
        const origin = suppressClickFor.current;
        suppressClickFor.current = null;
        if (!origin || !(event.target instanceof Node) || !event.target.contains(origin)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{ "--pull-distance": `${distance}px` } as CSSProperties}
      aria-label={ariaLabel}
    >
      <div className="pull-to-refresh__indicator" role="status" aria-live="polite">
        {status === "refreshing" ? <RefreshCw className="pull-to-refresh__spinner" size={15} /> : null}
        {message}
      </div>
      <div className="pull-to-refresh__content">{children}</div>
    </div>
  );
}
