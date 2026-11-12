"""Fail-closed validation of the exact Liuli Markdown upload. Standard library only."""
import argparse
import calendar
import hashlib
import json
import math
from pathlib import Path
import re
from datetime import date, datetime


def obj(properties):
    return dict(type='object', properties=properties)


def arr(items, minimum=0, maximum=None):
    return dict(type='array', items=items, minimum=minimum, maximum=maximum)


TEXT = dict(type='string')
NUMBER = dict(type='number')
BOOL = dict(type='boolean')
PERIOD = dict(type='string', pattern=r'[0-9]{4}-Q[1-4]')
DATE = dict(type='string', format='date')
PERFORMANCE = dict(type='string', enum=['超预期', '符合预期', '不如预期'])
QUARTER_PERFORMANCE = dict(type='string', enum=['超预期', '符合预期', '不如预期', '未验证'])
MODEL = obj(dict(growth_rate=NUMBER, target_multiple=NUMBER, market_value_3y=NUMBER))

# Every object property below is required; unrecognized keys fail rather than disappear at import.
SCHEMA = obj(dict(
    company=TEXT, company_code=dict(type='string', pattern=r'[0-9]{6}'),
    report_period=PERIOD, report_release_date=DATE, current_market_value=NUMBER,
    financial_performance=obj(dict(beat_items=arr(TEXT), inline_items=arr(TEXT), miss_items=arr(TEXT))),
    trend_reference=obj(dict(revenue_yoy=NUMBER, revenue_qoq=NUMBER,
                             profit_yoy=NUMBER, profit_qoq=NUMBER)),
    guidance_check=obj(dict(has_guidance=BOOL, guidance_conflict=BOOL, note=TEXT)),
    quarter_performance=QUARTER_PERFORMANCE, quarter_main_reason=TEXT,
    profit_model=MODEL, fcf_model=MODEL, revenue_model=MODEL,
    primary_model=dict(type='string', enum=['profit', 'fcf', 'revenue']),
    expected_market_value_3y=NUMBER, expectation_gap_rate=NUMBER,
    valuation_assumptions=obj(dict(
        previous_period=dict(type=['string', 'null'], pattern=r'[0-9]{4}-Q[1-4]'),
        last_assumptions_vs_actual=arr(obj(dict(metric=TEXT, assumed=TEXT, actual=TEXT,
                                               result=PERFORMANCE))),
        current_assumptions=arr(obj(dict(metric=TEXT, assumed=TEXT)), minimum=1, maximum=3))),
    analysis_date=DATE, researcher_code=TEXT))

CONTEXT_FIELDS = ('company', 'company_code', 'report_period', 'report_release_date',
                  'analysis_date', 'researcher_code', 'title', 'business_module',
                  'skill_name', 'source', 'status')

# Card values are quantitative expressions, never report paragraphs. Extend units
# for a verified business metric rather than weakening this boundary to free text.
ASSUMPTION_NUMBER = r'[+-]?[0-9]+(?:\.[0-9]{1,4})?'
ASSUMPTION_UNIT = (r'(?:%|％|个百分点|基点|bps?|倍|天|个月|年|次|'
                   r'(?:万亿|亿|万|千)?(?:元|美元|港元|股|片|台|辆|吨|件|套|人|户|平方米|千瓦时)'
                   r'(?:/(?:股|片|台|辆|吨|件|套|人|户|平方米|千瓦时))?)')
ASSUMPTION_POINT = re.compile(
    rf'(?:不低于|不高于|大于|小于|至少|至多|>=|<=|≥|≤|>|<|=)?{ASSUMPTION_NUMBER}{ASSUMPTION_UNIT}')
ASSUMPTION_RANGE = re.compile(
    rf'(?P<low>{ASSUMPTION_NUMBER})(?P<low_unit>{ASSUMPTION_UNIT})?'
    rf'(?:至|—|–|～|~)(?P<high>{ASSUMPTION_NUMBER})(?P<high_unit>{ASSUMPTION_UNIT})')


