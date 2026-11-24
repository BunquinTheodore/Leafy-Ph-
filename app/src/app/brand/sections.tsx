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

/** One panel: the title on top, then rows on the shared 12 column grid (see brand.css). */
function Section({
  eyebrow,
  title,
  roomy = false,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Panels with spare height get a little more air between their rows. */
  roomy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={roomy ? "brand-panel brand-panel--roomy" : "brand-panel"}>
      <header className="brand-panel__head">
        <p className="eyebrow m-0">{eyebrow}</p>
        <h2 className="display display-sm">{title}</h2>
      </header>
      {children}
    </div>
  );
}

const Tile = ({ tone, children }: { tone: "dark" | "light"; children: ReactNode }) => (
  <div
    className="brand-tile b-3"
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
      <div className="brand-grid">
        <Tile tone="dark">
          <Logo height={48} className="brand-logo-h" />
        </Tile>
        <Tile tone="light">
          <Logo height={48} className="brand-logo-h" />
        </Tile>
        <Tile tone="dark">
          <Logo variant="stacked" height={64} className="brand-logo-s" />
        </Tile>
        <Tile tone="light">
          <Logo variant="stacked" height={64} className="brand-logo-s" />
        </Tile>
        <Tile tone="dark">
          <LogoMark height={44} className="brand-logo-m" />
        </Tile>
        <Tile tone="light">
          <LogoMark height={44} className="brand-logo-m" />
        </Tile>
        <Tile tone="light">
          <LogoMark height={44} tone="mono" className="brand-logo-m text-black" />
        </Tile>
        <Tile tone="dark">
          <LogoMark height={44} tone="mono" className="brand-logo-m text-white" />
        </Tile>
      </div>
      <div className="brand-grid brand-grid--center">
        <div className="prose brand-logo-text b-6">
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
        <ul className="brand-assets b-6">
          <li>
            <Image
              src="/icons/icon-192.png"
              alt="App icon, 192 pixels"
              width={96}
              height={96}
              className="rounded-[22%]"
            />
            <span className="brand-note">App icon, 192 pixels</span>
          </li>
          <li>
            <Image
              src="/icons/icon-maskable-192.png"
              alt="Maskable app icon"
              width={96}
              height={96}
            />
            <span className="brand-note">Maskable app icon</span>
          </li>
          <li>
            <Image
              src="/icons/favicon-48.png"
              alt="Favicon, 48 pixels"
              width={48}
              height={48}
              className="brand-favicon"
            />
            <span className="brand-note">Favicon, 48 pixels</span>
          </li>
          <li>
            <Wordmark height={26} />
            <span className="brand-note">Wordmark</span>
          </li>
        </ul>
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
      <ul className="brand-grid">
        {SWATCHES.map(([token, label]) => (
          <li key={token} className="brand-swatch b-2">
            <div className="brand-swatch__chip" style={{ background: `var(--${token})` }} />
            <div className="brand-swatch__name">
              <p>{label}</p>
              <code>--{token}</code>
            </div>
          </li>
        ))}
      </ul>
      <div className="brand-grid brand-grid--center">
        <div className="brand-badges b-4">
          {SEVERITY.map((tone) => (
            <Badge key={tone} tone={tone} />
          ))}
        </div>
        <p className="prose b-8">
          Severity always carries a label and an icon, never color alone. Gradients stay inside the
          green family, and amber is the single accent. Every text pair is checked for WCAG AA in
          both themes by the test suite.
        </p>
      </div>
    </Section>
  );
}

export function TypeSection() {
  return (
    <Section eyebrow="Brand" title="Typography" roomy>
      <div className="brand-grid brand-grid--stretch">
        <Card className="brand-card b-4">
          <p className="eyebrow m-0">Display, Josefin Sans Light, capitals</p>
          <p className="display brand-sample brand-sample--display">Know your leaf.</p>
          <p className="brand-note">
            Hero, page titles, section labels. Wide tracking, one line or two, never three.
          </p>
        </Card>
        <Card className="brand-card b-4">
          <p className="eyebrow m-0">Headings and UI, Poppins 500 and 600</p>
          <p className="h2 brand-sample brand-sample--heading">Early blight on tomato</p>
          <p className="brand-note">
            Subheadings, buttons, navigation, cards and stats with tabular figures.
          </p>
        </Card>
        <Card className="brand-card b-4">
          <p className="eyebrow m-0">Reading, Manrope 400, 500, 700</p>
          <p className="brand-sample brand-sample--reading">
            Forms and long disease text. Calm, plain words.
          </p>
          <p className="brand-note">Sixteen to eighteen pixels, line height 1.65.</p>
        </Card>
      </div>
      <div className="brand-grid">
        <p className="prose b-6">
          A paragraph keeps a measure of 62 characters, is left aligned and never justified, and
          uses text-wrap pretty so the last line is not a single orphan word. Headings use text-wrap
          balance.
        </p>
        <p className="prose b-6">
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
    <Section eyebrow="Brand" title="Voice and copy" roomy>
      <p className="blurb">
        {BRAND_POSITIONING} Calm, precise, reassuring, quietly curious. Never alarmist or jokey.
      </p>
      <ul className="brand-grid brand-grid--stretch">
        {TAGLINES.map((line) => (
          <li key={line} className="b-4">
            <Card className="brand-card">
              <p className="h3 brand-tagline m-0">{line}</p>
              <p className="brand-note">Tagline option</p>
            </Card>
          </li>
        ))}
      </ul>
      <div className="brand-grid brand-grid--stretch brand-voice">
        <div className="b-4">
          <Alert tone="success" title="Say it like this">
            We found signs of early blight. This photo is a little dark, so try daylight and hold
            the leaf flat.
          </Alert>
        </div>
        <div className="b-4">
          <Alert tone="warning" title="Not like this">
            Whoa, your plant is in big trouble! Fix it NOW!!!
          </Alert>
        </div>
        <p className="prose b-4 self-center">
          Short sentences, plain words, active voice, no exclamation marks, and a one line
          explanation for any jargon.
        </p>
      </div>
    </Section>
  );
}

