# 富途 OpenAPI 接口可用性测试报告

> 文档定位：琉璃以后扩展港股时使用的资料准备。当前阶段只验证接口能否用、记录限制，**不涉及系统实现**。正式接入时，按 `docs/liuli_system_spec.md` 的模块边界另行设计。

- 测试日期：2026-10-12（周一，港股正常交易日，测试时已收盘）
- 测试标的：小米集团-W `HK.01810`（个别仅支持美股的接口用 `US.AAPL` 对照）
- 官方文档：<https://open.futunn.com/zh-cn/api/overview/>（LLM 索引：<https://open.futunn.com/zh-cn/llms.txt>）
- 测试范围：全部只读 REST 接口。下单、改单、撤单、修改自选这类写操作没有调用，WebSocket 推送和 MCP 也没有测。

## 1. 结论

| 分类 | 测试接口数 | 可用 | 说明 |
| --- | --- | --- | --- |
| 基础数据 | 10 | 10 | 经济日历「热门」当天返回空列表，换成「搜索」能取到数据 |
| 实时行情 | 6 | 6 | 买卖盘只返回 1 档，推测当前账号是港股 LV1 行情权限 |
| 资金流向 | 3 | 3 | |
| 板块 | 2 | 2 | |
| 衍生品（期权/期货） | 8 | 8 | 组合期权报价没测（需要先构造多腿合约） |
| 筛选 | 3 | 3 | |
| IPO | 3 | 3 | 港股、A 股、美股都有数据 |
| 自选 | 2 | 2 | 只测了读取，「修改自选」是写操作，没调用 |
| F10 深度数据 | 26 | 26 | 部分字段小米本身没有数据，见第 4 节 |
| 做空 | 2 | 2 | |
| 实盘交易（只读） | 8 | 8 | 账户里没有资金和持仓，所以返回值都是 0 或空列表 |
| 模拟交易（只读） | 6 | 6 | 订单、持仓等接口必须带 `market` 参数，文档没写清楚 |
| **合计** | **79** | **79** | |

**结论：现有 AppKey 的只读接口全部能用。** 唯一需要关注的权限限制是港股盘口深度（只有 1 档）。

接口响应耗时的中位数约 2.1 秒，最慢约 9.5 秒（港股行业板块列表）。这个速度不适合放在用户请求的同步链路里，应该由 Worker 定时拉取后落库。

## 2. 认证与调用方式

| 项 | 值 |
| --- | --- |
| HTTP Host | `https://webapi.futunn.com` |
| WebSocket 行情 / 交易 | `wss://webapi-quote.futunn.com/ws` / `wss://webapi-trade.futunn.com/ws` |
| 认证方式 | 传统 API Key：Ed25519 私钥签名（另一种是 OAuth 2.1 + PKCE，本次没用） |
| 本地凭证位置 | `var/secrets/futu_app_key`（AppKey ID）、`var/secrets/futu_private_key.pem`（私钥），这两个文件都已被 Git 忽略 |

每个请求都要带 4 个请求头：

| Header | 内容 |
| --- | --- |
| `X-Api-Key` | AppKey ID |
| `X-Timestamp` | 当前毫秒时间戳 |
| `X-Nonce` | 随机字符串，只能用字母、数字、`_`、`-`，长度 1–64 |
| `Authorization` | 签名的 Base64，不加 `Bearer` 前缀 |

签名原文由 5 段用 `\n` 连接，即使某段为空，换行符也要保留：

```text
{timestamp_ms}\n{HTTP_METHOD}\n{path}\n{query_string}\n{sha256_hex(body) 或空串}
```

注意事项：

- `query_string` 必须和实际发出的 URL 逐字节一致，包括参数顺序和编码方式。JSON body 要先序列化成字节，签名和发送都用同一份字节。
- 客户端和服务端的时钟偏差超过 5 秒会返回 `-12006`。不带签名的请求也返回 `-12006`。可以先调用 `GET /api/v1.0/server-time` 校准时钟（这个接口不需要签名）。
- 错误有两种形态：
  - HTTP 非 200，或返回体里 `code`、`s` 字段表示失败；
  - HTTP 200 且 `code=0`，但 `data.ret_code` 不为 0。这种「成功外壳里包着业务错误」的情况，判断成败时要同时检查两层。
