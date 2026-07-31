# 组合当日盈亏净资产口径设计

## 目标

将组合层“今日盈亏”和“今日涨跌幅”从逐个持仓按昨收汇总，调整为基于组合净资产变化的计算。新口径需要覆盖现金校准、调仓、卖出、分红、利息和费用等系统不保存明细的内部变化，同时只剔除明确的外部入金与出金。

本次修改组合汇总和组合市值快照中的当日表现，不改变个股卡片、标的组合和热力图中的个股涨跌计算。

## 当前问题

当前组合汇总使用每个持仓的 `quantity * (current_price - previous_close)` 作为 `day_pnl`，再将各持仓相加。该算法只有在持仓数量全天不变且没有现金收益、费用和外部资金变化时才近似正确。

系统实际只维护当前股数和现金余额，不记录完整的买卖成交、分红、税费和手续费流水。现金校准承载这些操作的综合结果，因此不能把现金校准当作外部资金流剔除。

## 计算口径

单组合当前总资产：

```text
current_total = current_position_market_value + current_cash
```

当日净外部资金流：

```text
net_external_flow = today_deposit - today_withdraw
```

组合当日盈亏：

```text
day_pnl = current_total - previous_total - net_external_flow
```

组合当日涨跌幅：

```text
adjusted_base = previous_total + net_external_flow
day_pct = day_pnl / adjusted_base * 100
```

当 `adjusted_base <= 0` 时，`day_pct` 返回 `null`。

`previous_total` 取当前日期之前最近一份 `portfolio_value_snapshot.total_value`。它代表上一有效资产日，不要求自然日连续，因此周末和节假日自动使用更早的最近快照。

## 资金流水分类

只有以下流水属于外部资金流：

- `deposit`：正向外部资金流，从当前总资产变化中扣除。
- `withdraw`：负向外部资金流，在公式中加回。

以下流水不作为外部资金流：

- `adjustment`：现金校准，包含买卖、分红、费用等未拆分操作的综合现金结果。
- `dividend`：组合内部投资收益。
- `interest`：组合内部投资收益。

上述三类变化继续通过当前现金余额进入组合净资产，从而自然影响当日盈亏。

## 新组合与缺失基准

新组合在上海时区的当天创建且不存在历史快照时：

- 直接录入的持仓和现金视为初始本金。
- `day_pnl` 返回 `0.0`。
- `day_pct` 返回 `null`，因为没有有效的上一日收益率分母。

创建日期早于今天但不存在历史快照的组合属于基准缺失：

- `day_pnl` 返回 `null`。
- `day_pct` 返回 `null`。
- 不回退到逐个持仓涨跌估算。

这一区分避免新组合首日产生虚假盈利，也避免历史数据不完整的老组合展示不可靠结果。

## 多组合汇总

全组合概览逐组合计算当前总资产、历史基准和当日外部资金流：

- 新组合首日视为有效盈亏结果，贡献 `0.0` 盈亏，但将全组合涨跌幅标记为不可计算，避免从收益率分母中忽略这部分初始本金。
- 有历史基准的组合贡献自身 `day_pnl` 和 `adjusted_base`。
- 任一老组合缺失历史基准时，全组合 `day_pnl` 和 `day_pct` 都返回 `null`，不展示部分组合结果。
- 所有组合均有历史基准且 `adjusted_base` 合计大于零时，全组合 `day_pct = total_day_pnl / total_adjusted_base * 100`；包含新组合首日或分母不大于零时返回 `null`。
- 没有任何组合时保持 `day_pnl = 0.0`、`day_pct = null`。

## 服务边界

在 `invest_assistant/modules/portfolio/service.py` 内新增聚焦的组合当日表现计算单元，输入组合 ID、当前总资产和目标日期，输出可空的 `day_pnl`、`day_pct` 及计算状态。

`get_dashboard()` 使用该单元替换组合级汇总中的 `day_pnl` 和 `day_pct`，保证 Web 单组合页面使用新口径；持仓行仍保留价格涨跌口径。`get_overview()` 负责逐组合调用该单元并聚合结果。`upsert_value_snapshot()` 复用 `get_dashboard()` 的结果写入快照，避免单组合页面、组合概览和历史快照继续采用不同口径。

现有 `_position_dict()`、`_summary()` 和 `_allocation_rows()` 继续计算个股价格表现，供持仓表格、标的组合和热力图使用；它们的个股 `day_pnl`、`day_pct` 不再作为组合层汇总来源。

## 接口兼容性

继续使用现有接口和字段：

- `GET /api/portfolios/overview`
- `summary.day_pnl`
- `summary.day_pct`
- `portfolio_value_snapshot.day_pnl`
- `portfolio_value_snapshot.day_pct`

由于老组合缺失基准时 `summary.day_pnl` 可以为 `null`，Web 和 Android H5 的 TypeScript 类型需要允许空值。现有界面已经具备空值格式化能力，应显示 `--`，不新增文案或交互。

不修改数据库表结构、路由路径、现金流水写入结构或 Android/Web 技术栈。

## 测试

测试覆盖以下场景：

- 静态持仓按当前总资产与上一快照计算组合盈亏，而不是汇总个股昨收涨跌。
- 买入、卖出通过股数变化和现金校准反映时，总资产不变则组合盈亏为零。
- 分红、利息和费用造成的现金变化进入组合盈亏。
- 当日入金被扣除、当日出金被加回。
- `adjustment` 不作为外部资金流扣除。
- 新组合首日直接录入持仓时 `day_pnl = 0.0`、`day_pct = null`。
- 老组合缺少历史快照时两项结果均为 `null`。
- 全组合包含缺失基准的老组合时不返回部分盈亏。
- 周末或节假日使用今天之前最近的快照。
- 个股 `day_pct` 仍按现价与昨收计算。
- 快照写入和组合概览返回相同口径。

验证范围包括组合模块定向测试、相关工作台测试、Python 静态检查、Web 与 Android H5 TypeScript 检查和 `git diff --check`。任何会创建或修改测试数据库的命令，都必须按项目约束另行获得明确许可；不访问或修改 `var/db/liuli.sqlite3`。

## 非目标

- 不新增买卖成交、手续费、税费或分红明细模型。
- 不修改现金校准现有语义。
- 不为新组合增加“初始化完成”操作。
- 不追溯重算已有历史快照。
- 不修改年度盈亏和组合复盘收益率口径。
