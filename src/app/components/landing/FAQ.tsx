"use client";

import { ChevronDown } from "lucide-react";

type FaqItem = {
  question: string;
  answer: string;
};

const items: FaqItem[] = [
  {
    question: "How long does setup take?",
    answer:
      "About 10 minutes. Create an account, add your menu and print your QR code. You can do everything from your phone.",
  },
  {
    question: "How do customers pay?",
    answer:
      "They pay with DuitNow QR and upload the payment receipt. The money goes straight to your bank account, with no fees taken.",
  },
  {
    question: "Do I need to buy any hardware?",
    answer:
      "No. You use the phone you already have, and the QR code is just printed on paper.",
  },
  {
    question: "Do customers need to download an app?",
    answer:
      "No. They scan the QR code and your menu opens right in the browser. No app, no sign-up, no password.",
  },
  {
    question: "How do customers know their order is ready?",
    answer:
      "They can watch their queue number on their own phone, so they don't need to wait in front of your stall.",
  },
  {
    question: "What if the internet is slow?",
    answer:
      "QueLess still works. It's a lightweight web app built for slow and unstable connections.",
  },
  {
    question: "What happens after the 7-day free trial?",
    answer:
      "It's up to you whether to continue. Cancel anytime, with no contract and no penalty.",
  },
];

export default function FAQ() {
  return (
    <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-bold text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDown
              aria-hidden
              className="h-5 w-5 shrink-0 text-[var(--color-primary)] transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <p className="pb-6 text-base leading-relaxed text-[var(--color-text-secondary)] md:pr-12">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