- 不同接口组的返回结构不统一：行情类是 `{code, data}` 或 `{ret_code, data}`，实盘交易类是 `{s: "ok", d: ...}`。

## 3. 接口清单与用途

下表中「小米实测」一列是 2026-10-12 的真实返回摘要。`{symbol}` 表示证券代码，格式为 `市场.代码`。

### 3.1 基础数据

| 接口 | 方法 / 路径 | 用途 | 小米实测 |
| --- | --- | --- | --- |
| 交易日历 | `GET /quote/trading-days` | 查询某市场在某段时间内的交易日 | 10-02～10-12 共 7 个交易日（全天市） |
| 市场状态 | `POST /quote/market-state` | 当前交易状态和交易时段 | `CLOSED`，两个交易时段，全天 19800 秒 |
| 股票基本信息 | `POST /quote/stock-basicinfo` | 交易所、每手股数、上市日期、`stock_id` 等 | SEHK，每手 200 股，2018-07-09 上市 |
| 所属板块 | `GET /quote/{symbol}/owner-plate` | 个股所属的行业、概念、地区板块 | 23 个板块（含港股通、消费电子等） |
| 复权因子 | `GET /quote/{symbol}/corporate-actions/rehab` | 前后复权计算用的因子 | 空（小米没有分红和拆股） |
| 历史 K 线 | `GET /quote/{symbol}/history-kline` | 日 K、周 K、分钟 K，单次最多 370 根 | 9 月以来 29 根日 K，当天收 24.52（-5.55%），PE 13.7 |
| 资讯搜索 | `GET /quote/find-news` | 按关键词搜资讯、公告、研报 | 「小米集团」返回当天的回购公告等 5 条 |
| 社区搜索 | `GET /quote/find-community` | 搜索牛牛圈的讨论、话题、直播 | 5 条讨论 |
| 经济日历热门 | `GET /quote/economic-calendar/hot` | 某天的热门宏观事件 | 当天为空列表 |
| 经济日历搜索 | `GET /quote/economic-calendar/search` | 按关键词搜宏观数据、休市、经济事件、权息 | 「CPI」能取到数据；用「小米」搜权息为空 |

### 3.2 实时行情

| 接口 | 方法 / 路径 | 用途 | 小米实测 |
| --- | --- | --- | --- |
| 市场快照 | `POST /quote/snapshot` | 最全的实时快照（96 个字段），单次最多 400 个代码 | 现价 24.52，昨收 25.96，成交 45.4 亿港元，总市值约 6325 亿 |
| 股票报价 | `POST /quote/stock-quote` | 轻量报价（25 个字段） | 正常 |
| 买卖盘 | `POST /quote/order-book` | 盘口 | 请求 10 档，**只返回 1 档**（买一 24.50 / 20.9 万股） |
| 当前 K 线 | `GET /quote/{symbol}/cur-kline` | 最近 N 根 K 线 | 正常 |
| 分时数据 | `GET /quote/{symbol}/rt-data` | 当日分时走势 | 上午 151 个点，下午 180 个点 |
| 逐笔成交 | `GET /quote/{symbol}/rt-ticker` | 逐笔成交明细，单次最多 750 条 | 正常，含收市竞价的大单 |

### 3.3 资金流向

| 接口 | 方法 / 路径 | 用途 | 小米实测 |
| --- | --- | --- | --- |
| 资金流向 | `GET /quote/{symbol}/capital-flow` | 当日分钟级净流入（按超大、大、中、小单拆分） | 332 个点，全天净流入 2.1 亿，其中超大单和大单为净流出 |
| 资金流向历史 | `GET /quote/{symbol}/capital-flow/history` | 按日、周、月统计的主力净流入 | 正常 |
| 资金分布 | `GET /quote/{symbol}/capital-distribution` | 当日各档资金的流入和流出金额 | 正常 |

### 3.4 板块