def check_current_assumption(item, path, errors):
    metric, value = item['metric'], item['assumed']
    if len(metric) > 40 or re.search(r'[\n\r；;。]', metric):
        errors.append(path+'.metric: 只写期间、口径和指标名，不超过40字符；推导移至正文')
    interval = ASSUMPTION_RANGE.fullmatch(value)
    if len(value) > 32 or not (ASSUMPTION_POINT.fullmatch(value) or interval):
        errors.append(path+'.assumed: 只允许带单位的单个点值、阈值或区间（≤32字符、最多4位小数）；解释、公式、容差和来源移至正文')
    elif interval:
        low, high = interval.group('low', 'high')
        low_unit, high_unit = interval.group('low_unit', 'high_unit')
        if low_unit is not None and low_unit != high_unit:
            errors.append(path+'.assumed: 区间两端单位必须一致')
        if float(low) > float(high):
            errors.append(path+'.assumed: 区间下界不得高于上界')


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('重复JSON键: ' + key)
            result[key] = value
        return result
    def constant(value):
        raise ValueError('非有限JSON数字: ' + value)
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def check_node(value, schema, path, errors, checked):
    checked.append(path)
    predicates = dict(object=lambda v: isinstance(v, dict), array=lambda v: isinstance(v, list),
                      string=lambda v: isinstance(v, str), boolean=lambda v: type(v) is bool,
                      number=lambda v: type(v) in (int, float) and math.isfinite(v),
                      null=lambda v: v is None)
    types = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
    if not any(predicates[t](value) for t in types):
        errors.append(f'{path}: 类型应为 {types}，数字必须有限且不能是布尔值')
        return
    if value is None:
        return
    if isinstance(value, dict):
        props = schema['properties']
        errors.extend(f'{path}.{key}: 缺少必填字段' for key in props if key not in value)
        errors.extend(f'{path}.{key}: 未识别字段，先核实导入契约' for key in value if key not in props)
        for key in props:
            if key in value:
                check_node(value[key], props[key], path+'.'+key, errors, checked)
    elif isinstance(value, list):
        if len(value) < schema['minimum'] or (schema['maximum'] is not None and len(value) > schema['maximum']):
            errors.append(f'{path}: 数量超出允许范围')
        for i, item in enumerate(value):
            check_node(item, schema['items'], f'{path}[{i}]', errors, checked)
    elif isinstance(value, str):
        if not value.strip() or value.strip().lower() in ('n/a', 'null', 'tbd', '待补充', '未知'):
            errors.append(f'{path}: 不得为空或使用占位文本')
        if 'pattern' in schema and not re.fullmatch(schema['pattern'], value):
            errors.append(f'{path}: 格式不符合要求')
        if schema.get('format') == 'date':
            try:
                parsed = date.fromisoformat(value)
                if parsed.isoformat() != value:
                    raise ValueError('非YYYY-MM-DD')
            except ValueError:
                errors.append(f'{path}: 非法日期，应为YYYY-MM-DD')
    if 'enum' in schema and value not in schema['enum']:
        errors.append(f'{path}: 非法枚举 {value!r}')


