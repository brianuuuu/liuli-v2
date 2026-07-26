export type PagerMotion = {
  fromIndex: number;
  toIndex: number;
  progress: number;
  duration?: number;
};

export type PagerMotionSink = {
  setMotion: (motion: PagerMotion | null) => void;
};