| 接口 | 方法 / 路径 | 用途 | 小米实测 |
| --- | --- | --- | --- |
| 板块列表 | `GET /quote/plate-list` | 按市场和类别（行业、概念、地区）列出板块 | 港股行业板块 113 个 |
| 板块成份股 | `GET /quote/plate-stock` | 板块内的股票，支持排序和分页 | 正常 |

### 3.5 衍生品

| 接口 | 方法 / 路径 | 用途 | 实测 |
| --- | --- | --- | --- |
| 期权到期日 | `GET /quote/{symbol}/option-expiration` | 正股对应的期权到期日列表 | 小米 9 个到期日（周度、月度） |
| 期权链 | `GET /quote/{symbol}/option-chain` | 某个到期日的全部合约 | 10-16 到期共 92 个合约（`HK.MIU...`） |
| 期权波动率 | `GET /quote/{option}/option-volatility` | 隐含波动率和历史波动率，附文字解读 | 平均隐含波动率约 84.8% |
| 期权行权概率 | `GET /quote/{option}/option-exercise-probability` | 合约行权概率的历史 | 正常 |
| 组合期权策略 | `GET /quote/{symbol}/option-strategy` | 价差、跨式等策略组合报价 | 小米 46 个组合 |
| 组合期权价差 | `GET /quote/{symbol}/option-strategy-spread` | 某策略可选的价差档位（**仅美股**） | AAPL 正常 |
| 组合期权报价 | `POST /quote/combo-option-quote` | 自定义多腿组合报价 | 没测（需要先构造合约） |
| 期货信息 | `POST /quote/future-info` | 期货合约资料 | 恒指主连正常 |
| 相关期货 | `GET /quote/{symbol}/reference-future` | 主连合约对应的具体月份合约 | 恒指 18 个合约 |

### 3.6 筛选

| 接口 | 方法 / 路径 | 用途 | 实测 |
| --- | --- | --- | --- |
| 股票筛选 | `POST /quote/stock-screen` | 多因子选股（市场、板块、财务、技术指标） | 正常 |
| 窝轮筛选 | `POST /quote/warrant-screen` | 按正股、类型等条件筛选窝轮和牛熊证 | 小米相关窝轮正常返回 |
| 期权筛选 | `POST /quote/option-screen` | 全市场期权筛选 | 港股期权共匹配 86804 个 |

### 3.7 IPO 与自选

| 接口 | 方法 / 路径 | 用途 | 实测 |
| --- | --- | --- | --- |
| IPO 列表 | `GET /quote/ipo-list/{hk,us,cn,sg,my}` | 新股日历：认购期、暗盘、上市日、发行价 | 港股 1 只（传音），美股 104 只，A 股 3 只 |
| 自选分组 | `GET /quote/user-security-group` | 读取富途账户的自选分组 | 18 个分组 |
| 自选列表 | `GET /quote/user-security` | 某个分组里的股票 | 「全部」分组共 24 只 |
| 修改自选 | `POST /quote/modify-user-security` | 增加、删除自选 | 写操作，没调用 |

### 3.8 F10 深度数据

