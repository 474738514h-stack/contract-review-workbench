export type RiskLevel = "high" | "medium" | "low";

export type Opinion = {
  id: string;
  title: string;
  level: RiskLevel;
  analysis: string;
  suggestion: string;
};

export type ReviewPayload = {
  opinions: Opinion[];
  legalSummary: string;
  enterpriseSummary: string;
  reportUrl: string | null;
};

export type ResumeTicket = {
  eventId: string;
  interruptType: number;
};

export type ReviewApiResponse = {
  ok: boolean;
  demo: boolean;
  error: string | null;
  authUrl: string | null;
  resume: ResumeTicket | null;
  result: ReviewPayload | null;
};
