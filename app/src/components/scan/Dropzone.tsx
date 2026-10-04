"use client";

import { Camera, ImagePlus } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { ACCEPT_ATTRIBUTE } from "@/lib/scans/validation";
import { useMediaQuery } from "../interaction/hooks";
import { Button } from "../ui/Button";

const copy = scanCopy.drop;

interface DropzoneProps {
  onFile: (file: File) => void;
  /** A problem with the last file, in plain words. */
  problem?: string | null;
  disabled?: boolean;
}

/**
 * Big drop target: drag a photo here, or use the buttons. On phones "Take photo" opens the rear
 * camera (capture=environment). Only the first dropped file is used.
 */
export function Dropzone({ onFile, problem, disabled = false }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const browse = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const touch = useMediaQuery("(pointer: coarse)");

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) take(event.dataTransfer.files);
  };

  return (
    <div
      className="drop card card-glass card-vein"
      data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
      role="group"
      aria-label={copy.label}
      aria-describedby={problem ? messageId : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span className="drop__icon" aria-hidden="true">
        <ImagePlus size={44} strokeWidth={1.5} />
      </span>
      <h2 className="h3 drop__title">{dragging ? copy.dragging : copy.title}</h2>
      <p className="drop__hint m-0">{touch ? copy.hintTouch : copy.hint}</p>
      <div className="drop__actions">
        <Button
          size="lg"
          disabled={disabled}
          onClick={() => browse.current?.click()}
          data-testid="upload-photo"
        >
          <ImagePlus size={20} strokeWidth={1.5} aria-hidden="true" />
          {copy.upload}
        </Button>
        {touch ? (
          <Button
            size="lg"
            variant="secondary"
            disabled={disabled}
            onClick={() => camera.current?.click()}
            data-testid="take-photo"
          >
            <Camera size={20} strokeWidth={1.5} aria-hidden="true" />
            {copy.camera}
          </Button>
        ) : null}
      </div>
      <p className="drop__formats m-0">{copy.formats}</p>
      {problem ? (
        <p id={messageId} className="drop__problem m-0" role="alert">
          {problem}
        </p>
      ) : null}
      <input
        ref={browse}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label={copy.upload}
        data-testid="photo-input"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={copy.camera}
        data-testid="camera-input"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