def check_expectation_baseline(data, context, errors, checked):
    """Check provenance metadata and comparison math; source truth needs human review."""
    review = context.get('expectation_review')
    if isinstance(review, dict) and review.get('status') == 'initial_hypotheses':
        checked.append('context.expectation_review')
        if review.get('prior_hypotheses_available') is not False or not isinstance(review.get('evidence'), str) or not review['evidence'].strip():
            errors.append('context.expectation_review: 首次建档须核实无可验证旧假设并保留历史检查证据')
        if data['quarter_performance'] != '未验证':
            errors.append('$.quarter_performance: 首次建档须填非空状态“未验证”，不能留null或制造兑现标签')
        history = data['valuation_assumptions']
        if history['last_assumptions_vs_actual'] or context.get('expectation_baseline') is not None:
            errors.append('context.expectation_review: 首次建档不得同时声称历史兑现或已有比较基准')
        if any(data['financial_performance'].values()):
            errors.append('$.financial_performance: 无旧基准时三档预期条目应为空，经营事实写正文')
        return
    path = 'context.expectation_baseline'
    checked.append(path)
    baseline = context.get('expectation_baseline')
    if not isinstance(baseline, dict):
        errors.append(path+': 缺少已核实的事前量化预期基准，禁止默认符合预期')
        return
    required = ('source_type', 'source_ref', 'recorded_at', 'target_period', 'metric',
                'unit', 'expected_low', 'expected_high', 'tolerance', 'actual', 'direction')
    for key in required:
        checked.append(path+'.'+key)
        if key not in baseline:
            errors.append(path+'.'+key+': 缺少必填字段')
    if any(key not in baseline for key in required):
        return
    for key in ('source_ref', 'unit', 'metric'):
        if not isinstance(baseline[key], str) or not baseline[key].strip():
            errors.append(path+'.'+key+': 必须为非空证据文本')
    if baseline['source_type'] not in ('company_guidance', 'market_consensus', 'researcher_prior'):
        errors.append(path+'.source_type: 历史实际或事后推算不能冒称事前预期')
    if baseline['target_period'] != data['report_period']:
        errors.append(path+'.target_period: 必须与本期匹配，不能混用单季和累计预测')
    if baseline['metric'] != data['quarter_main_reason']:
        errors.append(path+'.metric: 必须与综合判断的关键驱动指标一致')
    try:
        recorded = baseline['recorded_at']
        public = context.get('report_public_at')
        if not isinstance(recorded, str) or not isinstance(public, str):
            raise ValueError('须独立核实report_public_at首次公开时间，不以正式披露日自动替代')
        if len(recorded) == 10 and len(public) == 10:
            if date.fromisoformat(recorded) >= date.fromisoformat(public):
                raise ValueError('基准须早于首次公开日期；同日须提供两个精确时间戳')
        else:
            before = datetime.fromisoformat(recorded)
            after = datetime.fromisoformat(public)
            if before.tzinfo is None or after.tzinfo is None or before >= after:
                raise ValueError('同日比较须带时区时间戳且基准严格早于首次公开')
        if date.fromisoformat(public[:10]) > date.fromisoformat(data['report_release_date']):
            raise ValueError('首次公开不能晚于已核实正式披露日期')
    except (ValueError, TypeError) as exc:
        errors.append(path+'.recorded_at: '+str(exc))
    if baseline['source_type'] == 'company_guidance' and not data['guidance_check']['has_guidance']:
        errors.append(path+'.source_type: 选用公司指引却未标记存在适用指引')
    numbers = ('expected_low', 'expected_high', 'tolerance', 'actual')
    if any(type(baseline[k]) not in (int, float) or not math.isfinite(baseline[k]) for k in numbers):
        errors.append(path+': 区间、容差、实际值必须为有限数字且不能为布尔值')
        return
    low, high, tol, actual = (baseline[k] for k in numbers)
    if low > high or tol < 0:
        errors.append(path+': 上下界倒置或容差为负')
        return
    direction = baseline['direction']
    if direction not in ('higher_is_better', 'lower_is_better'):
        errors.append(path+'.direction: 必须明确指标好坏方向')
        return
    if low-tol <= actual <= high+tol:
        expected = '符合预期'
    else:
        better = actual > high+tol
        if direction == 'lower_is_better':
            better = not better
        expected = '超预期' if better else '不如预期'
    if data['quarter_performance'] != expected:
        errors.append('$.quarter_performance: 与事前区间、容差及指标方向不符，应为'+expected)


