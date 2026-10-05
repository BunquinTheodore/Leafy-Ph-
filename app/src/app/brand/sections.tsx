import Image from "next/image";
import type { ReactNode } from "react";
import { Logo, LogoMark, Wordmark } from "@/components/brand/Logo";
import { SpotlightSurface, TiltCard, VeinLink } from "@/components/interaction/Surfaces";
import { Tooltip } from "@/components/interaction/Tooltip";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Progress,
  Skeleton,
  Stepper,
} from "@/components/ui";
import { BRAND_POSITIONING, TAGLINES } from "@/lib/brand";
import { FormDemo, OverlayDemo, SoundDemo } from "./demos";

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid w-full gap-4">
      <header className="grid gap-2">
        <p className="eyebrow m-0">{eyebrow}</p>
        <h2 className="display display-sm">{title}</h2>
      </header>
      {children}
    </div>
  );
}

const Tile = ({ tone, children }: { tone: "dark" | "light"; children: ReactNode }) => (
  <div
    className="grid min-h-20 place-items-center rounded-[var(--radius-card)] border border-[var(--border)] p-3"
    style={
      tone === "dark"
        ? { background: "#06120b", color: "#e9f4ec" }
        : { background: "#f5faf4", color: "#0e2316" }
    }
    data-theme={tone}
  >
    {children}
  </div>
);

export function LogoSection() {
  return (
    <Section eyebrow="Brand" title="Logo and mark">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[repeat(4,14rem)]">
        <Tile tone="dark">
          <Logo height={48} />
        </Tile>
        <Tile tone="light">
          <Logo height={48} />
        </Tile>
        <Tile tone="dark">
          <Logo variant="stacked" height={64} />
        </Tile>
        <Tile tone="light">
          <Logo variant="stacked" height={64} />
        </Tile>
      </div>
      <div className="grid items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-[repeat(2,8rem)]">
          <Tile tone="dark">
            <LogoMark height={44} />
          </Tile>
          <Tile tone="light">
            <LogoMark height={44} />
          </Tile>
          <Tile tone="light">
            <LogoMark height={44} tone="mono" className="text-black" />
          </Tile>
          <Tile tone="dark">
            <LogoMark height={44} tone="mono" className="text-white" />
          </Tile>
        </div>
        <div
          className="prose"
          style={{ maxWidth: "none", fontSize: "calc(1.0625rem * var(--ui-scale))" }}
        >
          <p>
            The mark is a two leaf shape on a clean grid: a large leaf with a vein cut and a smaller
            leaf crossing it. The wordmark is LEAFY in Josefin Sans Light, capitals, tracked at
            0.18em.
          </p>
          <p>
            Clear space equals the height of the small leaf. Minimum size is 20px for the mark and
            96px for a lockup. On busy imagery use the mono versions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 lg:max-w-[18rem] lg:justify-end">
          <Image
            src="/icons/icon-192.png"
            alt="App icon, 192 pixels"
            width={96}
            height={96}
            className="rounded-[22%]"
          />
          <Image
            src="/icons/icon-maskable-192.png"
            alt="Maskable app icon"
            width={96}
            height={96}
          />
          <Image src="/icons/favicon-48.png" alt="Favicon, 48 pixels" width={48} height={48} />
          <Wordmark height={26} />
        </div>
      </div>
    </Section>
  );
}

const SWATCHES = [
  ["bg", "Background"],
  ["bg-raised", "Raised"],
  ["surface", "Surface"],
  ["border", "Border"],
  ["text", "Text"],
  ["text-muted", "Muted text"],
  ["brand", "Brand"],
  ["brand-deep", "Brand deep"],
  ["brand-glow", "Brand glow"],
  ["accent", "Accent"],
  ["info", "Info"],
  ["danger", "Danger"],
] as const;

const SEVERITY = ["healthy", "low", "moderate", "high", "severe"] as const;

