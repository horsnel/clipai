import type { Page } from '@/App';
import { ChevronLeft, FileText } from 'lucide-react';

interface TermsPageProps {
  onNavigate: (page: Page) => void;
}

export function TermsPage({ onNavigate }: TermsPageProps) {
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
              <FileText className="w-5 h-5 text-clip-cyan" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text">
                Terms of Service
              </h1>
              <p className="text-clip-muted text-sm">Last updated: January 2026</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="card-glass p-6 lg:p-8 space-y-8">
          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              1. Service Description
            </h2>
            <p className="text-clip-muted leading-relaxed">
              ClipAI is an AI-powered video editing service that automatically detects and extracts highlight 
              clips from gaming footage. Our platform uses artificial intelligence to analyze gameplay videos, 
              identify exciting moments, and generate shareable clips optimized for social media platforms 
              including TikTok, Instagram Reels, and YouTube Shorts.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              2. User Responsibilities
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              By using ClipAI, you agree to:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Provide accurate and complete information when creating an account
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Maintain the security of your account credentials
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Ensure you have the right to upload and process any content you submit
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Use the service in compliance with all applicable laws and regulations
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              3. Acceptable Use
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              You may not use ClipAI to:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-red mt-1">•</span>
                Upload or process illegal, harmful, or offensive content
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-red mt-1">•</span>
                Violate the intellectual property rights of others
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-red mt-1">•</span>
                Attempt to reverse engineer or disrupt the service
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-red mt-1">•</span>
                Use automated systems to access the service without authorization
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-red mt-1">•</span>
                Share account credentials or allow unauthorized access
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              4. Payment Terms
            </h2>
            <p className="text-clip-muted leading-relaxed mb-3">
              All payments are processed securely through Paystack. By subscribing to a paid plan:
            </p>
            <ul className="space-y-2 text-clip-muted">
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                You authorize us to charge your payment method for the subscription fee
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                Subscriptions automatically renew unless cancelled before the renewal date
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                No refunds are provided for used clips or partial billing periods
              </li>
              <li className="flex items-start gap-2">
                <span className="text-clip-cyan mt-1">•</span>
                You may cancel your subscription at any time from your account settings
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              5. Intellectual Property
            </h2>
            <p className="text-clip-muted leading-relaxed">
              You retain all ownership rights to the content you upload to ClipAI. By using our service, 
              you grant us a limited license to process your content solely for the purpose of providing 
              the clip generation service. ClipAI and its associated trademarks, logos, and technology 
              are the property of OLHMES and are protected by intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              6. Limitation of Liability
            </h2>
            <p className="text-clip-muted leading-relaxed">
              ClipAI is provided "as is" without warranties of any kind. We do not guarantee that the 
              service will be uninterrupted, error-free, or that generated clips will meet your specific 
              requirements. To the maximum extent permitted by law, OLHMES shall not be liable for any 
              indirect, incidental, special, consequential, or punitive damages arising from your use 
              of the service.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              7. Termination
            </h2>
            <p className="text-clip-muted leading-relaxed">
              We reserve the right to suspend or terminate your account at any time for violations of 
              these terms or for any other reason at our discretion. Upon termination, your right to 
              use the service will immediately cease, and any pending clips may be deleted.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              8. Changes to Terms
            </h2>
            <p className="text-clip-muted leading-relaxed">
              We may update these Terms of Service from time to time. We will notify you of any material 
              changes by posting the new terms on this page and updating the "Last updated" date. 
              Continued use of the service after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-clip-text mb-3">
              9. Contact
            </h2>
            <p className="text-clip-muted leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at:{" "}
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
