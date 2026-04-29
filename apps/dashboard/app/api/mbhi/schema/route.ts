import { NextResponse } from "next/server";
import {
  DOCS_SOURCE,
  OBSERVED_AT,
  OBSERVED_PROBES,
  SAMPLE_ACTION,
  SAMPLE_CODE,
  SAMPLE_ENDPOINT,
  SAMPLE_OPTIONS,
  SHORTCODES,
} from "@/app/mbhi-lab/schema";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    docsSource: DOCS_SOURCE,
    observedAt: OBSERVED_AT,
    requestShape: {
      endpoint: SAMPLE_ENDPOINT,
      action: SAMPLE_ACTION,
      queryParams: ["t", "action", "code", "options"],
      sampleCode: SAMPLE_CODE,
      sampleOptions: SAMPLE_OPTIONS,
    },
    shortcodes: SHORTCODES,
    observedProbes: OBSERVED_PROBES,
  });
}
