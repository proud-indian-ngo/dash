import { db } from "@pi-dash/db";
import { currentRevision, signerState } from "@pi-dash/db/queries/resolutions";
import { env } from "@pi-dash/env/server";
import {
  answersFieldName,
  answersText,
  circularReference,
} from "@pi-dash/shared/resolutions";

import { getS3 } from "../s3";
import { CircularError, sha256Of } from "./circulars";
import { fillAnswers } from "./signing-service";

export const circularKey = (circularId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/governance/circulars/${circularId}/${name}`;

export interface SigningCopy {
  /** What the trustee's signature says about each resolution. */
  answers: string;
  /** sha256 of the latest PDF the copy extends. */
  basedOnSha256: string;
  bytes: Uint8Array;
  fieldName: string;
  /** Where the copy is kept. */
  objectKey: string;
}

/**
 * The PDF a trustee signs: the circular's latest copy with their answers
 * filled into their field, so their signature covers what they assent and
 * object to. It is made once per latest copy and set of answers and kept,
 * so the signed file can be checked against exactly these bytes. With
 * `create: false` it is only looked up: a newer latest copy (someone else
 * signed) or changed answers mean the trustee signed a stale copy.
 */
export async function signingCopy(
  circularId: string,
  trusteeId: string,
  options: { create: boolean }
): Promise<SigningCopy> {
  const [state, revision] = await Promise.all([
    signerState(db, circularId, trusteeId),
    currentRevision(circularId),
  ]);
  if (!(state && revision)) {
    throw new CircularError(
      "You weren't a trustee in office when this was issued."
    );
  }
  if (state.openAssents === 0) {
    throw new CircularError(
      "There's nothing left for you to sign on this circular."
    );
  }
  const answers = answersText(state.answers);
  const base = {
    answers,
    basedOnSha256: revision.latestSha256,
    fieldName: state.fieldName,
  };
  const s3 = await getS3();
  const readLatest = async () => {
    const bytes = new Uint8Array(
      await s3.file(revision.latestObjectKey).arrayBuffer()
    );
    if (sha256Of(bytes) !== revision.latestSha256) {
      throw new CircularError(
        "The circular's latest copy doesn't match its record, so it can't be signed. Ask the Managing Trustee to look into it."
      );
    }
    return bytes;
  };
  const digest = sha256Of(
    new TextEncoder().encode(`${revision.latestSha256}\n${answers}`)
  ).slice(0, 24);
  const objectKey = circularKey(
    circularId,
    `to-sign/${trusteeId}-${digest}.pdf`
  );
  const file = s3.file(objectKey);
  if (await file.exists()) {
    return {
      ...base,
      bytes: new Uint8Array(await file.arrayBuffer()),
      objectKey,
    };
  }
  if (!options.create) {
    throw new CircularError(
      "The circular changed after you started: someone else signed, or your answers changed. Start again to sign the latest copy."
    );
  }
  // The fill is deterministic, so two requests racing here write the same
  // bytes.
  const bytes = await fillAnswers({
    name: answersFieldName(trusteeId),
    pdf: await readLatest(),
    value: answers,
  });
  await file.write(bytes, {
    contentDisposition: `attachment; filename="circular-${circularReference(circularId)}-to-sign.pdf"`,
    type: "application/pdf",
  });
  return { ...base, bytes, objectKey };
}
