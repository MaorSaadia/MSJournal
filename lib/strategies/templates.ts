import { emptyPlaybook, type Playbook } from "./model";
export const confirmationChoices = [
  "Liquidity sweep",
  "Displacement",
  "FVG",
  "Order block",
  "MSS",
  "CISD",
  "SMT",
  "OTE",
  "Killzone",
  "Opening range",
  "VWAP",
  "Volume profile",
  "Trendline",
  "Range high/low",
];
export type StarterTemplate = {
  id: string;
  category: string;
  name: string;
  initials: string;
  description: string;
  fields: Playbook;
};
function starter(
  id: string,
  name: string,
  initials: string,
  description: string,
  confirmations: string[],
  context: string,
  entry: string,
  color: Playbook["color"] = "violet",
): StarterTemplate {
  const number = Number(id);
  return {
    id: `starter-${id}`,
    category: number <= 9 ? "ICT models" : "Price action & indicators",
    name,
    initials,
    description,
    fields: {
      ...emptyPlaybook(),
      name,
      description,
      color,
      context,
      entry,
      invalidation:
        "Define the condition that invalidates your idea before entry.",
      stop: "Describe your stop location and the risk you are willing to take.",
      exit: "Mark your intended target and describe when you will exit.",
      management:
        "Write how you will manage the position and when you will stop trading.",
      avoid: "List the conditions that make this setup unsuitable for you.",
      checklist: confirmations.map((text, index) => ({
        id: `00000000-0000-4000-8000-${String(number * 100 + index + 1).padStart(12, "0")}`,
        text,
      })),
    },
  };
}
// Editable planning structures, not validated systems or performance claims.
export const starterTemplates: StarterTemplate[] = [
  starter(
    "1",
    "Silver Bullet",
    "SB",
    "A focused session-window checklist and entry plan.",
    [
      "Trading window defined",
      "FVG confirmation reviewed",
      "Invalidation and target defined",
    ],
    "Define your session window, directional context and reference levels.",
    "Describe the displacement and FVG confirmation you require before entry.",
    "emerald",
  ),
  starter(
    "2",
    "Judas Swing",
    "JS",
    "Plan a false-move reversal with clear confirmation.",
    [
      "Session reference range marked",
      "Liquidity sweep reviewed",
      "Reversal confirmation defined",
    ],
    "Mark the session reference range and describe your reversal context.",
    "Define how you distinguish the initial move from a confirmed reversal.",
  ),
  starter(
    "3",
    "Power of 3",
    "P3",
    "Organize a plan around a range, a move and confirmation.",
    [
      "Reference range identified",
      "Manipulation criteria defined",
      "Directional confirmation reviewed",
    ],
    "Describe the accumulation range and your expected directional context.",
    "Write the confirmation you require after the move beyond the range.",
    "blue",
  ),
  starter(
    "4",
    "OTE",
    "OT",
    "Prepare a retracement entry with explicit invalidation.",
    [
      "Directional leg marked",
      "Retracement area defined",
      "Entry confirmation reviewed",
    ],
    "Identify the directional leg and retracement area you will watch.",
    "Define your retracement conditions and confirmation before entry.",
    "amber",
  ),
  starter(
    "5",
    "Turtle Soup",
    "TS",
    "Structure a failed-breakout reversal checklist.",
    [
      "Reference high or low marked",
      "Failed-breakout criteria defined",
      "Reversal confirmation reviewed",
    ],
    "Mark the reference high or low and describe the relevant context.",
    "Write the failed-breakout and return conditions required for your entry.",
    "rose",
  ),
  starter(
    "6",
    "SMT Divergence",
    "SM",
    "Record the comparison and confirmation you require.",
    [
      "Comparison instruments defined",
      "Divergence criteria reviewed",
      "Independent entry confirmation defined",
    ],
    "Name the instruments and levels you compare, and define divergence in your plan.",
    "Describe the separate confirmation you require before taking a trade.",
  ),
  starter(
    "7",
    "AMD",
    "AM",
    "A checklist for accumulation, manipulation and distribution.",
    [
      "Accumulation area marked",
      "Manipulation criteria defined",
      "Distribution confirmation reviewed",
    ],
    "Describe the range and the conditions you use to identify each stage.",
    "Define your entry confirmation, rather than assigning a stage automatically.",
    "emerald",
  ),
  starter(
    "8",
    "Seek and Destroy",
    "SD",
    "Prepare for two-sided movement with explicit stay-out rules.",
    [
      "Both sides of the range marked",
      "Volatility conditions reviewed",
      "Stay-out and confirmation rules defined",
    ],
    "Mark the range and the conditions in which you expect two-sided movement.",
    "Define when you will wait and what confirmation makes an entry acceptable.",
    "rose",
  ),
  starter(
    "9",
    "NWOG / NDOG",
    "NG",
    "Organize opening-gap reference levels and execution rules.",
    [
      "Opening-gap references marked",
      "Directional context recorded",
      "Entry and invalidation defined",
    ],
    "Record the weekly/daily opening-gap references you choose to watch.",
    "Describe how your reference levels combine with a separate entry confirmation.",
    "blue",
  ),
  starter(
    "10",
    "Opening Range Breakout",
    "OR",
    "A reusable opening-range and breakout plan.",
    [
      "Opening range and timezone defined",
      "Breakout confirmation reviewed",
      "Invalidation and target defined",
    ],
    "Define the opening-range duration, session timezone and reference levels.",
    "Describe the breakout or retest confirmation you require.",
    "emerald",
  ),
  starter(
    "11",
    "VWAP Reclaim",
    "VW",
    "Build your reclaim conditions and risk plan.",
    [
      "VWAP reference defined",
      "Reclaim criteria reviewed",
      "Entry and invalidation defined",
    ],
    "Record the VWAP reference and market context you use.",
    "Define a reclaim, your confirmation and the conditions under which you will wait.",
    "blue",
  ),
  starter(
    "12",
    "Volume Profile",
    "VP",
    "Map profile references and confirmation conditions.",
    [
      "Profile references marked",
      "Market context reviewed",
      "Confirmation and invalidation defined",
    ],
    "Name the profile session and reference areas relevant to your plan.",
    "Describe your entry confirmation at a reference area.",
    "amber",
  ),
  starter(
    "13",
    "Breakout & Retest",
    "BR",
    "A simple level, breakout and retest checklist.",
    [
      "Reference level marked",
      "Breakout criteria met",
      "Retest confirmation reviewed",
    ],
    "Describe the level, trend/range context and conditions to avoid.",
    "Define your breakout, retest and entry confirmation.",
    "emerald",
  ),
];
