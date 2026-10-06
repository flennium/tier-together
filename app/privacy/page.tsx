import LegalDocument from "@/components/legal-document";

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="This policy explains what Tier Together processes when you use the Discord Activity, why it is needed, and when it is removed."
    >
      <section>
        <h2>What we process</h2>
        <p>When you launch Tier Together through Discord, we receive the minimum Discord identity and Activity context needed to run a shared room. This can include your Discord user ID, username, display name, avatar, application ID, server and channel context, and Activity instance ID.</p>
        <p>During a room, we process its tier-list configuration, item positions, participant presence, votes, results, and any item images a host chooses to upload. Votes are associated with a Discord user ID while the room is active so that each participant can vote once per round.</p>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>We use this information only to authenticate participants, keep everyone in the same Activity instance synchronized, enforce host and participant permissions, operate voting, reconnect an interrupted session, and generate results requested by participants.</p>
        <p>Tier Together does not use information for targeted advertising, profiling, or sale to third parties. We do not request your email address or maintain separate Tier Together accounts.</p>
      </section>

      <section>
        <h2>Storage and retention</h2>
        <p>Active room data is held temporarily in server memory. There is no application database or persistent room history. After the last participant disconnects, an empty room is scheduled for deletion after approximately five minutes. A server restart also clears active rooms.</p>
        <p>Authentication uses an encrypted, authenticated session cookie. The cookie is used to maintain your session and is not used for advertising. Infrastructure providers may retain ordinary security and access logs, such as request time, network address, and error information, according to their own retention practices.</p>
      </section>

      <section>
        <h2>Sharing and service providers</h2>
        <p>Information is shared with other participants only as needed for the room, such as display names, avatars, host status, board actions, and revealed voting results. Individual votes remain hidden from other participants until the reveal step.</p>
        <p>Tier Together relies on Discord to provide the Activity platform and identity authorization, and on Railway to host the application. Those providers process information under their own privacy terms. We may disclose information when required by law or necessary to protect users, the service, or others.</p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>You may decline Discord authorization or stop using the Activity at any time. You can revoke Tier Together from Discord’s Authorized Apps settings. Avoid uploading an image you do not want temporarily shared with everyone in the current room.</p>
        <p>To ask a privacy question or request help, use the support contact listed on Tier Together’s Discord application profile. Because Tier Together does not maintain persistent user profiles or room history, we ordinarily have no stored account record to retrieve or delete after a room expires.</p>
      </section>

      <section>
        <h2>Children and changes</h2>
        <p>Tier Together is intended only for people permitted to use Discord under Discord’s terms and applicable law. We may update this policy as the service changes. Material revisions will be reflected by updating the effective date on this page.</p>
      </section>
    </LegalDocument>
  );
}