const STEPS = [
  { id: "uploading", label: "Upload" },
  { id: "checking", label: "Check" },
  { id: "analyzing", label: "Analyze" },
  { id: "saving", label: "Save" },
];

/** Buttons, forms and feedback, with progress, loading and the empty state under them. */
export function ComponentsSection() {
  return (
    <Section eyebrow="System" title="Components">
      <div className="brand-grid brand-grid--stretch brand-components">
        <div className="brand-stack b-4">
          <Card className="brand-card">
            <h3 className="h3 m-0">Buttons</h3>
            <div className="flex flex-wrap gap-2">
              <Button>Scan a leaf</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Small</Button>
              <Button loading>Analyzing</Button>
              <Button disabled>Disabled</Button>
            </div>
            <p className="brand-note">
              Link style: <VeinLink href="/brand#motion">hover for the vein underline</VeinLink>.
              Term hint:{" "}
              <Tooltip content="A fungus that causes dark, ringed spots on older leaves.">
                <button type="button" className="underline decoration-dotted underline-offset-4">
                  early blight
                </button>
              </Tooltip>
            </p>
          </Card>
          <Card className="brand-card">
            <h3 className="h3 m-0">Progress</h3>
            <Progress label="Uploading photo" value={62} valueText="62 percent" />
            <Progress label="Analyzing leaf" />
            <Stepper label="Scan progress" current="analyzing" steps={STEPS} />
          </Card>
        </div>
        <div className="brand-stack b-4">
          <Card className="brand-card">
            <h3 className="h3 m-0">Forms</h3>
            <FormDemo />
          </Card>
          <Card className="brand-card">
            <h3 className="h3 m-0">Loading</h3>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="skeleton-tall w-full" />
          </Card>
        </div>
        <div className="brand-stack b-4">
          <Card className="brand-card">
            <h3 className="h3 m-0">Feedback</h3>
            <Alert tone="info">Your scan is processing. You can leave this page.</Alert>
            <Alert tone="error" title="That photo did not upload">
              Check your connection and try again.
            </Alert>
            <OverlayDemo />
          </Card>
          <Card className="grid content-center">
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
      </div>
    </Section>
  );
}

export function MotionSection() {
  return (
    <Section eyebrow="System" title="Motion, cursor and sound">
      <div className="brand-grid brand-grid--stretch">
        <div className="brand-stack b-4">
          <TiltCard className="card card-glass card-vein" hint="Open">
            <h3 className="h3 title-line m-0">Tilt and glare</h3>
            <p className="brand-note mt-2">Cards lean up to about 6 degrees toward the cursor.</p>
          </TiltCard>
          <SpotlightSurface className="card card-glass">
            <h3 className="h3 title-line m-0">Spotlight</h3>
            <p className="brand-note mt-2">A soft light follows the pointer over glass.</p>
          </SpotlightSurface>
        </div>
        <Card className="brand-card b-4">
          <h3 className="h3 m-0">Easing and timing</h3>
          <code className="text-sm">cubic-bezier(0.22, 1, 0.36, 1)</code>
          <ul className="brand-note m-0 grid list-none gap-1 p-0">
            <li>200 ms micro interactions</li>
            <li>400 ms panels</li>
            <li>700 to 900 ms scene transitions</li>
          </ul>
          <p className="brand-note">
            Only transform, opacity and filter move. Effects run for a real mouse, honor reduced
            motion, and never shift layout.
          </p>
        </Card>
        <Card className="brand-card b-4">
          <h3 className="h3 m-0">Cursor</h3>
          <div className="brand-cursors">
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
          <p className="brand-note">
            32px, hotspot on the arrow tip. Text fields keep the I-beam; touch gets none.
          </p>
        </Card>
      </div>
      <div className="brand-grid brand-grid--center">
        <h3 className="h3 m-0 b-4">Sound palette</h3>
        <p className="brand-note b-8">
          Synthesized with Web Audio, 25% master volume, starts after the first gesture. Every sound
          has a visual twin. Toggle it in the header.
        </p>
      </div>
      <SoundDemo />
    </Section>
  );
}

const DOS = [
  "One calm green accent on a forest dark or airy light surface.",
  "Real HTML text on top of 3D, canvases hidden from assistive tech.",
  "Sideways panels instead of long vertical pages.",
  "Plain, short copy that says what happened and what to do next.",
  "Disease photos in their natural color inside a neutral frame.",
  "Icons from one set with a label for key actions.",
];

const DONTS = [
  "No hyphenated line breaks, no three line titles, no justified text.",
  "No heavy drop shadows, bouncing, flashing or autoplaying audio.",
  "No red alarm styling for normal results. Severity uses label plus icon.",
  "No logo stretching, recoloring outside the variants, or busy backgrounds.",
  "No tinted disease reference images.",
  "No effects that move text or hide information.",
];

export function RulesSection() {
  return (
    <Section eyebrow="System" title="Do and do not">
      <div className="brand-grid brand-grid--stretch">
        <Card className="brand-card b-6">
          <h3 className="h3 m-0">Do</h3>
          <ul className="brand-rules">
            {DOS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
        <Card className="brand-card b-6">
          <h3 className="h3 m-0">Do not</h3>
          <ul className="brand-rules">
            {DONTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </Section>
  );
}
