"""Regression checks for the upload boundary. Run with python3 -m unittest discover -s scripts."""
import importlib.util
import json
from pathlib import Path
import unittest
from copy import deepcopy

SCRIPT = Path(__file__).with_name('validate_valuation_report.py')
SPEC = importlib.util.spec_from_file_location('valuation_validator', SCRIPT) if SCRIPT.exists() else None
MODULE = importlib.util.module_from_spec(SPEC) if SPEC else None
if MODULE:
    SPEC.loader.exec_module(MODULE)

CONTEXT = dict(company='示例公司', company_code='600055', report_period='2026-Q3',
               report_release_date='2026-10-24', analysis_date='2026-10-24',
               researcher_code='valuator_001', title='示例公司-2026-10-24-标的估值报告',
               business_module='stock_analysis', skill_name='liuli-stock-valuator',
               source='mcp', status='received', report_public_at='2026-10-23',
               expectation_baseline=dict(source_type='researcher_prior', source_ref='历史报告#1原假设',
                 recorded_at='2026-09-01', target_period='2026-Q3', metric='毛利率', unit='小数比率',
                 expected_low=.24, expected_high=.28, tolerance=0, actual=.25,
                 direction='higher_is_better'))

def example():
    return dict(company='示例公司', company_code='600055', report_period='2026-Q3',
        report_release_date='2026-10-24', current_market_value=100,
        financial_performance=dict(beat_items=[], inline_items=[], miss_items=[]),
        trend_reference=dict(revenue_yoy=.1, revenue_qoq=-.2, profit_yoy=1.2, profit_qoq=.3),
        guidance_check=dict(has_guidance=False, guidance_conflict=False, note='未发布单季指引'),
        quarter_performance='符合预期', quarter_main_reason='毛利率',
        profit_model=dict(growth_rate=.1, target_multiple=20, market_value_3y=110),
        fcf_model=dict(growth_rate=1.5, target_multiple=20, market_value_3y=115),
        revenue_model=dict(growth_rate=.08, target_multiple=1.8, market_value_3y=120),
        primary_model='revenue', expected_market_value_3y=120, expectation_gap_rate=.2,
        valuation_assumptions=dict(previous_period='2026-Q2', last_assumptions_vs_actual=[],
            current_assumptions=[dict(metric='2026-Q4单季营业收入', assumed='4.0—4.5亿元')]),
        analysis_date='2026-10-24', researcher_code='valuator_001')

def markdown(data):
    return '# 估值报告\n\n正文及证据。\n\n```json\n'+json.dumps(data, ensure_ascii=False)+'\n```\n'

