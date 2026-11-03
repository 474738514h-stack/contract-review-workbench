import type { ReviewPayload, RiskLevel } from "@/lib/types";

type DemoInput = {
  contractType: string;
  stance: string;
  focus: string[];
};

type DemoOpinion = {
  focus: string;
  level: RiskLevel;
  title: string;
  analysis: string;
  suggestion: string;
};

function stancePhrase(stance: string) {
  if (stance === "中立") return "从中立立场看";
  return `以${stance}立场审查`;
}

function catalog(input: DemoInput): DemoOpinion[] {
  const who = input.stance === "乙方" ? "乙方" : "甲方";
  const counter = who === "甲方" ? "乙方" : "甲方";
  return [
    {
      focus: "付款与结算",
      level: "high",
      title: "付款节点与违约金明显失衡",
      analysis: `${stancePhrase(input.stance)}这份${input.contractType}时，付款义务被集中在签约后很短的期限内，且未与交付、验收挂钩。逾期违约金按合同总额的较高比例按日计算，可能被认定为过高，并使${who}在对方尚未履约时已经承担主要资金风险。`,
      suggestion: `将付款改为分阶段支付：签约后支付 30%，交付或服务开始后支付 40%，验收合格后支付 25%，质保或服务期满支付 5%。逾期付款违约金改为按未付金额、以日万分之五计算，且累计不超过未付金额的 10%。${counter}应在收款前提供合法有效发票。`,
    },
    {
      focus: "交付验收",
      level: "high",
      title: "验收标准与异议期限缺失",
      analysis: "合同如果把“货到即合格”或“未在极短期限内提出异议即视为验收”写成唯一规则，接收方几乎无法主张质量问题。验收标准、样品、测试方法和书面签收之间也没有对应关系。",
      suggestion: `验收应对照附件中的规格、数量和服务范围进行。接收方在交付后 10 个工作日内完成初验，不合格时书面列明问题，交付方在 5 个工作日内整改。整改后仍不合格的，接收方可以拒收、要求减价或解除相应部分。沉默不构成验收合格。`,
    },
    {
      focus: "违约责任",
      level: "medium",
      title: "违约责任只约束一方",
      analysis: `条款如果只约定${who}逾期付款的责任，却没有约定${counter}迟延交付、交付不符或无法提供服务时的责任，双方风险分配明显不对等。固定高额违约金也可能超出实际损失。`,
      suggestion: `双方违约均应承担责任。迟延履行的，按日支付迟延部分金额万分之五的违约金；造成损失的，赔偿实际损失，但一方累计赔偿不超过合同总额的 20%。故意或重大过失、人身损害和保密义务除外，不适用该上限。`,
    },
    {
      focus: "知识产权",
      level: "medium",
      title: "成果权属与使用范围不清楚",
      analysis: "合同未区分签约前已有成果和履约中新产生的成果，也没有写明委托方付款后能否在约定业务范围内使用。权属全部归一方且限制另一方正常使用时，后续交付和二次开发容易产生争议。",
      suggestion: "各方保留其在签约前已经享有的知识产权。履约中专门为对方创作的成果，在对应款项付清后归委托方所有；提供方保留其通用工具、模板和已有组件，并授予委托方不可撤销的、在约定业务范围内使用的许可。提供方保证成果不侵犯第三人权利。",
    },
    {
      focus: "解除终止",
      level: "low",
      title: "解除条件与费用结算未写清",
      analysis: "任意解除如果没有通知期、已完成工作的结算方式和资料返还义务，解除后双方仍可能就已付款项和在途工作发生争议。",
      suggestion: "任何一方提前解除的，应至少提前 15 日书面通知。解除前已完成并验收的部分按约定结算；尚未完成的部分停止履行。已收取但未对应交付成果的款项应在 10 个工作日内退还。保密义务在合同解除后继续有效。",
    },
  ];
}

export function buildDemoReview(input: DemoInput): ReviewPayload {
  const all = catalog(input);
  const selected = input.focus.length
    ? all.filter((item) => input.focus.includes(item.focus))
    : all;
  const opinions = (selected.length > 0 ? selected : all).map((item, index) => ({
    id: `demo-${index + 1}`,
    title: item.title,
    level: item.level,
    analysis: item.analysis,
    suggestion: item.suggestion,
  }));

  return {
    opinions,
    legalSummary:
      "当前为演示结果。本次未连接扣子工作流完成法律引用核验，不能作为正式法律意见。正式审查时，应核对《中华人民共和国民法典》合同编关于合同成立、履行、违约金调整和解除的规定是否被正确引用，并核对条款引用的法律名称、条号和现行有效性。",
    enterpriseSummary:
      "当前为演示结果。本次未查询工商登记、经营状态或失信信息。正式审查时，应核验合同各方的主体名称、统一社会信用代码、存续状态以及签约人是否获得授权。",
    reportUrl: null,
  };
}
