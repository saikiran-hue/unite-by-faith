import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="13 November 2026">
      <p>By signing in to Unite by Faith you agree to these terms.</p>
      <h2 className="h2">Who Can Join</h2>
      <p>You must be 18 or older and use your own Google account. One account per person.</p>
      <h2 className="h2">How to Behave</h2>
      <ul>
        <li>Treat others with kindness and respect. Unite by Faith is for friendship and fellowship, not dating.</li>
        <li>Do not harass, threaten, deceive or pressure anyone, and do not ask for money.</li>
        <li>Do not post anything illegal, sexual, hateful or spam.</li>
        <li>Be honest about who you are, including your age.</li>
      </ul>
      <h2 className="h2">Meeting People</h2>
      <p>
        We suggest matches but we do not check members&apos; backgrounds. Meet in public places, tell someone you trust
        where you are going, and leave any conversation that makes you uncomfortable.
      </p>
      <h2 className="h2">Your Content</h2>
      <p>
        You own what you write. You let us store and show it to the people it is meant for, so the service can work.
      </p>
      <h2 className="h2">Ending Your Account</h2>
      <p>
        You can ask us to delete your account at any time. We may suspend or remove accounts that break these terms.
      </p>
      <h2 className="h2">No Guarantees</h2>
      <p>
        The service is provided as it is, without guarantees that it will always be available or that matches will
        work out. To the extent the law allows, we are not responsible for how members behave towards each other.
      </p>
      <h2 className="h2">Contact</h2>
      <p>
        Questions or reports: <a href="mailto:swipecraft.in@gmail.com">swipecraft.in@gmail.com</a>.
      </p>
      <p>
        See also our <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalPage>
  );
}
