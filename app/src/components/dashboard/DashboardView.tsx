import { ScanLine } from "lucide-react";
import { member } from "@/lib/i18n/member-en";
import { LinkButton } from "../ui/Button";
import { Alert, Card } from "../ui/Display";
import type { DashboardStats, ScanSummary } from "./data";
import { EmptyDashboard } from "./EmptyDashboard";
import { RecentScans } from "./RecentScans";
import { ResultSplit } from "./ResultSplit";
import { SectionDots } from "./SectionDots";
import { TopDiseases } from "./TopDiseases";
import "./dashboard.css";

const copy = member.dashboard;
const SECTIONS_ID = "dash-sections";
const SECTIONS = [
  { id: "overview", label: copy.sections.overview },
  { id: "diseases", label: copy.sections.diseases },
  { id: "recent", label: copy.sections.recent },
] as const;

interface DashboardViewProps {
  firstName: string;
  /** Null when the summary could not be loaded. */
  stats: DashboardStats | null;
  scans: readonly ScanSummary[];
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card tilt glass className="tile">
      <p className="tile__label m-0">{label}</p>
      <p className="tile__value stat m-0">{value}</p>
    </Card>
  );
}

function ScanAction() {
  return (
    <LinkButton href="/scan" size="lg" className="dash__cta">
      <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
      {copy.scanCta}
    </LinkButton>
  );
}

function Unavailable() {
  return (
    <div className="dash__alert">
      <Alert tone="warning" title={copy.unavailableTitle}>
        {copy.unavailableBody}{" "}
        <a href="/dashboard" className="underline">
          {copy.retry}
        </a>
      </Alert>
    </div>
  );
}

/**
 * One viewport stage. Desktop: a fixed grid (tiles and result ring, top diseases, recent rail).
 * Phones: the same three sections slide sideways, so nothing needs vertical scrolling.
 */
export function DashboardView({ firstName, stats, scans }: DashboardViewProps) {
  const isEmpty = stats !== null && stats.total === 0 && scans.length === 0;
  return (
    <div className="dash stage-fill wide-stage" data-width="standard">
      <div className="wide-container dash__wrap ui-scaled">
        <header className="dash__head">
          <div className="dash__titles">
            <p className="eyebrow m-0">{copy.greeting(firstName)}</p>
            <h1 className="display display-sm dash__title">{copy.title}</h1>
          </div>
          {isEmpty ? null : <ScanAction />}
        </header>

        {stats === null ? (
          <Unavailable />
        ) : isEmpty ? (
          <EmptyDashboard />
        ) : (
          <>
            <div
              id={SECTIONS_ID}
              className="dash__sections"
              role="region"
              aria-label={copy.sectionsLabel}
            >
              <section
                id="overview"
                className="dash__sec dash__sec--overview"
                aria-label={copy.sections.overview}
              >
                <div className="dash__tiles">
                  <StatTile label={copy.totalScans} value={stats.total} />
                  <StatTile label={copy.last30Days} value={stats.last30Days} />
                </div>
                <ResultSplit stats={stats} />
              </section>
              <section
                id="diseases"
                className="dash__sec dash__sec--diseases"
                aria-label={copy.sections.diseases}
              >
                <TopDiseases diseases={stats.topDiseases} />
              </section>
              <section
                id="recent"
                className="dash__sec dash__sec--recent"
                aria-label={copy.sections.recent}
              >
                <RecentScans initial={scans} />
              </section>
            </div>
            <SectionDots targetId={SECTIONS_ID} sections={SECTIONS} />
          </>
        )}
      </div>
    </div>
  );
}
