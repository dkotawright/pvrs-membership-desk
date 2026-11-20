export const RATINGS = [
  ["reliability", "Reliability"],
  ["flexibility", "Flexibility"],
  ["timeManagement", "Time management"],
  ["communication", "Communication skills"],
  ["responsibility", "Responsibility"],
  ["appearance", "Appearance"],
  ["disposition", "Disposition"],
] as const;

export const refQuestions = (f: string) => [
  ["known", `How long have you known ${f}, and in what capacity?`, true],
  ["skills", `What are ${f}'s primary skills and qualities? Which areas could they improve on?`, true],
  ["getAlong", `How would you describe ${f}'s ability to get along with others?`, true],
  ["criticism", `How does ${f} handle constructive criticism?`, true],
  ["reservations", `Would you have any reservations about recommending ${f} as a volunteer of Potsdam Rescue?`, true],
  ["other", `Is there anything else you can tell us that might help us reach a decision?`, true],
  ["others", `Is there anyone else you feel we should talk to about ${f}? If so, please give us their contact information.`, false],
] as const;

export const trustQuestion = (f: string) =>
  `Within Potsdam Rescue we deal with large amounts of personal information. Do you feel ${f} is trustworthy and would not disclose such information?`;

export interface RefAnswers {
  known: string;
  skills: string;
  getAlong: string;
  criticism: string;
  ratings: Record<string, number>;
  trustworthy: string;
  reservations: string;
  other: string;
  others: string;
  signName: string;
}

export function blankRefAnswers(): RefAnswers {
  return { known: "", skills: "", getAlong: "", criticism: "", ratings: {}, trustworthy: "", reservations: "", other: "", others: "", signName: "" };
}

export function refProblems(a: RefAnswers, firstName: string) {
  const out: { k: string; msg: string }[] = [];
  for (const [k, label, req] of refQuestions(firstName)) {
    if (req && !String(a[k as keyof RefAnswers] || "").trim()) out.push({ k, msg: label.replace(/\?.*$/, "?") });
  }
  const missing = RATINGS.filter(([k]) => !a.ratings[k]).map(([, l]) => l);
  if (missing.length) out.push({ k: "rate:" + RATINGS.find(([k]) => !a.ratings[k])![0], msg: `Rate: ${missing.join(", ")}` });
  if (!a.trustworthy) out.push({ k: "trustworthy", msg: "Answer the question about personal information." });
  if (String(a.signName || "").trim().length < 2) out.push({ k: "signName", msg: "Type your name." });
  return out;
}

export function refResponse(a: RefAnswers, now = Date.now()) {
  const s = (v: string) => String(v || "").trim().slice(0, 4000);
  const ratings: Record<string, number> = {};
  for (const [k] of RATINGS) ratings[k] = a.ratings[k];
  return {
    v: 1,
    hp: "",
    submittedAt: now,
    answers: {
      known: s(a.known),
      skills: s(a.skills),
      getAlong: s(a.getAlong),
      criticism: s(a.criticism),
      ratings,
      trustworthy: a.trustworthy,
      reservations: s(a.reservations),
      other: s(a.other),
      others: s(a.others),
      signName: s(a.signName).slice(0, 200),
      signDate: new Date(now).toISOString().slice(0, 10),
    },
  };
}