| 接口 | 路径（前缀 `/quote/{symbol}`） | 用途 | 小米实测 |
| --- | --- | --- | --- |
| 财务报表 | `/financials/statements` | 利润表、资产负债表、现金流量表、主要指标，含同比和环比 | 2026 年 H1 营收 1089 亿元，同比 -6.1% |
| 营收拆分 | `/financials/revenue-breakdown` | 按业务、地区拆分营收 | 智能手机 41.5%，IoT 26.9%，智能电动汽车/AI 等 21.5%；中国大陆 62% |
| 业绩价格变动 | `/financials/earnings-price-move` | 历次财报发布后的股价反应 | 44 期记录 |
| 业绩价格历史 | `/financials/earnings-price-history` | 财报日附近的价格序列 | 600 条 |
| 分析师共识 | `/research/analyst-consensus` | 目标价和评级分布 | 35 家机构，均价目标 42.44（22.7–75），强烈买入占 71% |
| 评级汇总 | `/research/rating-summary` | 机构和分析师评级明细（**仅美股、加股**） | 小米返回 null；AAPL 正常 |
| 晨星评级 | `/research/morningstar` | 星级、公允价值、护城河、多空观点、PDF 报告 | 有完整内容（报告日期 09-28） |
| 估值明细 | `/valuation/detail` | PE、PB、PS 的历史分位、行业对比、前瞻估值 | 当前 PE 16.6，1 年均值 19.5，前瞻 PE 24.9 |
| 板块估值成份股 | `/quote/valuation/plate-stocks` | 某行业板块里各成份股的估值 | **只支持行业板块**（如 `HK.LIST1055`）。概念板块返回 `no data` |
| 指数成份估值 | `/quote/valuation/index-stocks` | 指数成份股的估值 | 恒指正常 |
| 指数所属板块 | `/quote/valuation/index-stock-plates` | 指数成份股按板块分组 | 恒指 51 个板块 |
| 分红派息 | `/corporate-actions/dividends` | 历次分红 | 空（小米不派息） |
| 回购 | `/corporate-actions/buybacks` | 回购公告明细 | 10-12 回购 250 万股，涉及金额 6124 万港元 |
| 拆合股 | `/corporate-actions/splits` | 拆股、合股记录（仅港股） | 空 |
| 股东概况 | `/shareholders/overview` | 股东类型分布和主要股东 | 正常 |
| 持仓变动 | `/shareholders/holding-changes` | 机构和个人的增减持 | 正常 |
| 持股明细 | `/shareholders/holder-detail` | 每个股东的持股数和比例 | 雷军持股 23.53% |
| 机构持仓 | `/shareholders/institutional` | 按报告期统计的机构持仓 | 正常 |
| 内部持股人 / 内部交易 | `/shareholders/insider-holders`、`/insider-trades` | 高管和董事的持股与交易（**美股为主**） | 小米为空；AAPL 正常 |
| 公司简介 | `/company/profile` | ISIN、上市日期、发行价、主营业务等 | 23 项 |
| 公司高管 | `/company/executives` | 高管名单 | 19 人 |
| 高管背景 | `/company/executive-background` | 高管履历 | 雷军履历正常 |
| 运营效率 | `/company/operational-efficiency` | 周转率等运营指标 | 正常 |
| 十大券商席位 | `/top-brokers` | 当日买卖前十券商（**仅港股**） | 实时数据，买卖各 10 家 |
| 券商席位历史 | `/top-brokers-history` | N 天前的券商席位 | 正常 |

### 3.9 做空

| 接口 | 路径 | 用途 | 小米实测 |
| --- | --- | --- | --- |
| 每日做空量 | `/quote/{symbol}/short/daily-volume` | 每日沽空股数和金额、占成交比 | 10-12 沽空 6300 万股，金额 15.6 亿 |
| 做空利息 | `/quote/{symbol}/short/interest` | 未平仓空头、空头比例 | 空头占比 5.76%（10-02 数据） |

### 3.10 实盘交易（只读部分）

| 接口 | 方法 / 路径 | 用途 | 实测 |
| --- | --- | --- | --- |
| 授权交易账户 | `GET /accounts/authorized_trd_accs` | 列出 AppKey 能访问的交易账户 | 2 个账户：期货账户、综合证券账户 |
| 账户资金 | `GET /accounts/{acc_id}/funds` | 购买力、总资产、现金 | 正常，金额为 0 |
| 持仓列表 | `GET /accounts/{acc_id}/positions` | 当前持仓 | 空 |
| 未完成订单 / 历史订单 | `GET /accounts/{acc_id}/orders`、`/orders_history` | 订单查询 | 空 |
| 当日成交 / 历史成交 | `GET /accounts/{acc_id}/order_fills`、`/fills_history` | 成交查询 | 空 |
| 最大可交易数量 | `GET /accounts/{acc_id}/acctradinginfo` | 下单前查询可买、可卖、可做空的数量 | 用综合证券账户正常；用期货账户查港股会返回 500 |
| 订单详情 | `POST /accounts/{acc_id}/orders/detail` | 按订单号查询 | 没有订单，没测 |
| 下单 / 改单 / 撤单 / 下单确认 | `POST`、`PUT`、`DELETE /accounts/{acc_id}/orders...` | 实盘交易 | **按约定不测** |

