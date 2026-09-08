import { Link } from "react-router-dom";

/**
 * drift.li legal pages — the Drift Link Terms and Privacy Policy, served on the
 * drift.li host (and brand custom domains) at /terms and /privacy. The text is the
 * published Drift Link agreement (Visionlight Productions Inc.), kept verbatim;
 * only the page chrome is drift-branded. picdrift.studio keeps its own studio
 * agreement (pages/Terms.tsx, pages/Privacy.tsx).
 */

const THEME_KEY = "drift-landing-theme";
const CONTACT_EMAIL = "picdrift@picdrift.com";

const CSS = `
.dlg{--bg:#050912;--bg2:#0b1626;--text:#eaf1fa;--text2:#9fb2c9;--text3:#6c7f99;--border:rgba(255,255,255,.08);--accent:#22d3ee;--card:rgba(11,22,38,.7);
  min-height:100dvh;background:linear-gradient(to bottom,var(--bg),var(--bg2) 60%,#04080f);color:var(--text);
  font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.dlg[data-theme="light"]{--bg:#f5f8fc;--bg2:#eef3fb;--text:#14203a;--text2:#586a86;--text3:#7a8aa3;--border:rgba(15,23,42,.09);--accent:#0891b2;--card:rgba(255,255,255,.8)}
.dlg-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px clamp(18px,5vw,56px);border-bottom:1px solid var(--border)}
.dlg-word{font-weight:800;font-size:19px;letter-spacing:-.02em;color:var(--text);text-decoration:none}
.dlg-word span{margin-left:6px;color:var(--accent)}
.dlg-nav{display:flex;gap:16px;font-size:13px}
.dlg-nav a{color:var(--text2);text-decoration:none;font-weight:600}
.dlg-nav a:hover,.dlg-nav a.on{color:var(--text)}
.dlg-main{max-width:820px;margin:0 auto;padding:clamp(28px,5vw,56px) clamp(18px,5vw,40px) 64px}
.dlg-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
.dlg-title{margin:0;font-size:clamp(30px,5vw,44px);line-height:1.05;font-weight:800;letter-spacing:-.03em;color:var(--text)}
.dlg-date{margin:12px 0 0;font-size:13px;color:var(--text3)}
.dlg-card{margin-top:28px;padding:clamp(20px,4vw,36px);border-radius:22px;border:1px solid var(--border);background:var(--card);backdrop-filter:blur(12px)}
.dlg-card>p{margin:0 0 18px;font-size:15px;line-height:1.7;color:var(--text2)}
.dlg-card>p.lead{font-size:16px;color:var(--text)}
.dlg-card section{margin-top:26px}
.dlg-card h2{margin:0 0 8px;font-size:12.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--text)}
.dlg-card section p{margin:0 0 10px;font-size:15px;line-height:1.7;color:var(--text2)}
.dlg-card ul{margin:6px 0 10px;padding-left:20px;color:var(--text2);font-size:15px;line-height:1.7}
.dlg-card li{margin:2px 0}
.dlg-card a{color:var(--accent);text-decoration:none}
.dlg-card a:hover{text-decoration:underline}
.dlg-card address{font-style:normal;line-height:1.7;color:var(--text2)}
.dlg-footer{max-width:820px;margin:0 auto;padding:0 clamp(18px,5vw,40px) 40px;display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;font-size:12px;color:var(--text3)}
.dlg-footer a{color:var(--text3);text-decoration:none}
.dlg-footer a:hover{color:var(--text)}
`;

