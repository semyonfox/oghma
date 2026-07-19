import Link from "next/link";
import PublicInfoPage, { InfoSection } from "@/components/public-info-page";
import {
  agentEndpointGuide,
  agentFacts,
  agentResourceComparison,
} from "@/lib/public/agent-content";

export const metadata = {
  title: "OghmaNotes Info",
  description:
    "Compact OghmaNotes product facts, Markdown links, LLM resources, and agent endpoint documentation.",
  alternates: {
    canonical: "/info",
  },
  openGraph: {
    title: "OghmaNotes Info",
    description:
      "Compact product facts, Markdown resources, LLM files, and documented agent endpoints for OghmaNotes.",
    url: "https://oghmanotes.ie/info",
    type: "website",
  },
};

export default function InfoPage() {
  return (
    <PublicInfoPage
      eyebrow="AI Index"
      title="OghmaNotes product and agent info"
      description="A compact factsheet for students, search engines, AI assistants, and agents that need Markdown resources or documented endpoints."
    >
      <InfoSection title="Short Answer">
        <p>
          OghmaNotes is an AI study workspace for university students. It
          combines Markdown notes, PDF and Canvas import, cited AI answers,
          semantic search, adaptive quizzes, spaced-repetition flashcards, and
          coursework tracking.
        </p>
      </InfoSection>

      <InfoSection title="Core Facts">
        <ul className="list-disc space-y-2 pl-6">
          {agentFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </InfoSection>

      <InfoSection title="Markdown Access">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Request this page as Markdown with{" "}
            <code>Accept: text/markdown</code> or{" "}
            <Link className="text-primary-300 hover:text-primary-200" href="/info?format=md">
              /info?format=md
            </Link>
            .
          </li>
          <li>
            Use{" "}
            <Link className="text-primary-300 hover:text-primary-200" href="/info.md">
              /info.md
            </Link>{" "}
            for the compact Markdown factsheet.
          </li>
          <li>
            Use{" "}
            <Link className="text-primary-300 hover:text-primary-200" href="/ai.md">
              /ai.md
            </Link>{" "}
            or{" "}
            <Link className="text-primary-300 hover:text-primary-200" href="/llms-full.txt">
              /llms-full.txt
            </Link>{" "}
            for the full profile.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Resource Comparison">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-subtle text-left text-sm">
            <thead>
              <tr className="text-text">
                <th className="py-3 pr-4 font-semibold">URL</th>
                <th className="py-3 pr-4 font-semibold">Format</th>
                <th className="py-3 font-semibold">Best use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {agentResourceComparison.map((resource) => (
                <tr key={resource.path}>
                  <td className="py-3 pr-4">
                    <Link
                      className="text-primary-300 hover:text-primary-200"
                      href={resource.path}
                    >
                      {resource.path}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{resource.format}</td>
                  <td className="py-3">{resource.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection title="Endpoint Quickstart">
        <p>
          The structured version is available at{" "}
          <Link className="text-primary-300 hover:text-primary-200" href="/agent-api.json">
            /agent-api.json
          </Link>{" "}
          and{" "}
          <Link className="text-primary-300 hover:text-primary-200" href="/openapi.json">
            /openapi.json
          </Link>
          . Authenticated endpoints require the user&apos;s browser session.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-subtle text-left text-sm">
            <thead>
              <tr className="text-text">
                <th className="py-3 pr-4 font-semibold">Method</th>
                <th className="py-3 pr-4 font-semibold">Path</th>
                <th className="py-3 pr-4 font-semibold">Auth</th>
                <th className="py-3 font-semibold">Use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {agentEndpointGuide.map((endpoint) => (
                <tr key={`${endpoint.method}-${endpoint.path}`}>
                  <td className="py-3 pr-4">
                    <code>{endpoint.method}</code>
                  </td>
                  <td className="py-3 pr-4">
                    <code>{endpoint.path}</code>
                  </td>
                  <td className="py-3 pr-4">{endpoint.auth}</td>
                  <td className="py-3">{endpoint.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection title="Safe Action Boundaries">
        <p>
          Agents should ask for explicit confirmation before registering
          accounts, submitting forms, connecting Canvas, importing private data,
          rotating calendar tokens, or asking questions over private study
          material.
        </p>
      </InfoSection>
    </PublicInfoPage>
  );
}