def validate_report(markdown, context):
    errors, checked = [], []
    result = dict(ok=False, upload_allowed=False, mode='invalid', errors=errors,
                  checked_fields=checked, report_sha256=hashlib.sha256(markdown.encode('utf-8')).hexdigest())
    blocks = list(re.finditer(r'^(`{3}|~{3})json[ \t]*\r?\n(.*?)^\1[ \t]*(?:\r?\n|$)',
                              markdown, re.MULTILINE | re.DOTALL))
    if not blocks or markdown[blocks[-1].end():].strip():
        errors.append('$: 报告必须以完整JSON代码块结束，回执不得写入正文末尾')
        return result
    try:
        data = strict_json(blocks[-1].group(2))
    except (ValueError, TypeError) as exc:
        errors.append('$: '+str(exc))
        return result
    if isinstance(data, dict) and set(data) == {'error'}:
        result['mode'] = 'error'
        if not isinstance(data['error'], str) or not data['error'].strip():
            errors.append('$.error: 错误原因不得为空')
        result['ok'] = not errors
        return result  # Error reports never authorize a normal valuation upload.
    check_node(data, SCHEMA, '$', errors, checked)
    if errors:
        return result
    result['mode'] = 'valuation'
    if not isinstance(context, dict):
        errors.append('context: 缺少独立来源核实的上传上下文')
        return result
    for key in CONTEXT_FIELDS:
        if not isinstance(context.get(key), str) or not context[key].strip():
            errors.append(f'context.{key}: 必填且不得为空')
    for key in ('company', 'company_code', 'report_period', 'report_release_date',
                'analysis_date', 'researcher_code'):
        if data[key] != context.get(key):
            errors.append(f'$.{key}: 与已核实上下文不一致')
    metadata = dict(title=f"{data['company']}-{data['analysis_date']}-标的估值报告",
                    business_module='stock_analysis', skill_name='liuli-stock-valuator',
                    source='mcp', status='received')
    for key, expected in metadata.items():
        if context.get(key) != expected:
            errors.append(f'context.{key}: 应为 {expected!r}')
    result['context_sha256'] = hashlib.sha256(json.dumps(context, sort_keys=True,
                                              ensure_ascii=False).encode('utf-8')).hexdigest()
    current = data['current_market_value']
    if current <= 0:
        errors.append('$.current_market_value: 必须大于0')
    for name in ('profit', 'fcf', 'revenue'):
        model = data[name+'_model']
        if model['target_multiple'] <= 0 or model['market_value_3y'] < 0 or model['growth_rate'] < -1:
            errors.append(f'$.{name}_model: 倍数须为正、市值非负、增长率不得小于-100%')
    primary = data[data['primary_model']+'_model']['market_value_3y']
    if not math.isclose(primary, data['expected_market_value_3y'], rel_tol=1e-6, abs_tol=1e-6):
        errors.append('$.expected_market_value_3y: 与主模型市值不一致')
    if current > 0 and not math.isclose(data['expectation_gap_rate'],
              data['expected_market_value_3y']/current-1, rel_tol=1e-6, abs_tol=1e-6):
        errors.append('$.expectation_gap_rate: 不等于三年市值/当前市值-1（应使用小数）')
    released, analyzed = map(date.fromisoformat, (data['report_release_date'], data['analysis_date']))
    year, quarter = map(int, (data['report_period'][:4], data['report_period'][-1]))
    month = quarter*3
    period_end = date(year, month, calendar.monthrange(year, month)[1]) if year else None
    if period_end is None or not period_end <= released <= analyzed:
        errors.append('$.report_release_date: 应满足报告期末≤披露日≤分析日')
    six_month_index = analyzed.year*12+analyzed.month-1-6
    sy, sm = divmod(six_month_index, 12)
    cutoff = date(sy, sm+1, min(analyzed.day, calendar.monthrange(sy, sm+1)[1]))
    if released < cutoff:
        errors.append('$.report_release_date: 最近财报已超过六个月')
    history = data['valuation_assumptions']
    previous, validations = history['previous_period'], history['last_assumptions_vs_actual']
    if previous is None and validations:
        errors.append('$.valuation_assumptions: 无上一期时验证数组必须为空')
    if previous is not None and previous >= data['report_period']:
        errors.append('$.valuation_assumptions.previous_period: 必须早于本期，不能自我验证')
    hypotheses = data['valuation_assumptions']['current_assumptions']
    if len({item['metric'] for item in hypotheses}) != len(hypotheses):
        errors.append('$.valuation_assumptions.current_assumptions: 指标重复')
    for i, item in enumerate(hypotheses):
        check_current_assumption(item, f'$.valuation_assumptions.current_assumptions[{i}]', errors)
    if data['guidance_check']['guidance_conflict'] and not data['guidance_check']['has_guidance']:
        errors.append('$.guidance_check: 无适用指引却标记与指引冲突')
    check_expectation_baseline(data, context, errors, checked)
    result['ok'] = result['upload_allowed'] = not errors
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path)
    parser.add_argument('--context', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        result = validate_report(args.report.read_bytes().decode('utf-8'),
                                 strict_json(args.context.read_text(encoding='utf-8')))
    except (OSError, UnicodeError, ValueError) as exc:
        result = dict(ok=False, upload_allowed=False, mode='invalid', errors=[str(exc)])
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered+'\n', encoding='utf-8')
    print(rendered)
    return 0 if result['upload_allowed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