const readTheme = (): "dark" | "light" => {
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

function Shell({
  eyebrow,
  title,
  date,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  date: string;
  current: "terms" | "privacy";
  children: React.ReactNode;
}) {
  return (
    <div className="dlg" data-theme={readTheme()}>
      <style>{CSS}</style>
      <header className="dlg-header">
        <Link to="/" className="dlg-word">
          Drift Link<span>Interactive</span>
        </Link>
        <nav className="dlg-nav" aria-label="Legal">
          <Link to="/terms" className={current === "terms" ? "on" : ""}>
            Terms
          </Link>
          <Link to="/privacy" className={current === "privacy" ? "on" : ""}>
            Privacy
          </Link>
          <Link to="/">Home</Link>
        </nav>
      </header>
      <main className="dlg-main">
        <div className="dlg-eyebrow">{eyebrow}</div>
        <h1 className="dlg-title">{title}</h1>
        <p className="dlg-date">Effective Date: {date}</p>
        <div className="dlg-card">{children}</div>
      </main>
      <footer className="dlg-footer">
        <span>© 2026 Drift Link · Visionlight Productions Inc.</span>
        <span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
      </footer>
    </div>
  );
}

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export function DriftTerms() {
  return (
    <Shell eyebrow="drift.li · legal" title="Terms and Conditions" date="April 9, 2026" current="terms">
      <p className="lead">
        Visionlight Productions Inc. ("we", "us", or "our") provides the PicDrift.com platform and related
        services through Drift.li, and may sell physical products (like PicDrift Prints) through third-party
        marketplaces such as Etsy. By using our websites, content, services, or purchasing our products, you
        agree to these Terms and Conditions and any updates made from time to time.
      </p>

      <section>
        <h2>Acceptance of Terms</h2>
        <p>
          By accessing or using PicDrift.com, you agree to these Terms. If you do not agree, do not use the
          sites or services. Continued use after changes means you accept the updated Terms.
        </p>
      </section>

      <section>
        <h2>Eligibility</h2>
        <p>
          Our platform is recommended for users 18 years or older. If you are under 18, you must be supervised
          by a parent or legal guardian who agrees to these Terms. The supervising adult accepts full
          responsibility for all activity.
        </p>
      </section>

      <section>
        <h2>Account Responsibility</h2>
        <p>
          If you create an account, you must keep your login secure. You are responsible for all activity under
          your account.
        </p>
      </section>

      <section>
        <h2>Service Availability and Changes</h2>
        <p>
          PicDrift is an evolving platform. Features, content, or services may change, be removed, or go
          offline at any time without notice. This includes temporary outages. These changes do not qualify
          for refunds.
        </p>
      </section>

      <section>
        <h2>Content Ownership and Restrictions</h2>
        <p>
          All content on PicDrift.com (including images, designs, animations, and videos) is protected by
          copyright. You may not copy, sell, share, or modify content without written permission from
          Visionlight Productions Inc.
        </p>
      </section>

      <section>
        <h2>User Submissions</h2>
        <p>
          If you upload or submit content, you confirm you have the rights to it and grant us permission to
          use it for our services and promotions. We may remove user content at our discretion.
        </p>
      </section>

      <section>
        <h2>Subscriptions and Payments</h2>
        <p>
          Annual subscriptions are processed through secure third-party providers. Subscriptions are billed
          for a full year and refunds are not guaranteed. Please contact us before opening any payment
          disputes.
        </p>
      </section>

      <section>
        <h2>Subscription Cancellations</h2>
        <p>
          To cancel a subscription, email <Mail /> before your renewal date. No partial refunds are given for
          unused time.
        </p>
      </section>

      <section>
        <h2>Cookies and Tracking</h2>
        <p>
          PicDrift uses cookies and analytics to improve performance. By using the site, you agree to this
          tracking. You can control cookies through your browser settings.
        </p>
      </section>

      <section>
        <h2>Third-Party Services</h2>
        <p>
          We use third-party services for hosting, payments, and support. These providers must handle your
          data responsibly, but we are not liable for their actions.
        </p>
      </section>

      <section>
        <h2>User Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Upload harmful or illegal content</li>
          <li>Interfere with the website</li>
          <li>Access other user accounts</li>
          <li>Send spam or unwanted messages</li>
          <li>Violate any laws or intellectual property rights</li>
        </ul>
        <p>Violations may lead to suspension or a permanent ban.</p>
      </section>

      <section>
        <h2>No Warranty</h2>
        <p>
          Our services and products are provided "as is." We do not guarantee that all features will be
          available or that service will be uninterrupted.
        </p>
      </section>

      <section>
        <h2>Limitation of Liability</h2>
        <p>
          Visionlight Productions Inc. is not liable for indirect or incidental damages, including loss of
          data, content, access, or revenue.
        </p>
      </section>

      <section>
        <h2>Use of Materials and Links</h2>
        <p>
          Unless stated otherwise, content is shared under a Creative Commons license or fair use. If you want
          your content removed, email <Mail />.
        </p>
      </section>

      <section>
        <h2>Changes to Terms</h2>
        <p>We may update these Terms without notice. Continued use means you accept the changes.</p>
      </section>

      <section>
        <h2>Severability</h2>
        <p>If any part of these Terms is invalid, the rest still applies.</p>
      </section>

      <section>
        <h2>Governing Law</h2>
        <p>
          These Terms are governed by the laws of Manitoba, Canada. Legal matters will be resolved in
          Manitoba.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <address>
          Visionlight Productions Inc.
          <br />
          Box 549, Rosenort, MB, Canada
          <br />
          Email: <Mail />
        </address>
      </section>
    </Shell>
  );
}

export function DriftPrivacy() {
  return (
    <Shell eyebrow="drift.li · legal" title="Privacy Policy" date="March 27, 2025" current="privacy">
      <p className="lead">
        Visionlight Productions Inc. ("we", "us", or "our") respects your privacy. This Privacy Policy explains
        how your Personally Identifiable Information ("PII") is collected, used, and protected when you use our
        websites: PicDrift.com, Drift.li, and any of their subdomains or services.
      </p>

      <section>
        <h2>What is Personally Identifiable Information (PII)?</h2>
        <p>
          PII is any information that can be used on its own or with other data to identify, contact, or
          locate an individual. This includes name, email address, IP address, device identifiers, and content
          you submit to our site.
        </p>
      </section>

      <section>
        <h2>When do we collect information?</h2>
        <p>We collect data when you:</p>
        <ul>
          <li>Visit or navigate our websites</li>
          <li>Register for a subscription</li>
          <li>Submit a form or upload content</li>
          <li>Contact us via email or chat</li>
          <li>Subscribe to a newsletter</li>
          <li>Purchase services or interact with content</li>
        </ul>
      </section>

      <section>
        <h2>What information do we collect?</h2>
        <ul>
          <li>Name and email address (if provided)</li>
          <li>Payment and subscription info (via secure third-party processors)</li>
          <li>Browser, IP address, device type, and usage activity</li>
          <li>User-submitted images, links, or content</li>
          <li>Cookies and website tracking data</li>
        </ul>
      </section>

      <section>
        <h2>How do we use your information?</h2>
        <p>We may use your information to:</p>
        <ul>
          <li>Provide and personalize services and features</li>
          <li>Process payments and manage your subscription</li>
          <li>Respond to your requests or inquiries</li>
          <li>Improve site performance and content</li>
          <li>Send updates or promotional content</li>
          <li>Prevent fraud or abuse</li>
        </ul>
      </section>

      <section>
        <h2>How do we protect your information?</h2>
        <ul>
          <li>Data is hosted securely via Wix infrastructure</li>
          <li>All payments are processed through encrypted third-party gateways</li>
          <li>SSL encryption is used on our site</li>
          <li>Access to data is limited to authorized personnel only</li>
          <li>We monitor systems for vulnerabilities and apply updates</li>
        </ul>
      </section>

      <section>
        <h2>Cookies and Tracking Technologies</h2>
        <p>We use cookies to:</p>
        <ul>
          <li>Remember your preferences</li>
          <li>Improve website functionality</li>
          <li>Understand user behavior</li>
          <li>Analyze traffic and interactions</li>
        </ul>
        <p>
          You may disable cookies through your browser settings. Some features may not function correctly if
          cookies are turned off.
        </p>
      </section>

      <section>
        <h2>Third-Party Services and Sharing</h2>
        <p>We do not sell or trade your personal information. We may share limited information with:</p>
        <ul>
          <li>Web hosting and infrastructure partners (e.g., Wix)</li>
          <li>Payment processors</li>
          <li>Analytics services (e.g., Google Analytics)</li>
          <li>Customer support or email platforms</li>
        </ul>
        <p>All third-party partners must agree to keep data secure and confidential.</p>
      </section>

      <section>
        <h2>Use of Drift.li</h2>
        <p>
          Some PicDrift experiences link to Drift.li or its subdomains. The same privacy practices apply to all
          Drift.li experiences, which are operated by Visionlight Productions Inc.
        </p>
      </section>

      <section>
        <h2>Behavioral Tracking</h2>
        <p>We do not allow third-party behavioral tracking outside of standard analytics tools.</p>
      </section>

      <section>
        <h2>Google Services</h2>
        <p>
          We may use Google Analytics. We do not currently use Google AdSense or DART cookies. If this
          changes, we will update this policy and provide opt-out instructions.
        </p>
      </section>

      <section>
        <h2>Do Not Track Signals</h2>
        <p>
          We honor Do Not Track (DNT) signals. When enabled in your browser, non-essential cookies and
          trackers will be disabled.
        </p>
      </section>

      <section>
        <h2>California Online Privacy Protection Act (CalOPPA)</h2>
        <p>To comply with CalOPPA:</p>
        <ul>
          <li>You may visit our site anonymously</li>
          <li>This Privacy Policy is linked on our homepage and main pages</li>
          <li>The word "Privacy" appears in the link</li>
          <li>Any policy changes will be posted here</li>
          <li>
            Users may request, access, or delete their information by emailing <Mail />
          </li>
        </ul>
      </section>

      <section>
        <h2>Children's Privacy (COPPA)</h2>
        <p>
          We do not knowingly collect information from children under 13. The platform is recommended for
          users age 18 and older. Anyone under 18 must have adult supervision while using the site.
        </p>
      </section>

      <section>
        <h2>International Users</h2>
        <p>
          By using our services from outside Canada, you consent to your data being processed according to
          this policy and Canadian law. We comply with applicable international laws such as GDPR and PIPEDA.
          You may:
        </p>
        <ul>
          <li>Request access or deletion of your data</li>
          <li>Correct or update your data</li>
          <li>Withdraw consent</li>
          <li>Object to certain uses</li>
        </ul>
        <p>
          To exercise your rights, email <Mail />
        </p>
      </section>

      <section>
        <h2>Data Breach Notification</h2>
        <p>If a data breach occurs, we will notify affected users via email within 7 business days.</p>
      </section>

      <section>
        <h2>Your Consent</h2>
        <p>
          By using our websites, submitting forms, or accessing Drift.li, you consent to this Privacy Policy and
          the collection and use of your data as described.
        </p>
      </section>

      <section>
        <h2>Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Updates will be posted on this page with the new
          effective date.
        </p>
      </section>

      <section>
        <h2>Contact Information</h2>
        <address>
          Visionlight Productions Inc.
          <br />
          Box 549, Rosenort, MB, Canada
          <br />
          Email: <Mail />
        </address>
      </section>
    </Shell>
  );
}
