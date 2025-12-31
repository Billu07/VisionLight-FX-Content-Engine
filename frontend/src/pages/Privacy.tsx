import { Link } from "react-router-dom";

export const Privacy = () => {
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
            Privacy Policy
          </h1>
          <p className="text-purple-300">Last Updated: Dec 7, 2025</p>
        </div>

        {/* Content Container */}
        <div className="bg-gray-900/60 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-white/10 shadow-2xl space-y-10 text-gray-300 leading-relaxed">
          <section>
            <p className="mb-4">
              This Privacy Policy explains how{" "}
              <strong>Visionlight Production Inc.</strong> ("we," "us," "our")
              collects, uses, stores, and protects your information when you use
              PicDrift Studio and the FX dashboard engine. By accessing or using
              our platform, you agree to the practices described in this policy.
            </p>
          </section>

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
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              2. Information We Collect
            </h2>
            <p className="mb-4">
              We collect information necessary to operate, secure, and improve
              PicDrift Studio.
            </p>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              2.1 Information You Provide
            </h3>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Account details (name, email, password)</li>
              <li>Billing information for FX credit purchases</li>
              <li>Uploaded content (images, assets, animations)</li>
              <li>Support inquiries or communication with our team</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              2.2 Automatically Collected Information
            </h3>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>IP address and general location</li>
              <li>Browser type and device information</li>
              <li>Usage logs (render attempts, dashboard interactions)</li>
              <li>Security-related metadata for fraud prevention</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              2.3 AI Processing Data
            </h3>
            <p>
              When you upload content for rendering or generation, those assets
              may be temporarily processed by third-party AI services. We do not
              sell or permanently transfer your data to AI providers; your
              assets are used only to complete the requested render.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              3. How We Use Your Information
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Operate and maintain PicDrift Studio</li>
              <li>Process FX credit transactions</li>
              <li>Improve platform features and performance</li>
              <li>Prevent fraud, abuse, and API-related attacks</li>
              <li>Provide support and respond to inquiries</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="mt-4 font-semibold text-purple-200">
              We do not use your creative assets for training or improving AI
              models.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              4. How We Share Your Information
            </h2>
            <div className="space-y-4">
              <div>
                <strong className="text-white">
                  4.1 Third-Party AI Providers:
                </strong>{" "}
                We share temporary processing data (such as image files) when
                required to perform renders requested by the user.
              </div>
              <div>
                <strong className="text-white">4.2 Payment Processors:</strong>{" "}
                Secure payment services receive necessary billing information to
                complete purchases.
              </div>
              <div>
                <strong className="text-white">4.3 Legal Requirements:</strong>{" "}
                We may disclose data when required by law, such as responding to
                subpoenas or protecting platform integrity.
              </div>
            </div>
            <p className="mt-4">
              We do not sell or rent personal data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              5. Data Storage & Security
            </h2>
            <p className="mb-4">
              We use technical and administrative security measures to protect
              data, including:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Encrypted connections (HTTPS)</li>
              <li>Secure authentication systems</li>
              <li>Continuous API monitoring for unusual activity</li>
              <li>Data access restrictions internally</li>
            </ul>
            <p>
              Despite these efforts, no online platform can guarantee 100%
              security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              6. Data Retention
            </h2>
            <p className="mb-2">We retain data only as long as necessary to:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Maintain user accounts</li>
              <li>Fulfill legal requirements</li>
              <li>Support platform functionality</li>
            </ul>
            <p>
              Users may request deletion of their personal data (see Section 9).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              7. Cookies & Tracking Technologies
            </h2>
            <p className="mb-2">PicDrift Studio may use:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Essential cookies for login and account security</li>
              <li>Performance cookies to improve platform stability</li>
              <li>Analytics tools to understand usage patterns</li>
            </ul>
            <p>
              You may disable cookies in your browser, but this may limit
              platform functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              8. Children’s Privacy (COPPA Compliance)
            </h2>
            <p>
              PicDrift Studio is not intended for children under 13. We do not
              knowingly collect personal data from children. If a parent
              believes a child has created an account, contact us at{" "}
              <a
                href="mailto:picdrift@picdrift.com"
                className="text-cyan-400 hover:underline"
              >
                picdrift@picdrift.com
              </a>{" "}
              so we can remove the data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              9. Your Rights
            </h2>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              9.1 GDPR (EU Users)
            </h3>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Request access to your data</li>
              <li>Request correction or deletion</li>
              <li>Withdraw consent at any time</li>
              <li>Request data portability</li>
              <li>File a complaint with your local data authority</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-200 mb-2">
              9.2 General Rights for All Users
            </h3>
            <ul className="list-disc pl-5 mb-4 space-y-2">
              <li>Account deletion</li>
              <li>Removal of stored personal information</li>
              <li>Information about how your data is used</li>
            </ul>
            <p>
              To make a request, contact:{" "}
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
              10. Data Transfers
            </h2>
            <p>
              Data may be processed on servers located in Canada or other
              countries where our service providers operate. We ensure
              appropriate safeguards for international data transfers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              11. DMCA & Content Ownership
            </h2>
            <p>
              Users retain ownership of uploaded content. If a DMCA request
              requires us to remove content, we may disclose limited account
              information to the claimant if legally required.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              12. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy occasionally. Continued use of
              the platform after updates constitutes acceptance of the changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              13. Contact Us
            </h2>
            <p>
              For privacy-related questions or concerns, contact:{" "}
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
              14. Acceptance
            </h2>
            <p>
              By using PicDrift Studio, you acknowledge that you have read and
              agree to this Privacy Policy.
            </p>
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
