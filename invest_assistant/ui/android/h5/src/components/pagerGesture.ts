export type PagerRelease = {
  deltaX: number;
  deltaY: number;
  velocityX: number;
  viewportWidth: number;
};

const AXIS_DOMINANCE_RATIO = 1.25;
const DISTANCE_FRACTION = 0.22;
const MIN_FLING_DISTANCE = 24;
const FLING_VELOCITY = 700;
const PROJECTION_SECONDS = 0.18;

export function resolvePagerTarget(
  currentIndex: number,
  itemCount: number,
  release: PagerRelease
) {
  const { deltaX, deltaY, velocityX } = release;
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * AXIS_DOMINANCE_RATIO;
  if (!horizontal) return currentIndex;

  const directionMatches = velocityX === 0 || Math.sign(velocityX) === Math.sign(deltaX);
  const distanceCommit = Math.abs(deltaX) >= release.viewportWidth * DISTANCE_FRACTION;
  const velocityCommit = Math.abs(deltaX) >= MIN_FLING_DISTANCE
    && directionMatches
    && Math.abs(velocityX) >= FLING_VELOCITY;
  if (!distanceCommit && !velocityCommit) return currentIndex;

  const projectedX = deltaX + (directionMatches ? velocityX * PROJECTION_SECONDS : 0);
  const direction = projectedX < 0 ? 1 : -1;
  return Math.max(0, Math.min(itemCount - 1, currentIndex + direction));
}
