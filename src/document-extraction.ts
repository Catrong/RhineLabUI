const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const DOCUMENT_EXTRACTION_DURATION = 3.2;
/** File fully clears the case before any part starts closing. */
export function documentExtraction(time: number) {
  const opening = ease(time / 0.65);
  const extraction = ease((time - 0.65) / 1.1);
  const closing = ease((time - 1.75) / 0.65);
  const handoff = ease((time - 1.75) / 1.3);
  return {
    spread: opening * (1 - closing),
    paperX: 5.5 * extraction,
    paperY: 0.15 * extraction,
    paperZ: 0.17 + 0.12 * extraction,
    paperOpacity: time >= 0 && time < DOCUMENT_EXTRACTION_DURATION ? 1 : 0,
    handoff,
    phase:
      time < 0
        ? "lifting"
        : time < 0.65
          ? "opening"
          : time < 1.75
            ? "extracting"
            : time < 2.4
              ? "closing"
              : time < DOCUMENT_EXTRACTION_DURATION
                ? "handoff"
                : "reading",
  };
}