### 3.11 模拟交易

| 接口 | 方法 / 路径 | 用途 | 实测 |
| --- | --- | --- | --- |
| 模拟账户列表 | `GET /sim-trade/accounts` | 各市场的模拟账户（`market_id` 1 表示港股） | 9 个账户 |
| 模拟资金 | `GET /sim-trade/{acc_id}/cash-info` | 模拟资金 | 港股模拟账户有 100 万 |
| 模拟持仓 / 订单 / 历史订单 | `GET /sim-trade/{acc_id}/positions`、`/orders`、`/history-orders` | 模拟盘查询 | **必须带 `market=1`**，否则报参数缺失或 backend error |
| 模拟最大买卖量 | `GET /sim-trade/{acc_id}/max-buy-sell` | 可买、可卖数量 | `symbol=01810` 不带市场前缀，按 25 港元算可买 39800 股 |
| 模拟下单 / 改单 / 撤单 | `POST /sim-trade/{acc_id}/orders...` | 模拟交易 | 没测 |

## 4. 已知限制和坑

1. **盘口只有 1 档**：如果要做 10 档盘口分析，需要在富途购买港股 LV2 行情。
2. **部分数据只覆盖美股**：评级汇总、内部持股和内部交易、组合期权价差，对港股返回空或 null。
3. **部分数据只覆盖港股**：十大券商席位、拆合股。
4. **数据为空不代表接口失败**：小米没有分红，复权因子和分红记录本来就是空的。
5. **板块估值成份股**只接受行业板块（`HK.LIST1055` 这类）。用概念板块会返回 HTTP 200，但 `ret_code=-10`。
6. **模拟交易**的查询接口必须带 `market`；`max-buy-sell` 的 `symbol` 不带市场前缀。
7. **实盘账户**要按 `enable_market` 选择，用期货账户查港股的可交易数量会返回 500。
8. **性能**：单次请求约 1–3 秒，偶尔接近 10 秒。批量场景应该用 `code_list`（最多 400 个代码）合并请求，并做缓存。限频规则见第 5 节。

## 5. 限频与配额

### 5.1 新版 REST / WebSocket 官方说明

