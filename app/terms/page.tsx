import LegalDocument from "@/components/legal-document";

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      summary="These terms govern your use of Tier Together, a Discord Activity for building and ranking shared tier lists."
    >
      <section>
        <h2>Agreement and eligibility</h2>
        <p>By launching or using Tier Together, you agree to these terms. If you do not agree, do not use the Activity. You must be permitted to use Discord under Discord’s terms and must comply with the rules of the server and channel where the Activity is launched.</p>
      </section>

      <section>
        <h2>The service</h2>
        <p>Tier Together lets participants select or configure a tier list, rank items on a synchronized board, vote, review a recap, and export a result. Rooms are temporary and are scoped to the current Discord Activity instance. Tier Together does not promise persistent storage, saved history, or recovery after all participants leave or the service restarts.</p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You may not use Tier Together to break the law, violate Discord’s policies, infringe intellectual-property or privacy rights, harass others, distribute malware, probe or disrupt the service, evade access controls, automate abusive traffic, or upload unlawful or harmful content.</p>
        <p>You are responsible for the names and images you add to a custom list and must have the necessary rights to share them with the other room participants. Hosts are responsible for using room controls fairly and for content they choose to present.</p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>The service is provided on an “as is” and “as available” basis. Features may change, be interrupted, or be discontinued. We may restrict access when reasonably necessary for security, maintenance, legal compliance, or protection of users and the service.</p>
      </section>

      <section>
        <h2>Disclaimers and liability</h2>
        <p>To the maximum extent permitted by law, no warranty is made that Tier Together will be uninterrupted, error-free, or suitable for a particular purpose. Tier-list results reflect participant choices and are not endorsements or professional advice.</p>
        <p>To the maximum extent permitted by law, the Tier Together developer will not be liable for indirect, incidental, special, consequential, or punitive damages, lost data, lost profits, or losses arising from inability to use the service. Rights that cannot legally be excluded remain unaffected.</p>
      </section>

      <section>
        <h2>Third-party services and contact</h2>
        <p>Tier Together operates through Discord and uses third-party hosting. Your use of those services remains subject to their respective terms. References to games, films, shows, or other works belong to their respective owners and do not imply sponsorship.</p>
        <p>For questions about these terms, use the support contact listed on Tier Together’s Discord application profile. We may update these terms as the service changes; continued use after an update means you accept the revised terms.</p>
      </section>
    </LegalDocument>
  );
}
