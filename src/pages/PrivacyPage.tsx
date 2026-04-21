import type { Page } from '@/App';
import { ChevronLeft, Shield } from 'lucide-react';

interface PrivacyPageProps {
  onNavigate: (page: Page) => void;
}

export function PrivacyPage({ onNavigate }: PrivacyPageProps) {
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => onNavigate('landing')}
            className="p-2 text-clip-muted hover:text-clip-text hover:bg-white/[0.05] rounded-lg transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-clip-cyan" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text">
                Privacy Policy
              </h1>
              <p className="text-clip-muted text-sm">Last updated: January 2026</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="card-glass p-6 lg:p-8 space-y-8">
          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              1. Information We Collect
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              We collect the following types of information:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Account Information:</strong> Your name, email address, and password when you create an account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Uploaded Content:</strong> Gaming videos and gameplay footage you upload for processing</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Usage Data:</strong> Information about how you interact with our service, including clip generation history</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Payment Information:</strong> Billing details processed securely through our payment provider</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              2. How We Use Your Information
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              We use your information to:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Provide and maintain the ClipAI service
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Process your uploaded videos and generate highlight clips
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Improve our AI models and service quality
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Communicate with you about your account and service updates
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Process payments and manage your subscription
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              3. Third-Party Services
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              We use the following third-party services to operate ClipAI:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Supabase:</strong> For user authentication and database storage</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Paystack:</strong> For secure payment processing</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Google Gemini AI:</strong> For video analysis and clip detection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Cloudflare:</strong> For content delivery and storage</span>
              </li>
            </ul>
            <p className="text-clip-muted leading-relaxed mt-3">
              These services have their own privacy policies and handle data in accordance with 
              industry-standard security practices.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              4. Data Retention
            </h2>
            <p className="text-clip-muted leading-relaxed">
              Uploaded videos are automatically deleted from our servers within 24 hours of processing 
              unless you choose to save them. Generated clips are stored for as long as you maintain 
              an active account. Account information is retained until you delete your account. 
              You can request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              5. Your Rights
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              You have the following rights regarding your data:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Access:</strong> Request a copy of your personal data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Correction:</strong> Update or correct inaccurate information</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Deletion:</strong> Request deletion of your account and data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Export:</strong> Download your data in a portable format</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                <span><strong className="text-clip-text">Opt-out:</strong> Unsubscribe from marketing communications</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              6. Security
            </h2>
            <p className="text-clip-muted leading-relaxed">
              We implement industry-standard security measures to protect your data, including 
              encryption in transit and at rest, secure authentication, and regular security audits. 
              However, no method of transmission over the internet is 100% secure, and we cannot 
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              7. Children's Privacy
            </h2>
            <p className="text-clip-muted leading-relaxed">
              ClipAI is not intended for use by children under the age of 13. We do not knowingly 
              collect personal information from children under 13. If you become aware that a child 
              has provided us with personal information, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              8. Changes to This Policy
            </h2>
            <p className="text-clip-muted leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material 
              changes by posting the new policy on this page and updating the "Last updated" date. 
              Continued use of the service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              9. Contact Us
            </h2>
            <p className="text-clip-muted leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at:{" "}
              <a href="mailto:support@clipai.com" className="text-clip-cyan hover:underline">
                support@clipai.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
