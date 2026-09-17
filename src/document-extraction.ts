const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const DOCUMENT_PAPER_START = 0.08;
export const DOCUMENT_EXTRACTION_DURATION = DOCUMENT_PAPER_START + 2.3;
export const DOCUMENT_CLEARANCE = 0.42;
/** One motion clock: straight out of the case, then a tangent-continuous arc. */
export function documentExtraction(time: number) {
  const motion = ease((time - DOCUMENT_PAPER_START) / 2.3);
  const extraction = clamp(motion / DOCUMENT_CLEARANCE);
  const handoff = clamp(
    (motion - DOCUMENT_CLEARANCE) / (1 - DOCUMENT_CLEARANCE),
  );
  const opening = ease((time - DOCUMENT_PAPER_START) / 0.4);
  const closing = ease((motion - DOCUMENT_CLEARANCE) / 0.36);
  return {
    clarity: ease(time / 0.45),
    motion,
    spread: opening * (1 - closing),
    paperX: 5.5 * extraction,
    paperY: 0.15 * extraction,
    paperZ: 0.17 + 0.12 * extraction,
    paperOpacity: time >= 0 && time < DOCUMENT_EXTRACTION_DURATION ? 1 : 0,
    handoff,
    cameraFraming: extraction * (1 - ease((handoff - .08) / .62)),
    revealContent: handoff >= 0.25,
    turn: ease(handoff),
    phase:
      time < 0
        ? "lifting"
        : time < DOCUMENT_PAPER_START
          ? "clearing"
          : motion < DOCUMENT_CLEARANCE
            ? "extracting"
            : time < DOCUMENT_EXTRACTION_DURATION
              ? "travelling"
              : "reading",
  };
}
