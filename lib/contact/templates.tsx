import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";
import type { ReactNode } from "react";

function Frame({ title, reference, topic, children }: { title: string; reference: string; topic: string; children: ReactNode }) {
  return <Html lang="en">
    <Head />
    <Preview>{title} · {reference}</Preview>
    <Body style={{ backgroundColor: "#fff", color: "#17252c", fontFamily: "Arial, sans-serif", margin: 0 }}>
      <Container style={{ maxWidth: 560, padding: "24px 20px", boxSizing: "border-box" }}>
        <Text style={{ color: "#00765b", fontSize: 22, fontWeight: 700 }}>MSJournal</Text>
        <Heading as="h1" style={{ fontSize: 25, lineHeight: 1.25 }}>{title}</Heading>
        <Section style={{ backgroundColor: "#edf8f3", borderRadius: 8, padding: "4px 16px" }}>
          <Text style={{ lineHeight: 1.5 }}><strong>Topic</strong> {topic}<br /><strong>Reference</strong> {reference}</Text>
        </Section>
        {children}
      </Container>
    </Body>
  </Html>;
}

type Summary = { reference: string; topic: string };
export const confirmationCopy = "Thank you for contacting MSJournal. We received your message. You can reply to this email to add more information.";

export function SupportNotification({ reference, topic, email, message, receipt }: Summary & { email: string; message: string; receipt?: string }) {
  return <Frame title="New support message" reference={reference} topic={topic}>
    <Text style={{ wordBreak: "break-word" }}><strong>Reply email</strong> {email}</Text>
    {receipt && <Text style={{ wordBreak: "break-word" }}><strong>Whop receipt or order ID</strong> {receipt}</Text>}
    <Heading as="h2" style={{ fontSize: 17 }}>Message</Heading>
    <Text style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.65, fontSize: 16 }}>{message}</Text>
  </Frame>;
}

export function VisitorConfirmation({ reference, topic }: Summary) {
  return <Frame title="We received your message" reference={reference} topic={topic}>
    <Text style={{ fontSize: 16, lineHeight: 1.65 }}>{confirmationCopy}</Text>
  </Frame>;
}
