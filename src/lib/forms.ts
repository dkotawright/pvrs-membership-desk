/** Orientation forms. Wording is PVRS's, from the paper sheets. Hep B declination is medical and goes to the vault. */

export interface FormDef {
  key: string;
  title: string;
  item?: RegExp;
  rev?: string;
  intro?: string;
  bullets?: string[];
  statement?: string;
  more?: string;
  sign?: string;
  counter?: string;
  foot?: string;
  lead?: string;
  tf?: string[];
  scen?: string[];
  groups?: [string, [string, string, number?, string?][]][];
  optional?: string;
  confidential?: boolean;
}

export const FORMS: FormDef[] = [
  {
    key: "confidentiality", item: /confidentiality statement/i, title: "Confidentiality Statement", rev: "10/2015",
    intro: "I, the undersigned, hereby acknowledge that as conditions for working/volunteering with Potsdam Volunteer Rescue Squad, Inc. the following aspects of confidentiality were explained to me:",
    bullets: [
      "I may not make public, or reveal to persons outside of PVRS, any information about a patient or patients family which I have gained as a result of my association with PVRS.",
      "I acknowledge that even though my position at PVRS (paid or volunteer) may end, information about a patient or patient's family may never be divulged and will be kept in strict confidence.",
      "I may not discuss personnel matters, the private lives of other PVRS members (paid/volunteer), or internal organizational issues with PVRS patients or their families.",
      "The transmission of all verbal and written communications regarding patients, is based on the principle that others “need to know” information. All requests for release of information to the media must be approved by either the CLO or President. Release of Protected Health Information for reasons other than patient care, billing, or health care operations, requires a written authorization from the patient or patient's representative.",
      "I understand that failure to maintain confidentiality could result in disciplinary actions, termination of employment or volunteer status, or possible legal actions.",
    ],
    sign: "Signature of Employee or Volunteer", counter: "Supervisor/Authorized Representative of PVRS",
    foot: "All PVRS staff and volunteers are required to sign this form annually.",
  },
  {
    key: "confquiz", title: "Confidentiality Quiz", lead: "Answer True or False.",
    tf: [
      "The PVRS patient has a right to privacy and confidentiality. We protect patient records and billing records. If a report must leave, we remove identifying data.",
      "All requests for patient information must be in written form.",
      "My home address and phone number are confidential and should not be released without my consent.",
      "The CAG billing information is sitting on an employee's desk, you are in the office, you can pick up the PCR's and read them over.",
      "You stop into dispatch and you heard an interesting call on the radio, so you open the PCR draw to see who, what, where the call was. This is a breech of confidentiality.",
      "You are going to the Post Office, and offer to get the PVRS mail. You are there when the mail is being opened, you have the right to see what the checks and bills are for.",
    ],
    scen: [
      "Someone asks you—“I know Mrs. Jones was picked up by PVRS. What was wrong?” What do you say?",
      "I saw the ambulance at the Smith house, who was it? What is your response?",
      "You are having lunch with a friend, and say you were on a call, at a specific address, and a relative has moved in to help. Was this appropriate information to share?",
      "You are meeting with several other PVRS members who were not a call with you. Can you talk about the patient or family of the call you just ran?",
      "You are in line at the store, you run into another PVRS member. Since you do not see each other very often, can you tell them about the recent call you just ran? What about in the parking lot?",
    ],
  },
  {
    key: "bylaws", item: /constitution/i, title: "Constitution and Bylaws",
    statement: "I, {name}, on this date, {date}, received a copy of the Potsdam Volunteer Rescue Squad's Constitution and Bylaws. It is my responsibility to read and abide by the Constitution and Bylaws set forth by Potsdam Volunteer Rescue Squad.",
    sign: "Member's Signature", counter: "Witness's Signature",
  },
  {
    key: "emergency", item: /emergency contact/i, title: "Emergency Contact Form",
    groups: [
      ["Member Demographics", [["m_name", "Name", 1], ["m_address", "Address", 1], ["m_city", "City", 1], ["m_phone", "Phone", 1, "tel"], ["m_email", "E-Mail", 1, "email"], ["m_position", "Position"]]],
      ["Emergency Contact Information Primary", [["p_name", "Name", 1], ["p_address", "Address"], ["p_phone", "Phone", 1, "tel"], ["p_email", "Email", 0, "email"]]],
      ["Emergency Contact Information Secondary", [["s_name", "Name"], ["s_address", "Address"], ["s_phone", "Phone", 0, "tel"], ["s_email", "Email", 0, "email"]]],
    ],
  },
  {
    key: "hepb", item: /hep\s?b/i, title: "Hepatitis B Vaccine Declination Form", confidential: true,
    optional: "Only sign this if you are choosing not to get the hepatitis B vaccine. If you're vaccinated, upload your record instead.",
    intro: "The following statement of declination of the hepatitis B vaccine must be signed by an employee who:",
    bullets: [
      "Chooses not to accept the vaccine.",
      "Has had appropriate training regarding hepatitis B, hepatitis B vaccination, the efficacy, safety, method of administration and benefits of vaccination, given free of charge to the employee.",
    ],
    statement: "I understand that due to my occupational exposure to blood or other potentially infectious materials I may be at risk of acquiring hepatitis B virus (HBV) infection. I have been given the opportunity to be vaccinated with hepatitis B vaccine, at no charge to myself. However, I decline hepatitis B vaccination at this time. I understand that by declining this vaccine I continue to be at risk of acquiring hepatitis B, a serious disease. If in the future I continue to have occupational exposure to blood or other potentially infectious materials and I want to be vaccinated with hepatitis B vaccine, I can receive the vaccination series at no charge to me.",
    more: "This statement is not a waiver; employees can request and receive the hepatitis B vaccination at a later date if they remain occupationally at risk for hepatitis B.",
    sign: "Employee Signature",
  },
];

export const HEPB_LABEL = "Hepatitis B vaccine declination (signed on phone)";
export const formByKey = (k: string) => FORMS.find((f) => f.key === k);
export const formForItem = (label: string) => FORMS.find((f) => f.item && f.item.test(label || ""));
export const SIGNABLE = ["confidentiality", "confquiz", "bylaws", "emergency"];

export function readFormValues(f: FormDef, values: Record<string, string>) {
  for (let i = 0; i < (f.tf || []).length; i++) if (!values["tf" + i]) return { missing: `Answer question ${i + 1}.` };
  for (let i = 0; i < (f.scen || []).length; i++) if (!String(values["sc" + i] || "").trim()) return { missing: `Answer the written question ${i + 1}.` };
  for (const [, fields] of f.groups || []) for (const [k, l, req] of fields) if (req && !String(values[k] || "").trim()) return { missing: `Fill in ${l}.` };
  return { values };
}
