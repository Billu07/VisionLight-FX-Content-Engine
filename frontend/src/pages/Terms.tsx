import { Link } from "react-router-dom";

export const Terms = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-purple-50 font-sans">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="text-cyan-400 hover:text-cyan-300 transition-colors mb-6 inline-block font-semibold"
          >
            ← Back to Home
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Terms and Conditions
          </h1>
          <p className="text-purple-300">Last Updated: Dec 7, 2025</p>
        </div>

        {/* Content Container */}
        <div className="bg-gray-900/60 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-white/10 shadow-2xl space-y-10 text-gray-300 leading-relaxed">
          <p className="italic text-lg text-purple-200">
            These Terms and Conditions (the "Agreement") govern your use of
            PicDrift Studio, a platform created and operated by Visionlight
            Production Inc. ("we," "us," or "our"). By accessing or using
            PicDrift Studio or the FX dashboard engine, you agree to be bound by
            this Agreement.
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              1. Company Information
            </h2>
            <p>
              <strong>Visionlight Production Inc.</strong>
              <br />
              Box 549, Rosenort, Manitoba, Canada R0G 1W0
              <br />
              Email:{" "}
              <a
                href="mailto:picdrift@picdrift.com"
                className="text-cyan-400 hover:underline"
              >
                picdrift@picdrift.com
              </a>
            </p>
            <p className="mt-2">
              PicDrift Studio and the FX dashboard engine ("FX") are products of
              Visionlight Production Inc.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              2. Platform Description
            </h2>
            <p>
              PicDrift Studio is a creative platform that allows users to
              upload, process, and generate multimedia content, including
              animations and AI-assisted renders. FX, our dashboard engine,
              integrates multiple third‑party AI sources and APIs to perform
              rendering and related tasks.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              3. Use of Third‑Party AI Services
            </h2>
            <p className="mb-2">
              We rely on third‑party AI services and APIs to provide core
              functionality of the platform. Because of this:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                We cannot guarantee render speed, quality, availability, or
                accuracy.
              </li>
              <li>
                We are not responsible for delays, failures, or errors caused by
                third‑party APIs.
              </li>
              <li>
                We are not liable for any damages, losses, or costs incurred as
                a result of third‑party service interruptions, incorrect
                outputs, or failures.
              </li>
              <li>
                You acknowledge that AI outputs may be unpredictable,
                inconsistent, or incomplete.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              4. Platform Availability
            </h2>
            <p className="mb-2">
              While we strive to maintain a stable and reliable platform, we
              make no guarantee that PicDrift Studio or FX will operate without
              interruption or errors. Platform performance may be affected by:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Server outages</li>
              <li>API disruptions</li>
              <li>Maintenance periods</li>
              <li>Network issues beyond our control</li>
            </ul>
            <p>
              We assume no liability for downtime, service interruptions, data
              loss, or operational inconsistencies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              5. User Responsibilities
            </h2>
            <p className="mb-2">By using PicDrift Studio, you agree to:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Provide accurate information when creating an account.</li>
              <li>Use the platform in compliance with all applicable laws.</li>
              <li>
                Maintain responsibility for the content you create, upload, or
                distribute.
              </li>
            </ul>
            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              Content Restrictions
            </h3>
            <p className="mb-2">You may not upload, create, or request:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Explicit, pornographic, or sexually inappropriate content</li>
              <li>Hateful, abusive, violent, or discriminatory material</li>
              <li>Illegal or infringing content of any kind</li>
            </ul>
            <p>
              We reserve the right to remove any content or terminate any
              account at our sole discretion, without notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              6. Intellectual Property
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                All proprietary technology, including the FX dashboard engine,
                platform design, algorithms, branding, and infrastructure,
                belongs to Visionlight Production Inc.
              </li>
              <li>
                Users retain ownership of original uploaded assets but grant us
                a license to process and store them as required for platform
                functionality.
              </li>
              <li>
                Users are fully responsible for ensuring they have the rights to
                all uploaded content.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              7. Refunds and Payment Terms
            </h2>
            <p className="mb-2">If the platform includes paid services:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Payments are final unless otherwise stated.</li>
              <li>
                Refunds may be issued at our discretion, such as in cases where
                renders fail due to internal platform issues (not third‑party
                API problems).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              8. Prohibited Actions
            </h2>
            <p className="mb-2">Users may not:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>
                Attempt to reverse‑engineer, modify, or exploit the platform or
                FX engine.
              </li>
              <li>Interfere with platform operations or security.</li>
              <li>Use the system to generate harmful or unlawful material.</li>
            </ul>
            <p>Violations may result in immediate removal from the platform.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              9. Limitation of Liability
            </h2>
            <p className="mb-2">To the maximum extent permitted by law:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Visionlight Production Inc. is not liable for indirect,
                incidental, punitive, or consequential damages.
              </li>
              <li>
                Our liability, if required by law, will be limited to the amount
                paid by the user for the service directly affected.
              </li>
              <li>
                We are not responsible for user misunderstandings, asset misuse,
                or expectations regarding AI output quality.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              10. Disclaimer of Warranties
            </h2>
            <p className="mb-2">
              PicDrift Studio and FX are provided "as is" and "as available"
              with no warranties of any kind, express or implied. This includes
              but is not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Non‑infringement</li>
              <li>Fitness for a particular purpose</li>
              <li>Continuous error‑free operation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">11. Privacy</h2>
            <p>
              We collect and store user data as necessary for platform
              functionality. We do not sell personal information to third
              parties. A separate Privacy Policy should be reviewed in
              conjunction with these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              12. Account Termination
            </h2>
            <p className="mb-2">
              We reserve the right to suspend or terminate accounts at any time
              for:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Violations of these Terms</li>
              <li>Abuse of the platform</li>
              <li>Illegal or harmful activity</li>
              <li>Operational or security concerns</li>
            </ul>
            <p>Terminated users may lose access to their data and projects.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              13. Changes to Terms
            </h2>
            <p>
              We may update or modify these Terms at any time. Continued use of
              the platform after changes constitutes acceptance of the revised
              Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              14. Governing Law
            </h2>
            <p>
              These Terms and Conditions are governed by the laws of Manitoba,
              Canada, without regard to conflict‑of‑law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              15. Contact Information
            </h2>
            <p>
              Questions about these Terms?
              <br />
              Contact us at:{" "}
              <a
                href="mailto:picdrift@picdrift.com"
                className="text-cyan-400 hover:underline"
              >
                picdrift@picdrift.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              16. Acceptance
            </h2>
            <p>
              By creating an account or using PicDrift Studio, you acknowledge
              that you have read, understood, and agree to these Terms and
              Conditions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              17. FX Credits and Pre‑Purchase Requirement
            </h2>
            <p className="mb-4">
              To use rendering features within PicDrift Studio and the FX
              dashboard engine, users must pre‑purchase FX credits before any
              rendering or processing.
            </p>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              Credit Approval & Security Review
            </h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>
                Credit purchases may undergo manual or automated review for user
                safety.
              </li>
              <li>
                Review times may vary depending on security and system load.
              </li>
              <li>
                This process helps prevent fraudulent activity and API‑related
                misuse.
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              Controlled API Usage
            </h3>
            <p className="mb-2">We monitor and audit FX credit usage to:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Prevent automated attacks or malicious API behavior</li>
              <li>Maintain system integrity and performance</li>
              <li>Protect user access during high‑demand periods</li>
            </ul>
            <p>
              We may pause or deny credit usage if suspicious activity is
              detected.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              18. GDPR Compliance (EU Users)
            </h2>
            <p className="mb-2">
              EU users have the following rights under the General Data
              Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Access, correction, or deletion of personal data</li>
              <li>Withdrawal of consent</li>
              <li>Data portability</li>
              <li>Lodging a complaint with an EU data authority</li>
            </ul>
            <p>We process data only as necessary to operate PicDrift Studio.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              19. COPPA Compliance (Children Under 13)
            </h2>
            <p>
              PicDrift Studio is not intended for children under 13. If we
              become aware of data from a child under 13, we will delete it
              immediately. Parents may contact us at{" "}
              <a
                href="mailto:picdrift@picdrift.com"
                className="text-cyan-400 hover:underline"
              >
                picdrift@picdrift.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              20. DMCA Policy
            </h2>
            <p className="mb-2">
              Copyright holders may submit a DMCA takedown request containing:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Contact information</li>
              <li>Description of copyrighted work</li>
              <li>URL of infringing material</li>
              <li>Good‑faith belief statement</li>
              <li>Accuracy and perjury statement</li>
              <li>Signature (digital or physical)</li>
            </ul>
            <p>
              Requests can be sent to{" "}
              <a
                href="mailto:picdrift@picdrift.com"
                className="text-cyan-400 hover:underline"
              >
                picdrift@picdrift.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              21. Refund Policy (Expanded)
            </h2>
            <div className="space-y-4">
              <div>
                <strong className="text-purple-200">
                  FX credit purchases are non‑refundable, except when:
                </strong>
                <ul className="list-disc pl-5 mt-2">
                  <li>
                    Internal platform errors (not external APIs) prevent usage
                  </li>
                  <li>
                    A verified malfunction on our servers affects performance
                  </li>
                </ul>
              </div>
              <div>
                <strong className="text-purple-200">
                  Refunds are not issued for:
                </strong>
                <ul className="list-disc pl-5 mt-2">
                  <li>Errors caused by third‑party APIs</li>
                  <li>User mistakes or misunderstandings</li>
                  <li>Changes in render expectations</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              22. Additional Disclaimers
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                AI‑generated content may be unpredictable. You are responsible
                for reviewing outputs.
              </li>
              <li>
                Data storage is not guaranteed; users should maintain backups.
              </li>
              <li>
                Experimental features may be changed or removed at any time.
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-purple-400 text-sm">
          © 2026 PicDrift Studio. All rights reserved.
        </div>
      </div>
    </div>
  );
};