class UploadGateTests(unittest.TestCase):
    def check(self, data=None, text=None, context=CONTEXT):
        self.assertIsNotNone(MODULE, '缺少可执行的上传前完整字段校验器')
        return MODULE.validate_report(text if text is not None else markdown(data), context)

    def test_complete_report_passes(self):
        self.assertTrue(self.check(example())['upload_allowed'])

    def test_missing_any_nested_required_field_is_blocked(self):
        def paths(obj, prefix=()):
            for k, value in obj.items():
                yield prefix+(k,)
                if isinstance(value, dict):
                    yield from paths(value, prefix+(k,))
        for path in paths(example()):
            with self.subTest(path=path):
                d=example(); parent=d
                for k in path[:-1]: parent=parent[k]
                del parent[path[-1]]
                r=self.check(d)
                self.assertFalse(r['upload_allowed'])
                self.assertTrue(r['errors'])

    def test_wrong_type_at_every_required_slot_is_blocked(self):
        def paths(obj, prefix=()):
            for key, value in obj.items():
                yield prefix+(key,), value
                if isinstance(value, dict):
                    yield from paths(value, prefix+(key,))
        for path, value in paths(example()):
            with self.subTest(path=path):
                d=example(); parent=d
                for key in path[:-1]: parent=parent[key]
                parent[path[-1]] = [] if not isinstance(value,list) else {}
                self.assertFalse(self.check(d)['upload_allowed'])

    def test_wrong_types_and_nonfinite_numbers_are_blocked(self):
        for key, val in [('current_market_value',True),('current_market_value',float('nan')),
                         ('company_code',600055),('expectation_gap_rate','20%'),
                         ('valuation_assumptions',None),('analysis_date','2026-02-30')]:
            with self.subTest(key=key,val=val):
                d=example(); d[key]=val
                self.assertFalse(self.check(d)['upload_allowed'])

    def test_assumptions_must_be_structured_quantified_and_bounded(self):
        for value in [[],[dict(metric='收入', assumed='待补充')],
                      [dict(metric='收入')], [dict(metric='收入',assumed='10亿元')]*4]:
            d=example(); d['valuation_assumptions']['current_assumptions']=value
            self.assertFalse(self.check(d)['upload_allowed'])

    def test_empty_history_is_valid_but_same_period_validation_is_not(self):
        d=example(); d['valuation_assumptions']['previous_period']=None
        self.assertTrue(self.check(d)['upload_allowed'])
        d['valuation_assumptions']['previous_period']='2026-Q3'
        self.assertFalse(self.check(d)['upload_allowed'])

    def test_compact_tracking_targets_pass(self):
        for value in ['不低于20%', '大于0亿元', '不高于70亿元', '6.8—8.0亿元',
                      '2.1—2.5亿元', '-0.25至0.80亿元', '-0.8至-0.25亿元',
                      '41%—43%', '至少1.5个百分点', '≤90天', '>=2倍',
                      '0.1234元/股', '10万片', '4.28亿元']:
            with self.subTest(value=value):
                d=example(); d['valuation_assumptions']['current_assumptions'][0]['assumed']=value
                self.assertTrue(self.check(d)['upload_allowed'])

    def test_verbose_or_ambiguous_card_values_are_blocked(self):
        for value in [
            '6.8—8.0亿元，基准7.5311亿元，区间已含容差、额外容差0；以2026年报收入减21.4689371868亿元核验；依据Q3旺季后约15%回落至持平、BES6100尚未量产，研究员预测。',
            '6.8—8.0亿元（区间已含容差）', '不低于20%；研究员预测',
            '6.8—8.0亿元，基准7.53亿元', '年报收入减21.47亿元',
            '不低于20%，依据财报', '7.531123亿元', '6.8—8.0',
            '8.0至6.8亿元', '6.8万元至8.0亿元', '6.8亿元\n', '收入增长20%']:
            with self.subTest(value=value):
                d=example(); d['valuation_assumptions']['current_assumptions'][0]['assumed']=value
                r=self.check(d)
                self.assertFalse(r['upload_allowed'])
                self.assertTrue(any('current_assumptions[0].assumed' in e for e in r['errors']))

    def test_explanation_cannot_be_moved_to_metric_label(self):
        for metric in ['2026-Q4单季营业收入；以年报减前三季度核验', '收入'*21]:
            d=example(); d['valuation_assumptions']['current_assumptions'][0]['metric']=metric
            self.assertFalse(self.check(d)['upload_allowed'])

    def test_details_stay_in_body_and_original_history_remains_usable(self):
        d=example()
        d['valuation_assumptions']['last_assumptions_vs_actual']=[dict(
            metric='2026-Q3毛利率', assumed='24%—28%，区间已含容差，研究员预测',
            actual='25%', result='符合预期')]
        text=markdown(d).replace('正文及证据。',
            '研究员预测：2026-Q4单季营业收入4.0—4.5亿元，基准4.28亿元。'
            '区间已含容差，额外容差0；以年报全年收入减前三季度累计收入核验。')
        self.assertTrue(self.check(text=text)['upload_allowed'])

    def test_arithmetic_mismatch_is_blocked(self):
        for key in ['expected_market_value_3y','expectation_gap_rate']:
            d=example(); d[key]=999
            self.assertFalse(self.check(d)['upload_allowed'])

    def test_duplicate_unknown_or_nonterminal_json_is_blocked(self):
        text=markdown(example()).replace('"company":', '"company":"duplicate", "company":',1)
        self.assertFalse(self.check(text=text)['upload_allowed'])
        d=example(); d['current_hypothsis']=[]
        self.assertFalse(self.check(d)['upload_allowed'])
        self.assertFalse(self.check(text=markdown(example())+'上传回执')['upload_allowed'])

    def test_context_mismatch_or_absent_context_is_blocked(self):
        d=example(); d['researcher_code']='someone_else'
        self.assertFalse(self.check(d)['upload_allowed'])
        self.assertFalse(self.check(example(),context=None)['upload_allowed'])

    def test_error_json_is_recognized_but_not_normal_uploadable(self):
        r=self.check(dict(error='数据不足或财报周期无法确认'))
        self.assertEqual(r['mode'],'error')
        self.assertFalse(r['upload_allowed'])

    def test_dates_and_guidance_are_consistent(self):
        d=example(); d['analysis_date']='2026-10-23'
        self.assertFalse(self.check(d)['upload_allowed'])

    def test_baseline_is_required_even_for_inline_label(self):
        c=deepcopy(CONTEXT); del c['expectation_baseline']
        self.assertFalse(self.check(example(),context=c)['upload_allowed'])

    def test_baseline_missing_fields_and_bad_numeric_inputs_blocked(self):
        for key in CONTEXT['expectation_baseline']:
            c=deepcopy(CONTEXT); del c['expectation_baseline'][key]
            self.assertFalse(self.check(example(),context=c)['upload_allowed'])
        for key,val in [('actual',True),('expected_low',float('inf')),
                        ('tolerance',-1),('expected_low',.4),('direction','unknown')]:
            c=deepcopy(CONTEXT);c['expectation_baseline'][key]=val
            self.assertFalse(self.check(example(),context=c)['upload_allowed'])

    def test_posthoc_wrong_period_and_wrong_basis_blocked(self):
        for key,val in [('recorded_at','2026-10-24'),('recorded_at','2026-10-25'),
                        ('target_period','2026-Q2'),('metric','净利润'),
                        ('source_type','historical_actual'),('source_ref','')]:
            c=deepcopy(CONTEXT);c['expectation_baseline'][key]=val
            self.assertFalse(self.check(example(),context=c)['upload_allowed'])

    def test_negative_profit_and_loss_amount_have_opposite_directions(self):
        for direction,actual,label in [('higher_is_better',-.3,'超预期'),
                 ('higher_is_better',-.7,'不如预期'),('higher_is_better',-.5,'符合预期'),
                 ('lower_is_better',-.3,'不如预期'),('lower_is_better',-.7,'超预期')]:
            c=deepcopy(CONTEXT);c['expectation_baseline'].update(
                expected_low=-.6,expected_high=-.4,actual=actual,direction=direction)
            d=example();d['quarter_performance']=label
            self.assertTrue(self.check(d,context=c)['upload_allowed'])
            d['quarter_performance']='超预期' if label!='超预期' else '符合预期'
            self.assertFalse(self.check(d,context=c)['upload_allowed'])

    def test_tolerance_and_exact_boundary(self):
        for actual,label in [(.23,'符合预期'),(.29,'符合预期'),(.291,'超预期'),(.229,'不如预期')]:
            c=deepcopy(CONTEXT);c['expectation_baseline'].update(tolerance=.01,actual=actual)
            d=example();d['quarter_performance']=label
            self.assertTrue(self.check(d,context=c)['upload_allowed'])

    def test_same_day_timestamps_and_early_publication(self):
        c=deepcopy(CONTEXT);c['report_public_at']='2026-10-23T18:00:00+08:00'
        c['expectation_baseline']['recorded_at']='2026-10-23T17:00:00+08:00'
        self.assertTrue(self.check(example(),context=c)['upload_allowed'])
        for recorded in ['2026-10-23T18:01:00+08:00','2026-10-23',
                         '2026-10-23T17:00:00','2026-10-23T11:00:00+00:00']:
            c['expectation_baseline']['recorded_at']=recorded
            self.assertFalse(self.check(example(),context=c)['upload_allowed'])

    def test_publication_time_required_and_guidance_basis_consistent(self):
        c=deepcopy(CONTEXT);del c['report_public_at']
        self.assertFalse(self.check(example(),context=c)['upload_allowed'])
        c=deepcopy(CONTEXT);c['expectation_baseline']['source_type']='company_guidance'
        self.assertFalse(self.check(example(),context=c)['upload_allowed'])
        d=example();d['guidance_check']['has_guidance']=True
        self.assertTrue(self.check(d,context=c)['upload_allowed'])
        d=example(); d['guidance_check']['guidance_conflict']=True
        self.assertFalse(self.check(d)['upload_allowed'])

    def test_initial_hypotheses_allowed_without_fabricated_history(self):
        c=deepcopy(CONTEXT);c.pop('expectation_baseline');c.pop('report_public_at')
        c['expectation_review']=dict(status='initial_hypotheses', prior_hypotheses_available=False,
                                    evidence='已读上一期报告，无可验证量化假设')
        d=example();d['quarter_performance']='未验证'
        self.assertTrue(self.check(d,context=c)['upload_allowed'])
        for label in ['符合预期','超预期','不如预期',None,'']:
            d['quarter_performance']=label
            self.assertFalse(self.check(d,context=c)['upload_allowed'])

    def test_initial_mode_cannot_hide_existing_comparison_or_skip_new_hypotheses(self):
        c=deepcopy(CONTEXT);c.pop('expectation_baseline')
        c['expectation_review']=dict(status='initial_hypotheses', prior_hypotheses_available=False,
                                    evidence='历史检查记录')
        d=example();d['quarter_performance']='未验证'
        for change in ['existing','missing_evidence','history','no_future','graded_items','baseline']:
            cc=deepcopy(c);dd=deepcopy(d)
            if change=='existing':cc['expectation_review']['prior_hypotheses_available']=True
            if change=='missing_evidence':cc['expectation_review']['evidence']=''
            if change=='history':dd['valuation_assumptions']['last_assumptions_vs_actual']=[dict(metric='毛利率',assumed='25%',actual='25%',result='符合预期')]
            if change=='no_future':dd['valuation_assumptions']['current_assumptions']=[]
            if change=='graded_items':dd['financial_performance']['inline_items']=['默认符合预期']
            if change=='baseline':cc['expectation_baseline']=CONTEXT['expectation_baseline']
            self.assertFalse(self.check(dd,context=cc)['upload_allowed'])

    def test_unverified_quarter_label_requires_explicit_initial_review(self):
        d=example();d['quarter_performance']='未验证'
        self.assertFalse(self.check(d)['upload_allowed'])

if __name__ == '__main__':
    unittest.main()
