import assert from "node:assert/strict";

import { buildDocx } from "./docx";
import { parseWorkflowFields } from "./parse-review";

const parsed = parseWorkflowFields({
  output: JSON.stringify([
    {
      问题: "预付款比例过高",
      风险等级: "高",
      问题分析: "签约后三日内支付全部款项，且未与交付挂钩。",
      修改建议: "改为签约后支付 30%，验收合格后支付剩余款项。",
    },
  ]),
  output1: "引用了《中华人民共和国民法典》第五百八十五条，条号有效。",
  enterprise: "北京示例科技有限公司处于存续状态。",
  url: "https://example.feishu.cn/docx/abc",
});

assert.equal(parsed.opinions.length, 1);
assert.equal(parsed.opinions[0]?.level, "high");
assert.match(parsed.opinions[0]?.suggestion ?? "", /30%/);
assert.match(parsed.legalSummary, /民法典/);
assert.match(parsed.enterpriseSummary, /存续/);
assert.equal(parsed.reportUrl, "https://example.feishu.cn/docx/abc");

const markdown = parseWorkflowFields({
  output: `1. 验收标准缺失
风险等级：中
问题分析：货到即视为合格。
修改建议：增加 10 个工作日的书面验收期。

2. 通知条款不完整
风险等级：低
问题分析：没有约定送达地址。
修改建议：补充双方联系人和电子邮箱。`,
  output1: "",
  enterprise: "",
  url: "",
});

assert.equal(markdown.opinions.length, 2);
assert.equal(markdown.opinions[0]?.level, "medium");
assert.equal(markdown.opinions[1]?.level, "low");
assert.match(markdown.opinions[1]?.suggestion ?? "", /电子邮箱/);

const docx = buildDocx("第一条 测试\n第二条 付款");
assert.equal(docx.subarray(0, 2).toString(), "PK");
assert.ok(docx.includes(Buffer.from("第一条 测试")));

console.log("parser and docx checks passed");
