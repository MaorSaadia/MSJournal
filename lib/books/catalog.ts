export const bookCategories = ["Foundations", "Strategies", "Psychology"] as const;
export type BookCategory = (typeof bookCategories)[number];
export type TradingBook = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  shortDescription: string;
  fullDescription: string[];
  category: BookCategory;
  audience: string;
  highlights: string[];
  cover: { path: string; alt: string; width: number; height: number } | null;
  amazonUrl?: string;
  companionHref?: string;
  order: number;
  featured: boolean;
  seriesLabel?: string;
  includes?: string[];
  related: string[];
};
const cover = (slug: string, title: string, height = 1440, width = 900): NonNullable<TradingBook["cover"]> => ({
  path: `/books/${slug}.webp`, alt: `${title} — front cover, by Maor Saadia`, width, height,
});

// Add Amazon links ONLY in amazonUrl below. All purchase actions use this catalog.
// Source: supplied descriptions and covers; the existing companion supplies the
// Consistent Day Trader title and worksheet connection. No manuscripts are public.
export const tradingBooks: TradingBook[] = [
  {
    id: "absolute-beginners", slug: "day-trading-for-absolute-beginners",
    title: "Day Trading For Absolute Beginners", subtitle: "From Zero to Your First Trade", author: "Maor Saadia",
    shortDescription: "A step-by-step starting point for charts, trading sessions and your first practice trade.",
    fullDescription: [
      "Start with the essentials, even if a price chart currently feels like a foreign language. This guide introduces the vocabulary, tools and practical workflow behind a planned trade.",
      "Learn candlesticks and timeframes, set up a TradingView workspace, and walk through a first trade using paper trading. The book also introduces liquidity, major trading sessions, high-impact news preparation, and account and order setup on TradingView and Tradovate.",
      "The learning path moves from practice toward understanding prop firm evaluations. It is written for readers exploring stocks, forex, futures or crypto who want to build a foundation before taking on more complexity.",
    ],
    category: "Foundations", audience: "New traders with no prior experience who want a clear, practical place to begin.",
    highlights: ["Candlesticks, chart reading and timeframes", "TradingView setup and paper-trading workflow", "Major sessions and preparation around news", "An introduction to liquidity and funded trading"],
    cover: cover("day-trading-for-absolute-beginners", "Day Trading For Absolute Beginners"),
    amazonUrl: "https://www.amazon.com/dp/B0FQBBK2SH", order: 1, featured: true, related: ["smart-money", "operator-1", "masterclass"],
  },
  {
    id: "smart-money", slug: "smart-money-simplified",
    title: "Smart Money, Simplified", subtitle: "Your Complete ICT Blueprint from Beginner to Consistent Trader", author: "Maor Saadia",
    shortDescription: "Connect liquidity, market structure and entry concepts into a structured trading plan.",
    fullDescription: [
      "A structured introduction to ICT and Smart Money Concepts, supported by annotated charts and examples. The focus is on connecting concepts rather than collecting isolated patterns.",
      "Explore liquidity grabs, stop hunts and the Judas Swing alongside Breaks of Structure and Changes of Character. Fair Value Gaps and Order Blocks are placed within a workflow that includes multi-timeframe analysis, daily bias, execution and management.",
      "Risk management and the pressure of fear, FOMO and greed are part of the discussion, together with a bonus chapter on preparing for prop firm challenges.",
    ],
    category: "Strategies", audience: "Readers ready to move from basic chart knowledge into a repeatable ICT analysis and planning process.",
    highlights: ["Liquidity, stop hunts and the Judas Swing", "Market structure: BOS and CHOCH", "Fair Value Gaps and Order Blocks", "A trading-plan checklist, risk and psychology"],
    cover: cover("smart-money-simplified", "Smart Money, Simplified"),
    amazonUrl: "https://www.amazon.com/dp/B0FMDZ98CL", order: 2, featured: false, related: ["absolute-beginners", "ict-playbook", "masterclass"],
  },
  {
    id: "ict-playbook", slug: "the-ict-playbook",
    title: "THE ICT PLAYBOOK", subtitle: "Mastering the Advanced ICT Models for Funded Trading", author: "Maor Saadia",
    shortDescription: "A closer look at advanced ICT models, confluence and a top-down execution framework.",
    fullDescription: [
      "The sequel to Smart Money, Simplified moves beyond the fundamentals into specific, rule-based ICT models. It is intended for readers who already understand the basic language of Smart Money Concepts.",
      "Study the Power of Three and Judas Swing, the ICT 2022 Silver Bullet, Breaker and Mitigation Blocks, SMT Divergence, and an introduction to IPDA. A professional framework brings those models together in a top-down trading plan.",
      "The funded-trader mindset section considers discipline and risk protocols, including the book's 0.5% risk rule and circuit-breaker habit. These are educational frameworks to assess in the context of an individual plan and account rules.",
    ],
    category: "Strategies", audience: "Traders familiar with basic ICT concepts who want to study advanced models and structured execution.",
    highlights: ["Power of Three and the Judas Swing", "Silver Bullet timing and entry model", "Breaker Blocks, Mitigation Blocks and SMT", "IPDA, top-down planning and risk protocols"],
    cover: cover("the-ict-playbook", "THE ICT PLAYBOOK", 1406),
    amazonUrl: "https://www.amazon.com/dp/B0FMJWBDJ3", order: 3, featured: false, related: ["smart-money", "operator-2", "ict-codex"],
  },
  {
    id: "masterclass", slug: "the-modern-ict-traders-masterclass",
    title: "The Modern ICT Trader's Masterclass", subtitle: "The 3-in-1 Path from A-Z to Day Trading Mastery", author: "Maor Saadia",
    shortDescription: "The three-book learning path, from first principles to advanced ICT models, in one volume.",
    fullDescription: [
      "A 3-in-1 volume integrating Day Trading For Absolute Beginners, Smart Money, Simplified, and THE ICT PLAYBOOK into one educational journey. These are the same three titles also available individually in this catalog.",
      "Begin with charts, candlesticks and timeframes, then explore liquidity, market structure, Fair Value Gaps, Order Blocks and session timing. The advanced portion introduces PO3, the Judas Swing, Silver Bullet, Breaker and Mitigation Blocks, SMT Divergence and IPDA.",
      "The volume also includes risk management, trading discipline, preparation for prop firm challenges, and a Trader's Daily Execution Checklist. Choose this collection when you prefer the combined path rather than separate volumes.",
    ],
    category: "Strategies", audience: "Readers who prefer the foundations-to-advanced series together in a single volume.",
    highlights: ["The complete three-book learning sequence", "Foundations, liquidity and market structure", "Advanced entry models and session timing", "Risk, psychology and a daily execution checklist"],
    cover: cover("the-modern-ict-traders-masterclass", "The Modern ICT Trader's Masterclass", 1000, 625),
    amazonUrl: "https://www.amazon.com/dp/B0FRM58PL5", order: 4, featured: false, includes: ["absolute-beginners", "smart-money", "ict-playbook"],
    related: ["absolute-beginners", "smart-money", "ict-playbook"],
  },
  {
    id: "ict-codex", slug: "the-institutional-ict-codex",
    title: "THE INSTITUTIONAL ICT CODEX", subtitle: "The Definitive Guide to Smart Money Concepts (SMC) for Day Trading Forex, Futures & Indices", author: "Maor Saadia",
    shortDescription: "A structured reference for ICT concepts, time-and-price analysis and execution models.",
    fullDescription: [
      "A textbook-style guide organizing ICT and Smart Money Concepts into a connected curriculum for forex, futures and index traders. It is designed as a reference for readers who want to understand how individual concepts fit together.",
      "Topics include price action, displacement, Market Structure Shifts, Order Blocks, Fair Value Gaps, Breakers and liquidity pools. Time-and-price study includes London and New York Kill Zones, alongside checklists for the 2022 Mentorship Model, Silver Bullet and Unicorn Setup.",
      "The framework also addresses risk management and the psychological demands of prop firm evaluations and funded accounts. The emphasis is on study, planning and a structured approach to execution.",
    ],
    category: "Strategies", audience: "Students who know individual concepts but want a desk reference and a more connected framework.",
    highlights: ["Price action, displacement and structure shifts", "Order Blocks, FVGs, Breakers and liquidity", "London and New York session timing", "Execution checklists, risk and psychology"],
    cover: cover("the-institutional-ict-codex", "THE INSTITUTIONAL ICT CODEX", 1350),
    amazonUrl: "https://www.amazon.com/dp/B0G83TBLYC", order: 5, featured: false, related: ["smart-money", "ict-playbook", "operator-2"],
  },
  {
    id: "disciplined-edge", slug: "the-disciplined-edge",
    title: "The Disciplined Edge", subtitle: "Mastering the Mental Game of Institutional Trading", author: "Maor Saadia",
    shortDescription: "Explore the behavior, pressure and risk decisions that sit behind technical knowledge.",
    fullDescription: [
      "Recognizing a setup and following a plan under pressure are different challenges. The Disciplined Edge focuses on the mental game: impulsive decisions, revenge trading, emotional reactions and the difficulty of following a consistent process.",
      "The book discusses stress responses, the 'Invisible Wall,' probability-based thinking and a personal Code of Conduct. It considers the move from growth to preservation when approaching prop firm evaluations and funded accounts.",
      "This is a practical discussion of discipline and risk-minded decision-making rather than a collection of chart setups. It is for readers who want to examine how they respond when trading becomes uncomfortable.",
    ],
    category: "Psychology", audience: "Traders who understand setups but want to work on impulsivity, emotional pressure and process discipline.",
    highlights: ["Recognizing emotional reactions under pressure", "Revenge trading and impulsive behavior", "Probability-minded thinking and preservation", "A Code of Conduct for trading decisions"],
    cover: cover("the-disciplined-edge", "The Disciplined Edge", 1000, 625),
    amazonUrl: "https://www.amazon.com/dp/B0GFCX3QGV", order: 6, featured: true, related: ["consistent-day-trader", "operator-2"],
  },
  {
    id: "operator-1", slug: "the-institutional-operator-book-1",
    title: "The Institutional Operator", subtitle: "From Zero to Funded: The Complete ICT & Smart Money Masterclass", author: "Maor Saadia", seriesLabel: "Book 1",
    shortDescription: "Build the foundations of market structure, liquidity and a considered trading process.",
    fullDescription: [
      "Book 1 begins with the essentials of markets, chart reading and day trading before developing the language of ICT and Smart Money Concepts. It is written for readers seeking a structured education rather than disconnected tactics.",
      "Explore market structure, liquidity, wick grabs, Fair Value Gaps, Order Blocks, premium and discount, session timing and top-down analysis. The emphasis is on placing these ideas in the context of a practical trading plan.",
      "The framework connects technical knowledge with timing, process and discipline. It is a starting point for new students, readers rebuilding after confusion, or traders preparing a stronger foundation for funded trading.",
    ],
    category: "Foundations", audience: "Beginners and returning students who want foundations that connect naturally to a structured ICT framework.",
    highlights: ["Day-trading foundations and chart reading", "Structure, liquidity and smart money concepts", "FVGs, Order Blocks, premium and discount", "Top-down analysis and a practical decision process"],
    cover: cover("the-institutional-operator-book-1", "The Institutional Operator — Book 1", 1350),
    amazonUrl: "https://www.amazon.com/dp/B0GX2YKYJH", order: 7, featured: true, related: ["operator-2", "absolute-beginners", "smart-money"],
  },
  {
    id: "operator-2", slug: "the-institutional-operator-book-2",
    title: "The Institutional Operator", subtitle: "Advanced Execution, Risk & The Disciplined Edge", author: "Maor Saadia", seriesLabel: "Book 2",
    shortDescription: "Connect advanced models with risk architecture, review and discipline under pressure.",
    fullDescription: [
      "Book 2 develops the applied side of ICT and Smart Money execution for readers who already understand the foundations. It connects model selection and timing with the ability to carry a plan through real market conditions.",
      "Study the Power of Three, Silver Bullet, Breaker Blocks, Mitigation Blocks, SMT Divergence and model-based top-down execution as connected tools within a broader framework.",
      "The discussion extends into risk architecture, review systems, drawdown management, process compliance, behavioral discipline, self-trust and recovery after setbacks. The focus is on execution, structure and long-term trader identity.",
    ],
    category: "Strategies", audience: "Readers ready to move beyond concept recognition into applied execution, review and risk management.",
    highlights: ["Advanced ICT models, PO3 and Silver Bullet", "Breakers, Mitigations and SMT Divergence", "Risk architecture, drawdown and review systems", "Behavioral discipline and recovery after setbacks"],
    cover: cover("the-institutional-operator-book-2", "The Institutional Operator — Book 2", 1352),
    amazonUrl: "https://www.amazon.com/dp/B0H3THY9VN", order: 8, featured: false, related: ["operator-1", "ict-playbook", "disciplined-edge"],
  },
  {
    id: "consistent-day-trader", slug: "the-consistent-day-trader",
    title: "The Consistent Day Trader", subtitle: "A Practical Guide to Trading Psychology, Risk Management, and Prop Firm Challenges", author: "Maor Saadia",
    shortDescription: "Explore the gap between knowing your trading rules and following them under pressure, with practical risk boundaries and four reusable worksheets.",
    fullDescription: [
      "You had a plan. Then the market opened.",
      "Your limit order missed by one tick. You watched price reach your target without you. Your balance hadn’t changed but somehow, it felt like you had lost. So you entered late. Took a weaker setup. And one missed opportunity became a session spent trying to recover.",
      "Or perhaps you hesitate when your setup appears, close trades out of fear, or increase your size after a winning streak. You know your rules. Following them under pressure is where things get difficult.",
      "The Consistent Day Trader explores the gap between knowing what to do and actually doing it. Maor Saadia brings trading psychology, risk management, and trade execution together in a practical guide to making clearer decisions before, during, and after a trade.",
      "You’ll also find four reusable worksheets to build your personal operating plan, prepare and review a session, reset after a missed trade or loss, and practice a better response. The companion worksheets remain free to use without purchasing a book.",
      "Written for traders who understand the basics but struggle with execution, this book helps you examine both your behavior and the method behind it. Discipline matters but it does not make every strategy profitable or guarantee a payout.",
      "The next trade doesn’t need to fix the last one. It needs a decision you can stand behind.",
      "Start building the plan you want beside you when the session gets difficult.",
    ],
    category: "Psychology", audience: "Traders who understand the basics but struggle with execution and following their rules under pressure.",
    highlights: [
      "Recognize FOMO, revenge trading, and overtrading and prepare a response before frustration takes control.",
      "Set risk boundaries you can follow, with position sizing, session limits, and a plan for losing streaks and drawdowns.",
      "Manage an open trade with clearer rules for holding, exiting, or adjusting when the profit display competes for your attention.",
      "Approach prop firm challenges with a realistic plan, accounting for loss limits, evaluation costs, target pressure, and life beyond the first payout.",
      "Turn your trading journal into useful action by reviewing recurring patterns and practicing one deliberate change at a time.",
      "Evaluate progress without racing someone else’s timeline, while staying honest about your results, costs, and reasons to continue.",
    ],
    cover: cover("the-consistent-day-trader", "The Consistent Day Trader", 1343), companionHref: "/book", amazonUrl: "", order: 9, featured: false,
    related: ["disciplined-edge", "operator-2"],
  },
];

export const orderedBooks = [...tradingBooks].sort((a, b) => a.order - b.order);
export const findBook = (slug: string) => tradingBooks.find((b) => b.slug === slug);
export const bookById = (id: string) => tradingBooks.find((b) => b.id === id);

// Explicit Amazon domains, HTTPS, and no credentials. Never accept lookalike hosts.
const amazonDomains = ["amazon.com", "amazon.co.uk", "amazon.ca", "amazon.com.au", "amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.nl", "amazon.co.jp", "amazon.in", "amazon.com.br", "amazon.com.mx", "amazon.se", "amazon.pl", "amazon.com.be", "amazon.ie", "amazon.ae", "amazon.sa", "amazon.sg", "amazon.co.za", "amazon.com.tr", "amzn.to"];
export function amazonLink(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && amazonDomains.some((d) => url.hostname === d || url.hostname === `www.${d}`) ? url.toString() : null;
  } catch { return null; }
}
