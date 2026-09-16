import { DissentShell } from "@/components/dissent-v2/DissentShell";
import { StartReviewFormV2 } from "@/components/dissent-v2/ReviewBuilderV2";

export default function NewReviewRoute() {
  return <DissentShell><div className="dv2-page"><div className="dv2-frame"><StartReviewFormV2 /></div></div></DissentShell>;
}
