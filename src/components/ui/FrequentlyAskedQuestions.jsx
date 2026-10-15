import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./Accordion.jsx";
import { Reveal } from "./Reveal.jsx";
import "./frequently-asked-questions.css";

export function FrequentlyAskedQuestions({
  title = "Frequently asked questions",
  description,
  contact,
  data = [],
  className,
}) {
  return <section className={["faq", className].filter(Boolean).join(" ")}>
    <div className="faq-inner">
      <Reveal as="h2" className="faq-title">{title}</Reveal>

      {(description || contact) && <Reveal as="p" className="faq-description" index={1}>
        {description}{description && contact ? " " : null}{contact}
      </Reveal>}

      <Reveal className="faq-list" index={2}>
        <Accordion collapsible>
          {data.map((item, index) => <Reveal key={item.question} delay={Math.min(index, 6) * 0.04} y={8} duration={0.5}>
            <AccordionItem value={`item-${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          </Reveal>)}
        </Accordion>
      </Reveal>
    </div>
  </section>;
}
