"use client";

import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { clearFeedback, sendFeedback, type FeedbackInput } from "@/lib/scans/api";
import type { LabelOptions } from "@/lib/scans/labels";
import type { ScanFeedback } from "@/lib/scans/types";
import { useSfx } from "../sfx/SfxProvider";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/Toast";

const copy = scanCopy.feedback;
const COMMENT_MAX = 300;
const HEALTHY = "healthy";

interface FeedbackProps {
  scanId: string;
  initial: ScanFeedback | null;
  /** Plants and diseases for the optional picker. Without them only the comment is offered. */
  labels: LabelOptions | null;
}

interface Draft {
  plant: string;
  disease: string;
  comment: string;
}

const EMPTY_DRAFT: Draft = { plant: "", disease: "", comment: "" };

function draftFrom(feedback: ScanFeedback | null): Draft {
  if (!feedback || feedback.is_correct) return EMPTY_DRAFT;
  return {
    plant: feedback.correct_plant ?? "",
    disease: feedback.correct_disease ?? "",
    comment: feedback.comment ?? "",
  };
}

function Select({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="pick">
      <label htmlFor={id} className="pick__label">
        {label}
      </label>
      <select
        id={id}
        className="pick__select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

/** "Was this result correct?" with an optional right label picker on No. Quiet and skippable. */
export function Feedback({ scanId, initial, labels }: FeedbackProps) {
  const toast = useToast();
  const sfx = useSfx();
  const [saved, setSaved] = useState<ScanFeedback | null>(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const commentId = useId();

  useEffect(() => setSaved(initial), [initial]);

  const plant = labels?.plants.find((item) => item.slug === draft.plant) ?? null;

  async function submit(input: FeedbackInput, done: () => void) {
    setBusy(true);
    setProblem(null);
    const result = await sendFeedback(scanId, input);
    setBusy(false);
    if (!result.ok) {
      setProblem(copy.saveFailed);
      return;
    }
    const now = new Date().toISOString();
    setSaved({
      is_correct: input.is_correct,
      correct_plant: input.is_correct ? null : (input.correct_plant ?? null),
      correct_disease: input.is_correct ? null : (input.correct_disease ?? null),
      comment: input.is_correct ? null : (input.comment ?? null),
      updated_at: now,
    });
    sfx.play("success");
    toast({ message: copy.thanks, tone: "success" });
    done();
  }

  const answerYes = () => void submit({ is_correct: true }, () => undefined);

  const sendCorrection = () =>
    void submit(
      {
        is_correct: false,
        correct_plant: draft.plant || null,
        correct_disease: draft.plant && draft.disease ? draft.disease : null,
        comment: draft.comment.trim() || null,
      },
      () => setOpen(false),
    );

  async function remove() {
    setBusy(true);
    const result = await clearFeedback(scanId);
    setBusy(false);
    if (!result.ok) {
      setProblem(copy.saveFailed);
      return;
    }
    setSaved(null);
    setDraft(EMPTY_DRAFT);
    toast({ message: copy.removed, tone: "info" });
  }

  return (
    <div className="fb" data-testid="feedback">
      {saved ? (
        <>
          <p className="fb__thanks m-0" role="status">
            <Check size={18} strokeWidth={1.5} aria-hidden="true" />
            {copy.thanks}
          </p>
          <p className="fb__answer m-0">
            {saved.is_correct ? copy.yourAnswerYes : copy.yourAnswerNo}
          </p>
          <div className="fb__row">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(draftFrom(saved));
                setOpen(true);
              }}
              data-testid="feedback-change"
            >
              {copy.change}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
              {copy.remove}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="fb__q m-0" id="fb-question">
            {copy.question}
          </p>
          <div className="fb__row" role="group" aria-labelledby="fb-question">
            <Button
              variant="secondary"
              size="sm"
              onClick={answerYes}
              disabled={busy}
              data-testid="feedback-yes"
            >
              <ThumbsUp size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy.yes}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={busy}
              data-testid="feedback-no"
            >
              <ThumbsDown size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy.no}
            </Button>
          </div>
        </>
      )}
      {problem && !open ? (
        <p className="fb__problem m-0" role="alert">
          {problem}
        </p>
      ) : null}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={copy.dialogTitle}
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button onClick={sendCorrection} loading={busy} data-testid="feedback-send">
              {copy.send}
            </Button>
          </>
        }
      >
        <p>{copy.dialogBody}</p>
        <div className="pick-grid">
          {labels ? (
            <>
              <Select
                label={copy.plant}
                value={draft.plant}
                onChange={(value) => setDraft({ ...draft, plant: value, disease: "" })}
              >
                <option value="">{copy.plantNotSure}</option>
                {labels.plants.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                label={copy.disease}
                value={draft.disease}
                disabled={!plant}
                onChange={(value) => setDraft({ ...draft, disease: value })}
              >
                <option value="">{copy.diseaseNotSure}</option>
                <option value={HEALTHY}>{copy.diseaseHealthy}</option>
                {plant?.diseases.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </>
          ) : null}
          <div className="pick pick--wide">
            <label htmlFor={commentId} className="pick__label">
              {copy.comment}
            </label>
            <textarea
              id={commentId}
              className="pick__select pick__text"
              rows={3}
              maxLength={COMMENT_MAX}
              value={draft.comment}
              onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
            />
            <span className="pick__hint">
              {copy.commentHint(COMMENT_MAX - draft.comment.length)}
            </span>
          </div>
        </div>
        {problem ? (
          <p className="fb__problem" role="alert">
            {problem}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