export function ColorSection() {
  return (
    <Section eyebrow="Brand" title="Color">
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {SWATCHES.map(([token, label]) => (
          <li
            key={token}
            className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]"
          >
            <div className="h-16" style={{ background: `var(--${token})` }} />
            <div className="p-3 text-sm">
              <p className="m-0 font-[family-name:var(--font-heading)] font-medium">{label}</p>
              <code className="text-xs text-[var(--text-muted)]">--{token}</code>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        {SEVERITY.map((tone) => (
          <Badge key={tone} tone={tone} />
        ))}
      </div>
      <p className="prose m-0">
        Severity always carries a label and an icon, never color alone. Gradients stay inside the
        green family, and amber is the single accent. Every text pair is checked for WCAG AA in both
        themes by the test suite.
      </p>
    </Section>
  );
}

export function TypeSection() {
  return (
    <Section eyebrow="Brand" title="Typography">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <p className="eyebrow m-0">Display, Josefin Sans Light, capitals</p>
          <p className="display mt-3" style={{ fontSize: "clamp(1.75rem, 3.2vw, 3rem)" }}>
            Know your leaf.
          </p>
          <p className="mb-0 mt-3 text-sm text-[var(--text-muted)]">
            Hero, page titles, section labels. Wide tracking, one line or two, never three.
          </p>
        </Card>
        <Card>
          <p className="eyebrow m-0">Headings and UI, Poppins 500 and 600</p>
          <p className="h2 mt-3" style={{ fontSize: "clamp(1.5rem, 2.2vw, 2.25rem)" }}>
            Early blight on tomato
          </p>
          <p className="mb-0 mt-3 text-sm text-[var(--text-muted)]">
            Subheadings, buttons, navigation, cards and stats with tabular figures.
          </p>
        </Card>
        <Card>
          <p className="eyebrow m-0">Reading, Manrope 400, 500, 700</p>
          <p className="mb-0 mt-3 text-lg">Forms and long disease text. Calm, plain words.</p>
          <p className="mb-0 mt-3 text-sm text-[var(--text-muted)]">
            Sixteen to eighteen pixels, line height 1.65.
          </p>
        </Card>
      </div>
      <div className="prose">
        <p>
          A paragraph keeps a measure of 62 characters, is left aligned and never justified, and
          uses text-wrap pretty so the last line is not a single orphan word. Headings use text-wrap
          balance.
        </p>
        <p>
          Hyphenation is off everywhere, including inside 3D text. Copy avoids hyphenated compounds
          where plain wording works. Long disease names get a short display name on cards, and the
          full name only in the two line title on the detail page.
        </p>
      </div>
    </Section>
  );
}

export function VoiceSection() {
  return (
    <Section eyebrow="Brand" title="Voice and copy">
      <p className="blurb m-0">
        {BRAND_POSITIONING} Calm, precise, reassuring, quietly curious. Never alarmist or jokey.
      </p>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {TAGLINES.map((line) => (
          <li key={line}>
            <Card>
              <p className="h3 m-0">{line}</p>
              <p className="mb-0 mt-2 text-sm text-[var(--text-muted)]">Tagline option</p>
            </Card>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[repeat(4,14rem)]">
        <Alert tone="success" title="Say it like this">
          We found signs of early blight. This photo is a little dark, so try daylight and hold the
          leaf flat.
        </Alert>
        <Alert tone="warning" title="Not like this">
          Whoa, your plant is in big trouble! Fix it NOW!!!
        </Alert>
      </div>
      <p className="prose m-0">
        Short sentences, plain words, active voice, no exclamation marks, and a one line explanation
        for any jargon.
      </p>
    </Section>
  );
}

export function ComponentsSection() {
  return (
    <Section eyebrow="System" title="Components">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="grid content-start gap-4">
          <h3 className="h3 m-0">Buttons</h3>
          <div className="flex flex-wrap gap-3">
            <Button>Scan a leaf</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="sm">Small</Button>
            <Button loading>Analyzing</Button>
            <Button disabled>Disabled</Button>
          </div>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            Link style: <VeinLink href="/brand#motion">hover for the vein underline</VeinLink>. Term
            hint:{" "}
            <Tooltip content="A fungus that causes dark, ringed spots on older leaves.">
              <button type="button" className="underline decoration-dotted underline-offset-4">
                early blight
              </button>
            </Tooltip>
          </p>
        </Card>
        <Card className="grid content-start gap-4">
          <h3 className="h3 m-0">Forms</h3>
          <FormDemo />
        </Card>
        <Card className="grid content-start gap-4">
          <h3 className="h3 m-0">Feedback</h3>
          <Alert tone="info">Your scan is processing. You can leave this page.</Alert>
          <Alert tone="error" title="That photo did not upload">
            Check your connection and try again.
          </Alert>
          <OverlayDemo />
        </Card>
        <Card className="grid content-start gap-4">
          <h3 className="h3 m-0">Progress</h3>
          <Progress label="Uploading photo" value={62} valueText="62 percent" />
          <Progress label="Analyzing leaf" />
          <Stepper
            label="Scan progress"
            current="analyzing"
            steps={[
              { id: "uploading", label: "Upload" },
              { id: "checking", label: "Check" },
              { id: "analyzing", label: "Analyze" },
              { id: "saving", label: "Save" },
            ]}
          />
        </Card>
        <Card className="grid content-start gap-3">
          <h3 className="h3 m-0">Loading</h3>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card className="grid content-start">
          <EmptyState
            title="No scans yet"
            action={
              <LinkButton href="/scan" size="sm">
                Scan a leaf
              </LinkButton>
            }
          >
            Your first scan will show up here.
          </EmptyState>
        </Card>
      </div>
    </Section>
  );
}

export function MotionSection() {
  return (
    <Section eyebrow="System" title="Motion, cursor and sound">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-4">
          <TiltCard className="card card-glass card-vein" hint="Open">
            <h3 className="h3 title-line m-0">Tilt and glare</h3>
            <p className="mb-0 mt-2 text-sm text-[var(--text-muted)]">
              Cards lean up to about 6 degrees toward the cursor.
            </p>
          </TiltCard>
          <SpotlightSurface className="card card-glass">
            <h3 className="h3 title-line m-0">Spotlight</h3>
            <p className="mb-0 mt-2 text-sm text-[var(--text-muted)]">
              A soft light follows the pointer over glass.
            </p>
          </SpotlightSurface>
        </div>
        <Card className="grid content-start gap-3">
          <h3 className="h3 m-0">Easing and timing</h3>
          <code className="text-sm">cubic-bezier(0.22, 1, 0.36, 1)</code>
          <ul className="m-0 grid list-none gap-1 p-0 text-sm text-[var(--text-muted)]">
            <li>200 ms micro interactions</li>
            <li>400 ms panels</li>
            <li>700 to 900 ms scene transitions</li>
          </ul>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            Only transform, opacity and filter move. Effects run for a real mouse, honor reduced
            motion, and never shift layout.
          </p>
        </Card>
        <Card className="grid content-start gap-3">
          <h3 className="h3 m-0">Cursor</h3>
          <div className="flex items-center gap-4 rounded-[var(--radius-card)] bg-[#06120b] p-4">
            <Image
              src="/cursors/leaf-cursor.svg"
              alt="Default cursor"
              width={48}
              height={48}
              unoptimized
            />
            <Image
              src="/cursors/leaf-cursor-pointer.svg"
              alt="Link and button cursor"
              width={48}
              height={48}
              unoptimized
            />
            <Image
              src="/cursors/leaf-cursor-busy.svg"
              alt="Busy cursor"
              width={48}
              height={48}
              unoptimized
            />
          </div>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            32px, hotspot on the arrow tip. Text fields keep the I-beam; touch gets none.
          </p>
        </Card>
      </div>
      <div className="grid gap-3">
        <h3 className="h3 m-0">Sound palette</h3>
        <SoundDemo />
        <p className="prose m-0 text-sm text-[var(--text-muted)]">
          Synthesized with Web Audio, 25% master volume, starts after the first gesture. Every sound
          has a visual twin. Toggle it in the header.
        </p>
      </div>
    </Section>
  );
}

export function RulesSection() {
  const dos = [
    "One calm green accent on a forest dark or airy light surface.",
    "Real HTML text on top of 3D, canvases hidden from assistive tech.",
    "Sideways panels instead of long vertical pages.",
    "Plain, short copy that says what happened and what to do next.",
    "Disease photos in their natural color inside a neutral frame.",
    "Icons from one set with a label for key actions.",
  ];
  const donts = [
    "No hyphenated line breaks, no three line titles, no justified text.",
    "No heavy drop shadows, bouncing, flashing or autoplaying audio.",
    "No red alarm styling for normal results. Severity uses label plus icon.",
    "No logo stretching, recoloring outside the variants, or busy backgrounds.",
    "No tinted disease reference images.",
    "No effects that move text or hide information.",
  ];
  return (
    <Section eyebrow="System" title="Do and do not">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[repeat(4,14rem)]">
        <Card>
          <h3 className="h3 mb-3">Do</h3>
          <ul className="prose m-0">
            {dos.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="h3 mb-3">Do not</h3>
          <ul className="prose m-0">
            {donts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </Section>
  );
}
