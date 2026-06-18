"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { MinusSmallIcon, PlusSmallIcon } from "@heroicons/react/24/outline";

export default function FAQDisclosure({ faqs }) {
  return (
    <dl className="mt-16 divide-y divide-border-subtle">
      {faqs.map((faq) => (
        <Disclosure
          key={faq.question}
          as="div"
          className="py-6 first:pt-0 last:pb-0"
        >
          <dt>
            <DisclosureButton className="group flex w-full items-start justify-between text-left text-text">
              <span className="text-base/7 font-semibold">{faq.question}</span>
              <span className="ml-6 flex h-7 items-center text-text-tertiary">
                <PlusSmallIcon
                  aria-hidden="true"
                  className="size-6 group-data-[open]:hidden"
                />
                <MinusSmallIcon
                  aria-hidden="true"
                  className="size-6 group-not-data-[open]:hidden"
                />
              </span>
            </DisclosureButton>
          </dt>
          <DisclosurePanel as="dd" className="mt-2 pr-12">
            <p className="text-base/7 text-text-secondary">{faq.answer}</p>
          </DisclosurePanel>
        </Disclosure>
      ))}
    </dl>
  );
}
