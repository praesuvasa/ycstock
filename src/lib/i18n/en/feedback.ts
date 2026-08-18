import type { th } from "../th/feedback";

export const en: typeof th = {
  topics: {
    system: "System / app",
    work: "Work",
    team: "Coworkers",
    place: "Store / equipment",
    other: "Other",
  },
  staff: {
    intro: "Write about anything — a system that's hard to use, work that's stuck, broken equipment, an issue with a coworker, or an idea to make the store better",
    topicLabel: "What's this about",
    messageLabel: "What's on your mind",
    messagePlaceholder: "Tell it like it happened — no need to hold back",
    wantedActionLabel: "What would you like the company to do next",
    anonymousLabel: "Send anonymously",
    anonymousOnHint: "We won't record your name at all — no one can look up who sent this later (your branch is still included, so the issue can be fixed in the right place)",
    anonymousOffHint: "This will be sent with your name — so we can follow up with you if needed",
    sending: "Sending…",
    submit: "Send to the company",
    errSendFailed: "Couldn't send",
    sentTitle: "Sent — thank you",
    sentBody: "Your message has reached the company — if it needs follow-up, someone will get in touch",
    writeAnother: "Write another",
  },
  admin: {
    empty: "No messages yet",
    anonymous: "Anonymous",
    wantedActionLabel: "What they'd like the company to do",
  },
  errMessageTooShort: "Please add a bit more detail (at least 5 characters)",
};
