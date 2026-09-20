"""赛道六维量化评分：分数、综合分、评级、热度档位的唯一口径。

六个维度都是 0—10，综合分取六项算术平均，评级由综合分分档，热度档位单独由
市场热度分档。三个派生值在入库时算好写进快照列，看板排序走 SQL，Web 和 H5 直接读列
渲染角标，不各自实现一遍映射；改阈值只改这个文件，再对历史快照重算一次。

**六个维度一律"分高 = 更有利"**，否则算术平均没有意义。两个容易读反的维度：

- `cycle_resilience_score` 存的是穿越周期的能力，不是周期振幅：10 = 需求稳定、弱周期，
  0 = 强周期、大起大落。字面理解成"周期性越强分越高"会把强周期赛道推上 S 级。
- `concentration_score` 10 = 格局收敛、龙头有定价权，0 = 高度分散、同质化内卷。
"""

from collections.abc import Mapping

TRACK_SCORE_FIELDS = (
    "market_heat_score",
    "growth_speed_score",
    "concentration_score",
    "cycle_resilience_score",
    "current_market_size_score",
    "future_market_size_score",
)

TRACK_SCORE_LABELS = {
    "market_heat_score": "市场热度",
    "growth_speed_score": "发展速度",
    "concentration_score": "行业集中度",
    "cycle_resilience_score": "周期韧性",
    "current_market_size_score": "当前市场规模",
    "future_market_size_score": "远期市场规模",
}

SCORE_MIN = 0.0
SCORE_MAX = 10.0

# 综合分分档。六维里含集中度、周期韧性这类很难给到 9 分的维度，沿用个股 ≥9 才 S 的口径
# 会让 S 级几乎不存在，整体比个股低一档。
GRADE_THRESHOLDS: tuple[tuple[float, str], ...] = (
    (8.0, "S"),
    (7.0, "A"),
    (6.0, "B"),
    (5.0, "C"),
)
GRADE_FALLBACK = "D"
TRACK_GRADES = ("S", "A", "B", "C", "D")
# 看板排序用：S 最前。同级内再按综合分细排，所以这里只解决分档。
GRADE_ORDER = {grade: index for index, grade in enumerate(TRACK_GRADES)}

# 市场热度单独出一个档位：T0 最热，与 A 股"T0 龙头"的习惯一致。
HEAT_TIER_THRESHOLDS: tuple[tuple[float, str], ...] = (
    (9.0, "T0"),
    (7.0, "T1"),
    (5.0, "T2"),
    (3.0, "T3"),
)
HEAT_TIER_FALLBACK = "T4"
HEAT_TIERS = ("T0", "T1", "T2", "T3", "T4")
HEAT_TIER_ORDER = {tier: index for index, tier in enumerate(HEAT_TIERS)}


def clamp_score(value: float) -> float:
    """越界分数夹到 0—10 而不是抛错：校验在 schema 层做，这里只保证算法不被脏数据带偏。"""
    return min(SCORE_MAX, max(SCORE_MIN, round(float(value), 2)))


def compute_overall_score(scores: Mapping[str, float]) -> float:
    """六项算术平均。六项等权，没有权重表——权重一旦引入就得有人维护和解释。"""
    total = sum(clamp_score(scores[field]) for field in TRACK_SCORE_FIELDS)
    return round(total / len(TRACK_SCORE_FIELDS), 2)


def _bucket(value: float, thresholds: tuple[tuple[float, str], ...], fallback: str) -> str:
    for floor, label in thresholds:
        if value >= floor:
            return label
    return fallback


def grade_for_score(overall_score: float) -> str:
    return _bucket(clamp_score(overall_score), GRADE_THRESHOLDS, GRADE_FALLBACK)


def heat_tier_for_score(market_heat_score: float) -> str:
    return _bucket(clamp_score(market_heat_score), HEAT_TIER_THRESHOLDS, HEAT_TIER_FALLBACK)


def derive_track_scores(scores: Mapping[str, float]) -> dict:
    """由六个分数派生三个落库字段。写快照的路径全部走这里，保证列之间永远自洽。"""
    overall = compute_overall_score(scores)
    return {
        "overall_score": overall,
        "track_grade": grade_for_score(overall),
        "heat_tier": heat_tier_for_score(scores["market_heat_score"]),
    }