[接口限频页](https://open.futunn.com/zh-cn/api/overview/rate-limit) 的简体、繁体、英文三个版本内容一致，**都没有公开具体的请求次数**：

- 只说明平台会对接口调用施加配额。
- 建议的做法：能批量的接口合并请求，交易日历、板块列表、证券档案这类静态数据本地缓存，避开开盘高峰。
- 被限流时返回 **HTTP 429**。客户端应读取 `Retry-After` 响应头，没有这个头就按 1、2、4 秒指数退避。
- 实测时响应头里**没有** `X-RateLimit-*` 一类的剩余配额字段，客户端无法提前知道还剩多少额度。

[WebSocket 推送配额页](https://open.futunn.com/zh-cn/api/quote/push/rate-limit) 明确表示“不提供固定数值限制”，额度和账号类型、行情权限、套餐、市场、品类有关。配额分四类：

| 配额 | 计算口径 |
| --- | --- |
| 连接配额 | 同一账号或应用能同时保持的长连接数 |
| 订阅配额 | 每个「标的 + 数据类型」占 1 个，K 线还按周期和复权方式分别计算；反订阅后释放 |
| 权限配额 | 行情权限决定能订阅哪些市场、多少档盘口、是否有经纪队列 |
| 控制消息频率 | 鉴权、订阅、反订阅、重连这类消息的发送频率 |

订阅超限时返回 `code=4`，文档里的错误示例是 `"sub quota exceeded, max=100"`。遇到这个错误不要立即重试，应先减少订阅数量。

### 5.2 旧版 OpenD 的额度规则（参考）

富途旧产品线（OpenD 网关 + SDK）的[权限与额度文档](https://openapi.futunn.com/futu-api-doc/intro/authority.html)公布了具体数值。新版接口是否沿用这套规则，官方**没有明确说明**。不过新版 WebSocket 的报错示例 `max=100` 正好对应下表的最低档，推测两版规则一致。

- 单个接口有各自的频率限制，比如快照接口每 30 秒最多 60 次。
- 订阅和历史 K 线额度按用户等级分档：

| 用户等级 | 订阅额度 | 历史 K 线额度 | 期权订阅 / 期权历史 K 线 |
| --- | --- | --- | --- |
| 总资产低于 1 万港元（含未开户） | 100 | 100 | 20 |
| 总资产达 1 万港元 | 300 | 300 | 60 |
| 总资产达 50 万港元，或月交易超 200 笔，或月交易额超 200 万港元 | 1000 | 1000 | 200 |
| 总资产达 500 万港元，或月交易超 2000 笔，或月交易额超 2000 万港元 | 2000 | 2000 | 400 |

- **历史 K 线额度**：最近 7 天内每请求一只新股票占 1 个额度；重复请求同一只不重复计算，同一股票的不同周期也只算 1 个。
- **行情权限**：
  - 港股：境内认证客户免费获得 LV2；国际客户只有 LV1，要升级需购买。是境内还是国际按登录 IP 判断。
  - A 股：境内认证客户免费获得 LV1。

### 5.3 对港股扩展的影响

1. **账号档位**：测试账号的资产为 0，按旧版规则属于最低档（订阅 100、历史 K 线 100 只/7 天）。如果要扫描全港股（约 2600 只）的历史 K 线，这个额度是主要瓶颈。可以考虑提升账号档位，或改用「快照批量拉取 + 本地累积日 K」的方案。
2. **盘口深度**：实测只有 1 档。按规则，境内认证客户应该免费有 LV2，需要在富途 App 里核实账号的认证状态，以及服务器出口 IP 是否被判定为国际客户。
3. **待确认**：新版 REST 接口的实际阈值。可以通过开发者控制台（<https://open.futunn.com/dashboard>）或客服确认。实在无法确认时，再在非高峰时段做低强度实测（逐步提速直到出现 429）。
4. **客户端设计要求**：
   - 批量优先，快照、报价、基本信息都用 `code_list`。
   - 静态数据本地缓存。
   - 处理 429 和 `Retry-After`，按指数退避重试。
   - 判断成败时同时检查外层 `code`/`s` 和内层 `data.ret_code`。
   - 由 Worker 定时拉取后落库，不放进用户请求链路。

## 6. 港股扩展时与琉璃各模块的对应关系（建议）

| 琉璃模块 | 可用的富途接口 |
| --- | --- |
| Market Radar | 市场快照、资金流向和资金分布、板块列表和成份股、十大券商席位、做空数据、资讯搜索、经济日历 |
| Track Discovery | 板块列表和成份股、所属板块、板块估值成份股、股票筛选 |
| Stock Analysis | 历史 K 线、财务报表、营收拆分、估值明细、分析师共识、晨星评级、股东和机构持仓、回购、公司简介和高管 |
| Alert Center | 市场快照（价格和涨跌监控）、资金流向、做空比例、回购公告 |
| Portfolio | 实盘和模拟的账户资金、持仓、订单、成交；自选分组和自选列表 |
| Basic / Stock Master | 股票基本信息、交易日历、市场状态、IPO 列表 |

## 7. 复现方式

测试脚本没有放进仓库。签名流程见第 2 节，伪代码如下：

```python
ts = str(server_time_ms())
sign_str = f"{ts}\n{method}\n{path}\n{query_string}\n{sha256_hex(body) if body else ''}"
headers = {
    "X-Api-Key": app_key,
    "X-Timestamp": ts,
    "X-Nonce": secrets.token_hex(16),
    "Authorization": base64.b64encode(ed25519_key.sign(sign_str.encode())).decode(),
}
```

正式接入时，应按 `docs/liuli_system_spec.md` 的模块边界实现一个统一的富途客户端，负责签名、校时、退避重试和双层错误判断。
