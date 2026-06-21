import React, { useState } from 'react';
import { SectionCard } from '@/components/ui/SectionCard';
import { ToggleRow } from '@/components/profile/ToggleRow';
import { ApexTokens } from '@/constants/apexTokens';
import { isOptedOut, setAnalyticsConsent } from '@/lib/analytics';

export function PrivacyCard({ tk }: { tk: ApexTokens }) {
  const [shareUsage, setShareUsage] = useState(!isOptedOut());
  return (
    <SectionCard title="Privacy" tk={tk}>
      <ToggleRow
        label="Share usage data"
        sub="Anonymous analytics that help us improve Fantasy Gaffer. We never sell your data."
        value={shareUsage}
        onChange={(v) => {
          setShareUsage(v);
          setAnalyticsConsent(v);
        }}
        tk={tk}
      />
    </SectionCard>
  );
}
